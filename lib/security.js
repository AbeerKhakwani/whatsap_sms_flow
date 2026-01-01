// lib/security.js
// AI-powered security validation for user inputs

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Patterns that indicate potential security threats
const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,  // onclick=, onerror=, etc.
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
  /data:text\/html/gi,
  /vbscript:/gi,
  /<link[\s\S]*?>/gi,
  /<meta[\s\S]*?>/gi,
  /<style[\s\S]*?>[\s\S]*?<\/style>/gi,
];

// URL patterns that might be suspicious
const SUSPICIOUS_URL_PATTERNS = [
  /bit\.ly/gi,
  /tinyurl/gi,
  /t\.co/gi,
  /goo\.gl/gi,
  /wa\.me/gi,
  /telegram\.me/gi,
];

/**
 * Sanitize text input - remove dangerous HTML/scripts
 */
export function sanitizeText(input) {
  if (!input || typeof input !== 'string') return input;

  let sanitized = input;

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Escape remaining HTML entities
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return sanitized.trim();
}

/**
 * Basic validation - check for obvious security issues
 */
export function basicValidation(data) {
  const issues = [];

  // Check each text field for dangerous patterns
  const textFields = ['title', 'description', 'designer', 'item_type', 'color', 'material', 'condition', 'additional_details'];

  for (const field of textFields) {
    if (data[field]) {
      const value = String(data[field]);

      // Check for script injection
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(value)) {
          issues.push({ field, issue: 'Contains potentially dangerous code' });
          break;
        }
      }

      // Check for suspicious URLs
      for (const pattern of SUSPICIOUS_URL_PATTERNS) {
        if (pattern.test(value)) {
          issues.push({ field, issue: 'Contains suspicious shortened URLs' });
          break;
        }
      }
    }
  }

  // Validate price fields are numbers
  const priceFields = ['price', 'asking_price', 'original_price'];
  for (const field of priceFields) {
    if (data[field] !== undefined && data[field] !== '') {
      const num = parseFloat(data[field]);
      if (isNaN(num) || num < 0 || num > 100000) {
        issues.push({ field, issue: 'Invalid price value' });
      }
    }
  }

  return issues;
}

/**
 * AI-powered content moderation
 */
export async function aiContentValidation(data) {
  const contentToCheck = [
    data.title,
    data.description,
    data.designer,
    data.additional_details
  ].filter(Boolean).join('\n');

  if (!contentToCheck || contentToCheck.length < 3) {
    return { safe: true, issues: [] };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a content safety validator for a Pakistani designer clothing consignment marketplace.

Analyze the user-submitted content and check for:
1. SPAM: Repetitive promotional content, excessive caps, spam patterns
2. SCAMS: Phishing attempts, requests for payment outside platform, suspicious deals
3. INAPPROPRIATE: Offensive language, harassment, discriminatory content
4. FRAUD: Fake designer claims, counterfeit indicators, misleading descriptions
5. CONTACT_INFO: Phone numbers, emails, social media handles (we want transactions on-platform)
6. MALICIOUS: Code injection attempts, suspicious URLs, executable content

Return JSON:
{
  "safe": true/false,
  "issues": [
    { "type": "SCAM|SPAM|INAPPROPRIATE|FRAUD|CONTACT_INFO|MALICIOUS", "reason": "brief explanation" }
  ],
  "sanitized_content": "cleaned version if needed, or null if no changes"
}

Be strict about safety but reasonable - legitimate clothing descriptions should pass.
Pakistani designer names like "Sana Safinaz", "Maria B", etc. are legitimate brands.`
        },
        {
          role: 'user',
          content: contentToCheck
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content.trim();
    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(jsonStr);

  } catch (error) {
    console.error('AI validation error:', error);
    // Fail open with basic validation only if AI fails
    return { safe: true, issues: [], error: 'AI validation unavailable' };
  }
}

/**
 * Full validation pipeline - use this for all user inputs
 */
export async function validateAndSanitize(data) {
  // Step 1: Sanitize all text fields
  const sanitized = { ...data };
  const textFields = ['title', 'description', 'designer', 'item_type', 'color', 'material', 'condition', 'additional_details'];

  for (const field of textFields) {
    if (sanitized[field]) {
      sanitized[field] = sanitizeText(sanitized[field]);
    }
  }

  // Step 2: Basic pattern validation
  const basicIssues = basicValidation(sanitized);

  if (basicIssues.length > 0) {
    return {
      valid: false,
      data: sanitized,
      issues: basicIssues,
      message: 'Content contains invalid or potentially dangerous content'
    };
  }

  // Step 3: AI content moderation
  const aiResult = await aiContentValidation(sanitized);

  if (!aiResult.safe && aiResult.issues?.length > 0) {
    const issueTypes = aiResult.issues.map(i => i.type);
    let message = 'Content flagged for review';

    if (issueTypes.includes('CONTACT_INFO')) {
      message = 'Please remove contact information - all communication happens through the platform';
    } else if (issueTypes.includes('SCAM')) {
      message = 'This content has been flagged as potentially fraudulent';
    } else if (issueTypes.includes('INAPPROPRIATE')) {
      message = 'Please remove inappropriate language';
    } else if (issueTypes.includes('SPAM')) {
      message = 'This content appears to be spam';
    }

    return {
      valid: false,
      data: sanitized,
      issues: aiResult.issues,
      message
    };
  }

  // All checks passed
  return {
    valid: true,
    data: sanitized,
    issues: [],
    message: 'Content validated successfully'
  };
}

/**
 * Quick validation for updates (less strict, just security)
 */
export async function validateUpdate(data) {
  // Sanitize
  const sanitized = { ...data };
  const textFields = ['title', 'description', 'condition'];

  for (const field of textFields) {
    if (sanitized[field]) {
      sanitized[field] = sanitizeText(sanitized[field]);
    }
  }

  // Basic validation only for updates
  const basicIssues = basicValidation(sanitized);

  if (basicIssues.length > 0) {
    return {
      valid: false,
      data: sanitized,
      issues: basicIssues,
      message: 'Content contains invalid or potentially dangerous content'
    };
  }

  // Quick AI check for obvious issues
  const aiResult = await aiContentValidation(sanitized);

  if (!aiResult.safe) {
    return {
      valid: false,
      data: sanitized,
      issues: aiResult.issues,
      message: aiResult.issues?.[0]?.reason || 'Content flagged for review'
    };
  }

  return {
    valid: true,
    data: sanitized,
    issues: [],
    message: 'Update validated'
  };
}

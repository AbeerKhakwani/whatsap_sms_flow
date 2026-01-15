// api/validate-listing.js
// AI validates listing description and returns extracted fields + what's missing

import OpenAI from 'openai';
import { sanitizeText, basicValidation } from '../lib/security.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REQUIRED_FIELDS = ['designer', 'pieces', 'size', 'condition', 'asking_price', 'chest', 'hip'];

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { description } = req.body;

  if (!description || description.trim().length < 5) {
    return res.status(200).json({
      extracted: {},
      missing: REQUIRED_FIELDS,
      isComplete: false,
      message: "Please describe your item - include the designer/brand, pieces (kurta, 2pc, 3pc), size, condition, price, and measurements (chest & hip in inches)."
    });
  }

  // Sanitize input first
  description = sanitizeText(description);

  // Check for obvious security issues
  const securityIssues = basicValidation({ description });
  if (securityIssues.length > 0) {
    return res.status(400).json({
      extracted: {},
      missing: REQUIRED_FIELDS,
      isComplete: false,
      message: "Your description contains invalid content. Please try again with a simple description of your item."
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract product details from descriptions of Pakistani designer clothing for a consignment marketplace.

Extract these fields from the user's description:
- designer: brand name (e.g., "Sana Safinaz", "Zara Shahjahan", "Elan", "Maria B", "Khaadi", "Agha Noor")
- pieces: how many pieces included - return one of: "1-piece", "2-piece", "3-piece", "Lehnga", "Saree", "Sharara", "Gharara", "Other"
- size: size - return one of: "XS", "S", "M", "L", "XL", "XXL", "Unstitched", "Custom"
- condition: item condition - return one of: "New with tags", "Like new", "Excellent", "Good", "Fair"
- asking_price: asking/selling price (number only, in USD)
- chest: chest measurement in inches (number only, e.g., "36")
- hip: hip measurement in inches (number only, e.g., "38")
- color: main color(s) (optional)
- fabric: fabric type e.g., "Lawn", "Silk", "Chiffon", "Cotton", "Organza" (optional)
- notes: any flaws, alterations, or extras mentioned (optional)

Return JSON with:
{
  "extracted": { ... fields you found ... },
  "missing": [ ... required fields still needed ... ],
  "isComplete": true/false,
  "message": "friendly message - if missing fields, ask for them specifically. If complete, confirm what you understood"
}

Required fields are: designer, pieces, size, condition, asking_price, chest, hip
Be conversational and helpful in your message. If measurements are missing, gently ask for them.`
        },
        {
          role: 'user',
          content: description
        }
      ],
      temperature: 0.3
    });

    const content = response.choices[0].message.content.trim();

    // Parse JSON from response
    let result;
    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON parse error:', e, 'Content:', content);
      result = {
        extracted: {},
        missing: REQUIRED_FIELDS,
        isComplete: false,
        message: "I had trouble understanding that. Could you tell me: What designer/brand is it? What size? What condition? What price are you asking?"
      };
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('AI error:', error);
    return res.status(500).json({
      error: 'Failed to validate',
      extracted: {},
      missing: REQUIRED_FIELDS,
      isComplete: false,
      message: "Something went wrong. Please try again."
    });
  }
}

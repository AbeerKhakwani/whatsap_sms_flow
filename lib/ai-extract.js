// lib/ai-extract.js
// Shared AI extraction for product details

import OpenAI from 'openai';

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Required fields for a complete listing
 */
export const REQUIRED_FIELDS = ['designer', 'size', 'condition', 'asking_price'];

/**
 * Extract product details from description using AI
 */
export async function extractProductDetails(description) {
  if (!description?.trim()) return null;

  const openai = getOpenAI();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract product details from descriptions of Pakistani designer clothing.
Return a JSON object with these fields (use null if not mentioned):
- designer: brand name (e.g., "Sana Safinaz", "Zara Shahjahan", "Elan")
- item_type: type of item (e.g., "Lawn Suit", "Kurta", "Formal Dress")
- size: size mentioned (e.g., "S", "M", "L", "XL", or specific like "Small")
- condition: item condition (e.g., "New with Tags", "Like New", "Good", "Fair")
- color: main color(s)
- material: fabric type if mentioned (e.g., "Lawn", "Silk", "Chiffon", "Cotton")
- original_price: original/retail price if mentioned (number only, USD)
- asking_price: asking/selling price if mentioned (number only, USD)
- measurements: any measurements mentioned
- includes: what's included (e.g., "shirt, pants, dupatta")

Only return valid JSON, no other text.`
        },
        {
          role: 'user',
          content: description
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content.trim();
    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('AI extraction error:', error);
    return null;
  }
}

/**
 * Validate a description and return extracted fields + missing fields
 */
export async function validateListing(description) {
  const extracted = await extractProductDetails(description) || {};

  const missing = REQUIRED_FIELDS.filter(field => {
    const value = extracted[field];
    return !value || value === null || value === '';
  });

  const isComplete = missing.length === 0;

  let message;
  if (isComplete) {
    message = "Looks great! We got all the details we need.";
  } else {
    const missingNames = missing.map(f => {
      if (f === 'designer') return 'designer/brand';
      if (f === 'asking_price') return 'asking price';
      return f;
    });
    message = `Please add: ${missingNames.join(', ')}`;
  }

  return {
    extracted,
    missing,
    isComplete,
    message
  };
}

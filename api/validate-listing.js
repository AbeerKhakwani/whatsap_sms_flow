// api/validate-listing.js
// AI validates listing description and returns extracted fields + what's missing

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REQUIRED_FIELDS = ['designer', 'size', 'condition', 'asking_price'];

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

  const { description } = req.body;

  if (!description || description.trim().length < 5) {
    return res.status(200).json({
      extracted: {},
      missing: REQUIRED_FIELDS,
      isComplete: false,
      message: "Please describe your item - what designer/brand is it, what size, condition, and what price you're asking?"
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
- item_type: type of item (e.g., "Lawn Suit", "Kurta", "Formal Dress", "Lehnga")
- size: size (e.g., "XS", "S", "M", "L", "XL", or measurements)
- condition: item condition (e.g., "New with Tags", "Like New", "Gently Used", "Good")
- color: main color(s)
- material: fabric type (e.g., "Lawn", "Silk", "Chiffon", "Cotton", "Organza")
- original_price: original/retail price if mentioned (number only, in USD)
- asking_price: asking/selling price (number only, in USD)

Return JSON with:
{
  "extracted": { ... fields you found ... },
  "missing": [ ... required fields still needed: "designer", "size", "condition", "asking_price" ... ],
  "isComplete": true/false,
  "message": "friendly message - if missing fields, ask for them specifically. If complete, confirm what you understood"
}

Required fields are: designer, size, condition, asking_price
Be conversational and helpful in your message.`
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

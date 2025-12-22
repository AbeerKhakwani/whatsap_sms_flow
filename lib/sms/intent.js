// api/sms/intent.js
// AI-powered intent detection with keyword fallback

// Keywords for quick detection
const SELL_KEYWORDS = ['sell', '1', 'selling', 'consign'];
const BUY_KEYWORDS = ['buy', 'shop', 'browse', '2', 'purchase', 'looking'];
const LISTINGS_KEYWORDS = ['listings', 'my listings', 'my items', '3', 'status', 'check', 'my listing'];

/**
 * Fast keyword-based intent detection
 * Checks listings FIRST since "my listings" contains "list"
 */
export function detectByKeywords(message) {
  const lower = message.toLowerCase().trim();
  
  // Check listings FIRST - "my listings" contains "list" which would match sell
  if (LISTINGS_KEYWORDS.some(k => lower.includes(k))) return 'listings';
  if (SELL_KEYWORDS.some(k => lower.includes(k))) return 'sell';
  if (lower.includes('list')) return 'sell'; // "list" alone means sell
  if (BUY_KEYWORDS.some(k => lower.includes(k))) return 'buy';
  
  return null;
}

/**
 * AI-based intent detection using OpenAI
 */
export async function detectByAI(message) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a classifier for a clothing resale SMS service. Classify the user's intent into exactly one of: sell, buy, listings, unknown.

- sell: User wants to list/sell/consign an item
- buy: User wants to browse/shop/purchase items
- listings: User wants to check their current listings or item status
- unknown: Cannot determine intent

Respond with ONLY the intent word, nothing else.`
          },
          { role: 'user', content: message }
        ],
        max_tokens: 10,
        temperature: 0
      })
    });

    const data = await response.json();
    const intent = data.choices?.[0]?.message?.content?.toLowerCase().trim();
    
    if (['sell', 'buy', 'listings'].includes(intent)) {
      return intent;
    }
    return 'unknown';
  } catch (error) {
    console.error('❌ AI intent detection error:', error);
    return 'unknown';
  }
}

/**
 * Main intent detection - tries keywords first, falls back to AI
 */
export async function detectIntent(message) {
  // Try fast keyword detection first
  const keywordIntent = detectByKeywords(message);
  if (keywordIntent) return keywordIntent;
  
  // Fall back to AI for ambiguous messages
  return detectByAI(message);
}


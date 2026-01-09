// api/sms/intent.js
// AI-powered intent detection with keyword fallback

// Keywords for quick detection
const SELL_KEYWORDS = ['sell', '1', 'selling', 'consign'];
const OFFER_KEYWORDS = ['offer', 'bid', '2', 'buy', 'shop', 'browse', 'purchase', 'looking'];
const LISTINGS_KEYWORDS = ['listings', 'my listings', 'my items', '3', 'status', 'check', 'my listing'];
const SALES_KEYWORDS = ['my sales', 'sales', 'sold', 'earnings', 'payout', 'payouts', 'how much', 'balance', '4'];

/**
 * Fast keyword-based intent detection
 * Checks sales and listings FIRST since they have more specific keywords
 */
export function detectByKeywords(message) {
  const lower = message.toLowerCase().trim();

  // Check sales FIRST - "my sales" is very specific
  if (SALES_KEYWORDS.some(k => lower.includes(k))) return 'sales';
  // Check listings SECOND - "my listings" contains "list" which would match sell
  if (LISTINGS_KEYWORDS.some(k => lower.includes(k))) return 'listings';
  if (SELL_KEYWORDS.some(k => lower.includes(k))) return 'sell';
  if (lower.includes('list')) return 'sell'; // "list" alone means sell
  if (OFFER_KEYWORDS.some(k => lower.includes(k))) return 'offer';

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
            content: `You are a classifier for a clothing resale SMS service. Classify the user's intent into exactly one of: sell, offer, listings, sales, unknown.

- sell: User wants to list/sell/consign an item
- offer: User wants to bid/buy/make an offer on items
- listings: User wants to check their current listings or item status
- sales: User wants to see items they've sold, earnings, or payout info
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

    if (['sell', 'offer', 'listings', 'sales'].includes(intent)) {
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


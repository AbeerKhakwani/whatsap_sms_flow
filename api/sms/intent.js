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

/**
 * Analyze photo using GPT-4 Vision
 */
export async function analyzePhoto(imageUrl) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert at identifying Pakistani designer clothing. Analyze the image and extract:
- designer: The brand/designer name if visible or identifiable
- type: Type of garment (e.g., "formal suit", "lawn kurta", "bridal lehenga")
- colors: Main colors
- embellishment: Type of work (e.g., "thread embroidery", "mirror work", "sequins")
- condition: Estimated condition (new with tags, like new, good, fair)
- description: Brief 1-2 sentence description

Respond in JSON format only.`
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || [null, content];
    return JSON.parse(jsonMatch[1] || content);
  } catch (error) {
    console.error('❌ Photo analysis error:', error);
    return null;
  }
}

/**
 * Transcribe voice message using Whisper
 */
export async function transcribeVoice(audioUrl) {
  try {
    // Fetch audio from Twilio URL
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64')}`
      }
    });
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error('❌ Voice transcription error:', error);
    return '';
  }
}
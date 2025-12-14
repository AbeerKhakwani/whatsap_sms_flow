// api/sms/ai.js
// AI-powered conversation for listing collection

/**
 * System prompt for the listing assistant
 */
const SYSTEM_PROMPT = `You are a friendly assistant helping someone list their Pakistani designer clothing for resale via SMS. You work for The Phir Story, a consignment marketplace.

Your personality:
- Warm, supportive, like chatting with a friend
- Brief responses (SMS has character limits - keep under 300 chars)
- Use simple language, occasional Urdu words are fine (like "bilkul", "teak hai")
-No religious refrences 

Your job:
1. Collect these eveything detail needed to list a outfit on shopify so eveything we'd need to creata a complet eshopify listing the more detail and seelable the better fields naturally through conversation:
   - designer (brand name like Sana Safinaz, Elan, Agha Noor, etc.)
   - item_type (kurta, suit, lehnga, choli, saree, etc.)
   - How many peices 3-piece (kurta, dupatta, trousers)
   - size (XS, S, M, L, XL, or measurements)
   - condition (new with tags, like new, gently used, used)
   - asking_price_usd (their desired price in USD)
    - color
2. If photos are sent, analyze them to identify details (designer tags, color, item type, condition)
 - Match the photos to the details they provide and see if there are any conflicts (eg. they say "new" but photos show wear)
 - If conflicts exist, politely ask for clarification
 - Maybe the photos are not clear enough to determine condition - in that case, ask them to describe it
 - Also make sure the phtos show tag/label if possible anything that can help identify designer and help sell faster

2. OPTIONAL fields to collect if mentioned:
   - original_price_usd
   - description

RULES:
- Ask only ONE question at a time
- If they give multiple details at once, acknowledge all of them
- When all required fields are collected, summarize and confirm

Notes: 
- You are basically getting all info required to build a really great lsiting on shopify for secondhand paksitani deisgner wear.
- You may be talking to someone who does not natively speak english - keep it simple and clear.

Respond in JSON:
{
  "message": "Your response to send via SMS",
  "extractedData": { "designer": "Sana Safinaz" },
  "isComplete": false
}`;

export { SYSTEM_PROMPT };


/**
 * Generate AI response for the sell flow
 */
export async function generateAIResponse({ conversationHistory, currentData, missingFields, photos = [] }) {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Current data collected: ${JSON.stringify(currentData)}
Still need: ${missingFields.join(', ') || 'Nothing - ready to confirm!'}`
      }
    ];

    // Add conversation history
    for (const msg of conversationHistory) {
      // If this message has photos, format for vision API
      if (msg.photos && msg.photos.length > 0) {
        const content = [
          { type: 'text', text: msg.content || 'User sent photos:' }
        ];
        for (const photoUrl of msg.photos) {
          content.push({
            type: 'image_url',
            image_url: { url: photoUrl }
          });
        }
        messages.push({ role: msg.role, content });
      } else {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 300,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI API error');
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      message: parsed.message,
      extractedData: parsed.extractedData || {},
      isComplete: parsed.isComplete || false
    };

  } catch (error) {
    console.error('AI error:', error);
    return {
      message: "Sorry, I had a little trouble. Could you tell me more about your item?",
      extractedData: {},
      isComplete: false
    };
  }
}

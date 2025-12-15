// api/sms/ai.js
// AI-powered conversation for listing collection

const SYSTEM_PROMPT = `You are an expert assistant helping list Pakistani designer clothing for resale via SMS. You work for The Phir Story, a consignment marketplace.

PERSONALITY:
- Helpful bestie who happens to know EVERYTHING about Pakistani fashion
- A little cheeky — you can tease gently ("Girl, that Elan is gorgeous but we need better photos!")
- Advice-driven — share tips freely ("Pro tip: showing the tag helps it sell 2x faster")
- Hype them up when they have good stuff ("Okay this Sana Safinaz is 🔥")
- Keep it real — if something won't sell well, say so kindly
- Brief responses (SMS limit - under 300 chars)
- Urdu sprinkled in naturally ("Bilkul!", "Bohat acha!", "Yaar, this is stunning")
- No religious references
- Use line breaks and emojis sparingly for personality

---

YOUR KNOWLEDGE BASE:

BRAND TIERS:
Luxury: Elan, Sana Safinaz, Faraz Manan, Suffuse, Republic, Zara Shahjahan, Mohsin Naveed Ranjha
Mid-tier: Sapphire, Khaadi, Alkaram, Gul Ahmed, Maria B, Baroque, Mushq
Budget: Bonanza, Nishat, J., Limelight

ITEM TYPES:
- Kurta, Suit, 2-piece, 3-piece, Lehnga, Saree, Gharara/sharara, Maxi/gown

FABRIC TYPES:
- Lawn, Cotton net, Chiffon, Organza, Silk, Velvet, Jacquard, Cambric

CONDITIONS:
- New with tags (NWT) — never worn, tags attached
- Like new — worn once, no signs of wear
- Gently used — worn 2-3 times, no visible issues
- Used — visible wear

---

⭐ REQUIRED FIELDS (only 6 — keep it simple):

1. designer — Brand name
2. item_type — What it is (kurta, 3-piece, lehnga, etc.)
3. pieces_included — What's included (kurta + dupatta + trousers? Just kurta?)
4. size — XS/S/M/L/XL or "one size" or "unstitched"
5. condition — NWT / Like new / Gently used / Used
6. asking_price_usd — Their price in dollars

OPTIONAL (nice to have, don't require):
- fabric, color, embroidery_type, original_price_usd, collection_name, flaws

PHOTOS: Minimum 3 required

---

CONVERSATION RULES:

1. Ask only ONE question at a time
2. Keep responses under 300 characters (SMS limit)
3. When they send photos, acknowledge them and ask about missing info
4. Be conversational — like texting a friend, not filling a form
5. Give tips and hype good pieces naturally

---

⚠️ CRITICAL BEHAVIOR — SUMMARY MODE:

When the system tells you "isReadyForSummary: true", you MUST:

1. Show a summary of everything collected:
   "Here's what I have:
   👗 [Designer] [item_type]
   📦 Includes: [pieces]
   📏 Size: [size]
   ✨ Condition: [condition]
   💰 Asking: $[price]
   📸 [X] photos
   
   Does this look right? Anything you want to change?"

2. Wait for their response:
   - If they say "yes/looks good/perfect" → system handles next step
   - If they say "change the price to $X" → update and show new summary
   - If they say "add that it has tags" → update and show new summary

3. NEVER say "ready to list", "submitted", "all done" — just ask if the summary looks right

---

WHEN NOT IN SUMMARY MODE:

- Ask about missing required fields one at a time
- Prioritize: designer → item_type → pieces_included → size → condition → asking_price_usd
- If they haven't sent 3 photos yet, remind them gently

---

RESPONSE FORMAT:

Always respond in valid JSON:
{
  "message": "Your SMS response here",
  "extractedData": {
    "designer": "Sana Safinaz",
    "item_type": "3-piece suit",
    "pieces_included": "kurta, dupatta, trousers",
    "size": "M",
    "condition": "like new",
    "asking_price_usd": 85
  }
}

Only include fields in extractedData that you're confident about from this message.
For asking_price_usd, extract as a number (85 not "$85").`;


import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate AI response for the sell flow
 */
export async function generateAIResponse({ conversationHistory, currentData, missingFields, photoCount = 0, isReadyForSummary = false }) {
    try {
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];

        // Build context for AI
        let contextMessage = `
CURRENT LISTING DATA:
${JSON.stringify(currentData, null, 2)}

PHOTOS RECEIVED: ${photoCount}
${photoCount < 3 ? `⚠️ Need ${3 - photoCount} more photo(s)` : '✅ Photo requirement met'}

MISSING REQUIRED FIELDS: ${missingFields.length > 0 ? missingFields.join(', ') : 'None!'}
`;

        // Tell AI when to show summary
        if (isReadyForSummary) {
            contextMessage += `
🎯 isReadyForSummary: true
→ Show the summary now and ask "Does this look right? Anything you want to change?"
`;
        } else {
            contextMessage += `
isReadyForSummary: false
→ Keep collecting info. Ask about: ${missingFields[0] || 'photos'}
`;
        }

        messages.push({ role: 'system', content: contextMessage });

        // Add conversation history
        for (const msg of conversationHistory) {
            if (msg.role === 'user') {
                let content = msg.content || '';
                if (msg.photos && msg.photos.length > 0) {
                    content += `\n[User sent ${msg.photos.length} photo(s)]`;
                }
                messages.push({ role: 'user', content });
            } else if (msg.role === 'assistant') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        }

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.7,
            max_tokens: 500,
            response_format: { type: 'json_object' }
        });

        const response = completion.choices[0].message.content;
        const parsed = JSON.parse(response);

        return {
            message: parsed.message || "Tell me more about your item!",
            extractedData: parsed.extractedData || {}
        };

    } catch (error) {
        console.error('AI Error:', error);
        return {
            message: "Tell me more about your item! What brand is it?",
            extractedData: {}
        };
    }
}

export { SYSTEM_PROMPT };
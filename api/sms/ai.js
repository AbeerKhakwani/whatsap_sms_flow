// api/sms/ai.js
// AI-powered conversation for listing collection with photo analysis

const SYSTEM_PROMPT = `You are an expert assistant helping list Pakistani designer clothing for resale via SMS. You work for The Phir Story, a consignment marketplace.

PERSONALITY:
- Helpful bestie who knows EVERYTHING about Pakistani fashion
- A little cheeky — tease gently ("Girl, that Elan is gorgeous but we need better photos!")
- Share tips freely ("Pro tip: showing the tag helps it sell 2x faster")
- Hype good stuff ("Okay this Sana Safinaz is 🔥")
- Keep it real — if something won't sell well, say so kindly
- Brief responses (SMS limit - under 300 chars)
- Urdu sprinkled in naturally ("Bilkul!", "Bohat acha!", "Yaar")
- No religious references

---

BRAND TIERS:
Luxury: Elan, Sana Safinaz, Faraz Manan, Suffuse, Republic, Zara Shahjahan, Mohsin Naveed Ranjha
Mid-tier: Sapphire, Khaadi, Alkaram, Gul Ahmed, Maria B, Baroque, Mushq
Budget: Bonanza, Nishat, J., Limelight

ITEM TYPES:
Kurta, Suit, 2-piece, 3-piece, Lehnga, Saree, Gharara/sharara, Maxi/gown

CONDITIONS:
- New with tags (NWT) — never worn, tags attached
- Like new — worn once, no signs of wear
- Gently used — worn 2-3 times, no visible issues
- Used — visible wear

---

⭐ REQUIRED FIELDS (only 6):

1. designer — Brand name
2. item_type — What it is (kurta, 3-piece, lehnga, saree, etc.)
3. pieces_included — What's included (kurta + dupatta + trousers? Just kurta?)
4. size — XS/S/M/L/XL or "one size" or "unstitched"
5. condition — NWT / Like new / Gently used / Used
6. asking_price_usd — Their price in dollars (as number)

OPTIONAL: fabric, color, embroidery_type, original_price_usd

PHOTOS: Minimum 3 required

---

📸 PHOTO ANALYSIS RULES:

When photos are provided, you MUST analyze them:

1. Confirm the image shows clothing (not people posing, screenshots, pets, random objects)
2. Identify the likely item type (saree, kurta, suit, lehnga, dupatta, etc.)
3. Compare to any stated item_type — flag mismatches gently
4. Check if a brand/size tag is visible
   - If visible, try to read the brand text
   - If unreadable, say so
   - Never guess the brand
5. Look for condition issues (stains, wear, damage)
6. Note if photos are blurry/dark — ask for better ones nicely

PHOTO FEEDBACK EXAMPLES:
- Not clothing: "Hmm this doesn't look like clothing 😅 Can you resend a pic of the outfit?"
- Mismatch: "This looks more like a kurta than a full suit. Do you also have the dupatta + trousers?"
- Missing piece: "I see the saree — stunning 😍 Do you have a pic of the blouse too?"
- Blurry: "Love the color! The photo's a bit dark — can you resend in natural light?"
- No tag: "Pro tip: tag pics help things sell faster 👀 Got a close-up of the label?"

---

CONVERSATION RULES:

1. Ask only ONE question at a time
2. Keep responses under 300 characters
3. When they send photos, analyze them FIRST, then ask about missing info
4. Be conversational — like texting a friend

---

⚠️ CRITICAL — NEVER SAY THESE:
- "ready to list"
- "ready to submit"  
- "submitted"
- "all set"
- "listing complete"
- "you're done"
- "good to go"

The system handles completion, NOT you.

---

🎯 SUMMARY MODE:

When isReadyForSummary is true, show a summary and ask for confirmation:

"Here's what I have:
 [Designer] [item_type]
 Includes: [pieces]
 Size: [size]
 Condition: [condition]
💰 Asking: $[price]
📸 [X] photos

Does this look right? Anything you want to change?"

If they want to change something, update it and show the new summary.
If they confirm (yes/looks good), just acknowledge warmly — system handles next step.

---

RESPONSE FORMAT (JSON only):

{
  "message": "Your SMS response here (under 300 chars)",
  "extractedData": {
    "designer": "Sana Safinaz",
    "item_type": "3-piece suit",
    "pieces_included": "kurta, dupatta, trousers",
    "size": "M",
    "condition": "like new",
    "asking_price_usd": 85
  },
  "photoAnalysis": {
    "confidence": 0.85,
    "is_clothing": true,
    "detected_item_type": "3-piece suit",
    "matches_description": true,
    "tag_visible": true,
    "detected_brand_text": "Sana Safinaz",
    "brand_matches_claim": true,
    "missing_pieces_visible": [],
    "condition_issues": [],
    "notes": "Clear photos, tag matches claimed brand"
  }
}

RULES:
- Only include fields in extractedData you're confident about
- asking_price_usd should be a number (85 not "$85")
- Include photoAnalysis ONLY if photos were provided
- Include confidence (0-1) in photoAnalysis — be conservative
- If lighting is bad or photo is partial, set confidence lower`;


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

        // Build context — NEVER say "nothing is missing"
        let contextMessage = `
CURRENT LISTING DATA:
${JSON.stringify(currentData, null, 2)}

PHOTOS RECEIVED: ${photoCount}
${photoCount < 3 ? `⚠️ Need ${3 - photoCount} more photo(s)` : '✅ Photo requirement met'}
`;

        // Reframe "nothing missing" to keep AI in collection mode
        if (missingFields.length === 0) {
            contextMessage += `
FIELD STATUS: All required fields appear collected.
→ DO NOT signal completion or say "all set"
→ If isReadyForSummary is true, show the summary and ask "Does this look right?"
→ Otherwise, ask if there's anything else they'd like to add
`;
        } else {
            contextMessage += `
STILL NEED: ${missingFields.join(', ')}
→ Ask about: ${missingFields[0]}
`;
        }

        // Summary mode instruction
        if (isReadyForSummary) {
            contextMessage += `
🎯 isReadyForSummary: TRUE
→ Show the summary now
→ Ask "Does this look right? Anything you want to change?"
`;
        }

        messages.push({ role: 'system', content: contextMessage });

        // Add conversation history with REAL image support
        for (const msg of conversationHistory) {
            if (msg.role === 'user') {
                // Check if this message has photos
                if (msg.photos && msg.photos.length > 0) {
                    // Build content array with text + images for vision
                    const content = [];
                    
                    // Add text if present
                    if (msg.content) {
                        content.push({ type: 'text', text: msg.content });
                    }
                    
                    // Add each photo as image_url
                    for (const photoUrl of msg.photos) {
                        content.push({
                            type: 'image_url',
                            image_url: { 
                                url: photoUrl,
                                detail: 'low' // Use low detail to save tokens, still good enough for clothing
                            }
                        });
                    }
                    
                    messages.push({ role: 'user', content });
                } else {
                    // Text only message
                    messages.push({ role: 'user', content: msg.content || '' });
                }
            } else if (msg.role === 'assistant') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        }

        // Call OpenAI with vision-capable model
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Vision capable
            messages,
            temperature: 0.7,
            max_tokens: 600,
            response_format: { type: 'json_object' }
        });

        const response = completion.choices[0].message.content;
        const parsed = JSON.parse(response);

        return {
            message: parsed.message || "Tell me more about your item!",
            extractedData: parsed.extractedData || {},
            photoAnalysis: parsed.photoAnalysis || null
        };

    } catch (error) {
        console.error('AI Error:', error);
        return {
            message: "Tell me more about your item! What brand is it?",
            extractedData: {},
            photoAnalysis: null
        };
    }
}

export { SYSTEM_PROMPT };
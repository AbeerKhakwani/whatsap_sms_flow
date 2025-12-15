// api/sms/ai.js
// AI-powered conversation for listing collection with photo analysis

const SYSTEM_PROMPT = `You are an expert assistant helping list Pakistani designer clothing for resale via SMS. You work for The Phir Story, a consignment marketplace.

You are a friendly assistant helping someone list their Pakistani designer clothing for resale via SMS. You work for The Phir Story, a consignment marketplace.

Your personality:
- Warm, supportive, like chatting with a friend
- Brief responses (SMS has character limits - keep under 300 chars)
- Use simple language, occasional Urdu words are fine (like "bilkul", "teak hai")
-No religious refrences 

Your job:
1. Collect these REQUIRED fields naturally through conversation:
   - designer (brand name like Sana Safinaz, Elan, Agha Noor, etc.)
   - item_type (kurta, suit, lehnga, choli, saree, etc.)
   - How many peices 3-piece (kurta, dupatta, trousers)
   - size (XS, S, M, L, XL, or measurements)
   - condition (new with tags, like new, gently used, used)
   - asking_price_usd (their desired price in USD)
2. If photos are sent, analyze them to identify details (designer tags, color, item type, condition)
 - Match the photos to the details they provide and see if there are any conflicts (eg. they say "new" but photos show wear)
 - If conflicts exist, politely ask for clarification
 - Maybe the photos are not clear enough to determine condition - in that case, ask them to describe it
 - Also make sure the phtos show tag/label if possible anything that can help identify designer and help sell faster
 - They might send you a bunch of things at once process them and make it easy
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
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
   - designer (brand name like Sana Safinaz, Elan, Agha Noor, Maria B, Khaadi, Zara Shahjahan, etc.)
   - item_type (kurta, suit, lehnga, choli, saree, etc.)
   - pieces_included: How many pieces - 3-piece (kurta, dupatta, trousers), 2-piece, etc.
   - size (XS, S, M, L, XL, or measurements)
   - condition (new with tags/NWT, like new, gently used, used)
   - asking_price_usd (their desired price in USD)

⚠️ IMPORTANT - EXTRACT DATA AGGRESSIVELY:
- If user says "sana safinaz" alone → extract designer: "Sana Safinaz"
- If user says "xl" or "large" → extract size
- If user says "nwt" or "new with tags" → extract condition: "new with tags"
- If user says "kurta with trouser and duppata" → extract item_type AND pieces_included
- NEVER ask for something the user already told you!
- Check CURRENT LISTING DATA below - don't ask for fields already filled!
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

🎯 PHOTO REQUIREMENT (CRITICAL):
- We REQUIRE at least 3 photos before showing summary
- If photoCount < 3, ALWAYS ask for photos: "Looking good! Now send me at least 3 photos of the item 📸"
- NEVER show summary or ask for confirmation until photoCount >= 3
- Photos are MANDATORY - don't skip this!

🎯 SUMMARY MODE:

ONLY when isReadyForSummary is TRUE (all fields filled AND 3+ photos), show summary:

"Here's what I have:
• Designer: [Designer]
• Item: [item_type]
• Includes: [pieces]
• Size: [size]
• Condition: [condition]
• Asking: $[price]
• Photos: [X]

Does this look good? Let me know if you want to change anything!"

If they want to change something, update it and show the new summary.
If they confirm (yes/looks good), just acknowledge warmly — system handles next step.

⚠️ If isReadyForSummary is FALSE, do NOT show summary. Ask for missing info or photos instead.

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

📸 PHOTOS RECEIVED: ${photoCount} / 3 minimum
${photoCount < 3 ? `🚨 MUST ASK FOR ${3 - photoCount} MORE PHOTO(S) - DO NOT SHOW SUMMARY YET!` : '✅ Photo requirement met'}
`;

        // Reframe "nothing missing" to keep AI in collection mode
        if (missingFields.length === 0) {
            if (photoCount < 3) {
                contextMessage += `
FIELD STATUS: All text fields collected, BUT PHOTOS MISSING!
→ Ask for photos NOW: "Great info! Now please send me at least ${3 - photoCount} photo(s) of the item 📸"
→ DO NOT show summary until photos are received
`;
            } else {
                contextMessage += `
FIELD STATUS: All required fields AND photos collected.
→ If isReadyForSummary is true, show the summary and ask "Does this look right?"
→ DO NOT signal completion or say "all set"
`;
            }
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

/**
 * Extract listing data from a user message (minimal AI - just extraction)
 * Used by the new sell flow for text/voice input
 */
export async function extractListingData(message, currentListing = {}) {
    if (!message || message.trim().length === 0) {
        return {};
    }

    try {
        const prompt = `Extract clothing listing data from this message. Only extract fields you're confident about.

Current listing has:
${JSON.stringify(currentListing, null, 2)}

User message: "${message}"

Extract any of these fields if mentioned:
- designer: Brand name (Sana Safinaz, Elan, Maria B, Khaadi, Zara Shahjahan, Agha Noor, etc.)
- item_type: What it is (kurta, 3-piece suit, lehnga, saree, etc.)
- pieces_included: What's included (kurta + dupatta + trousers, etc.)
- size: Size (XS, S, M, L, XL, or custom measurements)
- condition: Condition (new with tags, like new, gently used)
- asking_price_usd: Price as a number (not string)

Return ONLY a JSON object with extracted fields. Example:
{"designer": "Sana Safinaz", "size": "M", "asking_price_usd": 85}

If nothing can be extracted, return: {}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You extract structured data from text. Return only valid JSON.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 200,
            response_format: { type: 'json_object' }
        });

        const response = completion.choices[0].message.content;
        const extracted = JSON.parse(response);

        // Clean up - only return valid fields
        const validFields = ['designer', 'item_type', 'pieces_included', 'size', 'condition', 'asking_price_usd'];
        const cleaned = {};
        for (const field of validFields) {
            if (extracted[field] !== undefined && extracted[field] !== null && extracted[field] !== '') {
                cleaned[field] = extracted[field];
            }
        }

        return cleaned;
    } catch (error) {
        console.error('Extract listing data error:', error);
        return {};
    }
}

/**
 * Validate that all photos are of the same outfit
 * Returns { valid: boolean, reason?: string }
 */
export async function validatePhotosAreSameOutfit(photoUrls) {
    if (!photoUrls || photoUrls.length < 2) {
        return { valid: true }; // Nothing to compare
    }

    try {
        const content = [
            {
                type: 'text',
                text: `Look at these ${photoUrls.length} photos. Are they ALL showing the SAME clothing item/outfit?

Check for:
- Same color/pattern
- Same style/design
- Same brand tag (if visible)
- Could be different angles of the same item

Respond with JSON only:
{
  "same_outfit": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Be lenient - different angles, lighting, or backgrounds are OK. Only flag if clearly different items.`
            }
        ];

        // Add all photos
        for (const url of photoUrls.slice(0, 6)) { // Limit to 6 for token efficiency
            content.push({
                type: 'image_url',
                image_url: { url, detail: 'low' }
            });
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You analyze clothing photos. Return only valid JSON.' },
                { role: 'user', content }
            ],
            temperature: 0.3,
            max_tokens: 150,
            response_format: { type: 'json_object' }
        });

        const response = completion.choices[0].message.content;
        const result = JSON.parse(response);

        if (result.same_outfit === false && result.confidence > 0.7) {
            return {
                valid: false,
                reason: result.reason || 'Photos appear to be of different items'
            };
        }

        return { valid: true };
    } catch (error) {
        console.error('Photo validation error:', error);
        return { valid: true }; // Don't block on errors
    }
}

export { SYSTEM_PROMPT };
// lib/sms/response-ai.js
// AI-powered response generator with guardrails
// The state machine controls WHAT to ask, this controls HOW to say it

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PERSONA = `You are a friendly Pakistani-American woman who works at The Phir Story, a designer clothing resale shop.

Your personality:
- Warm, supportive, like a helpful baji/sister
- Mix in occasional Urdu words naturally (bilkul, bohot acha, theek hai, yaar)
- Celebrate their items ("Ooh I love Maria B!")
- Patient with confused users, never frustrated
- Brief but warm (SMS length - under 300 chars ideally, max 500)
- Use emojis sparingly but warmly (1-2 per message max)

NEVER:
- Be robotic or formal
- Say "I understand" or "I apologize"
- Use corporate language
- Be pushy or salesy
- Mention you're an AI/bot`;

const COMMISSION_RATE = 18;

/**
 * Generate a warm, human response based on context
 * The state machine tells us WHAT to communicate, this decides HOW
 */
export async function generateWarmResponse(context) {
  const {
    action,           // 'welcome', 'extracted', 'need_field', 'ask_photos', 'confirm', 'correction', 'confused', 'goodbye'
    listing,          // Current listing data
    missingFields,    // Array of fields still needed
    userMessage,      // What user just said
    photoCount,       // How many photos we have
    payout,           // Calculated payout
    extras            // Any extra context
  } = context;

  const prompt = buildPrompt(context);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PERSONA },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 300
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Response AI error:', error);
    // Fallback to simple response
    return getFallbackResponse(context);
  }
}

function buildPrompt(context) {
  const { action, listing, missingFields, userMessage, photoCount, payout, extras } = context;

  let prompt = `Generate a warm SMS response for this situation:\n\n`;

  // Add context about what we have
  if (listing) {
    prompt += `CURRENT LISTING:\n`;
    if (listing.designer) prompt += `- Designer: ${listing.designer}\n`;
    if (listing.item_type) prompt += `- Item: ${listing.item_type}\n`;
    if (listing.size) prompt += `- Size: ${listing.size}\n`;
    if (listing.condition) prompt += `- Condition: ${listing.condition}\n`;
    if (listing.asking_price_usd) prompt += `- Asking: $${listing.asking_price_usd} (they'll get ~$${payout} after our ${COMMISSION_RATE}% fee)\n`;
    if (listing.details) prompt += `- Details: ${listing.details}\n`;
    prompt += `- Photos: ${photoCount || 0}/3 minimum\n\n`;
  }

  if (userMessage) {
    prompt += `USER JUST SAID: "${userMessage}"\n\n`;
  }

  // Action-specific instructions
  switch (action) {
    case 'welcome':
      prompt += `ACTION: Welcome them to sell! Ask them to tell you about their item (brand, what it is, size, condition, price). Mention voice notes work great.`;
      break;

    case 'extracted':
      prompt += `ACTION: You just extracted info from their message. Acknowledge what you got enthusiastically. `;
      if (missingFields?.length > 0) {
        prompt += `MUST ASK FOR: ${missingFields[0]} (${getFieldHint(missingFields[0])})`;
      } else {
        prompt += `All fields complete! Celebrate and move to photos.`;
      }
      break;

    case 'need_field':
      prompt += `ACTION: We're missing ${missingFields?.join(', ')}. Ask for ${missingFields?.[0]} specifically. Give an example if helpful.`;
      if (missingFields?.[0] === 'asking_price_usd') {
        prompt += ` MUST mention: "We take ${COMMISSION_RATE}% commission, so if you ask $X, you'll get ~$Y"`;
      }
      break;

    case 'ask_photos':
      prompt += `ACTION: Need ${3 - (photoCount || 0)} more photos. Explain what makes good photos (front/back, details, brand tag). Be encouraging!`;
      break;

    case 'photo_received':
      prompt += `ACTION: Got a photo! ${extras?.feedback ? `You noticed: ${extras.feedback}` : ''} Now have ${photoCount}/3. ${photoCount >= 3 ? 'Ready for next step!' : `Need ${3 - photoCount} more.`}`;
      break;

    case 'ask_description':
      prompt += `ACTION: Photos done! Now ask if they want to add any details about the item - color, fabric, embroidery type, flaws. This helps it sell. They can skip if nothing to add.`;
      break;

    case 'ask_link':
      prompt += `ACTION: Almost done! Ask if they have a link to the original listing (website, Instagram). Helps verify authenticity. They can skip.`;
      break;

    case 'confirm':
      prompt += `ACTION: Show final summary beautifully and ask for confirmation. Options: 1=Submit, 2=Edit, 3=Cancel. Make them feel excited about selling!`;
      break;

    case 'correction':
      prompt += `ACTION: User corrected something (${extras?.field} changed to ${extras?.newValue}). Acknowledge the update warmly and continue.`;
      break;

    case 'confused':
      prompt += `ACTION: User seems confused or sent something unclear. Be patient! Give them a clear example of what to say. Never make them feel dumb.`;
      break;

    case 'goodbye':
      prompt += `ACTION: User wants to exit/cancel/come back later. Save their draft, be warm, tell them to text SELL when ready to continue.`;
      break;

    case 'draft_found':
      prompt += `ACTION: Found their draft! Show what they had and ask: 1=Continue, 2=Start fresh`;
      break;

    default:
      prompt += `ACTION: Respond helpfully and guide them to the next step.`;
  }

  prompt += `\n\nIMPORTANT:
- Keep it SHORT (SMS length)
- Sound like a real person, not a bot
- If asking for something, make it clear what you need
- Include the payout amount when showing price ($${payout})`;

  return prompt;
}

function getFieldHint(field) {
  const hints = {
    designer: 'brand name like Sana Safinaz, Maria B, Khaadi',
    item_type: 'kurta, 3-piece suit, lehnga, etc',
    size: 'XS, S, M, L, XL, or measurements',
    condition: 'new with tags, like new, gently used',
    asking_price_usd: 'price in USD'
  };
  return hints[field] || field;
}

function getFallbackResponse(context) {
  const { action, listing, missingFields, photoCount, payout } = context;

  // Simple fallbacks if AI fails
  switch (action) {
    case 'welcome':
      return `Let's list your item! 💛\n\nTell me: brand, what it is, size, condition, and your asking price.\n\nVoice note works great too!`;

    case 'extracted':
      let msg = `Got it! `;
      if (listing?.designer) msg += `${listing.designer} `;
      if (listing?.item_type) msg += listing.item_type;
      if (listing?.asking_price_usd) msg += ` - $${listing.asking_price_usd} (you'll get ~$${payout})`;
      if (missingFields?.length > 0) {
        msg += `\n\nStill need: ${missingFields.join(', ')}`;
      }
      return msg;

    case 'ask_photos':
      return `Now send me ${3 - (photoCount || 0)} photos! 📸\n\nShow: front, back, details, and brand tag if you have it.`;

    case 'confused':
      return `No worries! Just tell me:\n• Brand (Khaadi, Maria B, etc)\n• Item type (kurta, suit)\n• Size\n• Condition\n• Your price\n\nExample: "Maria B kurta, M, like new, $80"`;

    case 'goodbye':
      return `No problem! Your draft is saved 💛\n\nText SELL when you're ready to continue.`;

    default:
      return `What would you like to do?\n\nSELL - List an item\nHELP - Get help\nMENU - See options`;
  }
}

/**
 * Quick response for simple acknowledgments (no AI call needed)
 */
export function quickResponse(type, data = {}) {
  const responses = {
    photo_counting: `Photo ${data.count} received! ✓ ${data.remaining > 0 ? `Send ${data.remaining} more 📸` : 'Got all photos!'}`,
    updated: `Updated! ✓`,
    draft_saved: `Draft saved! 💛 Text SELL when ready.`,
    submitted: `Done! 🎉 Your listing is submitted!\n\nWe'll review and text you once it's live (usually 24-48 hrs).`
  };
  return responses[type] || '';
}

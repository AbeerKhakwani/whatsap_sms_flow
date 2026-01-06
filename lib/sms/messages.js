// lib/sms/messages.js
// All SMS message content - The Phir Story

export const MESSAGES = {
    // ============ WELCOME & MENU ============
    WELCOME_NEW_USER: `Hey! 👋 Welcome to The Phir Story — Pakistani designer resale made easy.

Quick question: Have you sold with us before?

Reply YES or NO`,

    WELCOME_KNOWN_SELLER: `Hey, welcome back! 👋

What's next?
→ SELL - List an item
→ OFFER - Make an offer
→ LISTINGS - Your items`,

    MENU: `What's next?
→ SELL - List an item
→ OFFER - Make an offer
→ LISTINGS - Your items`,

    // ============ GLOBAL COMMANDS ============
    HELP: `Here to help! 💛

Commands:
SELL → List an item
OFFER → Make an offer
LISTINGS → Your items
MENU → Main menu
LOGOUT → Sign out
STOP → Unsubscribe

Questions? Reply or email hello@thephirstory.com`,

    STOP: `You're unsubscribed. 💛

Text START anytime to come back — your account stays safe.`,

    LOGOUT: `You've been logged out. 🔒

Text MENU when you're ready to sign back in.`,

    SESSION_EXPIRED: `It's been a while! 🔒

Please verify your email to continue.`,

    RATE_LIMITED: `Too many attempts. Please try again in an hour. ⏳`,

    UNSUBSCRIBED_BLOCK: `You're currently unsubscribed.

Text START when you're ready!`,

    ERROR: `Oops, something went wrong! 💛

Text MENU to start fresh.`,

    // ============ ACCOUNT CHECK ============
    ASK_EXISTING_EMAIL: `What email did you sign up with?`,

    ASK_NEW_EMAIL: `What email should we use for your account?

Example: you@gmail.com`,

    ACCOUNT_CHECK_INVALID: `Just need a quick YES or NO — have you used The Phir Story before?`,

    // ============ EMAIL VERIFICATION ============
    ASK_EMAIL_VERIFY: `Quick verification! 🔒

What email is your account under?`,

    VERIFIED: `You're in! ✅

What's next?
→ SELL - List an item
→ OFFER - Make an offer
→ LISTINGS - Your items`,

    EMAIL_NO_MATCH: (attempt) => `That doesn't match our records.

Try again? (Attempt ${attempt}/3)

Or text HELP if you're stuck.`,

    EMAIL_TOO_MANY_ATTEMPTS: `No worries — let's start over. 💛

Text MENU to try again.`,

    // ============ EXISTING EMAIL LOOKUP ============
    EMAIL_FOUND_LINKED: (name) => `Welcome back${name ? ` ${name}` : ''}! 🎉

You're all set. What's next?
→ SELL - List an item
→ OFFER - Make an offer
→ LISTINGS - Your items`,

    EMAIL_NOT_FOUND: (attempt) => `That doesn't match our records.

Try again? (Attempt ${attempt}/3)

Or reply NEW to create an account.`,

    EMAIL_NOT_FOUND_MAX: `That doesn't match our records.

Let's start over — have you sold with us before?

Reply YES or NO`,

    // ============ NEW ACCOUNT CREATION ============
    ACCOUNT_CREATED: `You're all set! 🎉 Welcome to The Phir Story.

What's next?
→ SELL - List an item
→ OFFER - Make an offer
→ LISTINGS - Your items`,

    EMAIL_EXISTS_LINKED: (name) => `Good news — found your account!${name ? ` Hey ${name}!` : ''} 🎉

Phone linked & ready to go.

What's next?
→ SELL - List an item
→ OFFER - Make an offer
→ LISTINGS - Your items`,

    INVALID_EMAIL: `That doesn't look like an email.

Example: you@gmail.com`,

    // ============ SELL FLOW (UNIFIED) ============
    SELL_START: `Let's list your item! 📸

Tell me about it — designer, what it is, size, condition, and your asking price.

Voice note, text, or photos — whatever's easiest!`,

    SELL_EXTRACTED: (listing, payout, missing) => {
        let response = `Got it! ✓\n\n`;

        // Show what we have
        if (listing.designer) response += `• ${listing.designer}`;
        if (listing.item_type) response += ` ${listing.item_type}`;
        response += `\n`;
        if (listing.size) response += `• Size ${listing.size}\n`;
        if (listing.condition) response += `• ${listing.condition}\n`;
        if (listing.details) response += `• ${listing.details}\n`;
        if (listing.asking_price_usd) {
            response += `• Asking $${listing.asking_price_usd}\n`;
            response += `\nYou'll get ~$${payout} when it sells 💰\n`;
        }

        // Show what's missing
        if (missing.length > 0) {
            response += `\nStill need: ${missing.join(', ')}\n`;
            response += `\nTell me ${missing[0]}!`;
        }

        return response;
    },

    SELL_ASK_DETAILS: `Any flaws to disclose? 📝

Missing buttons, stains, alterations, wear?

Reply SKIP if none!`,

    SELL_ASK_DESCRIPTION: (listing) => `Photos received! 📸

Now tell me more about this ${listing.item_type || 'item'}:
• Color & fabric?
• Any flaws or wear?
• Special details (embroidery, stonework)?

This helps it sell faster! Or reply SKIP.`,

    SELL_ASK_LINK: `Almost done! 🎉

Do you have a link to the original listing?
(designer website, Instagram post, etc.)

This helps verify authenticity!

Reply SKIP if you don't have one.`,

    SELL_READY_FOR_PHOTOS: (listing, payout) => `Perfect! Here's your item:

• ${listing.designer || ''} ${listing.item_type || ''}${listing.details ? ` — ${listing.details}` : ''}
• Size ${listing.size || ''} • ${listing.condition || ''}
• Asking $${listing.asking_price_usd || ''}

You'll get ~$${payout} when it sells 💰

Now send me 3+ photos — one at a time please! 📸
(Include the brand tag if you have it)`,

    SELL_PHOTO_RECEIVED: (count, feedback) => {
        let response = '';
        if (feedback) response += `${feedback}\n\n`;

        if (count >= 3) {
            response += `Got ${count} photos! ✓`;
        } else {
            const needed = 3 - count;
            response += `Photo ${count} received! ✓\n\nSend ${needed} more (one at a time) 📸`;
        }
        return response;
    },

    SELL_PHOTO_NOT_CLOTHING: `Hmm, that doesn't look like clothing! 😄

Send me photos of the outfit you're listing.`,

    SELL_PHOTO_NO_TAG: `Got it! If you have a photo of the brand tag, that helps buyers trust authenticity 🏷️`,

    SELL_SUMMARY: (listing, payout) => `Ready to submit! 🎉

━━━━━━━━━━━━━━━━
${listing.designer || ''} ${listing.item_type || ''}${listing.details ? `\n${listing.details}` : ''}
Size ${listing.size || ''} • ${listing.condition || ''}
Asking: $${listing.asking_price_usd || ''}
Photos: ${(listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0)} ✓${listing.original_link ? `\nLink: ✓` : ''}
━━━━━━━━━━━━━━━━

You'll receive ~$${payout} when it sells.

Reply:
1 = Submit
2 = Edit something
3 = Cancel`,

    SELL_CONFIRM_OPTIONS: `Reply:
1 = Submit
2 = Edit something
3 = Cancel`,

    SELL_WHAT_TO_EDIT: `What do you want to change?

1 = Details (designer, size, etc.)
2 = Photos
3 = Price
4 = Go back`,

    SELL_COMPLETE: `Done! 🎉 Your listing is submitted.

We'll review & text you once it's live (usually 24-48 hrs).

Reply SELL to list another, or MENU for options.`,

    SELL_DRAFT_FOUND: (designer, itemType) => {
        const item = [designer, itemType].filter(Boolean).join(' ') || 'your item';
        return `Welcome back! 👋

You have a draft: "${item}"

1 = Continue where you left off
2 = Start fresh`;
    },

    SELL_IN_PROGRESS: (designer, itemType) => {
        const item = [designer, itemType].filter(Boolean).join(' ') || 'an item';
        return `You're already listing ${item}! 📝

1 = Continue
2 = Start fresh`;
    },

    SELL_DRAFT_DELETED: `Draft deleted — fresh start!`,

    SELL_DRAFT_SAVED: `No worries! Your draft is saved. 💛

Text SELL when you're ready to continue.`,

    SELL_RESUME: (listing, payout, missing) => {
        let response = `Welcome back! Here's your draft:\n\n`;

        // Show what we have
        if (listing.designer) response += `• ${listing.designer}`;
        if (listing.item_type) response += ` ${listing.item_type}`;
        if (listing.designer || listing.item_type) response += `\n`;
        if (listing.details) response += `• ${listing.details}\n`;
        if (listing.size) response += `• Size ${listing.size}\n`;
        if (listing.condition) response += `• ${listing.condition}\n`;
        if (listing.asking_price_usd) {
            response += `• Asking $${listing.asking_price_usd}\n`;
            response += `\nYou'll get ~$${payout} when it sells 💰\n`;
        }

        const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
        if (photoCount > 0) response += `• ${photoCount} photo${photoCount > 1 ? 's' : ''} uploaded\n`;

        // Show what's missing
        if (missing.length > 0) {
            response += `\nStill need: ${missing.join(', ')}\n`;
            response += `\nTell me ${missing[0]}!`;
        } else if (photoCount < 3) {
            response += `\nJust need ${3 - photoCount} more photo${3 - photoCount > 1 ? 's' : ''}! 📸`;
        } else {
            response += `\nAll set! Reply 1 to submit.`;
        }

        return response;
    },

    SELL_INVALID_PRICE: `That doesn't look like a price. Just enter a number like 85 or $85`,

    SELL_DIDNT_UNDERSTAND: `I didn't catch that! 🤔

Try again — tell me the designer, item type, size, condition, and price.

Example: "Sana Safinaz 3-piece, medium, like new, $85"`,

    SELL_NO_CUSTOM: `We only sell Pakistani designer brands — not custom/handmade items. 💛

Which Pakistani designer made this? (e.g., Sana Safinaz, Elan, Maria B, Khaadi, etc.)`,

    SELL_NO_INDIAN: `We specialize in Pakistani designers only! 🇵🇰

Which Pakistani brand is this? (e.g., Sana Safinaz, Elan, Maria B, Khaadi, Sapphire, etc.)`,

    // ============ OFFER FLOW ============
    OFFER_START: `Want to make an offer? 💰

Browse our collection at thephirstory.com and find something you love.

When you're ready, send me the product link and your offer — we'll pass it to the seller!`,

    // ============ LISTINGS FLOW ============
    LISTINGS_START: `Pulling up your listings... ⏳`,

    LISTINGS_EMPTY: `No listings yet!

Ready to sell something?

Reply SELL to get started 💛`,
};

/**
 * Get a message by key, with optional arguments for dynamic messages
 */
export function msg(key, ...args) {
    const message = MESSAGES[key];
    if (typeof message === 'function') {
        return message(...args);
    }
    return message || MESSAGES.ERROR;
}

/**
 * Calculate seller payout
 */
export function calculatePayout(askingPrice, commissionRate = 18) {
    const price = parseFloat(askingPrice) || 0;
    return Math.round(price * (100 - commissionRate) / 100);
}

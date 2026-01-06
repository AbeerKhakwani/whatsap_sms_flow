// api/sms/messages.js
// All SMS message content - The Phir Story

export const MESSAGES = {
    // ============ WELCOME & MENU ============
    WELCOME_NEW_USER: `Hey! 👋 Welcome to The Phir Story — Pakistani designer resale made easy.

Quick question: Have you sold with us before?

Reply YES or NO`,

    WELCOME_KNOWN_SELLER: {
        text: `Hey, welcome back! 👋\n\nWhat are we doing today?`,
        buttons: [
            { id: 'sell', title: 'SELL' },
            { id: 'offer', title: 'OFFER' },
            { id: 'listings', title: 'MY LISTINGS' }
        ]
    },

    MENU: {
        text: `What's next?`,
        buttons: [
            { id: 'sell', title: 'SELL' },
            { id: 'offer', title: 'OFFER' },
            { id: 'listings', title: 'MY LISTINGS' }
        ]
    },

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

    VERIFIED: {
        text: `You're in! ✅\n\nWhat would you like to do?`,
        buttons: [
            { id: 'sell', title: 'SELL' },
            { id: 'offer', title: 'OFFER' },
            { id: 'listings', title: 'MY LISTINGS' }
        ]
    },

    EMAIL_NO_MATCH: (attempt) => `That doesn't match our records.

Try again? (Attempt ${attempt}/3)

Or text HELP if you're stuck.`,

    EMAIL_TOO_MANY_ATTEMPTS: `No worries — let's start over. 💛

Text MENU to try again.`,

    // ============ EXISTING EMAIL LOOKUP ============
    EMAIL_FOUND_LINKED: (name) => ({
        text: `Welcome back${name ? ` ${name}` : ''}! 🎉\n\nYou're all set. What's next?`,
        buttons: [
            { id: 'sell', title: 'SELL' },
            { id: 'offer', title: 'OFFER' },
            { id: 'listings', title: 'MY LISTINGS' }
        ]
    }),

    EMAIL_NOT_FOUND: (attempt) => `That doesn't match our records.

Try again? (Attempt ${attempt}/3)

Or reply NEW to create an account.`,

    EMAIL_NOT_FOUND_MAX: `That doesn't match our records.

Let's start over — have you sold with us before?

Reply YES or NO`,

    // ============ NEW ACCOUNT CREATION ============
    ACCOUNT_CREATED: {
        text: `You're all set! 🎉 Welcome to The Phir Story.\n\nWhat would you like to do?`,
        buttons: [
            { id: 'sell', title: 'SELL' },
            { id: 'offer', title: 'OFFER' },
            { id: 'listings', title: 'MY LISTINGS' }
        ]
    },

    EMAIL_EXISTS_LINKED: (name) => ({
        text: `Good news — found your account!${name ? ` Hey ${name}!` : ''} 🎉\n\nPhone linked & ready to go.`,
        buttons: [
            { id: 'sell', title: 'SELL' },
            { id: 'offer', title: 'OFFER' },
            { id: 'listings', title: 'MY LISTINGS' }
        ]
    }),

    INVALID_EMAIL: `That doesn't look like an email.

Example: you@gmail.com`,

    // ============ SELL FLOW ============
    SELL_START: {
        text: `Let's list your item! 📸\n\nHow would you like to share details?`,
        buttons: [
            { id: 'voice', title: '🎤 Voice note' },
            { id: 'text', title: '✏️ Type it out' },
            { id: 'form', title: '📋 Step-by-step' }
        ]
    },

    SELL_VOICE_PROMPT: `Send me a voice note with:
→ Designer name
→ What it is (kurta, suit, etc.)
→ Size
→ Condition
→ Your asking price in USD

You can speak in English or Urdu! 🎤`,

    SELL_TEXT_PROMPT: `Tell me about your item:
→ Designer name
→ What it is (kurta, suit, etc.)
→ Size
→ Condition
→ Your asking price in USD

Example: "Sana Safinaz 3-piece suit, size M, like new, $120"`,

    SELL_ASK_DESIGNER: `What's the designer/brand name?

Examples: Sana Safinaz, Elan, Maria B, Khaadi`,

    SELL_ASK_ITEM_TYPE: {
        text: `What type of item is it?\n\nOr type your own if not listed!`,
        buttons: [
            { id: 'kurta', title: 'Kurta' },
            { id: '3piece', title: '3-Piece Suit' },
            { id: 'lehnga', title: 'Lehnga' }
        ]
    },

    SELL_ASK_SIZE: {
        text: `What size is it?\n\nOr type custom measurements!`,
        buttons: [
            { id: 'small', title: 'S' },
            { id: 'medium', title: 'M' },
            { id: 'large', title: 'L' }
        ]
    },

    SELL_ASK_CONDITION: {
        text: `What's the condition?`,
        buttons: [
            { id: 'nwt', title: 'New with tags' },
            { id: 'like_new', title: 'Like new' },
            { id: 'good', title: 'Gently used' }
        ]
    },

    SELL_ASK_PRICE: `What's your asking price in USD?

Example: 85 or $85`,

    SELL_ASK_TAG_PHOTO: `Now send me a photo of the brand tag/label 🏷️

This helps buyers trust the authenticity!`,

    SELL_ASK_ITEM_PHOTOS: (count) => `Great! Now send me ${count} photo(s) of the item 📸

Show the front, back, and any details!`,

    SELL_SUMMARY: (listing) => `Here's what I have:

• Designer: ${listing.designer || 'Not set'}
• Item: ${listing.item_type || 'Not set'}
• Size: ${listing.size || 'Not set'}
• Condition: ${listing.condition || 'Not set'}
• Price: $${listing.asking_price_usd || 'Not set'}
• Tag photo: ${listing.photo_tag_url ? '✅' : '❌'}
• Item photos: ${listing.photo_urls?.length || 0}

Does this look right?`,

    SELL_CONFIRM: {
        text: `Ready to submit?`,
        buttons: [
            { id: 'yes', title: '✅ SUBMIT' },
            { id: 'edit', title: '✏️ EDIT' },
            { id: 'cancel', title: '❌ CANCEL' }
        ]
    },

    SELL_WHAT_TO_EDIT: {
        text: `What do you want to change?`,
        buttons: [
            { id: 'edit_details', title: 'Details' },
            { id: 'edit_photos', title: 'Photos' },
            { id: 'edit_price', title: 'Price' }
        ]
    },

    SELL_COMPLETE: {
        text: `Done! 🎉 Your listing is submitted.\n\nWe'll review & text you once it's live (usually 24-72 hrs).`,
        buttons: [
            { id: 'sell', title: 'SELL ANOTHER' },
            { id: 'menu', title: 'MENU' }
        ]
    },

    SELL_DRAFT_FOUND: (designer, itemType) => {
        const item = [designer, itemType].filter(Boolean).join(' ') || 'your item';
        return {
            text: `Welcome back! 👋\n\nYou have a draft: "${item}"`,
            buttons: [
                { id: 'continue', title: 'CONTINUE' },
                { id: 'new', title: 'START FRESH' }
            ]
        };
    },

    SELL_IN_PROGRESS: (designer, itemType) => {
        const item = [designer, itemType].filter(Boolean).join(' ') || 'an item';
        return {
            text: `You're already listing ${item}! 📝\n\nWhat would you like to do?`,
            buttons: [
                { id: 'continue_listing', title: 'CONTINUE' },
                { id: 'start_fresh', title: 'START FRESH' }
            ]
        };
    },

    SELL_DRAFT_SAVED: `Draft saved! 💛

Your progress is safe. Just text SELL when you're ready to finish.`,

    SELL_DRAFT_DELETED: `Draft deleted — fresh start!`,

    SELL_INVALID_PRICE: `That doesn't look like a price. Just enter a number like 85 or $85`,

    SELL_PHOTOS_MISMATCH: (reason) => `Hmm, those photos look like different items! 🤔

${reason ? reason + '\n\n' : ''}Please send photos of just ONE outfit at a time.

Let's start fresh — send me the tag photo first! 🏷️`,

    SELL_GOT_IT: `Got it! ✅`,

    SELL_DIDNT_UNDERSTAND: `I didn't catch that! 🤔

Please resend as a voice message, or type it out with more details like:
"Sana Safinaz 3-piece suit, size M, like new, $85"`,

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
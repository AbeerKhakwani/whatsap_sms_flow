// api/sms/messages.js
// All SMS message content - The Phir Story

export const MESSAGES = {
    // ============ WELCOME & MENU ============
    WELCOME_NEW_USER: `Hey! 👋 Welcome to The Phir Story — Pakistani designer resale made easy.

Quick question: Have you sold with us before?

Reply YES or NO`,

    WELCOME_KNOWN_SELLER: `Hey, welcome back! 👋

What are we doing today?

Reply:
SELL → List something
BUY → Browse & shop
LISTINGS → See your items`,

    MENU: `What's next?

Reply:
SELL → List something
BUY → Browse & shop
LISTINGS → See your items`,

    // ============ GLOBAL COMMANDS ============
    HELP: `Here to help! 💛

Commands:
SELL → List an item
BUY → Browse items
LISTINGS → Your items
MENU → Main menu
STOP → Unsubscribe

Questions? Reply or email hello@thephirstory.com`,

    STOP: `You're unsubscribed. 💛

Text START anytime to come back — your account stays safe.`,

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

    VERIFIED: `You're in! ✅`,

    EMAIL_NO_MATCH: (attempt) => `Hmm, that email doesn't match what we have.

Try again? (Attempt ${attempt}/3)

Or text HELP if you're stuck.`,

    EMAIL_TOO_MANY_ATTEMPTS: `No worries — let's start over. 💛

Text MENU to try again.`,

    // ============ EXISTING EMAIL LOOKUP ============
    EMAIL_FOUND_LINKED: (name) => `Welcome back${name ? ` ${name}` : ''}! 🎉

You're all set. What's next?

Reply:
SELL → List something
BUY → Browse & shop
LISTINGS → See your items`,

    EMAIL_NOT_FOUND: (attempt) => `Can't find that email in our system.

Try again? (Attempt ${attempt}/3)

Or reply NEW to create an account.`,

    EMAIL_NOT_FOUND_MAX: `Still not finding that email.

Want to create a new account?

Reply YES or NO`,

    // ============ NEW ACCOUNT CREATION ============
    ACCOUNT_CREATED: `You're all set! 🎉 Welcome to The Phir Story.

What would you like to do?

Reply:
SELL → List something
BUY → Browse & shop
LISTINGS → See your items`,

    EMAIL_EXISTS_LINKED: (name) => `Good news — found your account!${name ? ` Hey ${name}!` : ''} 🎉

Phone linked & ready to go.

Reply:
SELL → List something
BUY → Browse & shop
LISTINGS → See your items`,

    INVALID_EMAIL: `That doesn't look like an email.

Example: you@gmail.com`,

    // ============ SELL FLOW ============
    SELL_START: `Let's get your item listed! 📸

Send me:
→ Photos (at least 3)
→ Designer name
→ Any details you have

Or all of the above at once!

(Reply BACK anytime to save & exit)`,

    SELL_CONFIRM: `Does everything look right?

Reply:
YES → Submit for review
NO → Make changes`,

    SELL_COMPLETE: `Done! 🎉 Your listing is submitted.

We'll review & text you once it's live (usually 24-72 hrs).

Reply:
SELL → List another
MENU → Main menu`,

    SELL_EDIT: `No problem! What do you want to change?

Just tell me and I'll update it.`,

    SELL_DRAFT_FOUND: (designer, itemType) => {
        const item = [designer, itemType].filter(Boolean).join(' ') || 'your item';
        return `Welcome back! 👋

You have a draft in progress: "${item}"

Reply:
CONTINUE → Pick up where you left off
NEW → Start fresh (deletes draft)`;
    },

    SELL_DRAFT_SAVED: `Draft saved! 💛

Your progress is safe. Just text SELL when you're ready to finish.`,

    SELL_DRAFT_DELETED: `Draft deleted — fresh start! 📸

Send me photos of your item or tell me what you're listing.

(Reply BACK anytime to save & exit)`,

    // ============ BUY FLOW ============
    BUY_START: `Browse the collection at thephirstory.com 🛍️

Looking for something specific? Tell me the designer or style and I'll help you find it!`,

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
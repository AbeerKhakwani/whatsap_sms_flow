
// api/sms/messages.js
// // All SMS message content - optimized for Pakistani women 30s-50s

export const MESSAGES = {
    // ============ WELCOME & MENU ============
    WELCOME_NEW_USER: `Hi! 👋 Welcome to The Phir Story.

So happy you're here. Everything is simple — you can even send voice-notes later if typing is hard.

Question 1 of 3:
Have you used The Phir Story before?

Reply: YES or NO
(ہاں یا نہیں)`,

    WELCOME_KNOWN_SELLER: `Hi! 👋 Welcome back to The Phir Story.

What would you like to do today?

1. SELL / LIST an item (photos or voice-note)
2. BUY – Browse and shop
3. MY LISTINGS – See your items`,

    MENU: `What would you like to do today?

1. SELL / LIST an item (photos or voice-note)
2. BUY – Browse and shop
3. MY LISTINGS – See your items`,

    // ============ GLOBAL COMMANDS ============
    HELP: `I'm here to help. 💛

Type:
SELL – List an item
BUY – Browse items
LISTINGS – See your items
MENU – Start again
STOP – Unsubscribe
اردو – Urdu (coming soon)`,

    STOP: `You've been unsubscribed.
Text START anytime — your account stays safe. 💛`,

    UNSUBSCRIBED_BLOCK: `You're unsubscribed right now.
Text START when you're ready — we'll pick up where you left off.`,

    ERROR: `Koi baat nahi! (No worries!) 💛
Let's try that again — just text MENU to restart.`,

    // ============ ACCOUNT CHECK ============
    ASK_EXISTING_EMAIL: `Step 2 of 3:
What email did you use when signing up?`,

    ASK_NEW_EMAIL: `Step 2 of 3:
What email would you like to use?

Example: yourname@gmail.com`,

    ACCOUNT_CHECK_INVALID: `Please reply YES if you have an account, or NO to make a new one.
(ہاں یا نہیں)`,

    // ============ EMAIL VERIFICATION ============
    ASK_EMAIL_VERIFY: `Let's verify your account (your email stays private 🔒).

What email did you sign up with?`,

    VERIFIED: `All set! 👍 You're verified.`,

    EMAIL_NO_MATCH: (attempt) => `Hmm, that email doesn't match our records.
Please try again. (Attempt ${attempt}/3)

Need help? Text HELP`,

    EMAIL_TOO_MANY_ATTEMPTS: `Koi baat nahi — it happens. 💛
Let's start fresh.

Text MENU to begin again.`,

    // ============ EXISTING EMAIL LOOKUP ============
    EMAIL_FOUND_LINKED: (name) => `Welcome back${name ? `, ${name}` : ''}! 👋
Your phone is now linked — only you can access your account. 🔒

What would you like to do?

1. SELL / LIST an item
2. BUY
3. MY LISTINGS`,

    EMAIL_NOT_FOUND: (attempt) => `We couldn't find an account with that email.
Please try again. (Attempt ${attempt}/3)

Or type NEW to create a new account.`,

    EMAIL_NOT_FOUND_MAX: `Still no account found.

Would you like to create a new one?
Reply YES or NO`,

    // ============ NEW ACCOUNT CREATION ============
    ACCOUNT_CREATED: `All done! 🎉 Step 3 of 3 complete.
Welcome to The Phir Story. 💛

What would you like to do?

1. SELL / LIST an item
2. BUY
3. MY LISTINGS`,

    EMAIL_EXISTS_LINKED: (name) => `Great news — this email already has an account!

Your phone is now linked${name ? `, ${name}` : ''}. 💛
Only you can access your account. 🔒

What would you like to do?

1. SELL / LIST an item
2. BUY
3. MY LISTINGS`,

    INVALID_EMAIL: `That doesn't look like an email address.
Example: yourname@gmail.com

Please try again.`,

    // ============ SELL FLOW (placeholder) ============
    SELL_START: `Just send anything to begin:
a photo, designer name, description — whatever you have right now.

I’ll collect the details and guide you step by step 💫`,

    // ============ BUY FLOW (placeholder) ============
    BUY_START: `Browse our collection at thephirstory.com 🛍️

Looking for something specific? Tell me the designer or style!`,

    // ============ LISTINGS FLOW (placeholder) ============
    LISTINGS_START: `Checking your listings...`,

    LISTINGS_EMPTY: `You don't have any listings yet.

Text SELL to list your first item! 💛`,
SELL_CONFIRM: `Does this look right? Reply YES to submit or NO to make changes.`,
SELL_COMPLETE: `Your listing is ready for review. 🎉

We'll text you once it's live (usually within 72 hours).

Text MENU to list another item!`,

SELL_EDIT: `No problem! What would you like to change?`,
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

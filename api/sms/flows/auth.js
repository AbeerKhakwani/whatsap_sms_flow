// api/sms/flows/auth.js
// Authentication and verification flow handlers

import { msg } from '../messages.js';
import {
  findSellerByEmail,
  createSeller,
  linkPhoneToSeller,
  setState,
  authorize
} from '../db.js';
import { isValidEmail, normalizeEmail, isAffirmative, isNegative } from '../helpers.js';

/**
 * Handle: User asked "Do you have an account?" - awaiting YES/NO
 */
export async function handleAwaitingAccountCheck(message, conversation, phone) {
  if (isAffirmative(message)) {
    await setState(conversation.id, 'awaiting_existing_email');
    return msg('ASK_EXISTING_EMAIL');
  }

  if (isNegative(message)) {
    await setState(conversation.id, 'awaiting_new_email');
    return msg('ASK_NEW_EMAIL');
  }

  // Didn't understand
  return msg('ACCOUNT_CHECK_INVALID');
}

/**
 * Handle: Returning user entering email to find their account
 */
export async function handleAwaitingExistingEmail(message, conversation, phone) {
  const lower = message.toLowerCase().trim();

  // Allow user to switch to creating new account
  if (lower === 'new' || lower === 'create') {
    await setState(conversation.id, 'awaiting_new_email');
    return msg('ASK_NEW_EMAIL');
  }

  // Validate email format
  if (!isValidEmail(message)) {
    return msg('INVALID_EMAIL');
  }

  const email = normalizeEmail(message);
  const seller = await findSellerByEmail(email);

  if (seller) {
    // Found! Link phone and authorize
    await linkPhoneToSeller(seller.id, phone);
    await authorize(conversation.id, seller.id);
    return msg('EMAIL_FOUND_LINKED', seller.name);
  }

  // Not found - track attempts
  const attempts = (conversation.context?.email_attempts || 0) + 1;

  if (attempts >= 3) {
    await setState(conversation.id, 'awaiting_account_check', { email_attempts: 0 });
    return msg('EMAIL_NOT_FOUND_MAX');
  }

  await setState(conversation.id, 'awaiting_existing_email', { email_attempts: attempts });
  return msg('EMAIL_NOT_FOUND', attempts);
}

/**
 * Handle: New user entering email to create account
 */
export async function handleAwaitingNewEmail(message, conversation, phone) {
  // Validate email format
  if (!isValidEmail(message)) {
    return msg('INVALID_EMAIL');
  }

  const email = normalizeEmail(message);

  // Check if email already exists
  const existingSeller = await findSellerByEmail(email);
  if (existingSeller) {
    // Link phone to existing account
    await linkPhoneToSeller(existingSeller.id, phone);
    await authorize(conversation.id, existingSeller.id);
    return msg('EMAIL_EXISTS_LINKED', existingSeller.name);
  }

  // Create new seller
  const newSeller = await createSeller({ phone, email });
  await authorize(conversation.id, newSeller.id);
  return msg('ACCOUNT_CREATED');
}

/**
 * Handle: Known seller verifying their email
 */
export async function handleAwaitingEmail(message, conversation, seller) {
  // Validate email format
  if (!isValidEmail(message)) {
    return msg('INVALID_EMAIL');
  }

  const emailLower = normalizeEmail(message);

  // Check if email matches seller's email or paypal email
  if (emailLower === seller.email?.toLowerCase() ||
    emailLower === seller.paypal_email?.toLowerCase()) {
    // Check if there was a pending intent
    const pendingIntent = conversation.context?.pending_intent;
    // Verified!
    await authorize(conversation.id, seller.id);


    if (pendingIntent === 'sell') {
      return msg('VERIFIED') + '\n\n' + msg('SELL_START');
    }
    if (pendingIntent === 'buy') {
      return msg('VERIFIED') + '\n\n' + msg('BUY_START');
    }
    if (pendingIntent === 'listings') {
      return msg('VERIFIED') + '\n\n' + msg('LISTINGS_START');
    }

    return msg('VERIFIED');
  }

  // Wrong email - track attempts
  const attempts = (conversation.context?.email_attempts || 0) + 1;

  if (attempts >= 3) {
    await setState(conversation.id, 'awaiting_action', { email_attempts: 0, pending_intent: null });
    return msg('EMAIL_TOO_MANY_ATTEMPTS');
  }

  await setState(conversation.id, 'awaiting_email', {
    ...conversation.context,
    email_attempts: attempts
  });
  return msg('EMAIL_NO_MATCH', attempts);
}

/**
 * Trigger email verification with a pending intent
 */
export async function triggerVerification(conversation, intent) {
  await setState(conversation.id, 'awaiting_email', {
    pending_intent: intent,
    email_attempts: 0
  });
  return msg('ASK_EMAIL_VERIFY');
}
// api/sms/flows/auth.js
// Authentication and verification flow handlers

import { msg } from '../messages.js';
import {
  findSellerByEmail,
  findSellerByPhone,
  createSeller,
  linkPhoneToSeller,
  setState,
  authorize,
  isRateLimited,
  trackAuthAttempt,
  revokeOtherSessions
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
  // Check rate limiting
  if (await isRateLimited(conversation.id)) {
    return msg('RATE_LIMITED');
  }

  // SAFEGUARD: Check if phone is already linked to a seller
  const existingSellerByPhone = await findSellerByPhone(phone);
  if (existingSellerByPhone) {
    // Phone already has an account - just authorize them
    await authorize(conversation.id, existingSellerByPhone.id);
    return msg('EMAIL_FOUND_LINKED', existingSellerByPhone.name);
  }

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

  // Track auth attempt for rate limiting
  await trackAuthAttempt(conversation.id);

  const email = normalizeEmail(message);
  const seller = await findSellerByEmail(email);

  if (seller) {
    // Found! Link phone and authorize
    await linkPhoneToSeller(seller.id, phone);
    await authorize(conversation.id, seller.id);
    // Revoke other phone sessions for this seller
    await revokeOtherSessions(seller.id, conversation.id);
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
  // Check rate limiting
  if (await isRateLimited(conversation.id)) {
    return msg('RATE_LIMITED');
  }

  // SAFEGUARD: Check if phone is already linked to a seller
  const existingSellerByPhone = await findSellerByPhone(phone);
  if (existingSellerByPhone) {
    // Phone already has an account - just authorize them
    await authorize(conversation.id, existingSellerByPhone.id);
    return msg('EMAIL_EXISTS_LINKED', existingSellerByPhone.name);
  }

  // Validate email format
  if (!isValidEmail(message)) {
    return msg('INVALID_EMAIL');
  }

  // Track auth attempt for rate limiting
  await trackAuthAttempt(conversation.id);

  const email = normalizeEmail(message);

  // Check if email already exists
  const existingSeller = await findSellerByEmail(email);
  if (existingSeller) {
    // Link phone to existing account
    await linkPhoneToSeller(existingSeller.id, phone);
    await authorize(conversation.id, existingSeller.id);
    // Revoke other phone sessions for this seller
    await revokeOtherSessions(existingSeller.id, conversation.id);
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
  // Check rate limiting
  if (await isRateLimited(conversation.id)) {
    return msg('RATE_LIMITED');
  }

  // If prompt wasn't shown yet (e.g. after auth reset), show it first
  if (!conversation.context?.prompt_shown) {
    await setState(conversation.id, 'awaiting_email', { ...conversation.context, prompt_shown: true });
    return msg('ASK_EMAIL_VERIFY');
  }

  // Validate email format
  if (!isValidEmail(message)) {
    return msg('INVALID_EMAIL');
  }

  // Track auth attempt for rate limiting
  await trackAuthAttempt(conversation.id);

  const emailLower = normalizeEmail(message);

  // Check if email matches seller's email or paypal email
  if (emailLower === seller.email?.toLowerCase() ||
    emailLower === seller.paypal_email?.toLowerCase()) {
    // Check if there was a pending intent
    const pendingIntent = conversation.context?.pending_intent;
    // Verified!
    await authorize(conversation.id, seller.id);
    // Revoke other phone sessions for this seller
    await revokeOtherSessions(seller.id, conversation.id);

    if (pendingIntent === 'sell') {
      await setState(conversation.id, 'sell_started', {});
      return msg('SELL_START'); // Go straight to sell, they know they're verified
    }
    if (pendingIntent === 'offer') {
      return msg('OFFER_START');
    }
    if (pendingIntent === 'listings') {
      return msg('LISTINGS_START');
    }

    return msg('VERIFIED'); // Shows buttons for next action
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
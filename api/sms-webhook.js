/**
 * SMS Webhook - Clean Router
 */

import { msg } from './sms/messages.js';
import { normalizePhone, sendResponse, getGlobalCommand, logState } from './sms/helpers.js';
import { findSellerByPhone, findConversation, createConversation, updateConversation, setState } from './sms/db.js';
import { detectIntent } from './sms/intent.js';
import { handleAwaitingAccountCheck, handleAwaitingExistingEmail, handleAwaitingNewEmail, handleAwaitingEmail } from './sms/flows/auth.js';
import { handleSellFlow } from './sms/flows/sell.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { From, Body = '' } = req.body;
    const phone = normalizePhone(From);
    const message = Body.trim();

    // Load data
    const seller = await findSellerByPhone(phone);
    let conv = await findConversation(phone);
    if (!conv) conv = await createConversation(phone, seller?.id);

    logState(phone, seller, conv);// just for logs in vercel

    // Route message
    const response = await route(message, conv, seller, phone);
    return sendResponse(res, response);

  } catch (error) {
    console.error('❌ Error:', error);
    return sendResponse(res, msg('ERROR'));
  }
}

async function route(message, conv, seller, phone) {
  const state = conv.state || 'new';

  // 1. Global commands
  const cmd = getGlobalCommand(message);
  if (cmd === 'HELP') return msg('HELP');
  if (cmd === 'STOP') {
    await setState(conv.id, 'unsubscribed');
    return msg('STOP');
  }
  if (cmd === 'START' || cmd === 'MENU') {
    if (conv.is_authorized) {
      await setState(conv.id, 'authorized');
      return msg('MENU');
    }
    if (seller) {
      await setState(conv.id, 'awaiting_action');
      return msg('WELCOME_KNOWN_SELLER');
    }
    await setState(conv.id, 'awaiting_account_check');
    return msg('WELCOME_NEW_USER');
  }

  // 2. Blocked if unsubscribed
  if (state === 'unsubscribed') return msg('UNSUBSCRIBED_BLOCK');

  // 3. Route by state
  if (state === 'awaiting_account_check') return handleAwaitingAccountCheck(message, conv, phone);
  if (state === 'awaiting_existing_email') return handleAwaitingExistingEmail(message, conv, phone);
  if (state === 'awaiting_new_email') return handleAwaitingNewEmail(message, conv, phone);
  if (state === 'awaiting_email') return handleAwaitingEmail(message, conv, seller);
  if (state.startsWith('sell_')) return handleSellFlow(message, conv, seller);

  // 4. New user
  if (state === 'new') {
    if (seller) {
      await updateConversation(conv.id, { state: 'awaiting_action', seller_id: seller.id });
      return msg('WELCOME_KNOWN_SELLER');
    }
    await setState(conv.id, 'awaiting_account_check');
    return msg('WELCOME_NEW_USER');
  }

  // 5. Ready for action
  if (state === 'awaiting_action' || state === 'authorized') {
    const intent = await detectIntent(message);
    
    if (intent === 'sell') {
      if (!conv.is_authorized && seller) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'sell' });
        return msg('ASK_EMAIL_VERIFY');
      }
      await setState(conv.id, 'sell_started', {});
      return msg('SELL_START');
    }
    
    if (intent === 'buy') {
      if (!conv.is_authorized && seller) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'buy' });
        return msg('ASK_EMAIL_VERIFY');
      }
      return msg('BUY_START');
    }
    
    if (intent === 'listings') {
      if (!conv.is_authorized && seller) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'listings' });
        return msg('ASK_EMAIL_VERIFY');
      }
      return msg('LISTINGS_START');
    }
    
    return msg('MENU');
  }

  return msg('MENU');
}

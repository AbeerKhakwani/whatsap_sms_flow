import {
  normalizePhone,
  sendResponse,
  findSeller,
  findConversation,
  updateConversation,
  detectIntent,
  findSellerByEmail,
  createSeller,
  linkPhoneToSeller
} from './sms/helpers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { From, Body } = req.body;
    const phone = normalizePhone(From);
    const message = (Body || '').trim();
    const messageLower = message.toLowerCase().trim();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 Phone:', phone);
    console.log('📝 Message:', message);

    // Get seller and conversation
    let seller = await findSeller(phone);
    let conversation = await findConversation(phone);

    // Create conversation if doesn't exist
    if (!conversation) {
      await updateConversation(phone, seller?.id || null, {
        state: 'new',
        is_authorized: false,
        context: {}
      });
      conversation = await findConversation(phone);
    }

    const state = conversation?.state || 'new';
    const isAuthorized = conversation?.is_authorized || false;

    console.log('👤 Seller:', seller?.name || 'NOT IN DATABASE');
    console.log('💬 State:', state);
    console.log('✅ Authorized:', isAuthorized);

    // ═══════════════════════════════════════
    // MESSAGES
    // ═══════════════════════════════════════
    const welcomeMessage = "Hello! Welcome to The Phir Story. Hope you're having a great day!\n\nWhat would you like to do today?\n\n1. SELL or LIST an item\n2. BUY - Browse and shop\n3. MY LISTINGS - See your current listings";

    const menuMessage = "What would you like to do today?\n\n1. SELL or LIST an item\n2. BUY - Browse and shop\n3. MY LISTINGS - See your current listings";

    const helpMessage = "The Phir Story Help:\n\nText SELL to list an item\nText BUY to browse\nText LISTINGS to see your items\nText MENU to start over\nText STOP to unsubscribe\n\nQuestions? Email admin@thephirstory.com";

    const accountCheckMessage = "Hello! Welcome to The Phir Story. Hope you're having a great day!\n\nDo you already have an account with us?\n\nReply YES or NO";

    // ═══════════════════════════════════════
    // GLOBAL COMMANDS (work from ANY state)
    // ═══════════════════════════════════════
    if (messageLower === 'help' || messageLower === '?') {
      return sendResponse(res, helpMessage);
    }

    if (messageLower === 'stop' || messageLower === 'unsubscribe' || messageLower === 'cancel') {
      await updateConversation(phone, seller?.id || null, {
        state: 'unsubscribed',
        context: {}
      });
      return sendResponse(res, "You've been unsubscribed from The Phir Story messages. Text START to resubscribe anytime.");
    }

    if (messageLower === 'start' && state === 'unsubscribed') {
      await updateConversation(phone, seller?.id || null, {
        state: seller ? 'awaiting_action' : 'new',
        is_authorized: seller ? isAuthorized : false,
        context: {}
      });
      return sendResponse(res, seller ? welcomeMessage : accountCheckMessage);
    }

    if (messageLower === 'menu' || messageLower === 'start over' || messageLower === 'reset') {
      if (seller && isAuthorized) {
        await updateConversation(phone, seller.id, {
          state: 'awaiting_action',
          context: {}
        });
        return sendResponse(res, menuMessage);
      } else if (seller) {
        await updateConversation(phone, seller.id, {
          state: 'awaiting_action',
          context: {}
        });
        return sendResponse(res, welcomeMessage);
      } else {
        await updateConversation(phone, null, {
          state: 'new',
          context: {}
        });
        return sendResponse(res, accountCheckMessage);
      }
    }

    // Don't process if unsubscribed
    if (state === 'unsubscribed') {
      return sendResponse(res, "You're currently unsubscribed. Text START to resubscribe.");
    }

    let responseText = '';

    // ═══════════════════════════════════════════════════════════════
    // PHONE EXISTS IN SELLERS TABLE
    // ═══════════════════════════════════════════════════════════════
    if (seller) {
      
      // STATE: NEW
      if (state === 'new') {
        await updateConversation(phone, seller.id, {
          state: 'awaiting_action',
          context: {}
        });
        responseText = welcomeMessage;
      }

      // STATE: AWAITING_ACTION
      else if (state === 'awaiting_action') {
        const intent = await detectIntent(message);

        if (!intent) {
          responseText = menuMessage;
        }
        else if (isAuthorized) {
          responseText = await handleIntent(intent, phone, conversation, seller);
        }
        else {
          await updateConversation(phone, seller.id, {
            state: 'awaiting_email',
            context: { intent }
          });
          responseText = "Thanks! Before we get started, let's verify your account.\n\nWhat's the email you signed up with?";
        }
      }

      // STATE: AWAITING_EMAIL
      else if (state === 'awaiting_email') {
        const emailInput = messageLower;
        const sellerEmail = (seller.email || '').toLowerCase();
        const sellerPaypal = (seller.paypal_email || '').toLowerCase();

        if (emailInput === sellerEmail || emailInput === sellerPaypal) {
          const intent = conversation.context?.intent || null;

          await updateConversation(phone, seller.id, {
            state: 'authorized',
            is_authorized: true,
            context: {}
          });

          if (intent) {
            responseText = "You're verified!\n\n" + await handleIntent(intent, phone, conversation, seller);
          } else {
            responseText = "You're verified!\n\n" + menuMessage;
          }
        }
        else {
          // Track failed attempts
          const attempts = (conversation.context?.email_attempts || 0) + 1;
          
          if (attempts >= 3) {
            await updateConversation(phone, seller.id, {
              state: 'awaiting_action',
              context: {}
            });
            responseText = "Too many attempts. Let's start over.\n\nText HELP if you need assistance, or reply with what you'd like to do:\n\n1. SELL\n2. BUY\n3. MY LISTINGS";
          } else {
            await updateConversation(phone, seller.id, {
              context: { ...conversation.context, email_attempts: attempts }
            });
            responseText = `That email doesn't match our records. Please try again. (Attempt ${attempts}/3)\n\nOr text HELP if you need assistance.`;
          }
        }
      }

      // STATE: AUTHORIZED
      else if (state === 'authorized') {
        const intent = await detectIntent(message);

        if (intent) {
          responseText = await handleIntent(intent, phone, conversation, seller);
        } else {
          responseText = menuMessage;
        }
      }

      // FALLBACK - reset to awaiting_action
      else {
        await updateConversation(phone, seller.id, {
          state: 'awaiting_action',
          context: {}
        });
        responseText = welcomeMessage;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHONE NOT IN SELLERS TABLE - NEW OR RETURNING USER
    // ═══════════════════════════════════════════════════════════════
    else {

      // STATE: NEW - Ask if they have an account
      if (state === 'new') {
        await updateConversation(phone, null, {
          state: 'awaiting_account_check',
          context: {}
        });
        responseText = accountCheckMessage;
      }

      // STATE: AWAITING_ACCOUNT_CHECK - They reply YES or NO
      else if (state === 'awaiting_account_check') {
        if (messageLower === 'yes' || messageLower === 'y' || messageLower === 'yeah' || messageLower === 'yep') {
          await updateConversation(phone, null, {
            state: 'awaiting_existing_email',
            context: {}
          });
          responseText = "Great! What's the email address you signed up with?";
        }
        else if (messageLower === 'no' || messageLower === 'n' || messageLower === 'nope' || messageLower === 'nah') {
          await updateConversation(phone, null, {
            state: 'awaiting_new_email',
            context: {}
          });
          responseText = "Let's create your account! What email would you like to use?";
        }
        else {
          responseText = "Please reply YES if you have an account, or NO to create one.";
        }
      }

      // STATE: AWAITING_EXISTING_EMAIL - Returning user, check if email exists
      else if (state === 'awaiting_existing_email') {
        // Check if they want to create new instead
        if (messageLower === 'new' || messageLower === 'create' || messageLower === 'no') {
          await updateConversation(phone, null, {
            state: 'awaiting_new_email',
            context: {}
          });
          responseText = "No problem! What email would you like to use for your new account?";
        }
        else {
          const emailInput = messageLower;
          const existingSeller = await findSellerByEmail(emailInput);

          if (existingSeller) {
            // Link phone to existing seller
            await linkPhoneToSeller(existingSeller.id, phone);
            
            await updateConversation(phone, existingSeller.id, {
              state: 'authorized',
              is_authorized: true,
              seller_id: existingSeller.id,
              context: {}
            });

            // Refresh seller reference
            seller = existingSeller;

            responseText = `Welcome back${existingSeller.name ? ', ' + existingSeller.name : ''}! Your phone is now linked to your account.\n\n` + menuMessage;
          }
          else {
            // Track failed attempts
            const attempts = (conversation.context?.email_attempts || 0) + 1;
            
            if (attempts >= 3) {
              await updateConversation(phone, null, {
                state: 'awaiting_new_email',
                context: {}
              });
              responseText = "We couldn't find that email. Let's create a new account instead.\n\nWhat email would you like to use?";
            } else {
              await updateConversation(phone, null, {
                context: { email_attempts: attempts }
              });
              responseText = `We couldn't find an account with that email. Please try again. (Attempt ${attempts}/3)\n\nOr reply NEW to create a new account.`;
            }
          }
        }
      }

      // STATE: AWAITING_NEW_EMAIL - New user, create account
      else if (state === 'awaiting_new_email') {
        const emailInput = messageLower;
        
        // Basic email validation
        if (!emailInput.includes('@') || !emailInput.includes('.')) {
          responseText = "That doesn't look like a valid email. Please enter a valid email address.";
        }
        else {
          // Check if email already exists
          const existingSeller = await findSellerByEmail(emailInput);
          
          if (existingSeller) {
            // Email exists, link phone instead
            await linkPhoneToSeller(existingSeller.id, phone);
            
            await updateConversation(phone, existingSeller.id, {
              state: 'authorized',
              is_authorized: true,
              seller_id: existingSeller.id,
              context: {}
            });

            seller = existingSeller;

            responseText = `Looks like you already have an account! Your phone is now linked.\n\n` + menuMessage;
          }
          else {
            // Create new seller
            const newSeller = await createSeller(phone, emailInput);
            
            if (newSeller) {
              await updateConversation(phone, newSeller.id, {
                state: 'authorized',
                is_authorized: true,
                seller_id: newSeller.id,
                context: {}
              });

              responseText = "Your account is created! Welcome to The Phir Story.\n\n" + menuMessage;
            } else {
              responseText = "Sorry, there was a problem creating your account. Please try again or text HELP for assistance.";
            }
          }
        }
      }

      // FALLBACK for unknown state - reset
      else {
        await updateConversation(phone, null, {
          state: 'new',
          context: {}
        });
        responseText = accountCheckMessage;
      }
    }

    // ═══════════════════════════════════════
    // FINAL FALLBACK
    // ═══════════════════════════════════════
    if (!responseText) {
      responseText = menuMessage;
    }

    console.log('📤 RESPONSE:', responseText.substring(0, 100));
    return sendResponse(res, responseText);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return sendResponse(res, "Sorry, something went wrong. Please try again or text HELP for assistance.");
  }
}

// ═══════════════════════════════════════
// HANDLE INTENT
// ═══════════════════════════════════════
async function handleIntent(intent, phone, conversation, seller) {
  if (intent === 'sell') {
    return "Let's get your item listed! How would you like to start?\n\n1. Send photos of your item\n2. Share the original product link\n3. Send a voice message describing it";
  } 
  else if (intent === 'buy') {
    return "You can browse our collection at thephirstory.com\n\nIs there something specific you're looking for? (designer name, size, style, etc.)";
  } 
  else if (intent === 'listings') {
    return "Checking your listings... (this feature coming soon)";
  }
  
  return "What would you like to do today?\n\n1. SELL or LIST an item\n2. BUY - Browse and shop\n3. MY LISTINGS - See your current listings";
}
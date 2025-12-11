/**
 * SMS Helper Functions
 */

// Normalize phone to E.164 format
export function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+1' + cleaned;
    else if (cleaned.length === 11 && cleaned.startsWith('1')) cleaned = '+' + cleaned;
  }
  return cleaned;
}

// Validate email
export function isValidEmail(email) {
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Normalize email to lowercase
export function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

// Send TwiML response
export function sendResponse(res, message) {
  console.log('📤 Sending:', message.substring(0, 80) + '...');
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message><![CDATA[${message}]]></Message></Response>`
  );
}

// Check affirmative responses
export function isAffirmative(msg) {
  return ['yes', 'y', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'haan', 'ji'].includes(msg.toLowerCase().trim());
}

// Check negative responses
export function isNegative(msg) {
  return ['no', 'n', 'nope', 'nah', 'nahi'].includes(msg.toLowerCase().trim());
}

// Check global commands
export function getGlobalCommand(message) {
  const msg = message.toLowerCase().trim();
  if (['help', '?'].includes(msg)) return 'HELP';
  if (['stop', 'unsubscribe'].includes(msg)) return 'STOP';
  if (['start', 'subscribe'].includes(msg)) return 'START';
  if (['menu', 'home'].includes(msg)) return 'MENU';
  return null;
}

// Log state for debugging
export function logState(phone, seller, conv) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 Phone:', phone);
  console.log('👤 Seller:', seller?.name || 'NOT IN DATABASE');
  console.log('💬 State:', conv?.state || 'new');
  console.log('✅ Authorized:', conv?.is_authorized || false);
}

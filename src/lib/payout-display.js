// src/lib/payout-display.js
//
// A seller's `payout_method` comes in two shapes:
//   • legacy string  — e.g. "Zelle"
//   • canonical object — { name, type, account } (what the seller portal saves)
// Admin pages must NEVER render the raw object as a React child (that throws React
// error #31 and blanks the page). These normalize it to safe display strings.

/** The payout method label, e.g. "Zelle". Always returns a string. */
export function payoutMethodLabel(seller) {
  const pm = seller?.payout_method;
  if (pm && typeof pm === 'object') return pm.type || pm.name || 'Zelle';
  if (typeof pm === 'string' && pm) return pm;
  return seller?.payment_provider === 'zelle_manual'
    ? 'Zelle'
    : (seller?.payment_provider || 'Zelle');
}

/** The payout destination (handle / account / PayPal email). Always returns a string. */
export function payoutHandle(seller) {
  if (seller?.payment_handle) return seller.payment_handle;
  if (seller?.paypal_email) return seller.paypal_email;
  const pm = seller?.payout_method;
  if (pm && typeof pm === 'object' && pm.account) return pm.account;
  return '';
}

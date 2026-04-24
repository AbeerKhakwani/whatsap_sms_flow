// src/lib/impersonation.js
// Admin-side helper for "View as seller" flow.
// Calls POST /api/admin-auth?action=impersonate-seller to mint a short-lived
// token, then opens the seller portal in a new tab with ?impersonate=<token>.
// SellerLogin.jsx detects the param and redeems it via /api/auth?action=redeem-impersonation.

const API_URL = import.meta.env.VITE_API_URL || '';

export async function viewAsSeller(sellerId) {
  if (!sellerId) {
    alert('Missing seller ID');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/admin-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('admin_token')}`
      },
      body: JSON.stringify({ action: 'impersonate-seller', sellerId })
    });
    const data = await res.json();
    if (!data.success) {
      alert(`Could not start impersonation: ${data.error || 'unknown error'}`);
      return;
    }

    const url = `${window.location.origin}/login?impersonate=${encodeURIComponent(data.token)}`;
    window.open(url, '_blank', 'noopener');
  } catch (err) {
    alert(`Impersonation failed: ${err.message}`);
  }
}

// Seller-side: read impersonation state from localStorage. Used by the banner
// component and any read-only gating in seller pages.
export function getImpersonationState() {
  try {
    const raw = localStorage.getItem('seller_impersonation');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.adminEmail || !parsed.sellerEmail) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setImpersonationState(state) {
  if (!state) {
    localStorage.removeItem('seller_impersonation');
    return;
  }
  localStorage.setItem('seller_impersonation', JSON.stringify({
    adminEmail: state.adminEmail,
    sellerEmail: state.sellerEmail,
    sellerId: state.sellerId,
    startedAt: state.startedAt || new Date().toISOString(),
    editMode: !!state.editMode
  }));
}

export function clearImpersonation() {
  localStorage.removeItem('seller_impersonation');
  localStorage.removeItem('seller_email');
  localStorage.removeItem('seller_token');
  localStorage.removeItem('seller_id');
  localStorage.removeItem('seller_phone');
  localStorage.removeItem('seller_name');
}

// Install a fetch wrapper that auto-injects X-Impersonation-* headers on
// mutation requests when the user is impersonating. Returns a cleanup fn.
// Idempotent — safe to call multiple times; second call is a no-op.
let originalFetch = null;
export function installImpersonationFetch() {
  if (typeof window === 'undefined') return () => {};
  if (originalFetch) return uninstallImpersonationFetch; // already installed

  originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const ctx = getImpersonationState();
    if (!ctx) return originalFetch(input, init);

    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    const isApi = url.includes('/api/');

    if (isMutation && isApi) {
      const headers = new Headers(init.headers || {});
      headers.set('X-Impersonation-Admin', ctx.adminEmail);
      if (ctx.sellerEmail) headers.set('X-Impersonation-Seller', ctx.sellerEmail);
      if (ctx.sellerId) headers.set('X-Impersonation-Seller-Id', String(ctx.sellerId));
      headers.set('X-Impersonation-Edit-Mode', ctx.editMode ? 'true' : 'false');
      return originalFetch(input, { ...init, headers });
    }

    return originalFetch(input, init);
  };
  return uninstallImpersonationFetch;
}

export function uninstallImpersonationFetch() {
  if (typeof window === 'undefined' || !originalFetch) return;
  window.fetch = originalFetch;
  originalFetch = null;
}

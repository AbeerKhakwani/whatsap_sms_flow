// lib/audit-log.js
// Records actions performed by an admin while impersonating a seller.
// Frontend injects X-Impersonation-Admin and X-Impersonation-Seller headers
// on every mutation request whenever localStorage flags impersonation mode.
// Endpoints call logImpersonationEvent() to record the action.

import { supabase } from './supabase-admin.js';

export function getImpersonationContext(req) {
  const adminEmail = req.headers['x-impersonation-admin'] || null;
  if (!adminEmail) return null;
  return {
    adminEmail: String(adminEmail).toLowerCase(),
    sellerEmail: req.headers['x-impersonation-seller'] ? String(req.headers['x-impersonation-seller']).toLowerCase() : null,
    sellerId: req.headers['x-impersonation-seller-id'] || null,
    editMode: req.headers['x-impersonation-edit-mode'] === 'true'
  };
}

export async function logImpersonationEvent(req, { action, targetId = null, payload = null }) {
  const ctx = getImpersonationContext(req);
  if (!ctx) return; // Not an impersonated request — nothing to log.

  try {
    const { error } = await supabase.from('audit_log').insert({
      actor_admin_email: ctx.adminEmail,
      target_seller_email: ctx.sellerEmail,
      target_seller_id: ctx.sellerId,
      action,
      target_id: targetId ? String(targetId) : null,
      payload: payload ? sanitizePayload(payload) : null,
      request_path: req.url || null,
      user_agent: req.headers['user-agent'] || null
    });
    if (error) {
      console.error('audit_log insert failed:', error.message);
    } else {
      console.log(`📝 AUDIT: ${ctx.adminEmail} → ${ctx.sellerEmail || '?'} → ${action}${targetId ? ` (${targetId})` : ''}`);
    }
  } catch (err) {
    console.error('audit_log unexpected error:', err.message);
  }
}

// Strip out anything obviously sensitive or huge before storing.
function sanitizePayload(p) {
  if (!p || typeof p !== 'object') return p;
  const clone = { ...p };
  for (const key of Object.keys(clone)) {
    if (/password|token|secret|otp|code/i.test(key)) {
      clone[key] = '[redacted]';
    }
    // Don't store entire base64 image blobs.
    if (typeof clone[key] === 'string' && clone[key].length > 4000) {
      clone[key] = `[truncated ${clone[key].length} chars]`;
    }
  }
  return clone;
}

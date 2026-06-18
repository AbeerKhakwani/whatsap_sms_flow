// api/search.js
// Natural-language search for the admin dashboard.
// POST /api/search  { query: string }
// Returns: { results: { sellers, transactions, listings }, interpretation, query }

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase-admin.js';
import { verifyToken } from '../lib/auth-utils.js';
import { cors } from '../lib/cors.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Schema context — stable across requests, will be prompt-cached
const SCHEMA_CONTEXT = `
You are a search assistant for "The Phir Story", a Pakistani designer resale marketplace.
Given a natural language query from an admin, return a JSON filter object to query the database.

DATABASE SCHEMA:

Table: sellers
  - id (uuid)
  - name (text) — seller's full name
  - email (text)
  - phone (text)
  - paypal_email (text) — legacy PayPal payout email
  - payment_handle (text) — Zelle / account handle the seller is paid to
  - payout_method (jsonb) — payout details (a string, or { name, type, account })
  - created_at (timestamp)

A seller has NO payment method on file when there is no usable payout destination —
none of payment_handle, paypal_email, or payout_method.account is set. These are the
sellers who cannot be paid yet.

Table: transactions
  - id (uuid)
  - seller_id (uuid, FK → sellers)
  - order_id (text) — Shopify order ID
  - order_name (text) — e.g. "#1042"
  - product_id (text) — Shopify product ID
  - product_title (text) — item name/designer
  - sale_price (numeric) — price paid after discounts
  - discount_amount (numeric) — coupon/offer discount applied
  - platform_fee (numeric) — flat $10 fee
  - seller_payout (numeric) — what seller receives
  - commission_rate (numeric) — seller commission %, null if not set
  - status (text) — always "pending_payout"
  - payout_status (text) — one of: pending_shipping, in_transit, delivered, available, paid, needs_attention, needs_commission
  - shipping_status (text) — one of: pending_label, label_created, in_transit, delivered, concierge, needs_attention
  - listing_type (text) — "consignment" or "concierge"
  - customer_email (text) — buyer's email
  - admin_note (text)
  - created_at (timestamp)

PAYOUT STATUS VALUES:
  - needs_commission → commission rate not set, needs admin to set it
  - pending_shipping → waiting for seller to ship
  - in_transit → label printed, package in transit
  - delivered → delivered to buyer
  - available → seller payout is ready to be sent
  - paid → payout has been sent
  - needs_attention → seller not found or data issue

LISTING TYPE:
  - concierge → Phirstory physically holds and ships the item
  - consignment → seller ships directly to buyer

RETURN FORMAT (valid JSON only, no markdown, no explanation outside JSON):
{
  "intent": "search_sellers | search_transactions | search_both | count_only",
  "seller_filter": {
    "name": "partial name to match (optional)",
    "email": "partial email (optional)",
    "no_payment_method": true,
    "has_payment_method": true
  },
  "transaction_filter": {
    "product_title": "partial match (optional)",
    "order_name": "e.g. #1042 (optional)",
    "customer_email": "partial email (optional)",
    "payout_status": ["list of statuses to include, or omit for all"],
    "shipping_status": ["list of statuses to include, or omit for all"],
    "listing_type": "concierge | consignment (optional)",
    "has_discount": true,
    "commission_rate_null": true,
    "seller_name": "partial name — used to join seller (optional)",
    "date_from": "ISO date (optional)",
    "date_to": "ISO date (optional)"
  },
  "sort": "newest | oldest | highest_payout | lowest_payout",
  "limit": 20,
  "interpretation": "Plain English: what this query means and what we're returning"
}

All filter fields are optional. Omit fields that are not relevant to the query.
If the user just wants a count (e.g. "how many"), set intent to "count_only".
Examples:
  "find all transactions for Amna" → seller_filter: { name: "Amna" }, intent: search_both
  "how many listings from Suffuse" → transaction_filter: { product_title: "Suffuse" }, intent: count_only
  "pending commission transactions" → transaction_filter: { payout_status: ["needs_commission"] }, intent: search_transactions
  "concierge items" → transaction_filter: { listing_type: "concierge" }, intent: search_transactions
  "orders with discounts" → transaction_filter: { has_discount: true }, intent: search_transactions
  "sellers who haven't been paid" → transaction_filter: { payout_status: ["available", "in_transit", "delivered", "pending_shipping"] }, intent: search_both
  "sellers without a payment method" → seller_filter: { no_payment_method: true }, intent: search_sellers
  "sellers with payout info on file" → seller_filter: { has_payment_method: true }, intent: search_sellers
  "all sellers" / "list every seller" → intent: search_sellers (no filter)
Note: intent "search_sellers" may be used with no name/email — e.g. to list all sellers, or to filter only by payment method.
`;

function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  if (token === 'email-auth') return true; // legacy admin tokens
  const decoded = verifyToken(token);
  return decoded && decoded.type === 'admin'; // tokens carry type:'admin' (not role)
}

export default async function handler(req, res) {
  if (cors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) {
    // Distinct, actionable message — a stale 24h token lands here and used to read
    // as a bare "Unauthorized", indistinguishable from a real auth bug.
    return res.status(401).json({
      error: 'Your admin session has expired or you are not signed in. Sign out, sign back in, and try the search again.',
      code: 'auth',
    });
  }

  // Surface a missing API key clearly — otherwise the Claude call throws and the
  // user just sees a generic "Failed to parse query" with no idea it's a config gap.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set — /api/search cannot reach Claude.');
    return res.status(500).json({
      error: 'Search is not configured yet (ANTHROPIC_API_KEY is missing on the server). Add it in Vercel → Settings → Environment Variables and redeploy.',
      code: 'no_api_key',
    });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query too short' });
  }

  const today = new Date().toISOString().split('T')[0];

  let filterJson;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SCHEMA_CONTEXT,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: `Today is ${today}. Parse this search query and return only valid JSON:\n\n"${query.trim()}"`
        }
      ]
    });

    // Pick the first text block rather than assuming content[0] is text.
    const text = (message.content || []).find(b => b.type === 'text')?.text || '';
    // Strip any markdown fences Claude might add
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    if (!cleaned) throw new Error('Claude returned an empty response');
    filterJson = JSON.parse(cleaned);
  } catch (err) {
    console.error('Claude parse error:', err);
    return res.status(500).json({ error: 'Could not understand that search. Try rephrasing it.', details: err.message });
  }

  try {
    const results = await executeSearch(filterJson);
    return res.status(200).json({
      success: true,
      results,
      interpretation: filterJson.interpretation || query,
      filter: filterJson
    });
  } catch (err) {
    console.error('Search execution error:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
}

// A seller can be paid only if one of these yields a destination. Mirrors
// src/lib/payout-display.js → payoutHandle() so "no payment method" here matches
// the "Add info" / "No payout info on file" flag admins see on the payouts screen.
function sellerPayoutHandle(s) {
  if (s.payment_handle) return s.payment_handle;
  if (s.paypal_email) return s.paypal_email;
  const pm = s.payout_method;
  if (pm && typeof pm === 'object' && pm.account) return pm.account;
  return '';
}

async function executeSearch(filter) {
  const limit = Math.min(filter.limit || 20, 50);
  const results = { sellers: [], transactions: [], counts: {} };

  const needsSellers = ['search_sellers', 'search_both', 'count_only'].includes(filter.intent);
  const needsTransactions = ['search_transactions', 'search_both', 'count_only'].includes(filter.intent);

  // ── Seller search ──────────────────────────────────────────────────────────
  const sf = filter.seller_filter || {};
  const sellerNameTerm = sf.name || filter.transaction_filter?.seller_name;
  // Run when there's any seller criterion, OR the query is explicitly about sellers
  // (e.g. "all sellers", "sellers without a payment method") — no name term required.
  const runSellerSearch = needsSellers && (
    sellerNameTerm || sf.email || sf.no_payment_method || sf.has_payment_method ||
    filter.intent === 'search_sellers'
  );

  if (runSellerSearch) {
    let q = supabase
      .from('sellers')
      .select('id, name, email, phone, paypal_email, payment_handle, payout_method, created_at');

    if (sellerNameTerm) q = q.ilike('name', `%${sellerNameTerm}%`);
    if (sf.email) q = q.ilike('email', `%${sf.email}%`);

    // Fetch generously, then apply the payment-method filter in code: payout_method is
    // dual-shaped jsonb, so "has a destination" can't be expressed cleanly in one query.
    q = q.order('name').limit(500);
    let { data } = await q;
    data = data || [];

    if (sf.no_payment_method) data = data.filter(s => !sellerPayoutHandle(s));
    if (sf.has_payment_method) data = data.filter(s => !!sellerPayoutHandle(s));

    results.counts.sellers = data.length;     // true match count
    results.sellers = data.slice(0, 200);     // show all (≤134 sellers total)
  }

  // ── Transaction search ─────────────────────────────────────────────────────
  if (needsTransactions) {
    const tf = filter.transaction_filter || {};
    let sellerIds = null;

    // Resolve seller name → IDs first (for joining)
    if (tf.seller_name && !results.sellers.length) {
      const { data: matchedSellers } = await supabase
        .from('sellers')
        .select('id')
        .ilike('name', `%${tf.seller_name}%`);
      sellerIds = (matchedSellers || []).map(s => s.id);
    } else if (results.sellers.length > 0 && filter.intent === 'search_both') {
      sellerIds = results.sellers.map(s => s.id);
    }

    let q = supabase
      .from('transactions')
      .select(`
        id, order_name, product_title, product_image, sale_price, discount_amount,
        platform_fee, seller_payout, commission_rate, payout_status, shipping_status,
        listing_type, customer_email, admin_note, created_at, seller_id,
        sellers!left (id, name, email)
      `);

    if (sellerIds?.length) q = q.in('seller_id', sellerIds);
    if (tf.product_title) q = q.ilike('product_title', `%${tf.product_title}%`);
    if (tf.order_name) q = q.ilike('order_name', `%${tf.order_name}%`);
    if (tf.customer_email) q = q.ilike('customer_email', `%${tf.customer_email}%`);
    if (tf.payout_status?.length) q = q.in('payout_status', tf.payout_status);
    if (tf.shipping_status?.length) q = q.in('shipping_status', tf.shipping_status);
    if (tf.listing_type) q = q.eq('listing_type', tf.listing_type);
    if (tf.has_discount) q = q.gt('discount_amount', 0);
    if (tf.commission_rate_null) q = q.is('commission_rate', null);
    if (tf.date_from) q = q.gte('created_at', tf.date_from);
    if (tf.date_to) q = q.lte('created_at', tf.date_to + 'T23:59:59Z');

    // Sort
    if (filter.sort === 'oldest') {
      q = q.order('created_at', { ascending: true });
    } else if (filter.sort === 'highest_payout') {
      q = q.order('seller_payout', { ascending: false, nullsFirst: false });
    } else if (filter.sort === 'lowest_payout') {
      q = q.order('seller_payout', { ascending: true, nullsFirst: false });
    } else {
      q = q.order('created_at', { ascending: false });
    }

    q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    results.transactions = data || [];
    results.counts.transactions = results.transactions.length;
  }

  return results;
}

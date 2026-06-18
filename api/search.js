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

Table: listings  (the submission pipeline — NOT live or sold inventory)
  - id (uuid)
  - seller_id (uuid, FK → sellers)
  - status (text) — only two values: "draft" (seller hasn't submitted yet) and
    "pending_approval" (waiting for an admin to approve). Approved / live / sold items
    are NOT in this table — those are Shopify products and transactions.
  - designer (text) — brand / designer
  - item_type (text) — e.g. "Lehenga", "Saree"
  - size (text)
  - condition (text)
  - asking_price_usd (numeric)
  - created_at (timestamp)
Use the listings table for the approval queue and drafts — e.g. "pending approvals",
"approvals waiting more than a week", "draft listings", "listings over $300".

RETURN FORMAT (valid JSON only, no markdown, no explanation outside JSON):
{
  "intent": "search_sellers | search_transactions | search_listings | search_both | summarize | count_only",
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
  "listing_filter": {
    "status": ["draft", "pending_approval"],
    "designer": "partial (optional)",
    "item_type": "partial (optional)",
    "size": "partial (optional)",
    "condition": "partial (optional)",
    "min_price": 0,
    "max_price": 0,
    "older_than_days": 7,
    "seller_name": "partial (optional)",
    "date_from": "ISO date (optional)",
    "date_to": "ISO date (optional)"
  },
  "sort": "newest | oldest | highest_payout | lowest_payout",
  "limit": 20,
  "interpretation": "Plain English: what this query means and what we're returning"
}

All filter fields are optional. Omit fields that are not relevant to the query.
For "how much" / "total" / "sum" questions (money owed, sales totals, payouts sent),
use intent "summarize" with the relevant transaction_filter — totals are computed over
ALL matching transactions (item count, total sale price, total seller payout, total discount).
For "how many" counting questions, use "count_only" (or "summarize").
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
  "pending approvals" → listing_filter: { status: ["pending_approval"] }, intent: search_listings
  "approvals waiting more than 7 days" → listing_filter: { status: ["pending_approval"], older_than_days: 7 }, intent: search_listings
  "draft listings from Amna" → listing_filter: { status: ["draft"], seller_name: "Amna" }, intent: search_listings
  "listings over $300" → listing_filter: { min_price: 300 }, intent: search_listings
  "how much do I owe sellers" → transaction_filter: { payout_status: ["available","in_transit","delivered","pending_shipping"] }, intent: summarize
  "total sales this month" → transaction_filter: { date_from: "<first day of month>", date_to: "<today>" }, intent: summarize
  "how much have I paid out this month" → transaction_filter: { payout_status: ["paid"], date_from: "<first day of month>", date_to: "<today>" }, intent: summarize
Note: intent "search_sellers" may be used with no name/email. "search_listings" covers the approval queue + drafts only (never live/sold items).
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

// Apply the transaction filter to a query builder — shared by the display query and
// the (uncapped) totals query so a summary always matches what the list shows.
function applyTxFilters(q, tf, sellerIds) {
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
  return q;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

async function executeSearch(filter) {
  const limit = Math.min(filter.limit || 20, 50);
  const results = { sellers: [], transactions: [], listings: [], summary: null, counts: {} };

  const intent = filter.intent;
  const needsSellers = ['search_sellers', 'search_both', 'count_only'].includes(intent);
  const needsTransactions = ['search_transactions', 'search_both', 'count_only', 'summarize'].includes(intent);
  const needsListings = intent === 'search_listings';
  const wantsTotals = intent === 'summarize' || intent === 'count_only';

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

    // Display rows (capped at `limit`)
    let q = supabase
      .from('transactions')
      .select(`
        id, order_name, product_title, product_image, sale_price, discount_amount,
        platform_fee, seller_payout, commission_rate, payout_status, shipping_status,
        listing_type, customer_email, admin_note, created_at, seller_id,
        sellers!left (id, name, email)
      `);
    q = applyTxFilters(q, tf, sellerIds);

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

    // Totals over ALL matching rows (not just the displayed page) for "how much / how many".
    if (wantsTotals) {
      let sq = supabase.from('transactions').select('sale_price, seller_payout, discount_amount');
      sq = applyTxFilters(sq, tf, sellerIds);
      const { data: allRows } = await sq.limit(10000);
      const rows = allRows || [];
      results.summary = {
        scope: 'transactions',
        count: rows.length,
        total_sale_price: round2(sum(rows, 'sale_price')),
        total_payout: round2(sum(rows, 'seller_payout')),
        total_discount: round2(sum(rows, 'discount_amount')),
      };
      results.counts.transactions = rows.length; // true match count, not the page size
    }
  }

  // ── Listings search (the submission pipeline: drafts + pending approvals) ────
  if (needsListings) {
    const lf = filter.listing_filter || {};
    let sellerIds = null;
    if (lf.seller_name) {
      const { data: ms } = await supabase
        .from('sellers').select('id').ilike('name', `%${lf.seller_name}%`);
      sellerIds = (ms || []).map(s => s.id);
      if (!sellerIds.length) sellerIds = ['00000000-0000-0000-0000-000000000000']; // no match → empty
    }

    let q = supabase
      .from('listings')
      .select('id, seller_id, status, designer, item_type, size, condition, asking_price_usd, photo_urls, shopify_product_url, created_at');

    if (sellerIds) q = q.in('seller_id', sellerIds);
    if (lf.status?.length) q = q.in('status', lf.status);
    if (lf.designer) q = q.ilike('designer', `%${lf.designer}%`);
    if (lf.item_type) q = q.ilike('item_type', `%${lf.item_type}%`);
    if (lf.size) q = q.ilike('size', `%${lf.size}%`);
    if (lf.condition) q = q.ilike('condition', `%${lf.condition}%`);
    if (lf.min_price) q = q.gte('asking_price_usd', lf.min_price);   // 0/absent → no lower bound
    if (lf.max_price) q = q.lte('asking_price_usd', lf.max_price);   // 0/absent → no upper bound
    if (lf.date_from) q = q.gte('created_at', lf.date_from);
    if (lf.date_to) q = q.lte('created_at', lf.date_to + 'T23:59:59Z');
    if (lf.older_than_days) {
      const cutoff = new Date(Date.now() - Number(lf.older_than_days) * 86400000).toISOString();
      q = q.lt('created_at', cutoff);
    }

    // Oldest-first is the right default for an approval backlog; flip on "newest".
    q = q.order('created_at', { ascending: filter.sort !== 'newest' }).limit(Math.min(filter.limit || 50, 200));
    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];

    // Attach seller name/email without relying on a PostgREST FK embed on `listings`.
    const ids = [...new Set(rows.map(r => r.seller_id).filter(Boolean))];
    if (ids.length) {
      const { data: sells } = await supabase.from('sellers').select('id, name, email').in('id', ids);
      const byId = Object.fromEntries((sells || []).map(s => [s.id, s]));
      rows = rows.map(r => ({ ...r, sellers: byId[r.seller_id] || null }));
    }
    results.listings = rows;
    results.counts.listings = rows.length;
  }

  return results;
}

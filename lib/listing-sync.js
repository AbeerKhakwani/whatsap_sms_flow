// lib/listing-sync.js
// One idempotent pass that makes a product's derived fields agree with its authoritative
// ones. Every admin write path calls this, so a newly created or edited listing is never
// left in a state the cleanup deck would flag.
//
// Authoritative → derived:
//   Condition OPTION value ──► condition TAG                 (one canonical value each)
//   `concierge` TAG        ──► custom.concierge (bool)       true, or absent
//                          ──► custom.shipped_by_tps (bool)  true / false
//   custom.measurements    ──► custom.chest_size             when chest is parseable
//
// Deliberately never throws. The caller's write has already succeeded by the time this
// runs; a Shopify hiccup here must not turn a saved edit into an error the admin sees.
// Any drift it misses is repairable with scripts/normalize-condition.mjs and
// scripts/concierge-metafield.mjs.

import { CONDITIONS, canonicalCondition, isConditionTag } from './conditions.js';
import { parseChest } from './measurements.js';
import { resolveCommission } from './commission.js';
import { calculateSellerPayout, PLATFORM_FEE } from './payout-calculation.js';

const STORE = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP || 'ba42c1.myshopify.com';
const TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const ENDPOINT = `https://${STORE}/admin/api/2024-10/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 200));
  return j.data;
}

const READ = `query($id:ID!){ product(id:$id){
  id title tags
  options{ id name optionValues{ id name } }
  measurements: metafield(namespace:"custom", key:"measurements"){ value }
  sellerEmail:  metafield(namespace:"seller", key:"email"){ value }
  commission:   metafield(namespace:"pricing", key:"commission_rate"){ value }
  ask:          metafield(namespace:"pricing", key:"seller_asking_price"){ value }
  chest:        metafield(namespace:"custom", key:"chest_size"){ value }
  concierge:    metafield(namespace:"custom", key:"concierge"){ value }
  shipped:      metafield(namespace:"custom", key:"shipped_by_tps"){ value } } }`;
const TAGS_MUT = `mutation($id:ID!,$t:[String!]!){ productUpdate(product:{id:$id, tags:$t}){ userErrors{ message } } }`;
const OPT_MUT  = `mutation($p:ID!,$o:OptionUpdateInput!,$vals:[OptionValueUpdateInput!]){
  productOptionUpdate(productId:$p, option:$o, optionValuesToUpdate:$vals){ userErrors{ message } } }`;
const SET  = `mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }`;
const DEL  = `mutation($m:[MetafieldIdentifierInput!]!){ metafieldsDelete(metafields:$m){ userErrors{ message } } }`;

const toGid = id => String(id).startsWith('gid://') ? String(id) : `gid://shopify/Product/${id}`;

/** Commission drives payout, so the two must always move together. */
function payoutFor(askValue, rate) {
  let ask = null;
  try { ask = parseFloat(JSON.parse(askValue || 'null')?.amount); } catch { ask = parseFloat(askValue); }
  if (!ask || isNaN(ask)) return null;
  const { sellerPayout } = calculateSellerPayout({ grossPrice: ask + PLATFORM_FEE, commissionRate: rate });
  if (sellerPayout == null) return null;
  return gid => ({ ownerId: gid, namespace: 'pricing', key: 'seller_payout', type: 'money',
    value: JSON.stringify({ amount: sellerPayout.toFixed(2), currency_code: 'USD' }) });
}

/**
 * Explicitly (re)set a listing's commission from the rules, overwriting whatever is there,
 * and recompute the payout. Only for deliberate acts — flipping the concierge toggle —
 * never for an incidental save.
 * @returns {Promise<{ok:boolean, rate?:number, reason?:string, error?:string}>}
 */
export async function setCommission(productId, { sellerEmail, isConcierge }) {
  const gid = toGid(productId);
  try {
    const { rate, reason } = resolveCommission({ sellerEmail, isConcierge });
    const { product } = await gql(`query($id:ID!){ product(id:$id){
      ask: metafield(namespace:"pricing", key:"seller_asking_price"){ value } } }`, { id: gid });
    const m = [{ ownerId: gid, namespace: 'pricing', key: 'commission_rate', type: 'number_integer', value: String(rate) }];
    const payout = payoutFor(product?.ask?.value, rate);
    if (payout) m.push(payout(gid));
    const r = await gql(SET, { m });
    if (r.metafieldsSet.userErrors.length) throw new Error(JSON.stringify(r.metafieldsSet.userErrors));
    console.log(`💰 setCommission ${productId}: ${rate}% (${reason})${payout ? ' + payout' : ''}`);
    return { ok: true, rate, reason };
  } catch (err) {
    console.error(`⚠️  setCommission ${productId} failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Bring a product's derived fields in line with its authoritative ones.
 * @param {string|number} productId
 * @returns {Promise<{ok:boolean, changed:string[], error?:string}>}
 */
export async function reconcileListing(productId) {
  const gid = toGid(productId);
  const changed = [];
  try {
    const { product: p } = await gql(READ, { id: gid });
    if (!p) return { ok: false, changed, error: 'product not found' };

    const sets = [], dels = [];

    // ── Condition: the option value is truth, the tag mirrors it ──────────
    const opt = p.options.find(o => /^conditions?$/i.test(o.name.trim()));
    let condition = null;
    if (opt && opt.optionValues.length === 1) {
      const raw = opt.optionValues[0].name;
      condition = canonicalCondition(raw);
      if (condition && raw !== condition) {
        await gql(OPT_MUT, { p: gid, o: { id: opt.id, name: 'Condition' },
          vals: [{ id: opt.optionValues[0].id, name: condition }] });
        changed.push(`condition option ${raw} -> ${condition}`);
      } else if (CONDITIONS.includes(raw)) {
        condition = raw;
      }
    }

    // ── Tags: exactly one canonical condition tag ─────────────────────────
    let tags = p.tags.map(t => t.trim()).filter(Boolean);
    if (condition) {
      const condTags = tags.filter(isConditionTag);
      if (condTags.length !== 1 || condTags[0] !== condition) {
        tags = [...tags.filter(t => !isConditionTag(t)), condition];
        await gql(TAGS_MUT, { id: gid, t: tags });
        changed.push(`condition tag -> ${condition}`);
      }
    }

    // ── Concierge: the tag is truth, both booleans mirror it ──────────────
    const isConcierge = tags.some(t => t.toLowerCase() === 'concierge');
    if (isConcierge && p.concierge?.value !== 'true') {
      sets.push({ ownerId: gid, namespace: 'custom', key: 'concierge', type: 'boolean', value: 'true' });
      changed.push('concierge=true');
    } else if (!isConcierge && p.concierge?.value != null) {
      // Cleared, never written false — an explicit false gives the storefront filter a
      // second value and turns one checkbox into two.
      dels.push({ ownerId: gid, namespace: 'custom', key: 'concierge' });
      changed.push('concierge cleared');
    }
    const wantShipped = isConcierge ? 'true' : 'false';
    if (p.shipped?.value !== wantShipped) {
      sets.push({ ownerId: gid, namespace: 'custom', key: 'shipped_by_tps', type: 'boolean', value: wantShipped });
      changed.push(`shipped_by_tps=${wantShipped}`);
    }

    // ── Commission: FILL ONLY, never overwrite ────────────────────────────
    // This pass runs on every admin save. Overwriting here would silently re-rate a
    // listing (and change what the seller is owed) any time an unrelated field was
    // edited. A deliberate concierge toggle re-rates explicitly; see setCommission().
    if (String(p.commission?.value ?? '').trim() === '') {
      const { rate, reason } = resolveCommission({ sellerEmail: p.sellerEmail?.value, isConcierge });
      sets.push({ ownerId: gid, namespace: 'pricing', key: 'commission_rate', type: 'number_integer', value: String(rate) });
      changed.push(`commission=${rate} (${reason})`);
      const payout = payoutFor(p.ask?.value, rate);
      if (payout) { sets.push(payout(gid)); changed.push('seller_payout'); }
    }

    // ── Chest: promote a parseable measurement into its own metafield ─────
    const chest = parseChest(p.measurements?.value);
    if (chest != null && String(p.chest?.value ?? '').trim() === '') {
      sets.push({ ownerId: gid, namespace: 'custom', key: 'chest_size', type: 'single_line_text_field', value: String(chest) });
      changed.push(`chest_size=${chest}`);
    }

    if (sets.length) await gql(SET, { m: sets });
    if (dels.length) await gql(DEL, { m: dels });

    if (changed.length) console.log(`🔧 reconcileListing ${productId}: ${changed.join(', ')}`);
    return { ok: true, changed };
  } catch (err) {
    console.error(`⚠️  reconcileListing ${productId} failed:`, err.message);
    return { ok: false, changed, error: err.message };
  }
}

// lib/listing-completeness.js
// Scans live listings for missing data and returns a per-item gap list for the cleanup deck.
//
// One definition of "incomplete" lives here, so the queue, the counts, and any future
// report can never disagree about what a gap is.

import { CONDITIONS, isConditionTag } from './conditions.js';
import { parseChest, parseHip } from './measurements.js';
import { resolveCommission } from './commission.js';

const STORE = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP || 'ba42c1.myshopify.com';
const TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const ENDPOINT = `https://${STORE}/admin/api/2024-10/graphql.json`;

// Store goods and services, not consigned garments — they have no condition or measurements.
const NON_GARMENT = /gift card|dry cleaning|tps tote/i;

/**
 * Every gap the deck knows how to surface.
 *  severity: 'breaking' — actively costs money or breaks the storefront
 *            'quality'  — merchandising quality, safe to defer
 *  fixable:  'inline'   — editable on the card
 *            'shopify'  — needs Shopify admin (photos, category)
 */
export const GAP_DEFS = {
  seller:       { label: 'Seller',            severity: 'breaking', fixable: 'inline',  hint: 'Orphaned — nobody gets paid when this sells.' },
  images:       { label: 'Photos',            severity: 'breaking', fixable: 'shopify', hint: 'No photos at all. This cannot sell.' },
  condition:    { label: 'Condition',         severity: 'breaking', fixable: 'inline',  hint: 'Missing or non-canonical. Breaks the storefront filter.' },
  condition_option: { label: 'Condition option', severity: 'breaking', fixable: 'shopify', hint: 'Product has no Condition option at all — it must be added in Shopify before a value can be set.' },
  size:         { label: 'Size',              severity: 'breaking', fixable: 'inline',  hint: 'No size option.' },
  ask:          { label: 'Asking price',      severity: 'breaking', fixable: 'inline',  hint: 'Payout cannot be calculated without it.' },
  commission:   { label: 'Commission',        severity: 'breaking', fixable: 'inline',  hint: 'Payout cannot be calculated without it.' },
  commission_review: { label: 'Commission looks like concierge', severity: 'breaking', fixable: 'inline',
    hint: 'Charging a concierge-level rate but not tagged concierge. Confirm which it is.' },
  designer:     { label: 'Designer',          severity: 'breaking', fixable: 'inline',  hint: 'Listed with no vendor.' },
  category:     { label: 'Category',          severity: 'quality',  fixable: 'shopify', hint: 'No Shopify category — weakens filtering.' },
  chest:        { label: 'Chest',             severity: 'quality',  fixable: 'inline',  hint: 'Needed for the chest-size filter.' },
  hip:          { label: 'Hip',               severity: 'quality',  fixable: 'inline',  hint: '' },
  measurements: { label: 'Measurements',      severity: 'quality',  fixable: 'inline',  hint: 'No measurements at all.' },
  material:     { label: 'Material',          severity: 'quality',  fixable: 'inline',  hint: '' },
  retail:       { label: 'Original retail',   severity: 'quality',  fixable: 'inline',  hint: 'Drives the “you save” badge.' },
  description:  { label: 'Description',       severity: 'quality',  fixable: 'inline',  hint: '' },
  images_few:   { label: 'More photos',       severity: 'quality',  fixable: 'shopify', hint: 'Fewer than three photos.' },
};

// Fix-first order used by the card and by the "most broken" sort.
export const GAP_ORDER = ['seller','condition_option','condition','size','designer','ask','commission','commission_review','images','category',
  'chest','hip','measurements','material','retail','description','images_few'];

async function gql(query, variables, attempt = 0) {
  const res = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) {
    if (JSON.stringify(json.errors).includes('THROTTLED') && attempt < 6) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      return gql(query, variables, attempt + 1);
    }
    throw new Error('Shopify: ' + JSON.stringify(json.errors).slice(0, 200));
  }
  return json.data;
}

const QUERY = `query($c:String,$q:String){ products(first:50, query:$q, after:$c){
  pageInfo{ hasNextPage endCursor }
  edges{ node{
    id title vendor status descriptionHtml handle
    featuredImage{ url } mediaCount{ count } category{ name }
    tags
    options{ name optionValues{ name } }
    variants(first:1){ edges{ node{ id price } } }
    metafields(first:40){ edges{ node{ namespace key value } } }
  } } } }`;

const has = v => v !== null && v !== undefined && String(v).trim() !== '';

/**
 * Scan listings and return every one with at least one gap.
 * @param {{ status?: string }} opts  status defaults to 'active'
 */
export async function scanCompleteness({ status = 'active' } = {}) {
  const nodes = []; let cursor = null;
  do {
    const d = await gql(QUERY, { c: cursor, q: `status:${status}` });
    nodes.push(...d.products.edges.map(e => e.node));
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cursor);

  const garments = nodes.filter(p => !NON_GARMENT.test(p.title));
  const items = [];

  for (const p of garments) {
    const mf = (ns, k) => p.metafields.edges.find(e => e.node.namespace === ns && e.node.key === k)?.node.value ?? null;
    const measurements = mf('custom', 'measurements') || '';
    const chestMf = mf('custom', 'chest_size');
    const chest = has(chestMf) ? chestMf : (parseChest(measurements) ?? '');
    const hip = parseHip(measurements) ?? '';
    const condOpt = p.options.find(o => /^conditions?$/i.test(o.name.trim()));
    const sizeOpt = p.options.find(o => /^size$/i.test(o.name.trim()));
    const condValue = condOpt?.optionValues?.[0]?.name ?? null;
    const condTags = p.tags.filter(isConditionTag);
    const description = (p.descriptionHtml || '').replace(/<[^>]*>/g, '').trim();

    const gaps = [];
    // Condition covers the option AND the tag — they are one thing to the admin, and the
    // patch endpoint rewrites the tag from the option, so there is nothing separate to edit.
    // But a product with no Condition OPTION cannot have a value set on it by the API at
    // all; the option has to be created in Shopify first. Surface that as its own gap so
    // the card links out instead of offering a dropdown that silently does nothing.
    if (!condOpt) gaps.push('condition_option');
    else if (!CONDITIONS.includes(condValue) ||
             condTags.length !== 1 || !CONDITIONS.includes(condTags[0])) gaps.push('condition');
    if (!sizeOpt) gaps.push('size');
    if (!has(p.vendor) || p.vendor === 'Unknown Designer') gaps.push('designer');
    if (!has(mf('seller', 'email')) && !has(mf('seller', 'id'))) gaps.push('seller');
    if (!has(mf('pricing', 'seller_asking_price'))) gaps.push('ask');
    const commissionRate = mf('pricing', 'commission_rate');
    const sellerEmail = mf('seller', 'email');
    const isConcierge = p.tags.some(t => t.trim().toLowerCase() === 'concierge');
    const expected = resolveCommission({ sellerEmail, isConcierge });
    if (!has(commissionRate)) gaps.push('commission');
    else if (!has(mf('pricing', 'rate_reviewed')) &&
             expected.reason === 'default' &&
             Number(commissionRate) >= 30) {
      // A concierge-level rate on an untagged item. No data signal separates "this is
      // concierge and was never tagged" from "this is a deliberate arrangement" — the
      // listing_type metafield is empty storewide, transactions all say 'regular', and
      // creation dates do not split the groups. So a human decides, once, per item.
      gaps.push('commission_review');
    }
    if (!has(chest)) gaps.push('chest');
    if (!has(measurements)) gaps.push('measurements');
    else if (!has(hip)) gaps.push('hip');
    const material = mf('custom', 'material_') || mf('custom', 'material') || mf('custom-hand', 'material') || mf('circle-hand', 'material');
    if (!has(material)) gaps.push('material');
    if (!has(mf('custom', 'estimated_retail_price'))) gaps.push('retail');
    if (!has(description)) gaps.push('description');
    if (!p.featuredImage) gaps.push('images');
    else if (p.mediaCount.count < 3) gaps.push('images_few');
    if (!p.category) gaps.push('category');
    if (!gaps.length) continue;

    gaps.sort((a, b) => GAP_ORDER.indexOf(a) - GAP_ORDER.indexOf(b));
    items.push({
      id: p.id.split('/').pop(), handle: p.handle, title: p.title, vendor: p.vendor || '',
      image: p.featuredImage?.url || null, mediaCount: p.mediaCount.count,
      price: p.variants.edges[0]?.node.price ?? null,
      size: sizeOpt?.optionValues?.[0]?.name ?? '',
      condition: condValue && CONDITIONS.includes(condValue) ? condValue : '',
      conditionRaw: condValue ?? '', conditionTags: condTags,
      measurements, chest: String(chest ?? ''), hip: String(hip ?? ''),
      material: material || '',
      seller: mf('seller', 'email') || '',
      commission: commissionRate || '',
      expectedCommission: expected.rate, expectedReason: expected.reason,
      isConcierge,
      retail: mf('custom', 'estimated_retail_price') || '',
      description,
      category: p.category?.name || '',
      gaps,
      breaking: gaps.filter(g => GAP_DEFS[g]?.severity === 'breaking').length,
    });
  }

  return {
    scanned: garments.length,
    complete: garments.length - items.length,
    items,
  };
}

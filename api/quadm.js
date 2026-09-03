// api/quadm.js
// Backs the QUADM pop-up page (/admin/quadm).
//
// Shopify is the source of truth for WHICH items are in the pop-up (tag:quadm)
// and for their catalogue data. Tag a product in Shopify and it shows up here;
// untag it and it drops off. Nothing in this file writes to Shopify.
//
// The quadm_items table holds only what Shopify has no field for: which
// container a piece is packed in, its status on the floor, and notes.

import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { verifyToken } from '../lib/auth-utils.js';
import { withCache, cacheBust } from '../lib/cache.js';

const CACHE_KEY = 'quadm:items';
const CACHE_TTL = 90; // seconds — long enough to survive a rush of phone refreshes

// Boxes are shipped. Their contents are fixed; only these are still movable.
const OPEN_CONTAINERS = ['Suitcase 1', 'Suitcase 2', 'Carry-on'];

const ITEMS_QUERY = `
  query($after: String) {
    products(first: 100, query: "tag:quadm", after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        vendor
        status
        totalInventory
        tags
        featuredImage { url(transform: {maxWidth: 700, maxHeight: 900, preferredContentType: WEBP}) }
        images(first: 5) {
          nodes { url(transform: {maxWidth: 1200, maxHeight: 1600, preferredContentType: WEBP}) }
        }
        priceRangeV2 { minVariantPrice { amount } }
        size:     metafield(namespace: "circle-hand", key: "size")   { value }
        colour:   metafield(namespace: "circle-hand", key: "color")  { value }
        cond:     metafield(namespace: "custom", key: "condition")   { value }
        material: metafield(namespace: "custom", key: "material_")   { value }
        measure:  metafield(namespace: "custom", key: "measurements"){ value }
        retail:   metafield(namespace: "custom", key: "estimated_retail_price") { value }
      }
    }
  }
`;

async function shopifyGraphql(query, variables) {
  const url = process.env.VITE_SHOPIFY_STORE_URL;
  const token = process.env.VITE_SHOPIFY_ACCESS_TOKEN;
  const res = await fetch(`https://${url}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

/** Size lives in a metafield on some listings and only in the tags on others. */
const SIZE_TAGS = {
  'extra small': 'XS', xs: 'XS',
  small: 'S', s: 'S',
  medium: 'M', m: 'M',
  large: 'L', l: 'L',
  'extra large': 'XL', xl: 'XL',
};
function sizeOf(node) {
  const mf = (node.size?.value || '').trim();
  if (mf) return SIZE_TAGS[mf.toLowerCase()] || mf;
  for (const t of node.tags || []) {
    const hit = SIZE_TAGS[t.trim().toLowerCase()];
    if (hit) return hit;
  }
  return '';
}

async function fetchItems() {
  const out = [];
  let after = null;
  do {
    const data = await shopifyGraphql(ITEMS_QUERY, { after });
    const page = data.products;
    for (const n of page.nodes) {
      out.push({
        id: n.id.split('/').pop(),
        name: n.title,
        designer: n.vendor && n.vendor !== 'Unknown' ? n.vendor : '',
        size: sizeOf(n),
        colour: n.colour?.value || '',
        price: Number(n.priceRangeV2?.minVariantPrice?.amount) || null,
        retail: Number(n.retail?.value) || null,
        cond: n.cond?.value || '',
        material: n.material?.value || '',
        measure: n.measure?.value || '',
        concierge: (n.tags || []).some(t => t.trim().toLowerCase() === 'concierge'),
        sold: n.totalInventory === 0,
        imgs: (n.images?.nodes || []).map(i => i.url).filter(Boolean),
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function isAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  if (token === 'email-auth') return true; // legacy admin tokens, as in api/scripts.js
  const decoded = verifyToken(token);
  return !!decoded && decoded.type === 'admin';
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, POST, OPTIONS')) return;

  // Seller and admin tokens are signed with the same JWT_SECRET and are told
  // apart only by `type`, so checking the signature alone would let any signed-in
  // seller read and write this page. Match the check the other admin endpoints use.
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query.action || 'all';

  try {
    if (req.method === 'GET' && action === 'all') {
      const refresh = req.query.refresh === '1';
      if (refresh) await cacheBust(CACHE_KEY);

      const [items, stateRes] = await Promise.all([
        withCache(CACHE_KEY, CACHE_TTL, fetchItems),
        supabase.from('quadm_items').select('*'),
      ]);
      if (stateRes.error) throw new Error(stateRes.error.message);

      const state = {};
      for (const row of stateRes.data || []) {
        state[row.product_id] = {
          container: row.container,
          status: row.status,
          notes: row.notes || [],
          updatedAt: row.updated_at,
        };
      }
      return res.status(200).json({ items, state, containers: OPEN_CONTAINERS });
    }

    if (req.method === 'POST' && action === 'state') {
      const { productId, container, status, notes, actor } = req.body || {};
      if (!productId) return res.status(400).json({ error: 'productId required' });
      if (status && !['avail', 'held', 'sold'].includes(status)) {
        return res.status(400).json({ error: 'status must be avail, held or sold' });
      }

      const patch = { product_id: String(productId), updated_at: new Date().toISOString() };
      if (container !== undefined) patch.container = container || null;
      if (status !== undefined) patch.status = status;
      if (notes !== undefined) patch.notes = notes;
      if (actor) patch.updated_by = String(actor).slice(0, 80);

      const { data, error } = await supabase
        .from('quadm_items')
        .upsert(patch, { onConflict: 'product_id' })
        .select()
        .single();
      if (error) throw new Error(error.message);

      return res.status(200).json({
        ok: true,
        row: {
          container: data.container,
          status: data.status,
          notes: data.notes || [],
          updatedAt: data.updated_at,
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('quadm error:', err);
    return res.status(500).json({ error: err.message });
  }
}

#!/usr/bin/env node
/**
 * audit-listings.js
 * Dry-run audit of all Shopify listings.
 * Reports: size inconsistencies, missing tags, missing prices, problem items.
 * Makes NO changes to Shopify.
 *
 * Usage:
 *   node scripts/audit-listings.js
 *   node scripts/audit-listings.js --json   (output as JSON for piping)
 */

import { config } from 'dotenv';
import { writeFileSync } from 'fs';
config({ path: '.env.prod' });

const SHOP = (process.env.SHOPIFY_SHOP || '').replace(/\n/g, '').trim();
const TOKEN = (process.env.SHOPIFY_ACCESS_TOKEN || '').replace(/\n/g, '').trim();
const JSON_MODE = process.argv.includes('--json');

if (!SHOP || !TOKEN) {
  console.error('Missing SHOPIFY_SHOP or SHOPIFY_ACCESS_TOKEN in .env.prod');
  process.exit(1);
}

// ─── Canonical size map ───────────────────────────────────────────────────────
const SIZE_MAP = {
  // Women's
  'xxs': 'XXS',
  'extra extra small': 'XXS',
  'xs': 'XS',
  'extra small': 'XS',
  'xsmall': 'XS',
  's': 'S',
  'small': 'S',
  'sm': 'S',
  'm': 'M',
  'medium': 'M',
  'med': 'M',
  'l': 'L',
  'large': 'L',
  'lg': 'L',
  'xl': 'XL',
  'extra large': 'XL',
  'xlarge': 'XL',
  'xxl': 'XXL',
  'extra extra large': 'XXL',
  '2xl': 'XXL',
  'xxxl': 'XXXL',
  '3xl': 'XXXL',
  // Kids — canonical forms
  '0-6 months': '0-6M',
  '0-6m': '0-6M',
  '6-12 months': '6-12M',
  '6-12m': '6-12M',
  '1-2 years': '1-2Y',
  '1-2 yrs': '1-2Y',
  '1-2y': '1-2Y',
  '2-3 years': '2-3Y',
  '2-3 yrs': '2-3Y',
  '2-3y': '2-3Y',
  '3-4 years': '3-4Y',
  '3-4 yrs': '3-4Y',
  '3-4y': '3-4Y',
  '4-5 years': '4-5Y',
  '4-5 yrs': '4-5Y',
  '4-5y': '4-5Y',
  '4y': '4Y',
  '5-6 years': '5-6Y',
  '5-6 yrs': '5-6Y',
  '5-6y': '5-6Y',
  '6y': '6Y',
  '6-7 years': '6-7Y',
  '6-7y': '6-7Y',
  '7-8 years': '7-8Y',
  '7-8 yrs': '7-8Y',
  '7-8y': '7-8Y',
  '8-9 years': '8-9Y',
  '8-9y': '8-9Y',
  '9-10 years': '9-10Y',
  '9-10y': '9-10Y',
};

const ALREADY_CANONICAL = new Set(Object.values(SIZE_MAP));

function canonicalSize(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (SIZE_MAP[lower]) return SIZE_MAP[lower];
  if (ALREADY_CANONICAL.has(raw)) return raw; // already correct
  return null; // unknown / can't map
}

// ─── Fetch all products (paginated) ──────────────────────────────────────────
async function fetchByStatus(status) {
  const products = [];
  let url = `https://${SHOP}/admin/api/2024-10/products.json?limit=250&status=${status}`;

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': TOKEN } });

    if (!res.ok) {
      console.error(`Shopify API error (${status}): ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    const batch = data.products || [];
    batch.forEach(p => { p._status = status; });
    products.push(...batch);

    const linkHeader = res.headers.get('link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;

    if (!JSON_MODE) process.stdout.write(`\rFetched ${products.length} products (${status})...`);
  }
  return products;
}

async function fetchAllProducts() {
  const active = await fetchByStatus('active');
  const draft = await fetchByStatus('draft');
  if (!JSON_MODE) console.log('');
  return [...active, ...draft];
}

// ─── Audit ────────────────────────────────────────────────────────────────────
async function audit() {
  if (!JSON_MODE) console.log(`\n🔍 Auditing all Shopify listings...\n`);

  const products = await fetchAllProducts();

  const issues = {
    size_needs_fix: [],        // Size variant not in canonical form
    size_unknown: [],          // Size variant we can't map (M/L, S/M, etc.)
    missing_ch_size_tag: [],   // No CH-size-X tag
    missing_ch_brand_tag: [],  // No CH-brand-X tag
    zero_price: [],            // Price is $0
    no_price: [],              // Price is blank/null
    default_title: [],         // Variant is "Default Title" (no size set)
    brand_in_variant: [],      // option2 is brand name (fine) but CH-brand tag missing
    tag_size_mismatch: [],     // CH-size tag doesn't match variant size
  };

  const summary = {
    total: products.length,
    clean: 0,
    has_issues: 0,
  };

  for (const p of products) {
    const tags = p.tags ? p.tags.split(',').map(t => t.trim()) : [];
    const tagSet = new Set(tags);
    const productIssues = [];

    // Get CH-size tag value
    const chSizeTag = tags.find(t => t.startsWith('CH-size-'));
    const chSizeValue = chSizeTag ? chSizeTag.replace('CH-size-', '') : null;

    // Get CH-brand tag value
    const chBrandTag = tags.find(t => t.startsWith('CH-brand-'));

    for (const variant of p.variants || []) {
      const rawSize = variant.option1;
      const price = parseFloat(variant.price || '0');

      // Default Title check
      if (rawSize === 'Default Title') {
        issues.default_title.push({ id: p.id, title: p.title, handle: p.handle });
        productIssues.push('default_title');
        continue;
      }

      // Price checks
      if (!variant.price || variant.price === '') {
        issues.no_price.push({ id: p.id, title: p.title, handle: p.handle, price: variant.price });
        productIssues.push('no_price');
      } else if (price === 0) {
        issues.zero_price.push({ id: p.id, title: p.title, handle: p.handle, price: variant.price });
        productIssues.push('zero_price');
      }

      // Size canonicalization
      const canonical = canonicalSize(rawSize);
      if (canonical === null) {
        // Can't map — unknown format
        issues.size_unknown.push({ id: p.id, title: p.title, rawSize, tags: p.tags });
        productIssues.push('size_unknown');
      } else if (canonical !== rawSize) {
        // Needs fixing
        issues.size_needs_fix.push({
          id: p.id,
          title: p.title,
          handle: p.handle,
          variantId: variant.id,
          rawSize,
          canonical,
        });
        productIssues.push('size_needs_fix');
      }

      // CH-size tag check
      if (!chSizeTag) {
        issues.missing_ch_size_tag.push({ id: p.id, title: p.title, rawSize, canonical });
        productIssues.push('missing_ch_size_tag');
      } else if (canonical && chSizeValue !== canonical) {
        // Tag exists but doesn't match variant
        issues.tag_size_mismatch.push({
          id: p.id, title: p.title,
          variantSize: rawSize, canonical,
          tagSize: chSizeValue
        });
        productIssues.push('tag_size_mismatch');
      }
    }

    // CH-brand tag check
    if (!chBrandTag) {
      issues.missing_ch_brand_tag.push({ id: p.id, title: p.title, tags: p.tags });
      productIssues.push('missing_ch_brand_tag');
    }

    if (productIssues.length === 0) {
      summary.clean++;
    } else {
      summary.has_issues++;
    }
  }

  return { issues, summary, total: products.length };
}

// ─── Print report ─────────────────────────────────────────────────────────────
function printReport({ issues, summary }) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PHIRSTORY LISTING AUDIT REPORT');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Total listings:   ${summary.total}`);
  console.log(`  ✅ Clean:         ${summary.clean}`);
  console.log(`  ⚠️  Has issues:   ${summary.has_issues}`);
  console.log('');

  // 1. Zero / missing price — most urgent
  if (issues.zero_price.length || issues.no_price.length) {
    console.log(`🚨 PRICE ISSUES — NEEDS IMMEDIATE ACTION`);
    console.log('─────────────────────────────────────────');
    [...issues.zero_price, ...issues.no_price].forEach(p => {
      const type = issues.zero_price.includes(p) ? '$0 price' : 'no price';
      console.log(`  [${type}] ${p.title}`);
      console.log(`    https://ba42c1.myshopify.com/admin/products/${p.id}`);
    });
    console.log('');
  }

  // 2. Default Title — no size set
  if (issues.default_title.length) {
    console.log(`⚠️  DEFAULT TITLE (no size set) — ${issues.default_title.length} items`);
    console.log('─────────────────────────────────────────');
    issues.default_title.forEach(p => {
      console.log(`  ${p.title}`);
      console.log(`    https://ba42c1.myshopify.com/admin/products/${p.id}`);
    });
    console.log('');
  }

  // 3. Size needs fix
  if (issues.size_needs_fix.length) {
    console.log(`📐 SIZE VARIANT NEEDS FIXING — ${issues.size_needs_fix.length} items`);
    console.log('─────────────────────────────────────────');
    issues.size_needs_fix.forEach(p => {
      console.log(`  "${p.rawSize}" → "${p.canonical}"   ${p.title}`);
    });
    console.log('');
  }

  // 4. Unknown sizes
  if (issues.size_unknown.length) {
    console.log(`❓ UNKNOWN SIZE (can't auto-fix) — ${issues.size_unknown.length} items`);
    console.log('─────────────────────────────────────────');
    issues.size_unknown.forEach(p => {
      console.log(`  "${p.rawSize}"   ${p.title}`);
    });
    console.log('');
  }

  // 5. Missing CH-size tag
  if (issues.missing_ch_size_tag.length) {
    console.log(`🏷️  MISSING CH-size TAG — ${issues.missing_ch_size_tag.length} items`);
    console.log('─────────────────────────────────────────');
    issues.missing_ch_size_tag.slice(0, 20).forEach(p => {
      const would = p.canonical ? `would add: CH-size-${p.canonical}` : 'size unknown, manual fix needed';
      console.log(`  ${p.title}  [${would}]`);
    });
    if (issues.missing_ch_size_tag.length > 20) {
      console.log(`  ... and ${issues.missing_ch_size_tag.length - 20} more`);
    }
    console.log('');
  }

  // 6. Missing CH-brand tag
  if (issues.missing_ch_brand_tag.length) {
    console.log(`🏷️  MISSING CH-brand TAG — ${issues.missing_ch_brand_tag.length} items`);
    console.log('─────────────────────────────────────────');
    issues.missing_ch_brand_tag.slice(0, 20).forEach(p => {
      console.log(`  ${p.title}`);
    });
    if (issues.missing_ch_brand_tag.length > 20) {
      console.log(`  ... and ${issues.missing_ch_brand_tag.length - 20} more`);
    }
    console.log('');
  }

  // 7. Tag/size mismatch
  if (issues.tag_size_mismatch.length) {
    console.log(`🔀 SIZE TAG MISMATCH (variant ≠ CH-size tag) — ${issues.tag_size_mismatch.length} items`);
    console.log('─────────────────────────────────────────');
    issues.tag_size_mismatch.forEach(p => {
      console.log(`  variant="${p.variantSize}" but tag="CH-size-${p.tagSize}"   ${p.title}`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Run with --fix flag to apply all auto-fixable changes');
  console.log('═══════════════════════════════════════════════════════\n');
}

// ─── Run ──────────────────────────────────────────────────────────────────────
audit().then(result => {
  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
    writeFileSync('scripts/audit-report.json', JSON.stringify(result, null, 2));
  } else {
    printReport(result);
    writeFileSync('scripts/audit-report.json', JSON.stringify(result, null, 2));
    console.log('Full report saved to: scripts/audit-report.json\n');
  }
}).catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});

// lib/sizes.js — SINGLE SOURCE OF TRUTH for garment size.
//
// Same job lib/conditions.js does for condition: one canonical vocabulary that the Size
// product option, the size tag, and every dropdown all read from.
//
// Adult sizes use LETTERS. That is both the majority form already in the store and the
// only form Shopify's standard `shopify.size` taxonomy recognises, so letters link
// cleanly and the storefront size filter works. Kids sizes use the abbreviated form.
//
// Docs: SIZE_TAXONOMY.md

/** Adult letter sizes, smallest to largest. These link to the shopify.size taxonomy. */
export const ADULT_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Sizes that are real but sit outside the letter scale. */
export const SPECIAL_SIZES = ['One Size', 'Unstitched'];

/** Only XS–XXL exist as standard shopify.size metaobjects. */
export const TAXONOMY_LINKABLE = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/** Everything a dropdown should offer, in order. */
export const SIZES = [...ADULT_SIZES, ...SPECIAL_SIZES];

const ADULT_ALIASES = {
  'xxs': 'XXS', 'xxsmall': 'XXS', 'xx-small': 'XXS', '2xs': 'XXS',
  'xs': 'XS', 'xsmall': 'XS', 'x-small': 'XS', 'extra small': 'XS', 'extrasmall': 'XS',
  's': 'S', 'small': 'S', 'sm': 'S',
  'm': 'M', 'medium': 'M', 'med': 'M',
  'l': 'L', 'large': 'L', 'lg': 'L',
  'xl': 'XL', 'xlarge': 'XL', 'x-large': 'XL', 'extra large': 'XL', 'extralarge': 'XL',
  'xxl': 'XXL', 'xxlarge': 'XXL', '2xl': 'XXL', 'xx-large': 'XXL',
  'xxxl': 'XXXL', '3xl': 'XXXL', 'xxxlarge': 'XXXL',
  'one size': 'One Size', 'onesize': 'One Size', 'os': 'One Size', 'free size': 'One Size', 'freesize': 'One Size',
  'unstitched': 'Unstitched', 'un-stitched': 'Unstitched',
};

const tidy = s => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Kids sizes normalise to a compact form: "7-8Y", "6Y", "6-12M", "0-6M".
 * Accepts "7-8 Years", "6- 7 Years", "6 - 12 months", "7-8y" and so on.
 * @returns {string|null}
 */
export function canonicalKidsSize(raw) {
  const s = tidy(raw).toLowerCase();
  // "3-4 years" / "3-4y" / "3 - 4 yrs"
  const range = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*(years?|yrs?|y|months?|mos?|m)$/);
  if (range) {
    const unit = /^m/.test(range[3]) ? 'M' : 'Y';
    return `${parseInt(range[1], 10)}-${parseInt(range[2], 10)}${unit}`;
  }
  // "6 years" / "6y" / "2 months"
  const single = s.match(/^(\d{1,2})\s*(years?|yrs?|y|months?|mos?|m)$/);
  if (single) {
    const unit = /^m/.test(single[2]) ? 'M' : 'Y';
    return `${parseInt(single[1], 10)}${unit}`;
  }
  return null;
}

/** True for a canonical kids size like "7-8Y" or "6M". */
export function isKidsSize(value) {
  return /^\d{1,2}(-\d{1,2})?[YM]$/.test(tidy(value));
}

/**
 * A between-sizes combo such as "S/M", "M/L", "XS/S".
 * Returns the component canonical sizes, or null.
 * @returns {string[]|null}
 */
export function parseCombo(raw) {
  const parts = tidy(raw).split(/\s*[/&+]\s*/);
  if (parts.length < 2) return null;
  const mapped = parts.map(p => ADULT_ALIASES[p.toLowerCase()] ?? null);
  if (mapped.some(m => m === null || !ADULT_SIZES.includes(m))) return null;
  // Keep the store's smallest-to-largest order regardless of how it was typed.
  return [...new Set(mapped)].sort((a, b) => ADULT_SIZES.indexOf(a) - ADULT_SIZES.indexOf(b));
}

/**
 * Resolve any size string to its canonical form, or null if undecidable.
 * Combos are NOT resolved here — they mean two sizes, so callers must use parseCombo.
 * @returns {string|null}
 */
export function canonicalSize(raw) {
  const s = tidy(raw);
  if (!s) return null;
  const low = s.toLowerCase();
  if (ADULT_ALIASES[low]) return ADULT_ALIASES[low];
  const kids = canonicalKidsSize(s);
  if (kids) return kids;
  // "Small (16)" — a letter with a numeric system bolted on.
  const paren = low.match(/^([a-z ]+?)\s*\(\s*\d+\s*\)$/);
  if (paren && ADULT_ALIASES[paren[1].trim()]) return ADULT_ALIASES[paren[1].trim()];
  // "10 (S)" — numeric with the letter in parentheses.
  const inner = low.match(/^\d+\s*\(\s*(xxs|xs|s|m|l|xl|xxl)\s*\)$/);
  if (inner) return inner[1].toUpperCase();
  return null;
}

/** True if a tag is a size tag (exact match on a known form only). */
export function isSizeTag(tag) {
  const s = tidy(tag);
  if (!s) return false;
  if (ADULT_ALIASES[s.toLowerCase()] !== undefined) return true;
  if (canonicalKidsSize(s)) return true;
  if (parseCombo(s)) return true;
  return SIZES.includes(s);
}

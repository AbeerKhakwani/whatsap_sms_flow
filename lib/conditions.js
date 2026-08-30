// lib/conditions.js — SINGLE SOURCE OF TRUTH for item condition.
//
// Every dropdown, every Shopify write, and the migration script all read from here.
// Before this existed the same 5-item list was copy-pasted into 6 files and none of
// them agreed, which is how the store ended up with 14 distinct condition values.
//
// Docs: CONDITION_TAXONOMY.md

/** The only condition values allowed to exist. Ordered best → worst (dropdown order). */
export const CONDITIONS = ['NWT', 'NWOT', 'Like New', 'Very Good', 'Fair'];

/** Longer labels for UI where the abbreviation isn't self-explanatory. */
export const CONDITION_LABELS = {
  'NWT': 'NWT — New with tags',
  'NWOT': 'NWOT — New without tags',
  'Like New': 'Like New',
  'Very Good': 'Very Good',
  'Fair': 'Fair',
};

/**
 * Every historical spelling we've seen in the store, mapped to its canonical value.
 * Keys are lowercased and whitespace-collapsed. Matched longest-first as a PREFIX,
 * so free-text like "Very Good - minimal signs of wear" resolves to Excellent.
 *
 * Deliberate merges (see CONDITION_TAXONOMY.md):
 *   Good, Excellent  → Very Good   (one "worn but sound" tier, named so it clearly
 *                                   ranks BELOW Like New — "Excellent" read as better)
 *   Brand New        → NWT
 *   Used, Poor       → Fair
 */
export const CONDITION_ALIASES = {
  // ── NWT ────────────────────────────────────────────────────────────────
  'nwt': 'NWT',
  'nwt - new with tags': 'NWT',
  'nwt- new with tags': 'NWT',
  'nwt - never worn': 'NWT',
  'new with tags': 'NWT',
  'new with tags (nwt)': 'NWT',
  'new w/tags': 'NWT',
  'new w tags': 'NWT',
  'brand new': 'NWT',
  'new': 'NWT',

  // ── NWOT ───────────────────────────────────────────────────────────────
  // MUST stay distinct from the "new with tags" keys above; prefix matching is
  // longest-first, so "new without tags" never collapses into "new".
  'nwot': 'NWOT',
  'nwot - new without tags': 'NWOT',
  'nwot- new without tags': 'NWOT',
  'new without tags': 'NWOT',
  'new without tags (nwot)': 'NWOT',

  // ── Like New ───────────────────────────────────────────────────────────
  'like new': 'Like New',
  'like-new': 'Like New',
  'likenew': 'Like New',
  'mint': 'Like New',

  // ── Very Good ──────────────────────────────────────────────────────────
  'very good': 'Very Good',
  'very-good': 'Very Good',
  'verygood': 'Very Good',
  'excellent': 'Very Good',
  'excellent condition': 'Very Good',
  'euc': 'Very Good',
  'good': 'Very Good',
  'good condition': 'Very Good',
  'gently used': 'Very Good',

  // ── Fair ───────────────────────────────────────────────────────────────
  'fair': 'Fair',
  'used': 'Fair',
  'poor': 'Fair',
};

// Longest key first so "new without tags" wins over "new", and
// "excellent condition" wins over "excellent".
const ALIAS_KEYS = Object.keys(CONDITION_ALIASES).sort((a, b) => b.length - a.length);

/** Lowercase, collapse whitespace/newlines, drop trailing punctuation. */
function tidy(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.,;:!*|]+$/, '')
    .trim();
}

/**
 * Resolve any condition string to a canonical value, or null if undecidable.
 *
 * Handles the exact value ("Very Good") and the free-text metafield form
 * ("Very Good - Minimum signs of wear\n*tiny hole on top of shalwar"), because
 * `custom.condition` is a description, not a taxonomy.
 *
 * @param {string} raw
 * @returns {'NWT'|'NWOT'|'Like New'|'Excellent'|'Fair'|null}
 */
export function canonicalCondition(raw) {
  const s = tidy(raw);
  if (!s) return null;
  if (CONDITION_ALIASES[s]) return CONDITION_ALIASES[s];

  // Free text: match a known grade at the START of the string only. Matching
  // anywhere would misgrade "Good - no signs of wear like new items" and the
  // like, and a grade mentioned mid-sentence is describing something else.
  for (const key of ALIAS_KEYS) {
    if (s.length > key.length) {
      const next = s[key.length];
      // Require a word boundary so "newport" never matches "new".
      if (s.startsWith(key) && !/[a-z0-9]/.test(next)) return CONDITION_ALIASES[key];
    }
  }
  return null;
}

/** True if a Shopify tag is a condition tag (exact match only — never a prefix). */
export function isConditionTag(tag) {
  const s = tidy(tag);
  return Boolean(s) && (CONDITION_ALIASES[s] !== undefined || CONDITIONS.includes(String(tag).trim()));
}

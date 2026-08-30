// lib/measurements.js — parse and safely merge the free-text `custom.measurements` field.
//
// `custom.measurements` is admin/seller-written prose, not a schema. Real values include:
//   "Medium"
//   "Medium | Chest: 20\" | Waist: 17\""
//   "Medium | Shoulder - 15.5” |  Chest - 21” |\nLength - 48\""
//   "Extra Large | US - 16 | Shoulder: 38 | Bust: 38 | Length: 57"
//
// It previously got REBUILT from chest+hip on every admin save, which silently destroyed
// every other part (size label, shoulder, waist, length) on 230 live products. Merge into
// it; never regenerate it.

const NUM = '([0-9]+(?:\\.[0-9]+)?)';
// Accepts "Chest: 20", "Chest - 21”", "Chest — 21\"", "Chest 21". Smart quotes included.
const field = name => new RegExp(`\\b(${name})\\b\\s*[:\\-–—]?\\s*${NUM}(?:\\s*["”″′'])?`, 'i');

const CHEST = field('chest|bust|pit to pit|pit-to-pit');
const HIP   = field('hip|hips');

/** Pull a numeric chest measurement out of free text, or null. Tolerates dash and colon forms. */
export function parseChest(text) {
  const m = CHEST.exec(String(text || ''));
  return m ? parseFloat(m[2]) : null;
}

/** Pull a numeric hip measurement out of free text, or null. */
export function parseHip(text) {
  const m = HIP.exec(String(text || ''));
  return m ? parseFloat(m[2]) : null;
}

/**
 * Merge chest/hip into an existing measurements string WITHOUT discarding anything else.
 *
 * - Updates a value in place when that field already appears (keeping the author's separator).
 * - Appends ` | Chest: 21"` only when the field is genuinely absent.
 * - Returns `existing` unchanged when there is nothing to add — an empty chest/hip never
 *   blanks a populated field.
 *
 * @param {string} existing current metafield value
 * @param {{chest?:string|number, hip?:string|number}} next
 * @returns {string}
 */
export function mergeMeasurements(existing, { chest, hip } = {}) {
  let out = String(existing || '').trim();
  const upsert = (re, label, value) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const num = String(value).trim();
    if (re.test(out)) {
      // Keep whatever separator the author used; swap only the number.
      out = out.replace(re, (full, name) => {
        const sep = /[:\-–—]/.exec(full)?.[0] || ':';
        return `${name}${sep === ':' ? ': ' : ` ${sep} `}${num}"`;
      });
    } else {
      out = out ? `${out} | ${label}: ${num}"` : `${label}: ${num}"`;
    }
  };
  upsert(CHEST, 'Chest', chest);
  upsert(HIP, 'Hip', hip);
  return out;
}

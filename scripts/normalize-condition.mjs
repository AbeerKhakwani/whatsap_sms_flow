// scripts/normalize-condition.mjs
// Reversible migration: force every product's Condition OPTION VALUE and condition TAG to one
// of the 5 canonical values in lib/conditions.js. Dry-run by default; snapshots before writing.
//
// METAFIELDS ARE NEVER WRITTEN. `custom.condition` is free-text carrying seller flaw disclosures
// ("Very Good - one tiny hole (unnoticeable) in front, see picture"). It is read to DECIDE the
// grade and then left completely alone, to be cleaned by hand in Shopify admin.
//
//   node scripts/normalize-condition.mjs                    # dry-run + snapshot (no store writes)
//   node scripts/normalize-condition.mjs --conflicts        # dry-run, show only disagreements
//   node scripts/normalize-condition.mjs --apply --limit=5  # apply to first 5 (test batch)
//   node scripts/normalize-condition.mjs --apply            # full apply
// Rollback: node scripts/rollback-condition.mjs --from=<snapshot> --apply

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { CONDITIONS, canonicalCondition, isConditionTag } from '../lib/conditions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod'), quiet: true });

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const APPLY = process.argv.includes('--apply');
const ONLY_CONFLICTS = process.argv.includes('--conflicts');
const limArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;
if (!TOKEN) { console.error('Missing SHOPIFY_MIGRATION_TOKEN in .env.prod'); process.exit(1); }

// Products that legitimately have no condition — services and store goods, not consigned garments.
const NON_GARMENT = /gift card|dry cleaning|tps tote/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gql(query, variables, attempt = 0) {
  const res = await fetch(API, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (j.errors) {
    if (JSON.stringify(j.errors).includes('THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1)); return gql(query, variables, attempt + 1);
    }
    throw new Error(JSON.stringify(j.errors).slice(0, 240));
  }
  return j.data;
}

const OPT_MUT = `mutation($p:ID!,$o:OptionUpdateInput!,$vals:[OptionValueUpdateInput!]){
  productOptionUpdate(productId:$p, option:$o, optionValuesToUpdate:$vals){ userErrors{ field message } } }`;
const TAG_MUT = `mutation($p:ID!,$t:[String!]!){ productUpdate(product:{id:$p, tags:$t}){ userErrors{ field message } } }`;

async function main() {
  // ── Fetch every product, all statuses (archived included — they get unarchived later) ──
  const prods = []; let cur = null;
  do {
    const d = await gql(`query($c:String){ products(first:60, after:$c){ pageInfo{ hasNextPage endCursor }
      edges{ node{ id title status tags
        options{ id name position optionValues{ id name } }
        metafield(namespace:"custom", key:"condition"){ value } } } } }`, { c: cur });
    prods.push(...d.products.edges.map(e => e.node));
    cur = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cur);

  const dir = join(__dirname, '..', 'backups'); mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const snapPath = join(dir, `condition-snapshot-${stamp}.json`);
  writeFileSync(snapPath, JSON.stringify({ taken_at: new Date().toISOString(), count: prods.length, products: prods }, null, 2));

  console.log(`\n=== CONDITION NORMALIZE — ${APPLY ? `APPLY${LIMIT < Infinity ? ` (first ${LIMIT})` : ''}` : 'DRY RUN'} ===`);
  console.log(`Snapshot: ${snapPath}  (${prods.length} products, all statuses)`);
  console.log(`Canonical: ${CONDITIONS.join(' · ')}   |   Metafields: READ ONLY, never written\n`);

  const plans = [], noOption = [], nonGarment = [], multiValue = [], unresolved = [], conflicts = [];

  for (const p of prods) {
    const opt = p.options.find(o => /^conditions?$/i.test(o.name.trim()));

    if (!opt) {
      (NON_GARMENT.test(p.title) ? nonGarment : noOption).push(p);
      continue;
    }
    // Two variants split by condition — renaming both could collide. Never auto-touch.
    if (opt.optionValues.length > 1) { multiValue.push({ p, opt }); continue; }

    const optRaw  = opt.optionValues[0]?.name || '';
    const tagRaw  = p.tags.find(isConditionTag) || '';
    const mfRaw   = p.metafield?.value || '';

    // Resolution order: metafield decides (user's call), then the option, then the tag.
    const fromMf = canonicalCondition(mfRaw);
    const fromOpt = canonicalCondition(optRaw);
    const fromTag = canonicalCondition(tagRaw);
    const target = fromMf || fromOpt || fromTag;

    if (!target) { unresolved.push({ p, optRaw, tagRaw, mfRaw }); continue; }

    // Record where the three surfaces disagreed, so a human can eyeball the calls.
    const seen = [fromMf, fromOpt, fromTag].filter(Boolean);
    if (new Set(seen).size > 1) conflicts.push({ p, fromMf, fromOpt, fromTag, target });

    const optNeeds = optRaw !== target;
    const nameNeeds = opt.name.trim() !== 'Condition';          // one product has "Conditions"
    const condTags = p.tags.filter(isConditionTag);
    const otherTags = p.tags.filter(t => !isConditionTag(t));
    const nextTags = [...otherTags, target];
    const tagNeeds = condTags.length !== 1 || condTags[0] !== target;

    if (optNeeds || nameNeeds || tagNeeds) {
      plans.push({ p, opt, target, optRaw, optNeeds, nameNeeds, tagNeeds, condTags, nextTags });
    }
  }

  if (ONLY_CONFLICTS) {
    console.log(`--- ${conflicts.length} products where the surfaces disagree (metafield wins) ---\n`);
    for (const c of conflicts) {
      console.log(`[${c.p.status}] ${c.p.title.slice(0, 44)}`);
      console.log(`    metafield=${(c.fromMf || '—').padEnd(10)} option=${(c.fromOpt || '—').padEnd(10)} tag=${(c.fromTag || '—').padEnd(10)} → ${c.target}`);
      console.log(`    mf text: ${JSON.stringify((c.p.metafield?.value || '').slice(0, 88))}\n`);
    }
    return;
  }

  // ── Report ────────────────────────────────────────────────────────────
  let done = 0, ok = 0, fail = 0;
  for (const pl of plans) {
    if (done >= LIMIT) break;
    const acts = [pl.nameNeeds && 'rename-opt', pl.optNeeds && 'value', pl.tagNeeds && 'tag'].filter(Boolean);
    const desc = `${pl.p.title.slice(0, 40).padEnd(40)} ${(pl.optRaw || '—')} + [${pl.condTags.join('/') || '—'}] → ${pl.target}`;

    if (!APPLY) { console.log(`  ${acts.join('+').padEnd(18)} ${desc}`); done++; continue; }

    try {
      if (pl.optNeeds || pl.nameNeeds) {
        const r = await gql(OPT_MUT, { p: pl.p.id,
          o: { id: pl.opt.id, name: 'Condition' },
          vals: pl.optNeeds ? [{ id: pl.opt.optionValues[0].id, name: pl.target }] : [] });
        const e = r.productOptionUpdate.userErrors;
        if (e.length) throw new Error('opt: ' + JSON.stringify(e));
      }
      if (pl.tagNeeds) {
        const r = await gql(TAG_MUT, { p: pl.p.id, t: pl.nextTags });
        const e = r.productUpdate.userErrors;
        if (e.length) throw new Error('tag: ' + JSON.stringify(e));
      }
      ok++; console.log(`  ✅ ${acts.join('+').padEnd(18)} ${desc}`);
    } catch (err) { fail++; console.log(`  ❌ ${pl.p.title.slice(0, 34)}: ${err.message.slice(0, 120)}`); }
    done++; await sleep(120);
  }

  const bar = '\n' + '─'.repeat(72);
  console.log(bar);
  console.log(`Products scanned:            ${prods.length}`);
  console.log(`Already canonical:           ${prods.length - plans.length - noOption.length - nonGarment.length - multiValue.length - unresolved.length}`);
  console.log(`${APPLY ? 'Changed' : 'Would change'}:${' '.repeat(APPLY ? 21 : 16)}${plans.length}${APPLY ? `  (ok ${ok}, failed ${fail})` : ''}`);
  console.log(`Surface disagreements:       ${conflicts.length}   (--conflicts to review)`);
  console.log(bar);

  if (multiValue.length) {
    console.log(`\n⚠️  MANUAL — Condition option has >1 value (rename would collide), NOT touched:`);
    for (const { p, opt } of multiValue) console.log(`   [${p.status}] ${p.title.slice(0, 44)} → ${JSON.stringify(opt.optionValues.map(v => v.name))}`);
  }
  if (unresolved.length) {
    console.log(`\n⚠️  MANUAL — no surface yields a grade, NOT touched:`);
    for (const u of unresolved) console.log(`   [${u.p.status}] ${u.p.title.slice(0, 40)} opt=${JSON.stringify(u.optRaw)} tag=${JSON.stringify(u.tagRaw)} mf=${JSON.stringify(u.mfRaw.slice(0, 34))}`);
  }
  if (noOption.length) {
    console.log(`\n⚠️  NO Condition option at all (${noOption.length} garments) — this script only renames existing options, it does not create them:`);
    const byStatus = {}; for (const p of noOption) (byStatus[p.status] ||= []).push(p);
    for (const [st, list] of Object.entries(byStatus)) {
      console.log(`   ${st} (${list.length}): ${list.map(p => p.title.slice(0, 26)).join(' · ')}`);
    }
  }
  if (nonGarment.length) {
    console.log(`\n✓  Correctly skipped, not consigned garments (${nonGarment.length}): ${nonGarment.map(p => p.title.slice(0, 24)).join(' · ')}`);
  }
  if (!APPLY) console.log(`\n⚠️  DRY RUN — nothing written. Snapshot saved. Re-run with --apply (optionally --limit=N).`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * scripts/wa-flow.mjs — manage WhatsApp Flow JSON as version-controlled source.
 *
 * The seller listing Flow lived only in Meta's Flow Builder, which made it
 * unreviewable and unrevertable. This pulls it into flows/*.json, and pushes
 * edits back (snapshotting the live version first).
 *
 *   node scripts/wa-flow.mjs list
 *   node scripts/wa-flow.mjs pull  listing         # Meta -> flows/listing.json
 *   node scripts/wa-flow.mjs push  listing         # flows/listing.json -> Meta (draft)
 *   node scripts/wa-flow.mjs publish listing       # publish the current draft
 *
 * Env comes from .env.prod (WHATSAPP_ACCESS_TOKEN, WHATSAPP_WABA_ID,
 * WHATSAPP_FLOW_ID, WHATSAPP_REVISION_FLOW_ID).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const GRAPH = 'https://graph.facebook.com/v21.0';
const ROOT = path.resolve(import.meta.dirname, '..');
const FLOW_DIR = path.join(ROOT, 'flows');

// Some values in .env.prod carry a trailing escaped newline; strip it.
const clean = v => (v || '').replace(/\\n$/, '').trim();
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env.prod')));
const TOKEN = clean(env.WHATSAPP_ACCESS_TOKEN);
const WABA_ID = clean(env.WHATSAPP_WABA_ID);

const FLOWS = {
  listing: { id: clean(env.WHATSAPP_FLOW_ID), file: 'listing.json' },
  revision: { id: clean(env.WHATSAPP_REVISION_FLOW_ID), file: 'revision.json' }
};

const auth = { Authorization: `Bearer ${TOKEN}` };

async function api(pathname, opts = {}) {
  const res = await fetch(`${GRAPH}/${pathname}`, {
    ...opts,
    headers: { ...auth, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers }
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.error || body)}`);
  return body;
}

function resolveFlow(name) {
  const flow = FLOWS[name];
  if (!flow) throw new Error(`Unknown flow "${name}". Known: ${Object.keys(FLOWS).join(', ')}`);
  if (!flow.id) throw new Error(`No flow id configured for "${name}"`);
  return flow;
}

async function list() {
  const { data } = await api(`${WABA_ID}/flows?fields=id,name,status,categories&limit=50`);
  for (const f of data) {
    const local = Object.entries(FLOWS).find(([, v]) => v.id === f.id)?.[0];
    console.log(`${f.id}  ${f.status.padEnd(10)} ${f.name}${local ? `  <- ${local}` : ''}`);
  }
}

async function pull(name) {
  const flow = resolveFlow(name);
  const { data } = await api(`${flow.id}/assets`);
  const asset = data.find(a => a.asset_type === 'FLOW_JSON');
  if (!asset) throw new Error('No FLOW_JSON asset on this flow');
  const json = await (await fetch(asset.download_url)).text();
  fs.mkdirSync(FLOW_DIR, { recursive: true });
  const dest = path.join(FLOW_DIR, flow.file);
  fs.writeFileSync(dest, JSON.stringify(JSON.parse(json), null, 2) + '\n');
  console.log(`Pulled ${name} (${flow.id}) -> flows/${flow.file}`);
}

async function push(name) {
  const flow = resolveFlow(name);
  const src = path.join(FLOW_DIR, flow.file);
  const json = fs.readFileSync(src, 'utf8');
  JSON.parse(json); // fail fast on malformed JSON before touching Meta

  // Snapshot whatever is live right now, so a bad push is one command to undo.
  const { data } = await api(`${flow.id}/assets`);
  const asset = data.find(a => a.asset_type === 'FLOW_JSON');
  if (asset) {
    const live = await (await fetch(asset.download_url)).text();
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const backup = path.join(ROOT, 'backups', `wa-flow-${name}-${stamp}.json`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, live);
    console.log(`Snapshot of live version -> ${path.relative(ROOT, backup)}`);
  }

  const form = new FormData();
  form.append('name', 'flow.json'); // Meta requires this exact asset name
  form.append('asset_type', 'FLOW_JSON');
  form.append('file', new Blob([json], { type: 'application/json' }), 'flow.json');
  const res = await fetch(`${GRAPH}/${flow.id}/assets`, { method: 'POST', headers: auth, body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.error || body)}`);
  if (body.validation_errors?.length) {
    console.error('Validation errors:', JSON.stringify(body.validation_errors, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(`Pushed flows/${flow.file} -> ${name} (${flow.id}) as draft. Run "publish ${name}" to go live.`);
}

async function publish(name) {
  const flow = resolveFlow(name);
  await api(`${flow.id}/publish`, { method: 'POST', body: JSON.stringify({}) });
  console.log(`Published ${name} (${flow.id})`);
}

const [cmd, name] = process.argv.slice(2);
const commands = { list, pull, push, publish };
if (!commands[cmd]) {
  console.error('Usage: node scripts/wa-flow.mjs <list|pull|push|publish> [listing|revision]');
  process.exit(1);
}
commands[cmd](name).catch(e => { console.error(`Failed: ${e.message}`); process.exit(1); });

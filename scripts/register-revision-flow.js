/**
 * scripts/register-revision-flow.js
 *
 * One-time script to register the "Revision Update" WhatsApp Flow with Meta.
 * Run once, save the returned FLOW_ID as WHATSAPP_REVISION_FLOW_ID in Vercel env.
 *
 * Usage:
 *   WHATSAPP_ACCESS_TOKEN=xxx WHATSAPP_WABA_ID=xxx node scripts/register-revision-flow.js
 *
 * Steps performed:
 *   1. Create flow (get flow_id)
 *   2. Upload flow JSON asset
 *   3. Publish the flow
 *   4. Print the flow_id → save as WHATSAPP_REVISION_FLOW_ID
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA_ID = process.env.WHATSAPP_WABA_ID;
const GRAPH_URL = 'https://graph.facebook.com/v21.0';

if (!TOKEN || !WABA_ID) {
  console.error('❌  Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID env vars first.');
  process.exit(1);
}

async function gql(url, opts) {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    ...opts
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('API error:', JSON.stringify(body, null, 2));
    throw new Error(`HTTP ${res.status}`);
  }
  return body;
}

async function main() {
  // ── Step 1: Create the flow ──────────────────────────────────────────────
  console.log('1️⃣  Creating flow...');
  const created = await gql(`${GRAPH_URL}/${WABA_ID}/flows`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Revision Update Flow',
      categories: ['CUSTOMER_SUPPORT']
    })
  });
  const flowId = created.id;
  console.log(`   ✅  Flow created: ${flowId}`);

  // ── Step 2: Upload the flow JSON as an asset ─────────────────────────────
  console.log('2️⃣  Uploading flow JSON...');
  const flowJson = readFileSync(path.join(__dirname, '../lib/wa-revision-flow.json'), 'utf8');

  // Upload requires multipart/form-data
  const { FormData, Blob } = await import('node:buffer').then(() => globalThis);
  // Fallback for older Node versions that don't have native FormData
  let FormDataClass, BlobClass;
  try {
    FormDataClass = FormData;
    BlobClass = Blob;
  } catch {
    const fd = await import('formdata-node');
    FormDataClass = fd.FormData;
    BlobClass = fd.Blob;
  }

  const form = new FormDataClass();
  form.append('name', 'revision_update_flow');
  form.append('asset_type', 'FLOW_JSON');
  form.append('file', new BlobClass([flowJson], { type: 'application/json' }), 'wa-revision-flow.json');

  const uploadRes = await fetch(`${GRAPH_URL}/${flowId}/assets`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    body: form
  });
  const uploadBody = await uploadRes.json();
  if (!uploadRes.ok) {
    console.error('Upload error:', JSON.stringify(uploadBody, null, 2));
    throw new Error(`Upload HTTP ${uploadRes.status}`);
  }

  const validationErrors = uploadBody.validation_errors;
  if (validationErrors?.length) {
    console.warn('⚠️  Validation warnings:', JSON.stringify(validationErrors, null, 2));
  } else {
    console.log('   ✅  Flow JSON uploaded & valid');
  }

  // ── Step 3: Publish the flow ─────────────────────────────────────────────
  console.log('3️⃣  Publishing flow...');
  await gql(`${GRAPH_URL}/${flowId}/publish`, { method: 'POST', body: JSON.stringify({}) });
  console.log('   ✅  Flow published');

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('\n✅  Registration complete!');
  console.log(`\n   FLOW ID: ${flowId}`);
  console.log('\n   Add to Vercel environment variables:');
  console.log(`   WHATSAPP_REVISION_FLOW_ID=${flowId}`);
  console.log('\n   Also add your WABA ID if not already set:');
  console.log(`   WHATSAPP_WABA_ID=${WABA_ID}`);
}

main().catch(e => {
  console.error('❌  Registration failed:', e.message);
  process.exit(1);
});

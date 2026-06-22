// scripts/test-server.mjs
// Runs the app's /api/* serverless handlers locally against .env.test — a fully isolated
// sandbox (test Supabase + dev Shopify store). Never points at prod.
//
// Usage:  node scripts/test-server.mjs        (defaults to port 3100)
//
// Adapts Node's req/res to the Vercel handler signature so the real handlers run unchanged.

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '..', '.env.test');
config({ path: ENV_PATH });

// Hard safety gate: refuse to boot if the env still points at production.
const shop = process.env.SHOPIFY_SHOP || '';
const supa = process.env.SUPABASE_URL || '';
if (!shop.includes('phirstory-test') || !supa.includes('vszdnmttackmfxyafpka')) {
  console.error('🛑 REFUSING TO START — .env.test does not point at the test sandbox.');
  console.error(`   SHOPIFY_SHOP=${shop}  SUPABASE_URL=${supa}`);
  process.exit(1);
}

const PORT = Number(process.env.TEST_PORT || 3100);

function makeRes(nodeRes) {
  return {
    statusCode: 200,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; nodeRes.setHeader(k, v); return this; },
    status(code) { this.statusCode = code; return this; },
    json(obj) {
      nodeRes.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this._headers });
      nodeRes.end(JSON.stringify(obj));
    },
    send(body) {
      nodeRes.writeHead(this.statusCode, this._headers);
      nodeRes.end(typeof body === 'string' ? body : JSON.stringify(body));
    },
    end(body) { nodeRes.writeHead(this.statusCode, this._headers); nodeRes.end(body); },
  };
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/api\/([a-zA-Z0-9_-]+)$/);
  if (!m) { nodeRes.writeHead(404); nodeRes.end('not found'); return; }
  const name = m[1];

  const chunks = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const rawBuf = Buffer.concat(chunks);
  let body = {};
  if (rawBuf.length) { try { body = JSON.parse(rawBuf.toString('utf8')); } catch { body = rawBuf.toString('utf8'); } }

  const query = Object.fromEntries(url.searchParams.entries());
  // Base req on a Readable replaying the raw bytes, so handlers that disable the body
  // parser and read the stream themselves (order-webhook HMAC) still work.
  const req = Object.assign(Readable.from(rawBuf.length ? [rawBuf] : []), {
    method: nodeReq.method, query, body, headers: nodeReq.headers, url: nodeReq.url, rawBody: rawBuf,
  });
  const res = makeRes(nodeRes);

  const t0 = Date.now();
  try {
    const mod = await import(path.join(__dirname, '..', 'api', `${name}.js`));
    if (typeof mod.default !== 'function') throw new Error(`api/${name}.js has no default export`);
    await mod.default(req, res);
    console.log(`  ${nodeReq.method} /api/${name}${query.action ? `?action=${query.action}` : ''} → ${res.statusCode} (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error(`  ✗ /api/${name} threw:`, e.message);
    if (!nodeRes.headersSent) { nodeRes.writeHead(500); nodeRes.end(JSON.stringify({ error: e.message })); }
  }
});

server.listen(PORT, () => {
  console.log(`🧪 test-server up on http://localhost:${PORT}`);
  console.log(`   Shopify : ${process.env.SHOPIFY_SHOP}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   (isolated sandbox — safe to run the lifecycle)`);
});

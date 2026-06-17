// scripts/backup-transactions.mjs
// Snapshot the entire transactions table to backups/transactions-<date>.json.
// Used as a restore point before any transactions migration. Reusable + safe (read-only).
//
//   node scripts/backup-transactions.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) { console.error('Missing SUPABASE_URL / key in env'); process.exit(1); }

const supabase = createClient(url, key);
const { data, error } = await supabase.from('transactions').select('*');
if (error) { console.error('Backup failed:', error.message); process.exit(1); }

const date = new Date().toISOString().slice(0, 10);
const dir = join(__dirname, '..', 'backups');
mkdirSync(dir, { recursive: true });
const out = join(dir, `transactions-${date}.json`);
writeFileSync(out, JSON.stringify(data, null, 2));
console.log(`Backed up ${data.length} transactions -> ${out}`);

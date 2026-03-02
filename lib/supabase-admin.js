// lib/supabase-admin.js
// Single shared Supabase client for all server-side code.
// Import this instead of creating your own client in every file.

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

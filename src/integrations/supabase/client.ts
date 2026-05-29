import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ['VITE_SUPABASE_URL'] : []),
    ...(!SUPABASE_ANON_KEY ? ['VITE_SUPABASE_ANON_KEY'] : []),
  ];
  console.error(`[Supabase] Missing env vars: ${missing.join(', ')}`);
}

export const supabase = createClient<Database>(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '', {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

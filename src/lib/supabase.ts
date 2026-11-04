import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
// Novi Supabase "publishable" ključ ili stari "anon" ključ – oba rade s klijentom.
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

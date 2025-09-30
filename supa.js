// supa.js — 乾淨版（ES Module）
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⬇⬇ 這兩個字串用你的專案值；務必用半形單引號，且不要有換行或多餘空白
const SUPABASE_URL  = 'https://qtgwedankftrqjmzuset.supabase.co';
const SUPABASE_ANON = 'SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g';

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});






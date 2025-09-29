// supa.js — Supabase 客戶端（穩定的 Auth 設定）
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://qtgwedankftrqjmzuset.supabase.co'';   // ← 改成你的
const SUPABASE_ANON = 'SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g';                           // ← 改成你的

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,        // 登入後保留會話
    autoRefreshToken: true,      // 自動刷新 token
    detectSessionInUrl: false,   // 我們沒用 OAuth 回跳，不要攔截網址
    storageKey: 'sb-auth-english-videos' // 自訂 key，避免與其它站互撞
  }
});





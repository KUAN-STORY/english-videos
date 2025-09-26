// /english-videos/js/supa.js
// 初始化 Supabase，連線會員登入、進度、測驗紀錄用

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TODO: 換成你自己的 Supabase 專案參數
const SUPABASE_URL  = 'https://KUAN-STORY's Project.supabase.co'   // ← Project Settings > API > Project URL
const SUPABASE_ANON = 'eyJhbGciOi...你的anon key...' // ← Project Settings > API > anon public key

// 建立 Supabase Client
export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,        // 保留登入狀態
    autoRefreshToken: true,      // 自動刷新 Token
    detectSessionInUrl: true     // 支援 OAuth 登入 URL callback
  }
})

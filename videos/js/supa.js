// /english-videos/js/supa.js
// 初始化 Supabase：連線會員登入、進度、測驗紀錄用

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ✅ 換成你自己的 Project URL / anon key
const SUPABASE_URL  = 'https://qtgwedankftrqjmzuset.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g'

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,    // 保留登入狀態
    autoRefreshToken: true,  // 自動刷新 Token
    detectSessionInUrl: true // 支援 OAuth callback
  }
})

// ===== 小工具：登入/登出/取得使用者 =====
export async function getUser() {
  const { data: { user } } = await supa.auth.getUser()
  return user || null
}

export async function signInWithEmail(email) {
  // 開發期：用 OTP Magic Link（寄到 email）
  return supa.auth.signInWithOtp({ email })
}

export async function signOut() {
  return supa.auth.signOut()
}

// ===== 寫入影片進度 =====
export async function upsertProgress({ slug, seconds }) {
  const user = await getUser()
  if (!user) return
  await supa.from('video_progress')
    .upsert({ user_id: user.id, slug, seconds }, { onConflict: 'user_id,slug' })
}

// ===== 寫入測驗紀錄 =====
export async function addQuizAttempt({ slug, score, total, payload }) {
  const user = await getUser()
  if (!user) return
  await supa.from('quiz_attempts')
    .insert({ user_id: user.id, slug, score, total, payload })
}

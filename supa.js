// supa.js  — 專案最外層版本（ES Module）
// -------------------------------------------------
// 用法（例如在 login.js / player.js 內）：
//   import { supa, getUser, signInWithEmail, signOut,
//            getPublicUrl, upsertProgress, addQuizAttempt } from './supa.js';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ✅ 你的 Supabase 專案參數（沿用你提供的）
const SUPABASE_URL  = 'https://qtgwedankftrqjmzuset.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g'

// 建立用戶端（保留登入狀態、支援 OAuth callback）
export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ============ Auth 基本動作 ============
export async function getUser() {
  const { data } = await supa.auth.getUser()
  return data?.user ?? null
}

export async function signInWithEmail(email) {
  // 寄 OTP / Magic Link，完成後會回到目前頁面
  const emailRedirectTo = location.origin + location.pathname
  return supa.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  })
}

export async function signOut() {
  return supa.auth.signOut()
}

// ============ Storage 公開 URL ============
export function getPublicUrl(bucket, path) {
  try {
    const { data } = supa.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

// ============ 進度/測驗紀錄（可選）===========
// video_progress: user_id (uuid), slug (text), seconds (numeric)
export async function upsertProgress({ slug, seconds }) {
  const user = await getUser()
  if (!user) return
  await supa
    .from('video_progress')
    .upsert(
      { user_id: user.id, slug, seconds },
      { onConflict: 'user_id,slug' },
    )
}

// quiz_attempts: user_id, slug, score, total, payload(json)
export async function addQuizAttempt({ slug, score, total, payload }) {
  const user = await getUser()
  if (!user) return
  await supa
    .from('quiz_attempts')
    .insert({ user_id: user.id, slug, score, total, payload })
}

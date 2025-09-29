// /english-videos/supa.js
// Supabase 初始化與一些小工具（Email + 密碼）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ⛳ 換成你的 Project URL / anon key（你現在這組可沿用）
const SUPABASE_URL  = 'https://qtgwedankftrqjmzuset.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g'

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})

// ---- 小工具：查使用者 / 登入 / 註冊 / 登出 ----
export async function getUser() {
  const { data: { user } } = await supa.auth.getUser()
  return user || null
}

export async function signInWithPassword({ email, password }) {
  return supa.auth.signInWithPassword({ email, password })
}

export async function signUpWithPassword({ email, password }) {
  return supa.auth.signUp({ email, password })
}

export async function signOut() {
  return supa.auth.signOut()
}



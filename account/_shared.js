// /account/_shared.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 讀你全站已定義的常數；若沒有，就填 ENV
const SUPABASE_URL =
  window.SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co'
const SUPABASE_ANON_KEY =
  window.SUPABASE_ANON_KEY || 'YOUR-ANON-KEY'

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 登入守門（未登入就回首頁或登入頁）
export async function requireUser () {
  const { data: { user } } = await supa.auth.getUser()
  if (!user) {
    location.href = '/'
    throw new Error('auth-required')
  }
  return user
}

// 小工具
export const fmtDateTime = (d) => {
  const t = new Date(d)
  return isNaN(t) ? '-' : t.toLocaleString()
}
export const fmtDate = (d) => {
  const t = new Date(d)
  return isNaN(t) ? '-' : t.toLocaleDateString()
}

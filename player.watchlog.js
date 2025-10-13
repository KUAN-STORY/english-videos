// player.watchlog.js
import { supabase } from './supa.js'
const TABLE = 'watch_logs'
async function getUserId() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch (e) { console.warn('[watchlog] getUserId failed:', e); return null }
}
async function upsertProgress(userId, slug, title, pos, dur) {
  try {
    const progress = Math.max(0, Math.min(1, dur > 0 ? (pos / dur) : 0))
    const payload = {
      user_id: userId,
      video_slug: slug,
      title: title || null,
      position_sec: Math.floor(pos || 0),
      duration_sec: Math.floor(dur || 0),
      progress_pct: progress,
      completed: progress >= 0.97,
      last_watched_at: new Date().toISOString()
    }
    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id,video_slug' })
    if (error) console.warn('[watchlog] upsert error:', error)
  } catch (e) { console.warn('[watchlog] upsertProgress failed:', e) }
}
export function initWatchLog(videoEl, meta = {}) {
  if (!videoEl) { console.warn('[watchlog] No <video>'); return () => {} }
  const slug = meta.slug || new URLSearchParams(location.search).get('slug') || location.pathname.split('/').pop()
  const title = meta.title || document.title
  let saved = false
  let uidPromise = null
  async function saveOnce() {
    if (saved) return
    saved = true
    try {
      uidPromise = uidPromise || getUserId()
      const uid = await uidPromise
      if (!uid) return
      const pos = Number(videoEl.currentTime || 0)
      const dur = Number(videoEl.duration || 0)
      await upsertProgress(uid, slug, title, pos, dur)
    } catch (e) { console.warn('[watchlog] saveOnce failed:', e) }
  }
  const onVis = () => (document.visibilityState === 'hidden') && saveOnce()
  const onHide = () => saveOnce()
  const onBeforeUnload = () => saveOnce()
  document.addEventListener('visibilitychange', onVis, { passive: true })
  window.addEventListener('pagehide', onHide, { passive: true })
  window.addEventListener('beforeunload', onBeforeUnload, { passive: true })
  ;[...document.querySelectorAll('[data-back],[data-exit],[data-close]')].forEach(btn => {
    btn.addEventListener('click', saveOnce, { passive: true })
  })
  return function cleanup() {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}

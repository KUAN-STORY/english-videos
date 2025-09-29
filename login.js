// login.js — Email+Password 版（強化：殺快取後可立即確認是否載入成功）
import { supa } from './supa.js';

// 白名單：未登入也可看的 slug
const FREE_SLUGS = new Set(['mid-autumn']);

// ---- 小工具 ----
const $  = (s, r = document) => r.querySelector(s);

let currentUser = null;
function isAuthedSync(){ return !!currentUser; }

async function refreshUser() {
  const { data: { user } } = await supa.auth.getUser();
  currentUser = user || null;
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: !!currentUser } }));
  return currentUser;
}

async function updateAuthUI() {
  const badge = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  if (!badge || !btnLogin || !btnLogout) return;

  if (currentUser) {
    badge.textContent = currentUser.user_metadata?.name || currentUser.email || '已登入';
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    btnLogin.style.display = 'inline-block';
    btnLogout.style.display = 'none';
  }
}

function wireHeaderAuth() {
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if (btnLogin) {
    btnLogin.onclick = async () => {
      const email = prompt('請輸入 Email：');
      if (!email) return;
      const password = prompt('請輸入密碼：');
      if (!password) return;

      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) {
        const goSignUp = confirm(`登入失敗：${error.message}\n要改用「註冊」嗎？`);
        if (goSignUp) {
          const { error: e2 } = await supa.auth.signUp({ email, password });
          if (e2) alert('註冊失敗：' + e2.message);
          else    alert('註冊成功，請到信箱完成驗證後再登入。');
        }
        return;
      }
      currentUser = data.user;
      await refreshUser();
      await updateAuthUI();
      alert('登入成功！');
    };
  } else {
    console.warn('[login.js] 找不到 #btnLogin');
  }

  if (btnLogout) {
    btnLogout.onclick = async () => {
      await supa.auth.signOut();
      currentUser = null;
      await updateAuthUI();
      window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: false } }));
      alert('已登出');
    };
  } else {
    console.warn('[login.js] 找不到 #btnLogout');
  }
}

async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) return;

  let authed = isAuthedSync();
  if (!authed) authed = !!(await refreshUser());

  if (!authed) {
    const goLogin = confirm('這部影片需要登入後才能觀看。要立刻登入嗎？');
    if (goLogin) { const b = $('#btnLogin'); if (b) b.click(); }
    else { location.href = './index.html'; }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[login.js] loaded & DOM ready');
  await refreshUser();
  await updateAuthUI();
  wireHeaderAuth();
  await guardPlayerIfAny();
  window.Auth = {
    isAuthedSync,
    isAuthed: async () => !!(await refreshUser()),
    getUser: () => currentUser,
  };
});

// 監聽 supabase 狀態
supa.auth.onAuthStateChange(async () => {
  console.log('[login.js] onAuthStateChange');
  await refreshUser();
  await updateAuthUI();
});

// 額外：把事件 log 出來，若還是「沒反應」可以打開 DevTools 看
window.addEventListener('auth:changed', (e)=>console.log('[auth:changed]', e.detail));


























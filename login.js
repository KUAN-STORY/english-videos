// login.js — Email + Password 版（首頁/播放器守門 + 右上登入列）
import { supa } from './supa.js';

// 未登入也可看的 slug（與 data/index.json 對應）
const FREE_SLUGS = new Set(['mid-autumn']);

// 小工具
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

  // 登入：Email + 密碼
  btnLogin?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = prompt('請輸入 Email：');
    if (!email) return;
    const password = prompt('請輸入密碼：');
    if (!password) return;

    try {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[login.js] signIn error:', error);
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
      document.getElementById('dlgLogin')?.close();
      alert('登入成功！');
    } catch (e2) {
      alert('登入失敗：' + (e2?.message || e2));
    }
  });

  // 登出
  btnLogout?.addEventListener('click', async () => {
    await supa.auth.signOut();
    currentUser = null;
    await updateAuthUI();
    window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: false } }));
    alert('已登出');
  });
}

// 只在 player 頁：未登入就擋，白名單除外
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) return;

  let authed = isAuthedSync();
  if (!authed) authed = !!(await refreshUser());

  if (!authed) {
    const goLogin = confirm('這部影片需要登入後才能觀看。要立刻登入嗎？');
    if (goLogin) { $('#btnLogin')?.click(); }
    else { location.href = './index.html'; }
  }
}

// 啟動
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[login.js] loaded & DOM ready');
  await refreshUser();
  await updateAuthUI();
  wireHeaderAuth();
  await guardPlayerIfAny();

  // 提供給其它腳本用
  window.Auth = {
    isAuthedSync,
    isAuthed: async () => !!(await refreshUser()),
    getUser: () => currentUser,
  };
});

// 監聽 Supabase 狀態（跨頁回來/自動刷新等）
supa.auth.onAuthStateChange(async () => {
  console.log('[login.js] onAuthStateChange');
  await refreshUser();
  await updateAuthUI();
});

// 讓你在 DevTools 看得到狀態改變
window.addEventListener('auth:changed', (e)=>console.log('[auth:changed]', e.detail));






































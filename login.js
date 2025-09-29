// login.js — Email + Password 登入版（ESM）
// 依你目前的專案結構，supa.js 在專案根目錄
import { supa } from './supa.js';

// 白名單：未登入也可看的 slug
const FREE_SLUGS = new Set(['mid-autumn']);

// ---- DOM helpers ----
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// 內部快取目前使用者（同步可讀）
let currentUser = null;

// 取回/刷新目前使用者（非同步）
async function refreshUser() {
  const { data: { user } } = await supa.auth.getUser();
  currentUser = user || null;
  // 廣播：讓外部（index.html / player.html）得知狀態有變
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: !!currentUser } }));
  return currentUser;
}

// 同步判斷是否已登入（不打網路）
function isAuthedSync() {
  return !!currentUser;
}

// ---- UI：右上角登入/登出顯示 ----
async function updateAuthUI() {
  const badge    = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout= $('#btnLogout');
  if (!badge || !btnLogin || !btnLogout) return;

  if (currentUser) {
    const name = currentUser.user_metadata?.name || currentUser.email || '已登入';
    badge.textContent = name;
    btnLogin.style.display  = 'none';
    btnLogout.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    btnLogin.style.display  = 'inline-block';
    btnLogout.style.display = 'none';
  }
}

function wireHeaderAuth() {
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if (btnLogin) {
    btnLogin.onclick = async () => {
      // Email + 密碼登入（若帳號不存在，可提示改用註冊）
      const email = prompt('請輸入 Email：');
      if (!email) return;
      const password = prompt('請輸入密碼：');
      if (!password) return;

      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) {
        // 給個簡單的引導：要不要直接註冊
        const goSignUp = confirm(`登入失敗：${error.message}\n要改用「註冊」嗎？`);
        if (goSignUp) {
          const { data: d2, error: e2 } = await supa.auth.signUp({ email, password });
          if (e2) alert('註冊失敗：' + e2.message);
          else    alert('註冊成功，請到信箱完成驗證，再重新登入。');
        }
        return;
      }
      currentUser = data.user;
      await refreshUser();
      await updateAuthUI();
    };
  }

  if (btnLogout) {
    btnLogout.onclick = async () => {
      await supa.auth.signOut();
      currentUser = null;
      await updateAuthUI();
      // 廣播變更（雖然 refreshUser 也會發，但登出這裡就先發）
      window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: false } }));
    };
  }
}

// ---- Player 守門（在 player.html 使用，同一份 login.js 會生效）----
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) return; // 白名單直接放行

  // 先用同步、再補一次非同步，以免 race condition
  let authed = isAuthedSync();
  if (!authed) authed = await (async () => !!(await refreshUser()))();

  if (!authed) {
    const goLogin = confirm('這部影片需要登入後才能觀看。要立刻登入嗎？');
    if (goLogin) {
      const btn = $('#btnLogin');
      if (btn) btn.click();
    } else {
      alert('目前先返回首頁。');
      location.href = './index.html';
    }
  }
}

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', async () => {
  await refreshUser();   // 先抓一次狀態
  await updateAuthUI();  // 同步右上角

  wireHeaderAuth();      // 綁定登入/登出按鈕
  await guardPlayerIfAny();
});

// Supabase 狀態改變（OAuth / Email+密碼 / 登出 等）
supa.auth.onAuthStateChange(async () => {
  await refreshUser();
  await updateAuthUI();
});

// 提供給外部（index.html / player.html）
window.Auth = {
  // 同步與非同步兩種
  isAuthedSync,
  isAuthed: async () => !!(await refreshUser()),
  getUser: () => currentUser,
};

























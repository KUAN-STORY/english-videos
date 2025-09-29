// login.js — Email + Password 版（整合、單一綁定）
import { supa } from './supa.js';

// 未登入也可看的 slug
const FREE_SLUGS = new Set(['mid-autumn']);

// ---- 工具 ----
const $  = (s, r = document) => r.querySelector(s);

let currentUser = null;
const isAuthedSync = () => !!currentUser;

// 取得使用者
async function refreshUser() {
  const { data: { user } } = await supa.auth.getUser();
  currentUser = user || null;
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: !!currentUser } }));
  return currentUser;
}

// 更新右上角 UI
async function updateAuthUI() {
  const badge    = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout= $('#btnLogout');
  if (!badge || !btnLogin || !btnLogout) return;

  if (currentUser) {
    badge.textContent = currentUser.user_metadata?.name || currentUser.email || '已登入';
    btnLogin.style.display  = 'none';
    btnLogout.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    btnLogin.style.display  = 'inline-block';
    btnLogout.style.display = 'none';
  }
}

// 開啟 Email/密碼登入
async function openAuthPrompt() {
  console.log('[login.js] openAuthPrompt()');
  const email = prompt('請輸入 Email：');
  if (!email) return;
  const password = prompt('請輸入密碼：');
  if (!password) return;

  try {
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
    console.log('[login.js] signIn ok', data?.user?.email);
    await refreshUser();
    await updateAuthUI();
    document.getElementById('dlgLogin')?.close();
    alert('登入成功！');
  } catch (e) {
    alert('登入失敗：' + (e?.message || e));
  }
}

// Player 守門（非白名單需登入）
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;

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

// 綁定事件（只綁一次）
function wireButtons() {
  console.log('[login.js] wireButtons');

  // 右上登入
  $('#btnLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthPrompt();
  });

  // 右上登出
  $('#btnLogout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await supa.auth.signOut();
    currentUser = null;
    await updateAuthUI();
    window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: false } }));
    alert('已登出');
  });

  // 彈窗按鈕
  $('#btnGoLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('#dlgLogin')?.close();
    openAuthPrompt();
  });
  $('#btnDlgClose')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('#dlgLogin')?.close();
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[login.js] loaded & DOM ready');
  await refreshUser();
  await updateAuthUI();
  wireButtons();
  await guardPlayerIfAny();

  // 對外
  window.Auth = {
    isAuthedSync,
    isAuthed: async () => !!(await refreshUser()),
    getUser: () => currentUser,
  };
});

// Supabase 狀態變更
supa.auth.onAuthStateChange(async () => {
  console.log('[login.js] onAuthStateChange');
  await refreshUser();
  await updateAuthUI();
});

// 除錯用
window.addEventListener('auth:changed', (e) => console.log('[auth:changed]', e.detail));



























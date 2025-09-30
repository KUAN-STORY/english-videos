// login.js — Email + Password 版（含詳細 log）
import { supa } from './supa.js';

const TAG = '[login.js]';
const log = (...args) => console.log(new Date().toTimeString().slice(0,8), TAG, ...args);

// ====== 狀態 ======
let currentUser = null;
const FREE_SLUGS = new Set(['mid-autumn']); // 免費試看白名單（player.html 用得到）

// ====== 工具 ======
const $ = (s, r = document) => r.querySelector(s);

async function refreshUser() {
  const { data: { user }, error } = await supa.auth.getUser();
  if (error) log('refreshUser error =>', error);
  currentUser = user || null;
  log('refreshUser =>', currentUser?.email || null);
  return currentUser;
}

function isAuthedSync() {
  return !!currentUser;
}

async function updateAuthUI() {
  const badge    = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout= $('#btnLogout');
  const authed   = !!currentUser;

  if (!badge || !btnLogin || !btnLogout) {
    log('updateAuthUI: some elements missing');
    return;
  }

  badge.textContent = authed ? (currentUser.user_metadata?.name || currentUser.email || '已登入') : '';
  btnLogin.style.display  = authed ? 'none'         : 'inline-block';
  btnLogout.style.display = authed ? 'inline-block' : 'none';

  log('updateAuthUI (authed=)', authed);
}

// ====== 登入/註冊對話 ======
async function openAuthPrompt() {
  const email = prompt('請輸入 Email：');
  if (!email) return;

  const password = prompt('請輸入密碼：');
  if (!password) return;

  log('signInWithPassword =>', email);
  const { data, error } = await supa.auth.signInWithPassword({ email, password });

  if (error) {
    log('signIn error =>', error.message);
    const goSignUp = confirm(`登入失敗：${error.message}\n要改用「註冊」嗎？`);
    if (goSignUp) {
      const r = await supa.auth.signUp({ email, password });
      if (r.error) {
        alert('註冊失敗：' + r.error.message);
        log('signUp error =>', r.error.message);
      } else {
        alert('註冊成功，請到信箱完成驗證後再登入。');
        log('signUp ok =>', r.data?.user?.email || email);
      }
    }
    return;
  }

  currentUser = data.user || null;
  await updateAuthUI();
  alert('登入成功！');
}

// ====== 綁定 header 的登入/登出按鈕 ======
function wireHeaderAuth() {
  $('#btnLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthPrompt();
  });

  $('#btnLogout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await supa.auth.signOut();
    currentUser = null;
    await updateAuthUI();
    alert('已登出');
  });
}

// ====== 如果在 player.html，就做守門（非白名單需登入） ======
async function guardPlayerIfAny() {
  const player = document.getElementById('player');
  if (!player) return;

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) {
    log('player guard: free slug, pass =>', slug);
    return;
  }

  let authed = isAuthedSync();
  if (!authed) authed = !!(await refreshUser());

  log('player guard: authed =', authed, 'slug =', slug);
  if (!authed) {
    const go = confirm('這部影片需要登入後才能觀看。要立刻登入嗎？');
    if (go) $('#btnLogin')?.click();
    else location.href = './index.html';
  }
}

// ====== 初始化 ======
document.addEventListener('DOMContentLoaded', async () => {
  log('loaded & DOM ready');

  // 先拉一次使用者，依此更新右上角
  await refreshUser();
  await updateAuthUI();

  // 綁定 header 的登入/登出
  wireHeaderAuth();

  // 如果在播放頁，進行守門
  await guardPlayerIfAny();

  // 對首頁提供簡單 API
  window.Auth = {
    isAuthedSync,
    isAuthed: async () => !!(await refreshUser()),
    getUser: () => currentUser
  };
});

// Supabase 狀態改變（例如剛登入/登出/刷新 token）
supa.auth.onAuthStateChange(async (event, session) => {
  log('onAuthStateChange:', event, session?.user?.email || null);
  await refreshUser();
  await updateAuthUI();
});














































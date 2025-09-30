// login.js — Email + Password 最終版（含詳細 log）
// 需求：index.html / player.html 以 ES Module 方式載入：
// <script type="module" src="./login.js?v=9"></script>

import { supa } from './supa.js';

// 未登入也可看的 slug
const FREE_SLUGS = new Set(['mid-autumn']);

// 小工具
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let currentUser = null;

// ---- 基本狀態 ----
async function refreshUser() {
  try {
    const { data: { user }, error } = await supa.auth.getUser();
    if (error) console.warn('[login] getUser error:', error);
    currentUser = user || null;
    console.log('[login] refreshUser ->', currentUser?.email || null);
    window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: !!currentUser, user: currentUser }}));
    return currentUser;
  } catch (e) {
    console.error('[login] refreshUser exception:', e);
    currentUser = null;
    return null;
  }
}

function isAuthedSync() { return !!currentUser; }

// ---- UI ----
async function updateAuthUI() {
  const badge    = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout= $('#btnLogout');

  if (!badge || !btnLogin || !btnLogout) {
    console.warn('[login] UI nodes missing', {badge:!!badge, btnLogin:!!btnLogin, btnLogout:!!btnLogout});
    return;
  }
  if (currentUser) {
    badge.textContent = currentUser.user_metadata?.name || currentUser.email || '已登入';
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    btnLogin.style.display = 'inline-block';
    btnLogout.style.display = 'none';
  }
  console.log('[login] updateAuthUI -> authed?', !!currentUser);
}

// ---- 互動 ----
async function openAuthPrompt() {
  console.log('[login] openAuthPrompt()');
  const email = prompt('請輸入 Email：');
  if (!email) return;
  const pw = prompt('請輸入密碼：');
  if (!pw) return;

  try {
    const { data, error } = await supa.auth.signInWithPassword({ email, password: pw });
    if (error) {
      console.warn('[login] signIn failed:', error);
      const goSign = confirm(`登入失敗：${error.message}\n要改用「註冊」嗎？`);
      if (goSign) {
        const { error: e2 } = await supa.auth.signUp({ email, password: pw });
        if (e2) alert('註冊失敗：' + e2.message);
        else alert('註冊成功，請到信箱完成驗證再登入。');
      }
      return;
    }
    console.log('[login] signIn ok ->', data?.user?.email);
    await refreshUser();
    await updateAuthUI();
    $('#dlgLogin')?.close();
  } catch (e) {
    console.error('[login] signIn exception:', e);
    alert('登入失敗：' + (e?.message || e));
  }
}

function wireHeaderAuth() {
  $('#btnLogin')?.addEventListener('click', (e)=>{ e.preventDefault(); openAuthPrompt(); });
  $('#btnLogout')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    console.log('[login] signOut()');
    await supa.auth.signOut();
    await refreshUser();
    await updateAuthUI();
  });

  // 內頁彈窗按鈕（首頁卡片阻擋時）
  $('#btnGoLogin')?.addEventListener('click', (e)=>{
    e.preventDefault();
    $('#dlgLogin')?.close();
    openAuthPrompt();
  });
  $('#btnDlgClose')?.addEventListener('click', (e)=>{
    e.preventDefault();
    $('#dlgLogin')?.close();
  });
}

// ---- Player 守門（非白名單需登入）----
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) {
    console.log('[login] guardPlayer -> FREE slug:', slug);
    return;
  }

  let authed = isAuthedSync();
  if (!authed) authed = !!(await refreshUser());

  console.log('[login] guardPlayer -> need auth, authed?', authed, 'slug:', slug);
  if (!authed) {
    const go = confirm('這部影片需要登入後才能觀看。要立刻登入嗎？');
    if (go) $('#btnLogin')?.click();
    else location.href = './index.html';
  }
}

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[login] DOM ready');
  await refreshUser();
  await updateAuthUI();
  wireHeaderAuth();
  await guardPlayerIfAny();

  // 對外
  window.Auth = {
    isAuthedSync,
    isAuthed: async () => !!(await refreshUser()),
    getUser: () => currentUser,
  };
});

// ---- Supabase 狀態變化 ----
supa.auth.onAuthStateChange(async (event, session) => {
  console.log('[login] onAuthStateChange ->', event, 'user:', session?.user?.email || null);
  await refreshUser();
  await updateAuthUI();
});

// 額外除錯事件
window.addEventListener('auth:changed', (e)=>console.log('[login] auth:changed', e.detail));


































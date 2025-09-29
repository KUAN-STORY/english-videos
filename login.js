// /english-videos/login.js
// 正式站：Email + 密碼；整合右上登入/登出、首頁鎖卡片、對話框「去登入」、Player 守門

import {
  supa,
  getUser as _getUser,
  signOut as _signOut,
  signInWithPassword,
  signUpWithPassword
} from './supa.js';

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

// 未登入也可看的 slug
const FREE_SLUGS = new Set(['mid-autumn']);

/* ---------- Auth utils ---------- */
async function getUser() { return await _getUser(); }
async function isAuthed() { return !!(await getUser()); }
async function signOut()  { await _signOut(); }

/* ---------- UI ---------- */
async function refreshAuthUI() {
  const u = await getUser();
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const badge     = $('#userNameBadge');
  if (!btnLogin || !btnLogout || !badge) return;

  if (u) {
    btnLogin.style.display  = 'none';
    btnLogout.style.display = '';
    badge.textContent = `👤 ${u.email || '已登入'}`;
  } else {
    btnLogin.style.display  = '';
    btnLogout.style.display = 'none';
    badge.textContent = '';
  }
}

function askEmailPassword() {
  const email = prompt('請輸入 Email：');
  if (!email) return null;
  const password = prompt('請輸入密碼（新用戶將以此密碼註冊）：');
  if (!password) return null;
  return { email, password };
}

async function doEmailPasswordLogin() {
  const creds = askEmailPassword();
  if (!creds) return;

  // 先嘗試登入；若帳號不存在則自動註冊再登入
  let { error } = await signInWithPassword(creds);
  if (error) {
    // 常見：Invalid login credentials. → 試著幫忙註冊
    const shouldSignUp = confirm('登入失敗（可能尚未註冊）。要以這組 Email/密碼註冊嗎？');
    if (!shouldSignUp) return;

    const { error: e2 } = await signUpWithPassword(creds);
    if (e2) { alert('註冊失敗：' + e2.message); return; }

    // 部分專案會開啟 email 確認；若未開啟可直接登入
    const r3 = await signInWithPassword(creds);
    if (r3.error) { alert('登入失敗：' + r3.error.message); return; }
  }

  await refreshAuthUI();
}

/* 對外給其它腳本使用 */
async function showLogin() { await doEmailPasswordLogin(); }

function wireHeaderAuth() {
  $('#btnLogin')?.addEventListener('click', showLogin);
  $('#btnLogout')?.addEventListener('click', async () => {
    await signOut();
    await refreshAuthUI();
    lockIndexCardsIfAny();
  });
}

function wireLoginDialog() {
  // 你的首頁對話框「去登入」按鈕
  $('#btnGoLogin')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try { $('#dlgLogin')?.close(); } catch {}
    await showLogin();
  });
}

/* ---------- 首頁：鎖卡片 ---------- */
function lockIndexCardsIfAny() {
  getUser().then(u => {
    if (u) return;
    $$('[data-requires-auth]').forEach(btn => {
      btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
      btn.textContent = '🔒 前往';
      btn.classList.add('locked');
      btn.addEventListener('click', lockClick, { once:false });
    });
  });
}
function unlockIndexCardsIfAny() {
  $$('[data-requires-auth]').forEach(btn => {
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
    btn.classList.remove('locked');
    btn.removeEventListener('click', lockClick);
  });
}
async function lockClick(e) {
  if (await isAuthed()) return;
  e.preventDefault();
  // 直接叫出對話框流 or 立即登入
  if ($('#btnGoLogin')) { $('#btnGoLogin').click(); }
  else { await showLogin(); }
}

/* ---------- Player 守門 ---------- */
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;
  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) return; // 免登入

  if (!(await isAuthed())) {
    if (confirm('此影片需登入後才能觀看。要立刻登入嗎？')) {
      await showLogin();
    } else {
      alert('將返回首頁。');
      location.href = './index.html';
    }
  }
}

/* ---------- 啟動 ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  wireHeaderAuth();
  wireLoginDialog();
  await refreshAuthUI();
  await guardPlayerIfAny();

  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

supa.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

window.Auth = { getUser, isAuthed, showLogin };

















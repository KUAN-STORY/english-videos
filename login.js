// login.js — Supabase Auth（Email + Password）
// 需求：根目錄有 ./supa.js 匯出 { supa, getUser, signOut }

import { supa, getUser, signOut } from './supa.js';

// 未登入也可看的 slug（要與 data/index.json 內對應）
const FREE_SLUGS = new Set(['mid-autumn']);

// ---------- DOM 小工具 ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function isAuthed() {
  return !!(await getUser());
}

// 右上角登入列 UI
async function refreshAuthUI() {
  const u = await getUser();
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const badge     = $('#userNameBadge');
  if (!btnLogin || !btnLogout || !badge) return;

  if (u) {
    btnLogin.style.display  = 'none';
    btnLogout.style.display = '';
    const name = u.email || '已登入';
    badge.textContent = `👤 ${name}`;
  } else {
    btnLogin.style.display  = '';
    btnLogout.style.display = 'none';
    badge.textContent = '';
  }
}

// === Email + Password 登入流程 ===
// 1) 先嘗試 signInWithPassword
// 2) 若用戶不存在，會自動 signUp 後再登入
async function emailPasswordLoginFlow() {
  const email = (prompt('請輸入 Email：') || '').trim();
  if (!email) return;

  const password = prompt('請輸入密碼（新用戶會自動建立）：') || '';
  if (!password) { alert('需要密碼才能登入'); return; }

  // 先嘗試登入
  let { error } = await supa.auth.signInWithPassword({ email, password });

  // 若帳號不存在或權杖錯誤，可試著註冊後再登入
  if (error) {
    // 部分訊息可能是 "Invalid login credentials"
    // 或 "Email not confirmed" 等，這裡先嘗試 signUp
    const { error: signUpErr } = await supa.auth.signUp({ email, password });
    if (signUpErr && !/already|registered|exists/i.test(signUpErr.message || '')) {
      alert(`註冊失敗：${signUpErr.message || signUpErr}`);
      return;
    }
    // 再登入一次
    const r2 = await supa.auth.signInWithPassword({ email, password });
    if (r2.error) {
      alert(`登入失敗：${r2.error.message || r2.error}`);
      return;
    }
  }

  // 成功
  await refreshAuthUI();
  unlockIndexCardsIfAny();
  // 如果有登入對話框在顯示，可以順手關掉（首頁的）
  const dlg = $('#dlgLogin');
  if (dlg?.open) dlg.close();
}

// 綁定右上角按鈕
function wireHeaderAuth() {
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      await emailPasswordLoginFlow();
    });
  }
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await signOut();
      await refreshAuthUI();
      lockIndexCardsIfAny();
    });
  }
}

// ---------- Player 守門（未登入擋非白名單） ----------
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const authed = await isAuthed();

  if (!authed && !FREE_SLUGS.has(slug)) {
    const goLogin = confirm('這部影片需要登入後才能觀看。要立刻登入嗎？');
    if (goLogin) {
      await emailPasswordLoginFlow();
      // 登入後自動重新整理，讓頁面重載資料
      if (await isAuthed()) location.reload();
    } else {
      alert('目前先返回首頁。');
      location.href = './index.html';
    }
  }
}

// ---------- 首頁卡片鎖定/解鎖（在卡片按鈕上加 data-requires-auth） ----------
function lockIndexCardsIfAny() {
  getUser().then(u => {
    if (u) return; // 已登入就不鎖
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
  await emailPasswordLoginFlow();
  // 若成功，就讓原本的點擊可以繼續
  if (await isAuthed()) {
    unlockIndexCardsIfAny();
    // 重新觸發原本點擊
    const target = e.currentTarget;
    setTimeout(() => target.click(), 0);
  }
}

// ---------- 啟動 ----------
document.addEventListener('DOMContentLoaded', async () => {
  wireHeaderAuth();
  await refreshAuthUI();
  await guardPlayerIfAny();

  // 首頁才有 data-requires-auth 的卡片，需要鎖/解鎖
  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

// 登入狀態改變（包含 SignUp / SignIn / SignOut）
supa.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

// 讓其它腳本可用（index.html 會用到）
window.Auth = { getUser, isAuthed };




















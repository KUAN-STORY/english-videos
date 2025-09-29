// login.js — Email + Password 版（ES Module）
// 需要搭配根目錄的 supa.js
// index.html / player.html 需以：<script type="module" src="./login.js"></script> 載入

import { supa, getUser, signOut } from './supa.js';

// 未登入也可看的 slug（請與 data/index.json 對應）
const FREE_SLUGS = new Set(['mid-autumn']);

// ---------- DOM 小工具 ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function isAuthed() {
  return !!(await getUser());
}

// ========== Email + Password 基本動作 ==========
async function signInWithPassword(email, password) {
  return supa.auth.signInWithPassword({ email, password });
}

async function signUpWithPassword(email, password) {
  // 如果你在 Supabase 開啟了 Email Confirm，會寄驗證信；否則直接登入
  return supa.auth.signUp({ email, password });
}

// ======= 小對話窗：收 email / password（極簡版：用 prompt） =======
async function promptForEmailPassword(mode /* 'signin' | 'signup' */) {
  const email = (prompt(`請輸入 Email（${mode === 'signin' ? '登入' : '註冊'}）`) || '').trim();
  if (!email) return null;
  const pwd = (prompt(`請輸入密碼（${mode === 'signin' ? '登入' : '設定新帳號密碼'}）`) || '').trim();
  if (!pwd) return null;
  return { email, password: pwd };
}

// ---------- 右上角登入列 UI ----------
async function refreshAuthUI() {
  const u = await getUser();
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const badge     = $('#userNameBadge');
  if (!btnLogin || !btnLogout || !badge) return;

  if (u) {
    btnLogin.style.display  = 'none';
    btnLogout.style.display = '';
    const name = u.user_metadata?.name || u.email || '已登入';
    badge.textContent = `👤 ${name}`;
  } else {
    btnLogin.style.display  = '';
    btnLogout.style.display = 'none';
    badge.textContent = '';
  }
}

function wireHeaderAuth() {
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      // 讓使用者選擇「登入 / 註冊」
      const doSignIn = confirm('要用「Email + 密碼」登入嗎？\n\n按「確定」= 登入\n按「取消」= 註冊新帳號');
      const form = await promptForEmailPassword(doSignIn ? 'signin' : 'signup');
      if (!form) return;

      try {
        if (doSignIn) {
          const { error } = await signInWithPassword(form.email, form.password);
          if (error) throw error;
          alert('登入成功！');
        } else {
          const { error } = await signUpWithPassword(form.email, form.password);
          if (error) throw error;
          alert('註冊成功！\n若有開啟 Email 驗證，請先到信箱完成驗證再回來。');
        }
      } catch (e) {
        alert('操作失敗：' + (e?.message || e));
      }

      await refreshAuthUI();
      (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
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
      const btn = $('#btnLogin');
      if (btn) btn.click();
    } else {
      alert('目前先返回首頁。');
      location.href = './index.html';
    }
  }
}

// ---------- 首頁卡片鎖定/解鎖（需在卡片按鈕上加 data-requires-auth） ----------
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
  const btn = $('#btnLogin');
  if (confirm('此內容需登入後才能觀看。要立刻登入嗎？') && btn) btn.click();
}

// ---------- 啟動 ----------
document.addEventListener('DOMContentLoaded', async () => {
  wireHeaderAuth();
  await refreshAuthUI();
  await guardPlayerIfAny();

  // 只在首頁才有 data-requires-auth 的卡片
  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

// 登入狀態改變（如：從驗證信回來）
supa.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

// 讓其它腳本可用（首頁/播放器會取用）
window.Auth = { getUser, isAuthed };









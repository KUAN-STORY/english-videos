// login.js — Supabase Auth 版（Email Magic Link + Google）
// ✅ 注意：這是 ES Module，index.html / player.html 需以：
// <script type="module" src="login.js"></script> 載入

import { supa, getUser, signInWithEmail, signOut } from './supa.js';

// 只有這個 slug 在未登入時可看
const FREE_SLUGS = new Set(['mid-autumn']);

// ---------- 小工具 ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// 內部快取登入狀態，避免點擊當下誤判
let _authed = false;
async function refreshAuthState() {
  const u = await getUser();
  _authed = !!u;
  return _authed;
}

// 對外：給其他頁面查詢是否已登入
async function isAuthed() {
  // 先回快取，避免連續 I/O；若還沒初始化就讀一次
  if (typeof _authed === 'boolean') return _authed;
  return refreshAuthState();
}

// ---------- 右上角登入列 UI ----------
async function refreshAuthUI() {
  const u = await getUser();
  _authed = !!u;

  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const badge     = $('#userNameBadge');
  if (!btnLogin || !btnLogout || !badge) return;

  if (_authed) {
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
      const useGoogle = confirm('要用 Google 登入嗎？\n按「確定」使用 Google；按「取消」改用 Email。');
      if (useGoogle) {
        // 回來的網址必須加進 Supabase 的 Redirect URLs
        const redirectTo = location.origin + location.pathname; // 例：/english-videos/index.html
        await supa.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo }
        });
      } else {
        const email = prompt('請輸入 Email（會寄 Magic Link 到你的信箱）：');
        if (!email) return;
        try {
          await signInWithEmail(email);
          alert('已寄出登入連結，請到信箱點擊完成登入。');
        } catch (e) {
          alert('寄出登入連結失敗：' + (e?.message || e));
        }
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await signOut();
      await refreshAuthUI();
      lockIndexCardsIfAny();  // 立即上鎖
    });
  }
}

// ---------- 首頁鎖定/解鎖（卡片上的 data-requires-auth） ----------
function lockIndexCardsIfAny() {
  if (document.querySelector('[data-requires-auth]') === null) return;
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
  if (document.querySelector('[data-requires-auth]') === null) return;
  $$('[data-requires-auth]').forEach(btn => {
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
    btn.classList.remove('locked');
    btn.removeEventListener('click', lockClick);
  });
}

async function lockClick(e) {
  if (await isAuthed()) return; // 已登入就放行
  e.preventDefault();
  const btn = $('#btnLogin');
  if (confirm('此內容需登入後才能觀看。要立刻登入嗎？') && btn) btn.click();
}

// ---------- Player 守門（非白名單就要登入） ----------
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁
  const slug = new URLSearchParams(location.search).get('slug') || '';

  const authed = await isAuthed();  // 用快取後的狀態
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

// ---------- 啟動 ----------
document.addEventListener('DOMContentLoaded', async () => {
  // 第一次讀取 Session，建好快取；之後點卡片不會誤判
  await refreshAuthState();
  wireHeaderAuth();
  await refreshAuthUI();
  await guardPlayerIfAny();

  // 首頁卡片存在才需要鎖/解鎖
  if (document.querySelector('[data-requires-auth]')) {
    _authed ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

// 登入狀態改變（包含 OAuth / Magic Link 回來）
supa.auth.onAuthStateChange(async () => {
  await refreshAuthState();
  await refreshAuthUI();
  _authed ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

// 讓其它腳本可用
window.Auth = { getUser, isAuthed };











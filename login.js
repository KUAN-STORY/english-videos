// login.js — Supabase Auth（Email Magic Link + Google）
// 以 ES Module 載入：<script type="module" src="./login.js"></script>

console.log('[login.js] module loaded');

import { supa, getUser, signInWithEmail, signOut } from './videos/js/supa.js';

// 未登入也可看的 slug（需與 data/index.json 對應）
const FREE_SLUGS = new Set(['mid-autumn']);

// DOM helper
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function isAuthed() {
  const u = await getUser();
  return !!u;
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
      console.log('[login.js] #btnLogin clicked');
      const useGoogle = confirm('要用 Google 登入嗎？\n按「確定」使用 Google；按「取消」改用 Email。');

      if (useGoogle) {
        const redirectTo = location.origin + location.pathname; // index.html / player.html
        console.log('[login.js] Google OAuth redirectTo =', redirectTo);
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
      lockIndexCardsIfAny();
    });
  }
}

// Player 守門（非白名單且未登入則攔截）
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;
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

// 首頁卡片鎖定/解鎖（需在卡片按鈕上加 data-requires-auth）
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
  const btn = $('#btnLogin');
  if (confirm('此內容需登入後才能觀看。要立刻登入嗎？') && btn) btn.click();
}

// 啟動
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[login.js] DOMContentLoaded');
  wireHeaderAuth();
  await refreshAuthUI();
  await guardPlayerIfAny();

  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

// 登入狀態改變（包含 OAuth/Magic Link 回來）
supa.auth.onAuthStateChange(async () => {
  console.log('[login.js] onAuthStateChange');
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

// 讓其它腳本可查詢
window.Auth = { getUser, isAuthed };




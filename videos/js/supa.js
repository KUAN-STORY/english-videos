// login.js — Supabase Auth 版（Email Magic Link + Google）
// -------------------------------------------------------
// ⛳ 如果你的 supa.js 在別的位置，改這行即可：
//   import { supa, getUser, signInWithEmail, signOut } from './js/supa.js';
import { supa, getUser, signInWithEmail, signOut } from './english-videos/videos
/js/supa.js';

const PUBLIC_SLUGS = ['mid-autumn'];  // 未登入可看的 slug 白名單（可增減）

// ---------- 工具 ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function isAuthed() {
  return !!(await getUser());
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
      // 使用者選擇 Google 或 Email
      const useGoogle = confirm('要用 Google 登入嗎？\n按「確定」使用 Google；按「取消」改用 Email。');
      if (useGoogle) {
        // OAuth：回來的網址要在 Supabase 的 redirect 列表內
        const redirectTo = location.origin + location.pathname;
        await supa.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo }
        });
        // 會跳轉，回來後 onAuthStateChange 會更新 UI
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

// ---------- Player 守門（未登入擋非白名單） ----------
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const authed = await isAuthed();

  if (!authed && !PUBLIC_SLUGS.includes(slug)) {
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

// ---------- 首頁卡片鎖定/解鎖（需在卡片上加 data-requires-auth） ----------
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
  const goLogin = confirm('此內容需登入後才能觀看。要立刻登入嗎？');
  if (goLogin) {
    const btn = $('#btnLogin');
    if (btn) btn.click();
  }
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

// Supabase 監聽登入狀態改變
supa.auth.onAuthStateChange(async (_event, _session) => {
  await refreshAuthUI();
  const authed = await isAuthed();
  if (authed) unlockIndexCardsIfAny();
  else       lockIndexCardsIfAny();
});

// 讓其它腳本可查詢
window.Auth = { getUser, isAuthed };

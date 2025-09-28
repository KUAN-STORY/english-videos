// login.js — Supabase Auth 版（Email Magic Link + Google）
import { supa, getUser, signInWithEmail, signOut } from './videos/js/supa.js';

const PUBLIC_SLUGS = ['mid-autumn'];  // 未登入可看的 slug 白名單

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
      const useGoogle = confirm('要用 Google 登入嗎？\n按「確定」使用 Google；按「取消」改用 Email。');
      if (useGoogle) {
        const redirectTo = location.origin + location.pathname;
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

// ---------- Player 守門 ----------
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;
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

// ---------- 首頁卡片鎖定/解鎖 ----------
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

  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

supa.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  const authed = await isAuthed();
  if (authed) unlockIndexCardsIfAny();
  else       lockIndexCardsIfAny();
});

window.Auth = { getUser, isAuthed };



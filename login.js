// login.js — Supabase Auth 版（Email Magic Link + Google）
import { supa, getUser, signInWithEmail, signOut } from './videos/js/supa.js';

// 首頁白名單影片（未登入也可看）——與 data/index.json 內的 free 一致即可
const FREE_SLUGS = new Set(['mid-autumn']);

// 工具
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
        const redirectTo = location.origin + location.pathname; // 回到目前頁面
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

// Player 守門（若在 player.html，且非白名單且未登入 → 引導登入）
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

// 首頁卡片鎖定/解鎖（需在卡片按鈕上加 data-requires-auth）
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

// 啟動
document.addEventListener('DOMContentLoaded', async () => {
  wireHeaderAuth();
  await refreshAuthUI();
  await guardPlayerIfAny();

  // 只有首頁才有 data-requires-auth 的按鈕
  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

// 監聽登入狀態變更
supa.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

// 給其它頁面查詢
window.Auth = { getUser, isAuthed };


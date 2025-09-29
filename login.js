// login.js — Supabase Auth 版（Email Magic Link + Google）
import { supa, getUser, signInWithEmail, signOut } from './videos/js/supa.js';

console.log('[login.js] module loaded');

const FREE_SLUGS = new Set(['mid-autumn']); // 免登入白名單

// DOM helpers
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function isAuthed() {
  try {
    const u = await getUser();
    return !!u;
  } catch (e) {
    console.error('[login.js] getUser error:', e);
    return false;
  }
}

// 右上角登入列 UI
async function refreshAuthUI() {
  try {
    const u = await getUser();
    const btnLogin  = $('#btnLogin');
    const btnLogout = $('#btnLogout');
    const badge     = $('#userNameBadge');
    if (!btnLogin || !btnLogout || !badge) {
      console.warn('[login.js] header buttons missing');
      return;
    }

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
  } catch (e) {
    console.error('[login.js] refreshAuthUI error:', e);
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
        try {
          const redirectTo = location.origin + location.pathname; // 必須在 Supabase Redirect URLs 白名單
          console.log('[login.js] Google OAuth redirectTo =', redirectTo);
          await supa.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo }
          });
        } catch (e) {
          console.error('[login.js] Google OAuth error:', e);
          alert('Google 登入失敗：' + (e?.message || e));
        }
      } else {
        const email = prompt('請輸入 Email（會寄 Magic Link 到你的信箱）：');
        if (!email) return;
        try {
          await signInWithEmail(email);
          alert('已寄出登入連結，請到信箱點擊完成登入。');
        } catch (e) {
          console.error('[login.js] signInWithEmail error:', e);
          alert('寄出登入連結失敗：' + (e?.message || e));
        }
      }
    });
  } else {
    console.warn('[login.js] #btnLogin not found');
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      console.log('[login.js] #btnLogout clicked');
      try {
        await signOut();
        await refreshAuthUI();
        lockIndexCardsIfAny();
      } catch (e) {
        console.error('[login.js] signOut error:', e);
      }
    });
  }
}

// Player 守門（未登入擋非白名單）
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const authed = await isAuthed();
  console.log('[login.js] guardPlayerIfAny slug=', slug, 'authed=', authed);

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
  }).catch(e => console.error('[login.js] lockIndexCardsIfAny getUser err:', e));
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
supa.auth.onAuthStateChange(async (evt) => {
  console.log('[login.js] onAuthStateChange:', evt);
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

// 對話框上的「去登入」也在這邊再補一個保險的 click 綁定（避免首頁腳本沒綁到）
document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (t && t.id === 'btnGoLogin') {
    console.log('[login.js] #btnGoLogin clicked (fallback)');
    const btn = $('#btnLogin');
    if (btn) btn.click();
  }
});

// 讓其它腳本可用
window.Auth = { getUser, isAuthed };



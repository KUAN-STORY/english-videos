// login.js — 正式站（Email + 密碼版）
// ✅ 本檔會：
// 1) 只走 Email + Password，不再彈 Google
// 2) 維持你現有 UI：右上登入/登出、首頁鎖卡片、對話框「去登入」
// 3) Player 守門：mid-autumn 免登入，其它需登入
// 4) 路徑假設：/english-videos/ 底下的 supa.js 與本檔同層
//    （你的 repo 現在就是 /english-videos/supa.js）

import {
  supa,
  getUser as _getUser,
  signOut as _signOut,
  // 你在 supa.js 裡如有 signInWithEmailPassword / signUp… 也可以 export，
  // 這裡只需要 signInWithPassword 即可
} from './supa.js';

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

// 未登入也可看的 slug（與 data/index.json 對應）
const FREE_SLUGS = new Set(['mid-autumn']);

/* ----------------- Auth helpers ----------------- */
async function getUser() {
  return await _getUser();
}
async function isAuthed() {
  return !!(await getUser());
}
async function signOut() {
  await _signOut();
}

/* ----------------- UI wiring ----------------- */
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
  // 先用簡單 prompt；之後你要換成正式表單也可以，這檔不需再改其它地方
  const email = prompt('請輸入 Email：');
  if (!email) return null;
  const password = prompt('請輸入密碼：');
  if (!password) return null;
  return { email, password };
}

async function doEmailPasswordLogin() {
  const creds = askEmailPassword();
  if (!creds) return;

  const { error } = await supa.auth.signInWithPassword(creds);
  if (error) {
    alert('登入失敗：' + error.message);
    return;
  }
  await refreshAuthUI();
}

/** 讓其它程式可以叫出登入流程（例如首頁對話框「去登入」） */
async function showLogin() {
  await doEmailPasswordLogin();
}

/** 右上登入 / 登出按鈕 */
function wireHeaderAuth() {
  $('#btnLogin')?.addEventListener('click', showLogin);
  $('#btnLogout')?.addEventListener('click', async () => {
    await signOut();
    await refreshAuthUI();
    lockIndexCardsIfAny(); // 回首頁時即時鎖回
  });
}

/** 首頁卡片鎖定/解鎖（需在按鈕上加 data-requires-auth） */
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
  // 你首頁有一個對話框“去登入”，這裡兩種都支援
  if ($('#btnGoLogin')) {
    // 觸發你現有的對話框流程；按「去登入」會呼叫下面的 wireLoginDialog
    $('#btnGoLogin').click();
  } else {
    await showLogin();
  }
}

/** Player 守門：非 FREE 且未登入 → 要求登入或回首頁 */
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player 頁

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) return; // free 直接看

  if (!(await isAuthed())) {
    if (confirm('這部影片需要登入後才能觀看。要立刻登入嗎？')) {
      await showLogin();
      // 登入後自動繼續留在本頁
    } else {
      alert('目前先返回首頁。');
      location.href = './index.html';
    }
  }
}

/** 首頁對話框 “去登入” */
function wireLoginDialog() {
  // 你的對話框裡有 id="btnGoLogin"
  $('#btnGoLogin')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    // 關閉對話框
    try { $('#dlgLogin')?.close(); } catch {}
    await showLogin();
  });
}

/* ----------------- Boot ----------------- */
document.addEventListener('DOMContentLoaded', async () => {
  wireHeaderAuth();
  wireLoginDialog();
  await refreshAuthUI();
  await guardPlayerIfAny();

  // 只在首頁才有 data-requires-auth 的卡片
  if (document.querySelector('[data-requires-auth]')) {
    (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
  }
});

// 監聽登入狀態改變（Email+密碼登入、登出都會觸發）
supa.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
  (await isAuthed()) ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
});

/* 對外（讓 index / player 想查詢狀態或強制彈登入時可用） */
window.Auth = {
  getUser,
  isAuthed,
  showLogin
};
















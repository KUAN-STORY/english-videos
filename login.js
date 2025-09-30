// login.js — Final (Email + Password) v8
// -----------------------------------------------------
import { supa } from './supa.js';

const TAG = '[login.js]';
const $ = (s, r = document) => r.querySelector(s);

// 當前使用者（同步快取；給首頁快速判斷用）
let currentUser = null;

// ─────────────────────────────────────────────────────
// 基本流程
// ─────────────────────────────────────────────────────
async function refreshUser() {
  try {
    const { data: { user }, error } = await supa.auth.getUser();
    if (error) console.warn(TAG, 'getUser error:', error);
    const before = currentUser?.email || null;
    currentUser = user || null;
    const after  = currentUser?.email || null;

    console.log(TAG, 'refreshUser ->', { before, after });
    updateAuthUI();

    // 廣播給頁面（index.html/其他腳本可監聽）
    window.dispatchEvent(new CustomEvent('auth:changed', {
      detail: { authed: !!currentUser, email: currentUser?.email || null }
    }));

    return currentUser;
  } catch (e) {
    console.error(TAG, 'refreshUser exception:', e);
    return null;
  }
}

function isAuthedSync() {
  return !!currentUser;
}

// ─────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────
function updateAuthUI() {
  const badge    = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout= $('#btnLogout');

  if (!badge || !btnLogin || !btnLogout) {
    console.log(TAG, 'UI hooks not found (this is ok on test/minimal pages).');
    return;
  }

  if (currentUser) {
    const show = currentUser.user_metadata?.name || currentUser.email || '已登入';
    badge.textContent = show;
    btnLogin.style.display  = 'none';
    btnLogout.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    btnLogin.style.display  = 'inline-block';
    btnLogout.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────
// Auth 動作：登入 / 註冊 / 登出
// ─────────────────────────────────────────────────────
async function signInWithPassword(email, password) {
  console.log(TAG, 'signInWithPassword ->', email);
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn(TAG, 'signIn error:', error);
    alert('登入失敗：' + error.message);
    return null;
  }
  console.log(TAG, 'signIn ok ->', data?.user?.email);
  await refreshUser();
  alert('登入成功！');
  return data.user;
}

async function signUp(email, password) {
  console.log(TAG, 'signUp ->', email);
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) {
    console.warn(TAG, 'signUp error:', error);
    alert('註冊失敗：' + error.message);
    return null;
  }
  alert('註冊成功，請到信箱完成驗證後再登入。');
  return data.user;
}

async function signOut() {
  console.log(TAG, 'signOut');
  await supa.auth.signOut();
  currentUser = null;
  updateAuthUI();
  window.dispatchEvent(new CustomEvent('auth:changed', {
    detail: { authed: false, email: null }
  }));
  alert('已登出');
}

// ─────────────────────────────────────────────────────
// 對話框 / 按鈕綁定
// ─────────────────────────────────────────────────────
async function openAuthPrompt() {
  console.log(TAG, 'openAuthPrompt()');
  const email = prompt('請輸入 Email：');
  if (!email) return;
  const pw = prompt('請輸入密碼：');
  if (!pw) return;

  // 先嘗試登入；失敗再詢問是否要註冊
  const { data, error } = await supa.auth.signInWithPassword({ email, password: pw });
  if (error) {
    const goSignUp = confirm(`登入失敗：${error.message}\n要改成「註冊新帳號」嗎？`);
    if (goSignUp) await signUp(email, pw);
    return;
  }
  console.log(TAG, 'prompt signIn ok ->', data?.user?.email);
  await refreshUser();
  $('#dlgLogin')?.close();
}

function wireHeaderAuth() {
  const btnLogin   = $('#btnLogin');
  const btnLogout  = $('#btnLogout');
  const btnGoLogin = $('#btnGoLogin');  // (dialog 裡)
  const btnDlgClose= $('#btnDlgClose'); // (dialog 裡)

  if (btnLogin) {
    btnLogin.onclick = (e) => { e.preventDefault(); openAuthPrompt(); };
  } else {
    console.log(TAG, 'no #btnLogin found (page may be player/test)');
  }

  if (btnLogout) {
    btnLogout.onclick = async (e) => { e.preventDefault(); await signOut(); };
  }

  if (btnGoLogin) {
    btnGoLogin.onclick = (e) => {
      e.preventDefault();
      $('#dlgLogin')?.close();
      openAuthPrompt();
    };
  }

  if (btnDlgClose) {
    btnDlgClose.onclick = (e) => {
      e.preventDefault();
      $('#dlgLogin')?.close();
    };
  }
}

// ─────────────────────────────────────────────────────
// Player 守門（若頁面有 #player 才會運作）
//   - 白名單在 index.html 已控制卡片入口；這裡只是雙重保護
// ─────────────────────────────────────────────────────
const FREE_SLUGS = new Set(['mid-autumn']);
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return;

  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (FREE_SLUGS.has(slug)) {
    console.log(TAG, 'guard skipped (FREE):', slug);
    return;
  }

  // 先看同步快取，不行再 refresh
  let authed = isAuthedSync();
  if (!authed) authed = !!(await refreshUser());

  console.log(TAG, 'guardPlayer slug=', slug, 'authed=', authed);
  if (!authed) {
    const go = confirm('本片需登入才能觀看。要馬上登入嗎？');
    if (go) $('#btnLogin')?.click();
    else    location.href = './index.html';
  }
}

// ─────────────────────────────────────────────────────
// 初始化 & 事件
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log(TAG, 'DOMContentLoaded');
  await refreshUser();      // 把現有 session 讀回來
  wireHeaderAuth();         // 綁定按鈕
  await guardPlayerIfAny(); // 若在播放器頁，做守門

  // 對外提供 API（給 index.html 取用）
  window.Auth = {
    isAuthed: async () => !!(await refreshUser()),
    getUser : () => currentUser,
    // 若你有需要手動呼叫：
    _refresh: refreshUser,
    _signOut: signOut,
  };

  console.log(TAG, 'ready ->', { authed: !!currentUser, email: currentUser?.email || null });
});

// Supabase 內建狀態改變（登入/登出/Token 續期） → 重新整理快取與 UI
supa.auth.onAuthStateChange(async (event, session) => {
  console.log(TAG, 'onAuthStateChange:', event, 'session?', !!session);
  await refreshUser();
});

// 便利的除錯訊號（可在主控台看到登入狀態變化）
window.addEventListener('auth:changed', (e) => {
  console.log(TAG, 'auth:changed ->', e.detail);
});































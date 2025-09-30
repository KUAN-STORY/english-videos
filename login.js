// login.js — Email + Password 版（穩定＆含詳盡除錯訊息）
import { supa } from './supa.js';

// ====== 可調整：未登入也可看的影片 slug（白名單）======
const FREE_SLUGS = new Set(['mid-autumn']);

// ====== 小工具 ======
const $  = (s, r = document) => r.querySelector(s);
const now = () => new Date().toISOString().slice(11,19); // 只顯示 HH:MM:SS

let currentUser = null;

// 讀取使用者（從 Supabase）
async function refreshUser() {
  const { data: { user }, error } = await supa.auth.getUser();
  if (error) console.warn(`[${now()}][login.js] getUser error:`, error);
  currentUser = user || null;
  console.log(`[${now()}][login.js] refreshUser =>`, currentUser?.email || null);
  // 廣播（給 index / player 想聽的人）
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: { authed: !!currentUser, user: currentUser }}));
  return currentUser;
}

// UI：右上角徽章＆按鈕
async function updateAuthUI() {
  const badge = $('#userNameBadge');
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  if (!badge || !btnLogin || !btnLogout) return;

  if (currentUser) {
    const name = currentUser.user_metadata?.name || currentUser.email || '已登入';
    badge.textContent = name;
    btnLogin.style.display  = 'none';
    btnLogout.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    btnLogin.style.display  = 'inline-block';
    btnLogout.style.display = 'none';
  }
  console.log(`[${now()}][login.js] updateAuthUI (authed=${!!currentUser})`);
}

// 右上角登入/登出綁定
function wireHeaderAuth() {
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const dlg       = $('#dlgLogin');
  const goLogin   = $('#btnGoLogin');
  const dlgClose  = $('#btnDlgClose');

  // 右上登入
  btnLogin?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log(`[${now()}][login.js] <click> #btnLogin`);
    await openAuthPrompt();
  });

  // 右上登出
  btnLogout?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log(`[${now()}][login.js] <click> #btnLogout`);
    await supa.auth.signOut();
    currentUser = null;
    await updateAuthUI();
    alert('已登出');
  });

  // 卡片彈窗：去登入
  goLogin?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log(`[${now()}][login.js] <click> #btnGoLogin`);
    dlg?.close();
    await openAuthPrompt();
  });

  // 卡片彈窗：取消
  dlgClose?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log(`[${now()}][login.js] <click> #btnDlgClose`);
    dlg?.close();
  });
}

// 簡單的 Email+密碼登入提示（測試用）
async function openAuthPrompt() {
  const email = prompt('請輸入 Email：');
  if (!email) return;
  const password = prompt('請輸入密碼：');
  if (!password) return;

  console.log(`[${now()}][login.js] signInWithPassword:`, email);

  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn(`[${now()}][login.js] signIn error:`, error);
    alert(`登入失敗：${error.message}`);
    return;
  }

  console.log(`[${now()}][login.js] signIn ok =>`, data?.user?.email);
  await refreshUser();
  await updateAuthUI();
  alert('登入成功！');
}

// 給 player.html 用的守門（如果你在 player 有用到 #player）
async function guardPlayerIfAny() {
  const player = $('#player');
  if (!player) return; // 不在 player.html 直接略過

  const slug = new URLSearchParams(location.search).get('slug') || '';
  // 白名單放行
  if (FREE_SLUGS.has(slug)) {
    console.log(`[${now()}][login.js] guardPlayerIfAny: free slug "${slug}" → allow`);
    return;
  }

  const authed = !!(await refreshUser());
  if (!authed) {
    console.log(`[${now()}][login.js] guardPlayerIfAny: need login`);
    const go = confirm('這部影片需要登入後才能觀看，要立刻登入嗎？');
    if (go) {
      await openAuthPrompt();
      // 登入後再檢查一次
      const ok = !!(await refreshUser());
      if (!ok) location.href = './index.html';
    } else {
      location.href = './index.html';
    }
  }
}

// ====== 對外介面（給 index.html 呼叫）======
window.Auth = {
  // 同步快速判斷
  isAuthedSync: () => !!currentUser,
  // 非同步判斷（會到 Supabase 取一次）
  isAuthed: async () => !!(await refreshUser()),
  // 取使用者
  getUser: () => currentUser,
  // 直接呼叫登入（如果你之後想做自訂 UI 可以用）
  signInWithEmailPassword: async (email, password) => {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshUser();
    await updateAuthUI();
    return data.user;
  },
  // 登出
  signOut: async () => {
    await supa.auth.signOut();
    currentUser = null;
    await updateAuthUI();
  },
};

// ====== 初始化 ======
document.addEventListener('DOMContentLoaded', async () => {
  console.log(`[${now()}][login.js] loaded & DOM ready`);
  await refreshUser();
  await updateAuthUI();
  wireHeaderAuth();
  await guardPlayerIfAny();
});

// ====== 監聽 Supabase 狀態變化（自動刷新 / 登入 / 登出）======
supa.auth.onAuthStateChange(async (event, session) => {
  console.log(`[${now()}][login.js] onAuthStateChange:`, event, session?.user?.email || null);
  await refreshUser();
  await updateAuthUI();
});

// ====== 額外：把事件 log 出來，方便觀察 index.html ↔ login.js 溝通 ======
window.addEventListener('auth:changed', (e) => {
  console.log(`[${now()}][login.js] event auth:changed ->`, e.detail);
});










































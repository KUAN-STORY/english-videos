<script type="module">
// login.js — 只用 Email Magic Link 登入；對外發出 auth-changed 事件讓頁面重新渲染

import { supa, getUser, signOut } from './supa.js';

// DOM helpers
const $  = (s, r=document) => r.querySelector(s);

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
    badge.textContent = `👤 ${u.email || '已登入'}`;
  } else {
    btnLogin.style.display  = '';
    btnLogout.style.display = 'none';
    badge.textContent = '';
  }
}

// 啟動登入流程（Email Magic Link）
async function startEmailLogin() {
  const email = prompt('請輸入 Email，我會寄出登入連結：');
  if (!email) return;
  try {
    await supa.auth.signInWithOtp({
      email,
      options: {
        // Magic Link 點回來的頁面（保持現在頁面即可）
        emailRedirectTo: location.origin + location.pathname
      }
    });
    alert('已寄出登入連結，請到信箱點擊完成登入。');
  } catch (e) {
    alert('寄出登入連結失敗：' + (e?.message || e));
  }
}

// 綁定右上角按鈕
function wireHeaderAuth() {
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if (btnLogin)  btnLogin.addEventListener('click', startEmailLogin);
  if (btnLogout) btnLogout.addEventListener('click', async () => {
    await signOut();
    await refreshAuthUI();
    // 通知其它腳本登入狀態已變
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { authed: false }}));
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  wireHeaderAuth();
  await refreshAuthUI();
});

// 跨分頁／Magic Link 回來：狀態改變時觸發
supa.auth.onAuthStateChange(async (_event, session) => {
  await refreshAuthUI();
  const authed = !!session;
  // 通知其它腳本（例如 index.html）重新渲染按鈕解鎖
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { authed }}));
});

// 讓其它腳本能查詢
window.Auth = { isAuthed };
</script>


















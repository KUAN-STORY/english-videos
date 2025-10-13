// ===============================
// account-menu.js (最新版 2025.10)
// ===============================

// 版本顯示（可省略）
const VERSION = 'v1.2';

// 顯示登入狀態選擇器（可根據實際邏輯調整）
const HIDE_LOGIN_SEL = '.hide-when-login';
const HIDE_LOGOUT_SEL = '.hide-when-logout';

function mountUI(client) {
  if (HIDE_LOGIN_SEL)
    document.querySelectorAll(HIDE_LOGIN_SEL).forEach(el => (el.style.display = 'none'));
  if (HIDE_LOGOUT_SEL)
    document.querySelectorAll(HIDE_LOGOUT_SEL).forEach(el => (el.style.display = 'block'));

  // === 主根節點 ===
  const root = document.createElement('div');
  root.id = 'accMenuRoot';
  root.innerHTML = `
    <span class="acc-badge">${VERSION}</span>
    <button class="acc-avatar" id="accAvatarBtn" aria-label="account">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4zM12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path>
      </svg>
      <span id="accAvatarText" class="muted">未登入</span>
    </button>

    <div class="acc-menu" id="accDropdown">
      <div class="acc-item" data-link="./account/profile.html">個人資料</div>
      <div class="acc-item" data-link="./account/learning-dashboard.html">我的學習</div>
      <div class="acc-item" data-link="./account/learning.html">學習曲線</div>
      <div class="acc-item" data-link="./account/subscription.html">我的訂閱</div>
      <div class="split"></div>
      <div class="acc-item" id="accLogout" style="display:none">登出</div>
    </div>
  `;
  document.body.appendChild(root);

  // === 快速選取 ===
  const avatarBtn = root.querySelector('#accAvatarBtn');
  const menu = root.querySelector('#accDropdown');
  const txt = root.querySelector('#accAvatarText');
  const btnLogout = root.querySelector('#accLogout');

  // === 展開/收合選單 ===
  avatarBtn.addEventListener('click', () => {
    menu.classList.toggle('open');
  });

  // === 點擊整列跳轉 ===
  menu.addEventListener('click', e => {
    const item = e.target.closest('.acc-item[data-link]');
    if (!item) return;
    const link = item.getAttribute('data-link');
    if (link) location.href = link;
  });

  // === 登出動作 ===
  btnLogout.addEventListener('click', async () => {
    if (window.supabase) await supabase.auth.signOut();
    localStorage.removeItem('sb-auth-token');
    location.reload();
  });

  // === 自動高亮目前頁 ===
  const current = location.pathname.replace(/\/+$/, '');
  menu.querySelectorAll('.acc-item[data-link]').forEach(el => {
    const to = new URL(el.dataset.link, location.origin).pathname;
    if (current.endsWith(to)) el.classList.add('active');
  });
}

// === CSS: active 狀態 ===
const style = document.createElement('style');
style.textContent = `
  .acc-menu { display:none; flex-direction:column; position:absolute; background:#0e1624; border:1px solid #223; padding:6px 0; border-radius:8px; }
  .acc-menu.open { display:flex; }
  .acc-item { padding:8px 16px; cursor:pointer; color:#bbb; }
  .acc-item:hover { background:#1e2533; color:#fff; }
  .acc-item.active { color:#4da3ff; font-weight:600; }
  .split { border-bottom:1px solid #223; margin:4px 0; }
`;
document.head.appendChild(style);

// === 初始化 ===
mountUI();

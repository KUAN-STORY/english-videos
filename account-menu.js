// account-menu.js
// 帳號選單：個人資料 / 學習控制台 / 我的訂閱 / 推廣分潤 / 登出

import { supabase } from '../supa.js';

const VERSION = 'v1.0.0';
const root = document.getElementById('accountMenu');

if (root) {
  root.innerHTML = `
    <span class="acc-badge">${VERSION}</span>
    <button class="acc-avatar" id="accAvatarBtn" aria-label="account">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
      </svg>
    </button>

    <div class="acc-menu" id="accDropdown">
      <div class="acc-item" data-link="./account/profile.html">個人資料</div>
      <div class="acc-item" data-link="./account/learning-dashboard.html">學習控制台</div>
      <div class="acc-item" data-link="./account/subscriptions.html">我的訂閱</div>
      <div class="acc-item" data-link="./account/referrals.html">推廣分潤</div>
      <div class="split"></div>
      <div class="acc-item" id="accLogout" style="display:none">登出</div>
    </div>
  `;

  const avatarBtn = root.querySelector('#accAvatarBtn');
  const dropdown = root.querySelector('#accDropdown');
  const logoutBtn = root.querySelector('#accLogout');

  // 開關選單
  avatarBtn.addEventListener('click', () => {
    dropdown.classList.toggle('show');
  });

  // 點擊外部關閉
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) dropdown.classList.remove('show');
  });

  // 登出
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  // 點擊導頁
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.acc-item');
    if (!item || !item.dataset.link) return;
    location.href = item.dataset.link;
  });

  // 登入狀態判斷
  supabase.auth.getUser().then(({ data }) => {
    logoutBtn.style.display = data.user ? 'block' : 'none';
  });
}

// 樣式
const style = document.createElement('style');
style.textContent = `
  .acc-badge { font-size:10px; color:#666; position:absolute; top:2px; right:4px; }
  .acc-avatar { background:none; border:none; cursor:pointer; color:#333; }
  .acc-menu { display:none; position:absolute; right:0; top:40px; background:#fff;
    border:1px solid #ccc; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1);
    min-width:150px; z-index:1000; }
  .acc-menu.show { display:block; }
  .acc-item { padding:8px 14px; cursor:pointer; }
  .acc-item:hover { background:#f1f5ff; }
  .split { border-top:1px solid #eee; margin:4px 0; }
`;
document.head.appendChild(style);

/* V2025V001 – BookWide Account Menu */
(() => {
  const VERSION = 'V2025V001';

  // 你的專案（可被 window.SUPABASE_URL / SUPABASE_ANON_KEY 覆寫）
  const SUPABASE_URL  = window.SUPABASE_URL  || 'https://qtgwedankftrqjmzuset.supabase.co';
  const SUPABASE_KEY  = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g';

  // 要隱藏舊的登入 / 登出按鈕可塞 selector（選填）
  const HIDE_LOGIN_SEL  = window.SB_LOGIN_HIDE_SELECTOR  || '.btn-login,.login,.js-login';
  const HIDE_LOGOUT_SEL = window.SB_LOGOUT_HIDE_SELECTOR || '';

  // 載入 supabase-js v2（如未載）
  function ensureSupabase() {
    return new Promise((resolve) => {
      if (window.supabase) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => resolve();
      document.head.appendChild(s);
    });
  }

  // UI
  function mountUI(client) {
    // 隱藏舊按鈕（如果頁面有）
    if (HIDE_LOGIN_SEL)  document.querySelectorAll(HIDE_LOGIN_SEL).forEach(el => el.style.display='none');
    if (HIDE_LOGOUT_SEL) document.querySelectorAll(HIDE_LOGOUT_SEL).forEach(el => el.style.display='none');

    // root
    const root = document.createElement('div');
    root.id = 'accMenuRoot';
    root.innerHTML = `
      <span class="acc-badge">${VERSION}</span>
      <button class="acc-avatar" id="accAvatarBtn" aria-label="account">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.761 0 5-2.686 5-6s-2.239-6-5-6-5 2.686-5 6 2.239 6 5 6zm0 2c-3.859 0-7 2.91-7 6.5V22h14v-1.5C19 16.91 15.859 14 12 14z"/></svg>
        <span id="accAvatarText" class="muted">未登入</span>
      </button>
      <div class="acc-menu" id="accDropdown">
        <div class="acc-item" data-link="./account/profile.html">我的資料</div>
        <div class="acc-item" data-link="./account/learning-dashboard.html">我的學習</div>
        <div class="acc-item" data-link="./account/learning.html">學習曲線</div>
        <div class="split"></div>
        <div class="acc-item" id="accLogin">登入</div>
        <div class="acc-item" id="accLogout" style="display:none">登出</div>
      </div>
    `;
    document.body.appendChild(root);

    const avatarBtn = root.querySelector('#accAvatarBtn');
    const menu      = root.querySelector('#accDropdown');
    const txt       = root.querySelector('#accAvatarText');
    const btnLogin  = root.querySelector('#accLogin');
    const btnLogout = root.querySelector('#accLogout');

    // 切換選單
    avatarBtn.addEventListener('click', () => menu.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) menu.classList.remove('open');
    });

    // 連結
    menu.querySelectorAll('[data-link]').forEach(a=>{
      a.addEventListener('click', () => { location.href = a.dataset.link; });
    });

    // 登入：若設定 provider 就 OAuth，否則寄 Magic Link
    btnLogin.addEventListener('click', async () => {
      const provider = (window.SB_LOGIN_PROVIDER||'').toLowerCase();
      if (provider === 'google' || provider === 'github') {
        const { error } = await client.auth.signInWithOAuth({
          provider,
          options: { redirectTo: location.href }
        });
        if (error) alert(error.message);
      } else {
        const email = prompt('請輸入 Email（會寄驗證連結）');
        if (!email) return;
        const { error } = await client.auth.signInWithOtp({
          email, options:{ emailRedirectTo: location.href }
        });
        alert(error ? error.message : '已寄出登入連結，請到信箱點擊完成登入');
      }
    });

    // 登出
    btnLogout.addEventListener('click', async () => {
      await client.auth.signOut();
      location.reload();
    });

    // 初始狀態
    client.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (user) {
        txt.textContent = user.email || '已登入';
        btnLogin.style.display = 'none';
        btnLogout.style.display = 'flex';
      }
    });

    // 狀態變動
    client.auth.onAuthStateChange((_e, session) => {
      const user = session?.user;
      if (user) {
        txt.textContent = user.email || '已登入';
        btnLogin.style.display = 'none';
        btnLogout.style.display = 'flex';
      } else {
        txt.textContent = '未登入';
        btnLogin.style.display = 'flex';
        btnLogout.style.display = 'none';
      }
    });
  }

  // 啟動
  (async () => {
    await ensureSupabase();
    const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    mountUI(supa);
    console.log('[AccountMenu] Ready', VERSION);
  })();
})();

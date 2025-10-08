/* account-menu.js — drop-in account UI for index.html (V2025V001, preconfigured) */
(() => {
  const VERSION = "V2025V001";
  window.SUPABASE_URL = "https://qtgwedankftrqjmzuset.supabase.co";
  window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureSupabase() {
    if (!window.supabase) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    }
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window._sbClient) {
      window._sbClient = window.supabase.createClient(url, key, { auth: { persistSession: true } });
    }
    return window._sbClient;
  }

  function upsertVersionPill() {
    const id = 'kv-version-pill';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.textContent = VERSION;
      el.setAttribute('aria-label', 'version');
      document.body.appendChild(el);
    } else {
      el.textContent = VERSION;
    }
  }

  function hideLegacyLoginButtons() {
    const nodes = Array.from(document.querySelectorAll('a,button'));
    nodes.forEach(n => {
      const t = (n.textContent || '').trim();
      if (!t) return;
      if (t === '登入' || t.includes('登入')) {
        if (n.closest('#kv-account-menu')) return;
        n.style.display = 'none';
      }
    });
  }

  function buildMenu() {
    if (document.getElementById('kv-account-menu')) return;
    const wrap = document.createElement('div');
    wrap.id = 'kv-account-menu';
    wrap.innerHTML = `
      <button id="kv-avatar" class="kv-avatar" aria-haspopup="true" aria-expanded="false" title="帳號">
        <span class="kv-avatar-icon">👤</span>
      </button>
      <div id="kv-menu" class="kv-menu" role="menu" aria-hidden="true">
        <a class="kv-item" href="./account/profile.html" role="menuitem">我的資料</a>
        <a class="kv-item" href="./account/favorites.html" role="menuitem">收藏影片</a>
        <a class="kv-item" href="./account/learning.html" role="menuitem">學習曲線</a>
        <hr class="kv-sep"/>
        <button class="kv-item" id="kv-login" role="menuitem">登入</button>
        <button class="kv-item" id="kv-logout" role="menuitem">登出</button>
      </div>
    `;
    document.body.appendChild(wrap);

    const btn = wrap.querySelector('#kv-avatar');
    const menu = wrap.querySelector('#kv-menu');
    function closeMenu() { menu.setAttribute('aria-hidden','true'); btn.setAttribute('aria-expanded','false'); }
    function openMenu() { menu.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true'); }
    btn.addEventListener('click', e=>{ e.stopPropagation(); menu.getAttribute('aria-hidden')==='true'?openMenu():closeMenu(); });
    document.addEventListener('click', e=>{ if(!wrap.contains(e.target)) closeMenu(); });
    return { wrap, menu };
  }

  async function init() {
    upsertVersionPill();
    if (!document.getElementById('kv-account-css')) {
      const s = document.createElement('link');
      s.id = 'kv-account-css'; s.rel = 'stylesheet'; s.href = './account/account-menu.css';
      document.head.appendChild(s);
    }
    const sb = await ensureSupabase();
    const { wrap } = buildMenu();
    const loginBtn = wrap.querySelector('#kv-login');
    const logoutBtn = wrap.querySelector('#kv-logout');

    async function refreshAuthUI() {
      const { data: { session } } = await sb.auth.getSession();
      loginBtn.style.display = session ? 'none':'block';
      logoutBtn.style.display = session ? 'block':'none';
    }
    loginBtn.addEventListener('click', async () => {
      try {
        const provider = (window.SB_LOGIN_PROVIDER || '').toLowerCase();
        if (provider === 'google') {
          await sb.auth.signInWithOAuth({ provider:'google', options: { redirectTo: location.href } });
        } else if (provider === 'github') {
          await sb.auth.signInWithOAuth({ provider:'github', options: { redirectTo: location.href } });
        } else {
          const email = prompt('輸入 Email 以取得登入連結：');
          if (email) {
            await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
            alert('已寄出登入連結，請至信箱確認。');
          }
        }
      } catch(e) { alert('登入失敗：'+ e.message); }
    });
    logoutBtn.addEventListener('click', async () => { await sb.auth.signOut(); await refreshAuthUI(); });
    sb.auth.onAuthStateChange((_e,_s)=>refreshAuthUI());
    await refreshAuthUI();
    hideLegacyLoginButtons();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

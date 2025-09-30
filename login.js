/* login.js — 更完整的錯誤紀錄 + 好用的偵錯工具
 * 需求：先載入 supa.js，並在 supa.js 建立全域變數 supa = createClient(...)
 * UI（若存在就會綁定；沒有也不會壞）：
 *   #loginDialog  對話框（可選）
 *   #loginEmail   電子郵件 input（可選）
 *   #loginPassword密碼 input（可選）
 *   #btnLogin     登入按鈕（可選）
 *   #btnLogout    登出按鈕（可選）
 */

(function () {
  const log = (...args) => console.log('[login.js]', ...args);
  const warn = (...args) => console.warn('[login.js]', ...args);
  const err  = (...args) => console.error('[login.js]', ...args);

  if (!window.supa) {
    err('找不到 supa 物件，請先載入 supa.js 並建立 Supabase client。');
    return;
  }

  // 允許不登入也能播放的 slug（白名單）
  const FREE_SLUGS = new Set(['mid-autumn']);

  /** 取 URL 裡的 slug（例如 player.html?slug=houyi → 'houyi'） */
  function getSlug() {
    const qs = new URLSearchParams(location.search);
    return qs.get('slug') || '';
  }

  /** 取得目前 session（並做超完整的 console 紀錄） */
  async function getSession() {
    try {
      const { data, error } = await supa.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    } catch (e) {
      err('getSession() 失敗：', {
        message: e.message,
        status: e.status,
        name: e.name,
        cause: e.cause,
      });
      return null;
    }
  }

  /** 判斷是否已登入 */
  async function isSignedIn() {
    const session = await getSession();
    return !!session;
  }

  /** 登入（帶完整錯誤） */
  async function signInWithPassword(email, password) {
    log('signInWithPassword() 開始…', { email });
    try {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      log('登入成功：', data?.user?.email || '(unknown)');
      return { ok: true, data };
    } catch (e) {
      // 所有錯誤全部印出來，後台與 CORS/設定錯誤會很明顯
      err('登入失敗：', {
        message: e.message,
        status: e.status,
        code: e.code,
        name: e.name,
        details: e,
      });
      alert(`登入失敗：${e.message || '未知錯誤'}（status=${e.status ?? '-'}, code=${e.code ?? '-' }）`);
      return { ok: false, error: e };
    }
  }

  /** 登出（帶錯誤顯示） */
  async function signOut() {
    try {
      const { error } = await supa.auth.signOut();
      if (error) throw error;
      log('已登出');
      return { ok: true };
    } catch (e) {
      err('登出失敗：', {
        message: e.message,
        status: e.status,
        code: e.code,
      });
      alert(`登出失敗：${e.message || '未知錯誤'}`);
      return { ok: false, error: e };
    }
  }

  /** 需要登入的頁面守門（在 player.html 上用） */
  async function guardPlayerIfAny() {
    const slug = getSlug();
    if (FREE_SLUGS.has(slug)) {
      log(`slug="${slug}" 在白名單，可直接播放`);
      return true;
    }
    const ok = await isSignedIn();
    if (ok) {
      log('已登入，可播放受保護內容。');
      return true;
    }
    const go = confirm('這部影片需要登入後才能觀看。要現在登入嗎？');
    if (go) {
      openLoginDialog();
    } else {
      location.href = 'index.html';
    }
    return false;
  }

  /** 登入對話框（可選：如果 HTML 沒提供也沒關係） */
  function openLoginDialog() {
    const dlg = document.querySelector('#loginDialog');
    if (dlg) {
      dlg.style.display = 'block';
      return;
    }
    // 沒有對話框就顯示 prompt（方便先排查）
    const email = prompt('Email：');
    const pass = email ? prompt('Password：') : '';
    if (email && pass) signInWithPassword(email, pass);
  }
  function closeLoginDialog() {
    const dlg = document.querySelector('#loginDialog');
    if (dlg) dlg.style.display = 'none';
  }

  /** 綁定頁面上可能存在的登入/登出 UI（沒有就略過） */
  function bindUIOnce() {
    const btnLogin  = document.querySelector('#btnLogin');
    const btnLogout = document.querySelector('#btnLogout');
    const emailEl   = document.querySelector('#loginEmail');
    const passEl    = document.querySelector('#loginPassword');

    if (btnLogin) {
      btnLogin.onclick = async () => {
        const email = emailEl?.value?.trim();
        const pass  = passEl?.value || '';
        if (!email || !pass) {
          alert('請輸入 Email 與密碼');
          return;
        }
        const { ok } = await signInWithPassword(email, pass);
        if (ok) closeLoginDialog();
      };
    }
    if (btnLogout) {
      btnLogout.onclick = async () => {
        await signOut();
      };
    }
  }

  /** 監聽登入狀態（所有變化都印出來） */
  supa.auth.onAuthStateChange(async (event, session) => {
    log('onAuthStateChange:', event, session?.user?.email || '(no user)');
    // 可依狀態切換 UI，例如：
    document.documentElement.dataset.auth = session ? 'signed' : 'anon';
  });

  /** 對外開放一組 debug 工具（在 console 直接呼叫） */
  window.debugAuth = {
    getSession,
    isSignedIn,
    signIn: signInWithPassword,
    signOut,
    whoami: async () => {
      const s = await getSession();
      return s?.user || null;
    },
    // 方便在 player.html 直接呼叫
    guardPlayerIfAny,
    openLoginDialog,
  };

  // DOM 就緒
  document.addEventListener('DOMContentLoaded', async () => {
    log('loaded & DOM ready');
    bindUIOnce();

    // 入口頁若需要顯示「已登入 / 未登入」也可以在這裡調整 UI
    const signed = await isSignedIn();
    log('初始登入狀態：', signed ? 'SIGNED_IN' : 'SIGNED_OUT');

    // 若此頁是 player.html，幫忙守門（不會卡在 index.html）
    const isPlayer = /player\.html/i.test(location.pathname);
    if (isPlayer) {
      await guardPlayerIfAny();
    }
  });
})();
















































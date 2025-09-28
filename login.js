<script>
// login.js  (V1.1)  — 假登入 + 守門 + 共用 UI
(() => {
  const STORAGE_KEY = 'authUser';
  const PUBLIC_SLUGS = ['mid-autumn']; // 未登入可看的 slug 白名單

  // ===== Auth 狀態 =====
  const getUser = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch { return null; }
  };
  const isAuthed = () => !!getUser();

  // ===== UI接線（右上角）=====
  function updateAuthUI() {
    const u = getUser();
    const btnLogin  = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    const badge     = document.getElementById('userNameBadge');
    if (!btnLogin || !btnLogout || !badge) return;

    if (u) {
      btnLogin.style.display  = 'none';
      btnLogout.style.display = '';
      badge.textContent = `👤 ${u.name || u.email}`;
    } else {
      btnLogin.style.display  = '';
      btnLogout.style.display = 'none';
      badge.textContent = '';
    }
  }

  function promptLogin(onDone) {
    const name  = (prompt('請輸入顯示名稱（可留空）') || '').trim();
    const email = (prompt('請輸入 Email（示範版，可亂填）') || '').trim();
    if (!email) { alert('需要 Email 才能登入（示範版）'); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email, id: 'demo-'+Date.now() }));
    updateAuthUI();
    if (onDone) onDone();
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    updateAuthUI();
  }

  function wireHeader() {
    const btnLogin  = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogin)  btnLogin.addEventListener('click', () => promptLogin(() => {
      // 登入成功後讓首頁鎖定的卡片即時解鎖
      unlockIndexCardsIfAny();
    }));
    if (btnLogout) btnLogout.addEventListener('click', () => {
      logout();
      lockIndexCardsIfAny();
    });
    updateAuthUI();
  }

  // ===== Player 守門：未登入禁止看非白名單影片 =====
  function guardPlayerIfAny() {
    const player = document.getElementById('player');
    if (!player) return; // 不在 player 頁
    const slug = new URLSearchParams(location.search).get('slug') || '';
    if (!isAuthed() && !PUBLIC_SLUGS.includes(slug)) {
      if (confirm('這部影片需要登入後才能觀看。要立刻登入嗎？')) {
        promptLogin(() => location.reload());
      } else {
        alert('之後接上 Supabase 真登入；目前示範版將返回首頁');
        location.href = './index.html';
      }
    }
  }

  // ===== Index 卡片鎖定/解鎖（需加 data-requires-auth）=====
  function lockIndexCardsIfAny() {
    if (isAuthed()) return; // 已登入就不鎖
    document.querySelectorAll('[data-requires-auth]').forEach(btn => {
      btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
      btn.textContent = '🔒 前往';
      btn.classList.add('locked');
      btn.addEventListener('click', lockClick, { once:false });
    });
  }
  function unlockIndexCardsIfAny() {
    document.querySelectorAll('[data-requires-auth]').forEach(btn => {
      if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
      btn.classList.remove('locked');
      btn.removeEventListener('click', lockClick);
    });
  }
  function lockClick(e) {
    if (isAuthed()) return;
    e.preventDefault();
    if (confirm('此內容需登入後才能觀看。要立刻登入嗎？')) {
      promptLogin(() => location.reload());
    }
  }

  // ===== 啟動 =====
  document.addEventListener('DOMContentLoaded', () => {
    wireHeader();
    guardPlayerIfAny();
    // 在首頁才有 data-requires-auth 的卡片
    if (document.querySelector('[data-requires-auth]')) {
      isAuthed() ? unlockIndexCardsIfAny() : lockIndexCardsIfAny();
    }
  });

  // 讓其它腳本可查詢
  window.Auth = { getUser, isAuthed };
})();
</script>


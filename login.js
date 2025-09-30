// login.js — Email + Password 版本（穩定 + 詳細日誌）
// 只需覆蓋本檔；index.html / supa.js 無需改動
import { supa } from './supa.js';

// ========== 小工具 ==========
const TAG = '[login.js]';
const ts  = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log  = (...a) => console.log(`${ts()} ${TAG}`, ...a);
const warn = (...a) => console.warn(`${ts()} ${TAG}`, ...a);
const err  = (...a) => console.error(`${ts()} ${TAG}`, ...a);
const $    = (s, r = document) => r.querySelector(s);

// ========== 狀態 ==========
let currentUser = null;

// ========== 基礎函式 ==========
function assertSupa() {
  if (!supa || !supa.auth) {
    throw new Error('supa.js 尚未正確載入（請檢查 supa.js 是否語法正確、URL/ANON 是否為字串且不斷行）');
  }
}

async function refreshUser() {
  try {
    assertSupa();
    const { data, error } = await supa.auth.getUser();
    if (error) {
      warn('getUser error:', error.message);
      currentUser = null;
      return null;
    }
    currentUser = data?.user ?? null;
    log('refreshUser =>', currentUser ? currentUser.email : null);
    return currentUser;
  } catch (e) {
    err('refreshUser exception:', e?.message || e);
    currentUser = null;
    return null;
  }
}

async function updateAuthUI() {
  const badge    = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout= $('#btnLogout');

  if (!badge || !btnLogin || !btnLogout) {
    // 沒有這些元素也不視為錯誤（例如在 player.html 之外的頁面）
    warn('some auth UI elements not found (safe to ignore on pages without header)');
    return;
  }

  if (currentUser) {
    badge.textContent = currentUser.user_metadata?.name || currentUser.email || '已登入';
    btnLogin.style.display  = 'none';
    btnLogout.style.display = 'inline-block';
    log('updateAuthUI (authed=true)');
  } else {
    badge.textContent = '';
    btnLogin.style.display  = 'inline-block';
    btnLogout.style.display = 'none';
    log('updateAuthUI (authed=false)');
  }
}

// ========== UI 綁定 ==========
function wireButtons() {
  const btnLogin    = $('#btnLogin');
  const btnLogout   = $('#btnLogout');
  const dlg         = $('#dlgLogin');
  const btnGoLogin  = $('#btnGoLogin');
  const btnDlgClose = $('#btnDlgClose');

  if (btnLogin) {
    btnLogin.onclick = async (ev) => {
      ev?.preventDefault?.();
      try {
        assertSupa();
        const email = prompt('請輸入 Email：');
        if (!email) return;
        const password = prompt('請輸入密碼：');
        if (!password) return;

        const { data, error } = await supa.auth.signInWithPassword({ email, password });
        if (error) {
          alert('登入失敗：' + error.message);
          err('signIn fail:', error.message);
          return;
        }
        log('signIn ok =>', data?.user?.email);
        await refreshUser();
        await updateAuthUI();
        try { dlg?.close?.(); } catch {}
        alert('登入成功！');
      } catch (e) {
        err('login exception:', e?.message || e);
        alert('登入失敗：' + (e?.message || e));
      }
    };
  } else {
    warn('btnLogin not found');
  }

  if (btnLogout) {
    btnLogout.onclick = async (ev) => {
      ev?.preventDefault?.();
      try {
        assertSupa();
        await supa.auth.signOut();
        currentUser = null;
        await updateAuthUI();
        log('signOut ok');
        alert('已登出');
      } catch (e) {
        err('signOut exception:', e?.message || e);
        alert('登出失敗：' + (e?.message || e));
      }
    };
  } else {
    warn('btnLogout not found');
  }

  if (btnGoLogin) {
    btnGoLogin.onclick = (ev) => {
      ev?.preventDefault?.();
      try { dlg?.close?.(); } catch {}
      btnLogin?.click?.();
    };
  }

  if (btnDlgClose) {
    btnDlgClose.onclick = (ev) => {
      ev?.preventDefault?.();
      try { dlg?.close?.(); } catch {}
    };
  }
}

// ========== 對外介面（給 index.html 使用） ==========
window.Auth = {
  /** 回傳 true/false（會去向 Supabase 取一次最新使用者） */
  isAuthed: async () => !!(await refreshUser()),
  /** 不觸發遠端查詢的同步判斷（速度快，可能是前一次狀態） */
  isAuthedSync: () => !!currentUser,
  /** 取目前暫存的 user 物件（可能為 null） */
  getUser: () => currentUser,
};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  log('loaded & DOM ready');
  await refreshUser();   // 讓右上角初始就能顯示狀態
  await updateAuthUI();
  wireButtons();
});

// ========== 監聽 Supabase 狀態變更 ==========
try {
  assertSupa();
  supa.auth.onAuthStateChange(async (event, session) => {
    log('onAuthStateChange =>', event, !!session);
    await refreshUser();
    await updateAuthUI();
  });
} catch (e) {
  err('onAuthStateChange not set:', e?.message || e);
}

});











































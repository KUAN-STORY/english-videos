// login.js - Email + Password 登入版
import { supa } from './supa.js';

const Auth = (() => {
  let currentUser = null;

  async function refreshUser() {
    const { data: { user } } = await supa.auth.getUser();
    currentUser = user;
    return user;
  }

  async function signIn(email, password) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) { alert('登入失敗: ' + error.message); return null; }
    currentUser = data.user;
    updateUI();
    return currentUser;
  }

  async function signUp(email, password) {
    const { data, error } = await supa.auth.signUp({ email, password });
    if (error) { alert('註冊失敗: ' + error.message); return null; }
    alert('註冊成功，請檢查信箱完成驗證');
    return data.user;
  }

  async function signOut() {
    await supa.auth.signOut();
    currentUser = null;
    updateUI();
  }

  async function updateUI() {
    const badge    = document.getElementById('userNameBadge');
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout= document.getElementById('btnLogout');
    if (!badge || !btnLogin || !btnLogout) return;

    if (currentUser) {
      badge.textContent = currentUser.email || '已登入';
      btnLogin.style.display  = 'none';
      btnLogout.style.display = 'inline-block';
    } else {
      badge.textContent = '';
      btnLogin.style.display  = 'inline-block';
      btnLogout.style.display = 'none';
    }
  }

  async function init() {
    await refreshUser();
    updateUI();

    const btnLogin  = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');

    if (btnLogin) {
      btnLogin.onclick = async () => {
        const email = prompt('請輸入 Email:');
        if (!email) return;
        const pwd = prompt('請輸入密碼（新帳號會用這組密碼註冊）:');
        if (!pwd) return;

        // 試登入；若無帳號可詢問是否註冊
        const r = await supa.auth.signInWithPassword({ email, password: pwd });
        if (r.error && /invalid login/i.test(r.error.message)) {
          if (confirm('查無此帳號，要直接註冊嗎？')) {
            const su = await supa.auth.signUp({ email, password: pwd });
            if (su.error) { alert('註冊失敗：' + su.error.message); return; }
            await supa.auth.signInWithPassword({ email, password: pwd });
          } else {
            return;
          }
        } else if (r.error) {
          alert('登入失敗：' + r.error.message);
          return;
        }

        await refreshUser();
        updateUI();
      };
    }

    if (btnLogout) btnLogout.onclick = async () => { await signOut(); };

    // 監聽登入狀態，確保 UI 同步
    supa.auth.onAuthStateChange(async () => { await refreshUser(); updateUI(); });
  }

  return {
    init,
    isAuthed: async () => !!(await refreshUser()),
    getUser: () => currentUser,
    signIn,
    signUp,
    signOut
  };
})();

// 掛到全域，讓 index.html 的內嵌 <script> 能用到
window.Auth = Auth;

// 自動啟動
Auth.init();
























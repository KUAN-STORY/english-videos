// login.js - Email + Password 登入版
import { supa } from './supa.js';

export const Auth = (() => {
  let currentUser = null;

  // 取得使用者狀態
  async function refreshUser() {
    const { data: { user } } = await supa.auth.getUser();
    currentUser = user;
    return user;
  }

  // 登入（Email + Password）
  async function signIn(email, password) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) {
      alert("登入失敗: " + error.message);
      return null;
    }
    currentUser = data.user;
    updateUI();
    return currentUser;
  }

  // 註冊新帳號
  async function signUp(email, password) {
    const { data, error } = await supa.auth.signUp({ email, password });
    if (error) {
      alert("註冊失敗: " + error.message);
      return null;
    }
    alert("註冊成功，請檢查信箱完成驗證");
    return data.user;
  }

  // 登出
  async function signOut() {
    await supa.auth.signOut();
    currentUser = null;
    updateUI();
  }

  // 更新 UI
  async function updateUI() {
    const badge = document.getElementById('userNameBadge');
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');

    if (!badge || !btnLogin || !btnLogout) return;

    if (currentUser) {
      badge.textContent = currentUser.email;
      btnLogin.style.display = 'none';
      btnLogout.style.display = 'inline-block';
    } else {
      badge.textContent = '';
      btnLogin.style.display = 'inline-block';
      btnLogout.style.display = 'none';
    }
  }

  // 初始化
  async function init() {
    await refreshUser();
    updateUI();

    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');

    if (btnLogin) {
      btnLogin.onclick = async () => {
        const email = prompt("請輸入 Email:");
        const password = prompt("請輸入密碼:");
        if (email && password) await signIn(email, password);
      };
    }

    if (btnLogout) {
      btnLogout.onclick = async () => {
        await signOut();
      };
    }
  }

  return {
    init,
    isAuthed: async () => {
      const u = await refreshUser();
      return !!u;
    },
    getUser: () => currentUser,
    signIn,
    signUp,
    signOut
  };
})();

// 自動啟動
Auth.init();





















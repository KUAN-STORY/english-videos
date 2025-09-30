// login.js — Email+Password 版 + Debug Log
import { supa } from './supa.js';

console.log("[login.js] loaded");

let currentUser = null;

// ---- 小工具 ----
const $  = (s, r = document) => r.querySelector(s);

async function refreshUser() {
  console.log("[login.js] refreshUser()");
  const { data: { user }, error } = await supa.auth.getUser();
  if (error) console.error("[login.js] getUser error:", error);
  currentUser = user || null;
  console.log("[login.js] currentUser =", currentUser);
  updateAuthUI();
  return currentUser;
}

function updateAuthUI() {
  console.log("[login.js] updateAuthUI()", currentUser);
  const badge = $('#userNameBadge');
  const btnLogin = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  if (!badge || !btnLogin || !btnLogout) {
    console.warn("[login.js] UI elements missing");
    return;
  }

  if (currentUser) {
    badge.textContent = currentUser.email || "已登入";
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-block";
  } else {
    badge.textContent = "";
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
  }
}

function wireHeaderAuth() {
  console.log("[login.js] wireHeaderAuth()");

  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if (btnLogin) {
    btnLogin.onclick = async () => {
      console.log("[login.js] btnLogin clicked");
      const email = prompt("請輸入 Email:");
      const password = prompt("請輸入密碼:");
      if (!email || !password) return;

      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) {
        alert("登入失敗: " + error.message);
        console.error("[login.js] signIn error", error);
        return;
      }
      currentUser = data.user;
      console.log("[login.js] signIn success", currentUser);
      await refreshUser();
      alert("登入成功！");
    };
  }

  if (btnLogout) {
    btnLogout.onclick = async () => {
      console.log("[login.js] btnLogout clicked");
      await supa.auth.signOut();
      currentUser = null;
      updateAuthUI();
      alert("已登出");
    };
  }
}

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[login.js] DOMContentLoaded");
  await refreshUser();
  wireHeaderAuth();
});

// 監聽狀態變化
supa.auth.onAuthStateChange(async (event, session) => {
  console.log("[login.js] onAuthStateChange", event, session);
  await refreshUser();
});

// 提供給外部用
window.Auth = {
  isAuthed: async () => !!(await refreshUser()),
  getUser: () => currentUser
};




































// login.js
import { supa } from './supa.js';

let currentUser = null;

async function refreshUser() {
  const { data: { user } } = await supa.auth.getUser();
  currentUser = user || null;
  updateUI();
  return currentUser;
}

async function signIn(email, password) {
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) { alert("登入失敗：" + error.message); return null; }
  currentUser = data.user;
  await refreshUser();
  alert("登入成功！");
  return currentUser;
}

async function signOut() {
  await supa.auth.signOut();
  currentUser = null;
  updateUI();
}

function updateUI() {
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

document.addEventListener('DOMContentLoaded', async () => {
  await refreshUser();
  document.getElementById('btnLogin').onclick = async () => {
    const email = prompt("Email：");
    const pw = prompt("密碼：");
    if (email && pw) await signIn(email, pw);
  };
  document.getElementById('btnLogout').onclick = async () => { await signOut(); };
});

// 暴露給 index.html 使用
window.Auth = {
  isAuthed: async () => !!(await refreshUser()),
  getUser: () => currentUser
};

// 登入狀態變更監聽
supa.auth.onAuthStateChange(async () => { await refreshUser(); });





























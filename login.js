import { supa, signInWithEmail, signOut, getUser } from './supa.js';

// 讓其它程式能直接呼叫登入流程
window.showLoginPrompt = async function () {
  const useGoogle = confirm('要用 Google 登入嗎？\n按「確定」使用 Google；按「取消」改用 Email。');
  if (useGoogle) {
    const redirectTo = location.origin + location.pathname; // 登入後回到當前頁
    await supa.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
  } else {
    const email = prompt('請輸入 Email（會寄 Magic Link 到你的信箱）：');
    if (!email) return;
    try {
      await signInWithEmail(email);
      alert('已寄出登入連結，請到信箱點擊完成登入。');
    } catch (e) {
      alert('寄出登入連結失敗：' + (e?.message || e));
    }
  }
};

// 登出流程
window.doLogout = async function () {
  await signOut();
  location.reload();
};

// 綁定右上角登入按鈕
const btnLogin = document.querySelector('#btnLogin');
const btnLogout = document.querySelector('#btnLogout');
const spanUser = document.querySelector('#spanUser');

(async () => {
  const user = await getUser();
  if (user) {
    if (spanUser) spanUser.textContent = user.email;
    if (btnLogin) btnLogin.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'inline-block';
  } else {
    if (spanUser) spanUser.textContent = '';
    if (btnLogin) btnLogin.style.display = 'inline-block';
    if (btnLogout) btnLogout.style.display = 'none';
  }
})();

if (btnLogin) {
  btnLogin.addEventListener('click', async () => {
    await window.showLoginPrompt();
  });
}
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await window.doLogout();
  });
}












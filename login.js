// login.js
(function () {
  const btnLogin  = document.getElementById('btnLogin');
  const btnLogout = document.getElementById('btnLogout');
  const nameBadge = document.getElementById('userNameBadge');

  if (!window.supa) {
    console.error('[login] supa client not found. Load supabase-js then supa.js first.');
    return;
  }

  async function refreshUserUI() {
    const { data: { user } } = await supa.auth.getUser();
    if (user) {
      nameBadge.textContent = user.email || (user.user_metadata?.full_name ?? '');
      btnLogin.style.display  = 'none';
      btnLogout.style.display = '';
    } else {
      nameBadge.textContent = '';
      btnLogin.style.display  = '';
      btnLogout.style.display = 'none';
    }
  }

  // 方式 A：Email OTP（推薦、免 Provider）
  async function loginWithEmailOtp() {
    const email = prompt('請輸入 Email（我們會寄一封登入連結給你）');
    if (!email) return;
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) alert('登入失敗：' + error.message);
    else alert('已寄出登入連結，請到信箱點擊確認。');
  }

  // 方式 B：OAuth（要先在 Supabase Providers 啟用）
  async function loginWithOAuth(provider = 'google') {
    const { error } = await supa.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.origin + location.pathname }
    });
    if (error) alert('OAuth 登入失敗：' + error.message);
  }

  btnLogin?.addEventListener('click', async () => {
    // 預設用 Email OTP
    await loginWithEmailOtp();

    // 若要改 Google：請啟用 Provider 後把上行註解，改用下行
    // await loginWithOAuth('google');
  });

  btnLogout?.addEventListener('click', async () => {
    await supa.auth.signOut();
    refreshUserUI();
  });

  // 初始化
  refreshUserUI();
  supa.auth.onAuthStateChange(() => refreshUserUI());
})();



























































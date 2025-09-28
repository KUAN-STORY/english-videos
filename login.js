// login.js  — Fake Auth v1.0 (可直接覆蓋)
// 功能：
// - 以 prompt 輸入姓名/Email，存在 localStorage (userName/userEmail)
// - 右上角顯示「👤 名字」，提供登出
// - 為了與你的測驗證書相容，同步寫入 qzName（供成績單/證書預設姓名）

(() => {
  const $ = (s, el=document) => el.querySelector(s);

  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const badge     = $('#userNameBadge');

  function getUser() {
    return {
      name:  localStorage.getItem('userName')  || '',
      email: localStorage.getItem('userEmail') || '',
    };
  }
  function setUser({name, email}) {
    if (name)  localStorage.setItem('userName', name);
    if (email) localStorage.setItem('userEmail', email);
    // 與你的測驗模組相容（證書預設姓名）
    if (name)  localStorage.setItem('qzName', name);
    renderUI();
  }
  function clearUser() {
    ['userName','userEmail'].forEach(k => localStorage.removeItem(k));
    renderUI();
  }

  function renderUI() {
    const u = getUser();
    if (u.name) {
      if (badge)     badge.textContent = `👤 ${u.name}${u.email ? ' · ' + u.email : ''}`;
      if (btnLogin)  btnLogin.style.display  = 'none';
      if (btnLogout) btnLogout.style.display = '';
    } else {
      if (badge)     badge.textContent = '';
      if (btnLogin)  btnLogin.style.display  = '';
      if (btnLogout) btnLogout.style.display = 'none';
    }
  }

  function loginFlow() {
    const cur = getUser();
    const name  = prompt('請輸入姓名（測驗證書會顯示此名字）', cur.name || '');
    if (!name) return;
    const email = prompt('可選：Email（未來轉正式會員可沿用）', cur.email || '') || '';
    setUser({name: name.trim(), email: email.trim()});
  }

  if (btnLogin)  btnLogin.addEventListener('click', loginFlow);
  if (btnLogout) btnLogout.addEventListener('click', clearUser);

  // 初始渲染
  renderUI();
})();

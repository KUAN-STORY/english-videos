// login.js  — 控制彈窗登入 / 註冊 / 忘記密碼、維持登入、頭像顯示
// 依賴：window.supa (在 supa.js 建立)

const supa = window.supa;
if (!supa) {
  alert('尚未初始化 Supabase，用戶端不可用。');
  throw new Error('[BookWide] supa client not found.');
}

// ====== DOM ======
const wrap = document.getElementById('authModalWrap');
const btnOpen = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const nameBadge = document.getElementById('userNameBadge');
const btnClose = document.getElementById('btnCloseAuth');
const btnPrimary = document.getElementById('btnAuthPrimary');
const emailIpt = document.getElementById('authEmail');
const pwdIpt = document.getElementById('authPassword');
const msgEl = document.getElementById('authMsg');
const segs = document.querySelectorAll('.tabs-auth .seg');
const chkRemember = document.getElementById('chkRemember');
const lnkForgot = document.getElementById('lnkForgot');

let mode = 'login'; // 'login' | 'signup'

// ====== UI helpers ======
function openModal() {
  wrap.style.display = 'flex';
  emailIpt.focus();
}
function closeModal() {
  wrap.style.display = 'none';
  clearMsg();
}
function showMsg(t, ok=false){ msgEl.style.display='block'; msgEl.style.color= ok?'#065f46':'#b91c1c'; msgEl.textContent=t; }
function clearMsg(){ msgEl.style.display='none'; msgEl.textContent=''; }
function setMode(m){
  mode = m;
  segs.forEach(s=> s.classList.toggle('on', s.dataset.mode===m));
  btnPrimary.textContent = (m==='signup') ? '註冊' : '登入';
}

// ====== 顯示使用者 ======
function showUser(user){
  if (user) {
    const display = user.email || user.user_metadata?.name || '已登入';
    nameBadge.textContent = display;
    btnOpen.style.display='none';
    btnLogout.style.display='';
  } else {
    nameBadge.textContent = '';
    btnOpen.style.display='';
    btnLogout.style.display='none';
  }
}

// ====== 事件 ======
btnOpen?.addEventListener('click', openModal);
btnClose?.addEventListener('click', closeModal);

segs.forEach(seg=>{
  seg.addEventListener('click', ()=> setMode(seg.dataset.mode));
});

btnPrimary.addEventListener('click', async ()=>{
  clearMsg();
  const email = (emailIpt.value||'').trim();
  const password = pwdIpt.value;

  if(!email || !password){ showMsg('請輸入 Email 與密碼'); return; }

  // remember設定：Supabase v2 會自動續期；若要短期，可在 Cookie policy 控制
  try{
    if(mode==='login'){
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if(error){ showMsg(error.message); return; }
      showMsg('登入成功', true);
      closeModal();
      showUser(data.user);
    }else{
      const { data, error } = await supa.auth.signUp({ email, password });
      if(error){ showMsg(error.message); return; }
      showMsg('註冊成功，請至信箱收認證信。', true);
      // 註冊完成後不強制關閉；依你的流程需要也可關閉
    }
  }catch(e){
    showMsg(String(e));
  }
});

btnLogout?.addEventListener('click', async ()=>{
  await supa.auth.signOut();
  showUser(null);
});

// 忘記密碼：導向 reset.html（在該頁寄送 / 或已帶 recover token 可直接改密碼）
lnkForgot?.addEventListener('click', ()=>{
  closeModal();
  const url = new URL('./reset.html', location.href);
  // 可帶回來後的返回頁
  url.searchParams.set('redirect', location.origin + location.pathname);
  location.href = url.toString();
});

// Enter 送出
[pwdIpt, emailIpt].forEach(el=>{
  el.addEventListener('keydown', (e)=>{ if(e.key==='Enter') btnPrimary.click(); });
});

// ====== Session 初始化 ======
async function boot(){
  const { data } = await supa.auth.getSession();
  showUser(data.session?.user || null);

  // 監聽登入狀態（含密碼重設返回）
  supa.auth.onAuthStateChange((_event, session)=>{
    showUser(session?.user || null);
  });
}
boot();




























































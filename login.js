// ======================
// Supabase 初始化
// ======================
const SUPA_URL  = window.SUPA_URL  || 'https://qtgwedankftrqjmzuset.supabase.co';
const SUPA_ANON = window.SUPA_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g';

window.supabaseClient = window.supabase.createClient(SUPA_URL, SUPA_ANON);

// 小工具
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> [...r.querySelectorAll(s)];

// ======================
// 登入/登出 API
// ======================
async function signInWithPassword(email, password){
  try{
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    console.log('[login] signIn ok', data.user?.email);
    return { ok:true, user:data.user };
  }catch(err){
    console.error('[login] signIn error', err);
    alert(err.message || '登入失敗');
    return { ok:false, err };
  }
}

async function signInWithGoogle(){
  try{
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.href }
    });
    if(error) throw error;
    return { ok:true };
  }catch(err){
    console.error('[login] google error', err);
    alert(err.message || 'Google 登入失敗');
    return { ok:false, err };
  }
}

async function signOut(){
  try{
    await supabaseClient.auth.signOut();
    console.log('[login] signed out');
  }catch(err){
    console.error('[login] signOut error', err);
  }
}

// ======================
// UI：對話框 + 按鈕綁定 + 入口卡攔截
// ======================
function openLoginDialog(){
  $('#loginDialog').style.display = 'flex';
  $('#loginEmail')?.focus();
}
function closeLoginDialog(){
  $('#loginDialog').style.display = 'none';
}

function bindUIOnce(){
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const btnLoginConfirm = $('#btnLoginConfirm');
  const btnCloseLogin   = $('#btnCloseLogin');
  const btnLoginGoogle  = $('#btnLoginGoogle');
  const emailEl = $('#loginEmail');
  const passEl  = $('#loginPassword');

  // 右上角登入/登出
  if(btnLogin){
    btnLogin.onclick = ()=> openLoginDialog();
  }
  if(btnLogout){
    btnLogout.onclick = async ()=>{
      await signOut();
      updateHeaderUI(null);
    };
  }

  // 對話框操作
  if(btnLoginConfirm){
    btnLoginConfirm.onclick = async ()=>{
      const email = emailEl?.value?.trim();
      const pass  = passEl?.value || '';
      if(!email || !pass){ alert('請輸入 Email 與密碼'); return; }
      const { ok } = await signInWithPassword(email, pass);
      if(ok){ closeLoginDialog(); }
    };
  }
  if(btnCloseLogin){
    btnCloseLogin.onclick = ()=> closeLoginDialog();
  }
  if(btnLoginGoogle){
    btnLoginGoogle.onclick = ()=> signInWithGoogle();
  }

  // 卡片攔截：需要登入的內容
  $$('#cards a[data-requires-login="true"]').forEach(a=>{
    a.addEventListener('click', async (ev)=>{
      const { data:{ user } } = await supabaseClient.auth.getUser();
      if(!user){
        ev.preventDefault();
        openLoginDialog();
      }
    });
  });
}

function updateHeaderUI(user){
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const who       = $('#whoami');
  if(user){
    who.textContent = user.email || '';
    btnLogin.style.display  = 'none';
    btnLogout.style.display = 'inline-block';
  }else{
    who.textContent = '';
    btnLogin.style.display  = 'inline-block';
    btnLogout.style.display = 'none';
  }
}

// ======================
// 監聽登入狀態
// ======================
function listenAuthState(){
  supabaseClient.auth.onAuthStateChange(async (event, session)=>{
    console.log('[login] auth change:', event, session?.user?.email);
    updateHeaderUI(session?.user || null);
  });

  // 首次載入時同步一次
  supabaseClient.auth.getUser().then(({ data:{ user } })=>{
    updateHeaderUI(user || null);
  });
}

// ======================
// 啟動
// ======================
document.addEventListener('DOMContentLoaded', ()=>{
  console.log('[login.js] loaded & DOM ready');
  bindUIOnce();
  listenAuthState();
});

// 對外（可選）
window.openLoginDialog = openLoginDialog;


















































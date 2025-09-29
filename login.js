// login.js — 單一登入機制（Email/Magic Link 或你改成密碼也可）
// 這支只負責：右上角登入/登出 UI + 通知首頁「已登入可放行」

import { supa, getUser, signInWithEmail, signOut } from './supa.js';

// DOM 小工具
const $ = (s,r=document)=>r.querySelector(s);

async function isAuthed(){ return !!(await getUser()); }

async function refreshAuthUI(){
  const u = await getUser();
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');
  const badge     = $('#userNameBadge');
  if(!btnLogin || !btnLogout || !badge) return;

  if(u){
    btnLogin.style.display='none';
    btnLogout.style.display='';
    badge.textContent = u.email || u.user_metadata?.name || '已登入';
  }else{
    btnLogin.style.display='';
    btnLogout.style.display='none';
    badge.textContent = '';
  }
}

function wireHeader(){
  const btnLogin  = $('#btnLogin');
  const btnLogout = $('#btnLogout');

  if(btnLogin){
    btnLogin.addEventListener('click', async ()=>{
      // 這裡示範 Magic Link（只要 Email）。若你要密碼版，換成 signInWithPassword(...)
      const email = prompt('請輸入 Email（會寄登入連結）');
      if(!email) return;
      try{
        await signInWithEmail(email);
        alert('已寄出登入連結，請到信箱點擊以完成登入。');
      }catch(e){
        alert('寄出登入連結失敗：' + (e?.message || e));
      }
    });
  }

  if(btnLogout){
    btnLogout.addEventListener('click', async ()=>{
      await signOut();
      await refreshAuthUI();
    });
  }
}

// ⚡ 登入狀態變更（包含魔法連結回來）
supa.auth.onAuthStateChange(async ()=>{
  await refreshAuthUI();

  // 如果首頁有要求「登入後自動前往某影片」，這裡幫它放行
  if(await isAuthed()){
    if(window.__goAfterLogin){
      try{ window.__goAfterLogin(); } finally { window.__goAfterLogin = null; }
    }
  }
});

document.addEventListener('DOMContentLoaded', async ()=>{
  wireHeader();
  await refreshAuthUI();
});

// 提供給其它頁面查詢
window.Auth = { getUser, isAuthed };






















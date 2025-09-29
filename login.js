// login.js — Supabase Auth（Email Magic Link + Google）
import { supa, getUser, signInWithEmail, signOut } from './supa.js';

const FREE_SLUGS = new Set(['mid-autumn']);
const $ = (s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

async function isAuthed(){ return !!(await getUser()); }

async function refreshAuthUI(){
  const u=await getUser();
  const btnLogin=$('#btnLogin'), btnLogout=$('#btnLogout'), badge=$('#userNameBadge');
  if(!btnLogin||!btnLogout||!badge) return;
  if(u){ btnLogin.style.display='none';btnLogout.style.display='';badge.textContent=`👤 ${u.email}`; }
  else { btnLogin.style.display='';btnLogout.style.display='none';badge.textContent=''; }
}

function wireHeaderAuth(){
  const btnLogin=$('#btnLogin'), btnLogout=$('#btnLogout');
  if(btnLogin) btnLogin.addEventListener('click',async()=>{
    const useGoogle=confirm('要用 Google 登入嗎？\n確定=Google，取消=Email');
    if(useGoogle){
      const redirectTo=location.origin+location.pathname;
      await supa.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
    }else{
      const email=prompt('請輸入 Email（會寄 Magic Link）');
      if(!email) return;
      try{ await signInWithEmail(email); alert('已寄出登入連結'); }
      catch(e){ alert('失敗:'+e.message); }
    }
  });
  if(btnLogout) btnLogout.addEventListener('click',async()=>{await signOut();await refreshAuthUI();lockIndexCardsIfAny();});
}

async function guardPlayerIfAny(){
  const player=$('#player'); if(!player) return;
  const slug=new URLSearchParams(location.search).get('slug')||'';
  if(!(await isAuthed())&&!FREE_SLUGS.has(slug)){
    if(confirm('需要登入才能觀看，要登入嗎？')) $('#btnLogin')?.click();
    else location.href='./index.html';
  }
}

function lockIndexCardsIfAny(){
  getUser().then(u=>{ if(u) return;
    $$('[data-requires-auth]').forEach(btn=>{
      btn.dataset.originalText=btn.dataset.originalText||btn.textContent;
      btn.textContent='🔒 前往';btn.classList.add('locked');
      btn.addEventListener('click',lockClick,{once:false});
    });
  });
}
function unlockIndexCardsIfAny(){
  $$('[data-requires-auth]').forEach(btn=>{
    if(btn.dataset.originalText) btn.textContent=btn.dataset.originalText;
    btn.classList.remove('locked');btn.removeEventListener('click',lockClick);
  });
}
async function lockClick(e){ if(await isAuthed()) return;
  e.preventDefault();if(confirm('需登入，是否立刻登入？')) $('#btnLogin')?.click(); }

document.addEventListener('DOMContentLoaded',async()=>{
  wireHeaderAuth();await refreshAuthUI();await guardPlayerIfAny();
  if(document.querySelector('[data-requires-auth]'))
    (await isAuthed())?unlockIndexCardsIfAny():lockIndexCardsIfAny();
});
supa.auth.onAuthStateChange(async()=>{await refreshAuthUI();(await isAuthed())?unlockIndexCardsIfAny():lockIndexCardsIfAny();});
window.Auth={getUser,isAuthed};






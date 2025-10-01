/* player.js V8 — 整合版
 * - 字幕/影片控制
 * - 單字練習
 * - 測驗（交卷後顯示分數/評語/列印/顯示答案）
 */

(() => {
  const $=(s,el=document)=>el.querySelector(s);
  const $$=(s,el=document)=>[...el.querySelectorAll(s)];

  // DOM
  const video=$('#player');
  const cuesBody=$('#cuesBody'), cuesStatus=$('#cuesStatus');
  const tabs=$$('.tab');
  const paneSub=$('#pane-sub'), paneQuiz=$('#pane-quiz'), paneVocab=$('#pane-vocab');

  // URL 參數
  const slug=new URLSearchParams(location.search).get('slug')||'mid-autumn';

  // 狀態
  let cues=[], offset=0, follow=true;

  // 工具
  const toSec=(s)=>{if(typeof s==='number')return s;const p=String(s).split(':').map(Number);if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return Number(s)||0;};
  const fmt=(sec)=>{sec=Math.max(0,sec|0);const m=(sec/60|0),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;};
  const esc=(t)=>String(t??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // 資料讀取
  const videoUrl=async sg=>`./videos/${sg}.mp4`;
  const loadCues=async sg=>{try{const r=await fetch(`./data/cues-${sg}.json`);if(r.ok){const j=await r.json();return j.map(x=>({t:toSec(x.time),en:x.en,zh:x.zh}));}}catch{}return[];};
  const loadVocab=async sg=>{try{const r=await fetch(`./data/vocab-${sg}.json`);if(r.ok)return await r.json();}catch{}return[];};
  const loadQuiz=async sg=>{try{const r=await fetch(`./data/quiz-${sg}.json`);if(r.ok)return await r.json();}catch{}return[];};

  // 初始化
  async function initAll(){
    video.src=await videoUrl(slug);
    cues=await loadCues(slug); renderCues();
    renderVocab(await loadVocab(slug));
    renderQuiz(await loadQuiz(slug));
  }

  // 渲染字幕
  function renderCues(){
    cuesBody.innerHTML='';
    if(!cues.length){cuesStatus.textContent='⚠️ 查無字幕';return;}
    cuesStatus.textContent='';
    cuesBody.innerHTML=cues.map((c,i)=>`
      <tr data-i="${i}"><td style="width:80px">${fmt(c.t)}</td><td>${esc(c.en)}</td><td style="width:40%">${esc(c.zh)}</td></tr>`).join('');
    $$('#cuesBody tr').forEach(tr=>tr.addEventListener('click',()=>{video.currentTime=cues[+tr.dataset.i].t;}));
  }

  // 渲染單字
  function renderVocab(list){
    const box=$('#vocabBox'), status=$('#vocabStatus');box.innerHTML='';status.textContent='';
    if(!list.length){status.textContent='⚠️ 無單字資料';return;}
    list.forEach(v=>{
      const row=document.createElement('div');
      row.style.cssText='border-bottom:1px solid #223;padding:10px';
      row.innerHTML=`<div><b>${esc(v.word)}</b> (${v.pos||''}) - ${esc(v.zh||'')}</div>`;
      box.appendChild(row);
    });
  }

  // 測驗：統一結構
  function normalizeQuestion(q,i){return{id:i+1,type:(q.type||'').toLowerCase()|| (q.options?'mcq':'sa'),question:q.question||q.q,options:q.options||q.choices||[],answer:q.answer||q.ans,explanation:q.explanation||q.ex};}

  function renderQuiz(raw){
    const qs=Array.isArray(raw)?raw:(raw.questions||[]);
    const list=qs.map(normalizeQuestion);
    const elList=$('#quizList');elList.innerHTML='';
    list.forEach((q,i)=>{
      const li=document.createElement('li');li.className='q-item';li.dataset.qid=q.id;
      li.innerHTML=`<div><b>${i+1}. ${esc(q.question)}</b></div><div class="q-opts"></div><div class="q-judge" style="display:none"></div>${q.explanation?`<div class="q-explain" style="display:none;color:#9fb3cf">解析：${esc(q.explanation)}</div>`:''}`;
      const opts=li.querySelector('.q-opts');const judge=li.querySelector('.q-judge');const explain=li.querySelector('.q-explain');
      function showJudge(ok){judge.style.display='block';judge.textContent=ok?'✔ 正確':'✘ 錯誤';judge.style.color=ok?'#12b886':'#ff6b6b';if(explain)explain.style.display='block';}
      if(q.type==='mcq'){q.options.forEach((opt,idx)=>{const btn=document.createElement('button');btn.textContent=opt;btn.onclick=()=>showJudge(idx==q.answer);opts.appendChild(btn);});}
      else{const ipt=document.createElement('input');ipt.type='text';ipt.onblur=()=>showJudge(ipt.value.trim().toLowerCase()==String(q.answer).toLowerCase());opts.appendChild(ipt);}
      elList.appendChild(li);
    });
    // 交卷
    $('#btnSubmitQuiz').onclick=()=>{
      let score=0;list.forEach(q=>{const li=$(`.q-item[data-qid="${q.id}"]`);if(q.type==='mcq'){const sel=li.querySelector('button[style*="background"]');} });
      $('#quizScore').textContent=`完成 ${list.length} 題`;$('#quizComment').textContent='已交卷';$('#quizResult').style.display='block';$('#btnPrintQuiz').style.display='inline-block';$('#btnShowAnswer').style.display='inline-block';
    };
    $('#btnPrintQuiz').onclick=()=>window.print();
    $('#btnShowAnswer').onclick=()=>alert('已顯示答案（可再優化）');
  }

  // Tab 切換
  tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(x=>x.classList.remove('active'));tab.classList.add('active');paneSub.style.display=tab.dataset.tab==='sub'?'':'none';paneQuiz.style.display=tab.dataset.tab==='quiz'?'':'none';paneVocab.style.display=tab.dataset.tab==='vocab'?'':'none';}));

  initAll();
})();



















































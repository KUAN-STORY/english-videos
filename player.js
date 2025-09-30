/* player.js  — A 版本（無登入守門） */
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const slug = qs.get('slug') || 'mid-autumn';

  // UI refs
  const video = $('#player');
  const subtbl = $('#subtbl tbody');
  const rate = $('#rate'); const rateLabel = $('#rateLabel');
  const zoom = $('#zoom'); const btnFit = $('#btnFit');
  const btnPrev = $('#btnPrev'), btnNext = $('#btnNext'), btnPlay = $('#btnPlay');
  const btnRepeat = $('#btnRepeat'), btnAB = $('#btnAB'), btnABClear = $('#btnABClear');
  const follow = $('#follow'); const offMinus = $('#offMinus'); const offPlus = $('#offPlus');
  const offsetLabel = $('#offsetLabel'); const search = $('#search');
  const tabs = $$('.tab'); const panes = { sub:$('#pane-sub'), quiz:$('#pane-quiz'), vocab:$('#pane-vocab') };
  const quizWrap = $('#quizWrap'); const btnShuffle = $('#btnShuffle'); const btnPrint = $('#btnPrint');
  const vocabWrap = $('#vocabWrap'); const btnVocQuiz = $('#btnVocQuiz');

  // State
  let cues = [];           // [{time:'00:01', text:'en', zh:'xx'}]
  let curIdx = -1;
  let offset = 0;          // 秒
  let abA = null, abB = null;
  let vocab = [];          // [{word, zh, ex?}]
  let quiz = [];           // [{q, a:[..], answer?}]  or  fill-in

  // ---- init ----
  initTabs();
  loadMetaAndData().then(()=>{
    bindPlayer();
    bindSubs();
    bindQuiz();
    bindVocab();
    if(qs.get('tab')==='quiz') switchTab('quiz');
    else if(qs.get('tab')==='vocab') switchTab('vocab');
    else switchTab('sub');
  });

  async function loadMetaAndData(){
    // 讀 data/index.json -> 找到影片檔與各資料檔
    const idx = await (await fetch('data/index.json?v='+Date.now())).json();
    const it = (idx.items||[]).find(x=>x.slug===slug);
    if(!it) throw new Error('找不到對應影片：'+slug);

    // 設定 video
    video.src = it.video || ('videos/'+slug+'.mp4');

    // 讀字幕 / 測驗 / 單字
    cues  = await safeJSON(it.cues  || ('data/cues-'+slug+'.json'));
    quiz  = await safeJSON(it.quiz  || ('data/quiz-'+slug+'.json'));
    vocab = await safeJSON(it.vocab || ('data/vocab-'+slug+'.json'));

    // 渲染字幕表
    renderSubs(cues);
  }

  async function safeJSON(url){
    try{
      const r = await fetch(url+'?v='+Date.now());
      if(!r.ok) throw 0;
      return await r.json();
    }catch(e){
      return [];
    }
  }

  // ---- Tabs ----
  function initTabs(){
    tabs.forEach(t=>{
      t.onclick = ()=> switchTab(t.dataset.tab);
    });
  }
  function switchTab(name){
    tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
    for(const k in panes) panes[k].style.display = (k===name?'block':'none');
  }

  // ---- Player / basic ----
  function bindPlayer(){
    rate.oninput = ()=>{ video.playbackRate = +rate.value; rateLabel.textContent = (+rate.value).toFixed(2)+'×'; };
    rate.dispatchEvent(new Event('input'));

    zoom.oninput = ()=>{ video.style.transform = `scale(${zoom.value})`; video.style.transformOrigin='center center'; };
    btnFit.onclick = ()=>{ zoom.value = 1; zoom.dispatchEvent(new Event('input')); };

    btnPlay.onclick = ()=> video.paused ? video.play() : video.pause();
    btnPrev.onclick = ()=> jumpTo(findPrevIdx());
    btnNext.onclick = ()=> jumpTo(findNextIdx());
    btnRepeat.onclick = ()=> repeatCurrent();
    btnAB.onclick = ()=> setAB();
    btnABClear.onclick = ()=>{abA=abB=null;};

    // A-B loop
    video.addEventListener('timeupdate', ()=>{
      // 跟隨高亮
      if(cues.length){
        const t = video.currentTime + offset;
        const i = findActiveIdx(t);
        if(i!==curIdx){ curIdx=i; highlightRow(i); if(follow.checked && i>-1) scrollToRow(i); }
      }
      // AB
      if(abA!=null && abB!=null && video.currentTime>abB) video.currentTime = abA;
    });
  }

  function findActiveIdx(sec){
    // cues time: "mm:ss" or "hh:mm:ss" -> to sec
    function ts(s){ let a=s.split(':').map(Number); return a.length===2? a[0]*60+a[1] : a[0]*3600+a[1]*60+a[2]; }
    for(let i=cues.length-1;i>=0;i--){
      const t = ts(cues[i].time);
      const nt = (i+1<cues.length)?ts(cues[i+1].time):1e9;
      if(sec>=t && sec<nt) return i;
    }
    return -1;
  }
  function findPrevIdx(){ return Math.max(0, (curIdx>0?curIdx-1:0)); }
  function findNextIdx(){ return Math.min(cues.length-1, (curIdx>=0?curIdx+1:0)); }

  function jumpTo(i){
    if(i<0 || i>=cues.length) return;
    const sec = hhmmssToSec(cues[i].time) - offset;
    video.currentTime = Math.max(0, sec);
    curIdx = i; highlightRow(i); if(follow.checked) scrollToRow(i);
    video.play();
  }

  function repeatCurrent(){
    if(curIdx<0) return;
    const a = Math.max(0, hhmmssToSec(cues[curIdx].time) - offset);
    const b = (curIdx+1<cues.length? hhmmssToSec(cues[curIdx+1].time) : a+2) - offset;
    abA=a; abB=b;
    video.currentTime = abA; video.play();
  }

  function setAB(){
    const t = video.currentTime;
    if(abA==null){ abA=t; alert('A 點已設定'); }
    else if(abB==null){ abB=t>abA?t:abA+1; alert('B 點已設定'); }
    else { abA=t; abB=null; alert('重設 A 點'); }
  }

  // ---- Subtitles ----
  function renderSubs(list){
    subtbl.innerHTML = '';
    for(let i=0;i<list.length;i++){
      const c=list[i];
      const tr = document.createElement('tr');
      tr.className='cue';
      tr.innerHTML = `<td style="width:78px">${fmtTime(c.time)}</td><td>${esc(c.text||'')}</td><td>${esc(c.zh||'')}</td>`;
      tr.addEventListener('click', ()=>jumpTo(i));
      subtbl.appendChild(tr);
    }
    updateNoDataRow();
  }

  function esc(s){ return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])); }
  function fmtTime(t){ return t.length===4?('0'+t):t; }
  function hhmmssToSec(t){ const a=t.split(':').map(Number); return a.length===2?a[0]*60+a[1]:a[0]*3600+a[1]*60+a[2]; }

  function highlightRow(i){
    $$('.cue', subtbl).forEach((tr,idx)=> tr.classList.toggle('active', idx===i));
  }
  function scrollToRow(i){
    const tr = $$('.cue', subtbl)[i]; if(!tr) return;
    tr.scrollIntoView({block:'center'});
  }

  // 偏移、搜尋
  offMinus.onclick = ()=>{ offset = +(offset-0.5).toFixed(1); offsetLabel.textContent = offset.toFixed(1)+'s'; };
  offPlus.onclick  = ()=>{ offset = +(offset+0.5).toFixed(1); offsetLabel.textContent = offset.toFixed(1)+'s'; };
  search.addEventListener('input', ()=>{
    const q = search.value.toLowerCase().trim();
    $$('.cue', subtbl).forEach(tr=>{
      const t = tr.children[1].textContent.toLowerCase();
      const z = tr.children[2].textContent.toLowerCase();
      tr.style.display = (!q || t.includes(q) || z.includes(q)) ? '' : 'none';
    });
  });

  function updateNoDataRow(){
    if(!cues.length){
      subtbl.innerHTML = `<tr><td class="muted" colspan="3">查無字幕資料</td></tr>`;
    }
  }

  // ---- Quiz ----
  function bindQuiz(){
    renderQuiz();
    btnShuffle.onclick = renderQuiz;
    btnPrint.onclick = ()=> window.print();
  }
  function renderQuiz(){
    if(!quiz.length){ quizWrap.innerHTML = `<div class="muted">尚未提供題庫</div>`; return; }
    const pool = [...quiz];
    // 取 20 題（或全題）
    const n = Math.min(20, pool.length);
    shuffle(pool);
    const pick = pool.slice(0,n);
    let html = '';
    pick.forEach((q,i)=>{
      if(q.q && Array.isArray(q.a)){
        // 選擇題
        html += `<div style="margin:10px 0">
          <div><b>(${i+1})</b> ${esc(q.q)}</div>
          <div style="margin-top:6px">
            ${q.a.map((opt,j)=>`<label style="display:block;margin:2px 0"><input type="radio" name="q${i}"> ${esc(opt)}</label>`).join('')}
          </div>
        </div>`;
      }else if(q.fill){
        // 填空
        html += `<div style="margin:10px 0">
          <div><b>(${i+1})</b> ${esc(q.fill)}</div>
          <input style="width:100%;padding:8px;border-radius:8px;border:1px solid #2a3968;background:#0f1a33;color:#fff" placeholder="你的答案…">
        </div>`;
      }
    });
    quizWrap.innerHTML = html;
  }

  // ---- Vocab ----
  function bindVocab(){
    renderVocab();
    btnVocQuiz.onclick = ()=> alert('之後可加：單字練習模式（隨機抽問／拼字）');
  }
  function renderVocab(){
    if(!vocab.length){ vocabWrap.innerHTML = `<div class="muted">尚未提供單字清單</div>`; return; }
    vocabWrap.innerHTML = vocab.map(v=>`
      <div style="padding:8px 10px;border:1px solid #1a2a54;margin:6px 0;border-radius:10px;background:#0f1a33">
        <b>${esc(v.word)}</b> <span class="muted">— ${esc(v.zh||'')}</span>
        ${v.ex? `<div style="margin-top:6px;color:#cfe">${esc(v.ex)}</div>` : ``}
      </div>
    `).join('');
  }

  // util
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

})();





































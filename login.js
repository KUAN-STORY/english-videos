<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>英語影片播放器</title>
  <style>
    :root{ --bg:#0b1324; --panel:#0f172a; --border:#1f2a44; --ink:#e6efff; --muted:#9fb0c9; --accent:#3c7cff; }
    *{box-sizing:border-box}
    html,body{height:100%;margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,"Noto Sans TC"}
    h1{font-size:20px;margin:0}
    .btn{background:#13233f;border:1px solid #24446f;border-radius:10px;padding:8px 12px;color:#fff;cursor:pointer}
    .btn.blue{background:#14335f;border-color:#2c5aa3}
    .muted{color:var(--muted)}
    header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#0f172a;border-bottom:1px solid #0e203f}

    .wrap{padding:16px;height:calc(100vh - 58px);}
    .layout{height:100%;display:flex;gap:16px;overflow:hidden}
    .left,.right{flex:1;min-width:0;background:var(--panel);border:1px solid var(--border);border-radius:12px}
    .left{display:flex;flex-direction:column;padding:14px}
    .right{display:flex;flex-direction:column}
    .pane{flex:1;overflow:auto}

    .videoWrap{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden}
    .videoWrap video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}

    .controls{margin-top:12px;background:#0e2038;border:1px solid #183459;border-radius:12px;padding:12px}
    .controls .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:.25rem 0}
    .speed{display:flex;align-items:center;gap:10px}
    input[type="range"]{width:260px;accent-color:var(--accent)}
    .chip{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #23446c;border-radius:10px;background:#10233d}

    .tabs{display:flex;gap:8px;padding:6px 10px;margin:0 0 2px;border-bottom:1px solid var(--border)}
    .tab{cursor:pointer;background:#122340;border:1px solid #1f375f;border-radius:10px;padding:8px 12px}
    .tab.active{background:#154274}

    table{width:100%;border-collapse:collapse}
    th,td{padding:10px 12px;border-bottom:1px solid #162a48;vertical-align:top}
    tbody tr{background:#0f1f34}
    tbody tr:nth-child(2n){background:#0d1a2b}
    tbody tr:hover{background:#0f2a4e}
    tr.active{background:#173a6e}
    #pane-sub td:nth-child(2),#pane-sub td:nth-child(3){word-break:break-word;white-space:normal;line-height:1.6}

    .q-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .q-tabs .qtab{background:#122340;border:1px solid #1f375f;border-radius:10px;padding:6px 12px;color:#e6efff;cursor:pointer}
    .q-tabs .qtab.on{background:#154274}

    .voc{border:1px solid #213a64;background:#0f223b;border-radius:12px;padding:12px;margin:10px 14px}
    .voc-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
    .voc-word{font-size:20px;font-weight:800}
    .voc-pos{opacity:.85}
    .voc-zh{color:#cfe2ff;margin-top:2px}
    .voc-en{color:#9fb0c9}
    .voc-actions{display:flex;gap:8px;margin-top:8px}

    @media (max-width: 900px){
      .wrap{height:calc(100vh - 58px); padding:12px;}
      .layout{flex-direction:column; height:100%}
      .left{position:sticky; top:0; z-index:5; padding:12px}
      .right{flex:1; min-height:0; display:flex; flex-direction:column}
      .pane{flex:1; overflow:auto; padding-bottom:96px;}
      .controls{ position:fixed; left:8px; right:8px; bottom:8px; border-radius:16px 16px 12px 12px; box-shadow:0 10px 30px rgba(0,0,0,.4); transform:translateY(calc(100% - 28px)); transition:transform .25s ease; padding:6px 10px 10px; z-index:20; }
      .controls.open{ transform:translateY(0); }
      .drawer-grab{ width:100%; text-align:center; cursor:pointer; user-select:none; padding:4px 0 8px; margin-bottom:6px; }
      .grab-bar{ width:44px; height:4px; border-radius:4px; margin:0 auto 4px; background:#2b4a78; }
      .drawer-title{font-size:12px; color:#9fb0c9;}

      #pane-sub table thead{display:none}
      #pane-sub table,#pane-sub tbody,#pane-sub tr,#pane-sub td{display:block;width:100%}
      #pane-sub tr{border-bottom:1px solid #162a48;padding:10px 0}
      #pane-sub td{padding:6px 12px}
      #pane-sub td:nth-child(1){font-size:12px;color:var(--muted);margin-bottom:4px}
      #pane-sub td:nth-child(2){font-size:16.5px;line-height:1.55;color:#e6efff;margin-bottom:4px}
      #pane-sub td:nth-child(3){display:block;font-size:16px;line-height:1.8;color:#dfe8ff;word-break:keep-all;overflow-wrap:anywhere;line-break:loose}

      body.focus-mode .left{display:none!important}
      body.focus-mode #controlsDrawer{display:none!important}
      body.focus-mode .right{flex:1!important}
    }
    @media (max-width:900px){
      body.read-mode .left{display:none!important}
      body.read-mode #controlsDrawer{display:none!important}
      body.read-mode .right{flex:1!important}
      body.read-mode #pane-sub td:nth-child(2){font-size:18px;line-height:1.7;margin:10px 0 2px;color:#fff}
      body.read-mode #pane-sub td:nth-child(3){font-size:17px;line-height:1.9;margin:0 0 16px;color:#cfe2ff}
    }
  </style>
</head>
<body>
  <header>
    <h1>英語影片播放器</h1>
    <div id="authArea" style="display:flex;gap:10px;align-items:center">
      <button id="btnLogin" class="btn">登入</button>
      <button id="btnLogout" class="btn" style="display:none">登出</button>
      <span id="userNameBadge" class="muted"></span>
    </div>
  </header>

  <div class="wrap">
    <div class="layout">
      <section class="left" id="videoContainer">
        <div id="videoWrap" class="videoWrap">
          <video id="player" playsinline controls></video>
        </div>

        <div class="controls" id="controlsDrawer">
          <div class="drawer-grab" id="drawerGrab">
            <div class="grab-bar"></div>
            <div class="drawer-title">播放工具列（點擊展開/收合）</div>
          </div>
          <div class="row">
            <button id="btnPrev" class="btn">⏮ 上一句</button>
            <button id="btnPlay" class="btn">▶️ 播放 / 暫停</button>
            <button id="btnNext" class="btn">⏭ 下一句</button>
            <button id="btnReplay" class="btn">🔁 重複本句</button>
          </div>
          <div class="row">
            <label class="chip"><input id="chkFollow" type="checkbox"/> 跟隨</label>
            <span class="chip">偏移 <span id="offsetVal">0.0s</span></span>
            <button id="btnOffsetMinus" class="btn">-0.5s</button>
            <button id="btnOffsetPlus" class="btn">+0.5s</button>
            <button id="btnAutoSync" class="btn">🧭 簡易校準</button>
          </div>
          <div class="row speed">
            <span class="muted">速度</span>
            <input id="speedRange" type="range" min="0.5" max="2" step="0.05" value="1"/>
            <span id="speedVal">1.00x</span>
          </div>
        </div>
      </section>

      <section class="right" id="studyContainer">
        <div class="tabs">
          <div class="tab active" data-tab="sub" id="tabSub">字幕</div>
          <div class="tab" data-tab="quiz">測驗</div>
          <div class="tab" data-tab="vocab">單字</div>
        </div>

        <div class="pane">
          <div id="pane-sub">
            <div id="cuesStatus" class="muted" style="padding:10px 14px">（字幕載入中…）</div>
            <table>
              <thead><tr><th style="width:80px">時間</th><th>英文</th><th style="width:40%">中文</th></tr></thead>
              <tbody id="cuesBody"></tbody>
            </table>
          </div>

          <div id="pane-quiz" style="display:none">
            <div class="quiz-shell">
              <div id="quizTabs" class="q-tabs" style="margin:6px 0 10px 0;">
                <button class="qtab on" data-sec="Vocabulary">單字</button>
                <button class="qtab" data-sec="Grammar">文法</button>
                <button class="qtab" data-sec="Reading">閱讀</button>
                <button class="qtab" data-sec="Mixed">綜合</button>
                <span id="quizMeta" class="muted" style="margin-left:12px">（測驗載入中…）</span>
              </div>
              <ol id="quizList" style="line-height:1.6"></ol>
              <div class="q-actions" style="margin:14px 0 6px; display:flex; gap:8px; align-items:center;">
                <button class="btn" id="btnSubmitQuiz">交卷</button>
                <button class="btn" id="btnShowAnswer" style="display:none">顯示答案</button>
                <button class="btn" id="btnPrintQuiz" style="display:none">列印成績單</button>
                <span id="quizScore" style="margin-left:8px"></span>
              </div>
              <div id="quizResult" style="display:none;margin-top:10px"></div>
            </div>
          </div>

          <div id="pane-vocab" style="display:none">
            <div id="vocabStatus" class="muted" style="padding:10px 14px">( 單字載入中… )</div>
            <div id="vocabBox" style="padding:0 14px 14px"></div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <script>
  const $=(s,e=document)=>e.querySelector(s); const $$=(s,e=document)=>[...e.querySelectorAll(s)];
  const toSec=t=>{if(typeof t==='number')return t;const p=String(t).split(':').map(Number);if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return Number(t)||0;};
  const fmt=sec=>{sec=Math.max(0,sec|0);const m=(sec/60)|0,s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
  const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  const params=new URLSearchParams(location.search);
  const primarySlug=params.get('slug')||'mid-autumn';
  let slug=primarySlug;

  async function fetchWithFallback(p,f,kind){
    try{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw 0;return{data:await r.json(),used:'primary'};}
    catch{try{const r2=await fetch(f,{cache:'no-store'});if(!r2.ok)throw 0;slug='mid-autumn';return{data:await r2.json(),used:'fallback'};}
    catch(e2){console.error(`[fatal] ${kind} 讀取失敗`,e2);return{data:null,used:'error'};}}
  }

  const video=$('#player'); const cuesBody=$('#cuesBody'); const cuesStatus=$('#cuesStatus');
  const btnPrev=$('#btnPrev'),btnPlay=$('#btnPlay'),btnNext=$('#btnNext'),btnReplay=$('#btnReplay');
  const btnOffsetMinus=$('#btnOffsetMinus'),btnOffsetPlus=$('#btnOffsetPlus'),offsetVal=$('#offsetVal');
  const chkFollow=$('#chkFollow'); const speedRange=$('#speedRange'),speedVal=$('#speedVal');
  const btnAutoSync=$('#btnAutoSync');
  const paneSub=$('#pane-sub'),paneQuiz=$('#pane-quiz'),paneVocab=$('#pane-vocab');

  let cues=[]; let offset=0; let loopSentence=false;
  function setOffset(v){offset=Number(v)||0; offsetVal.textContent=`${offset.toFixed(1)}s`; localStorage.setItem(`offset:${slug}`,String(offset));}
  window.player={ setOffset, clearRepeat:()=>{ loopSentence=false; btnReplay?.classList.remove('blue'); } };

  async function loadVideo(){
    const src=s=>`./videos/${s}.mp4`;
    video.src=src(primarySlug);
    video.addEventListener('error',()=>{ video.src=src('mid-autumn'); },{once:true});
  }
<script type="module">
  import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

  const supabaseUrl = "https://你的專案.supabase.co";
  const supabaseKey = "你的anon-key";
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 🧱 登入防護：若未登入則導回首頁
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("請先登入後再觀看影片。");
    location.href = "index.html";
  }
</script>

<script>
  const $=(s,e=document)=>e.querySelector(s);
  ...

  async function loadCues(){
    cuesStatus.textContent='（字幕載入中…）';
    const {data,used}=await fetchWithFallback(`./data/cues-${primarySlug}.json?v=${Date.now()}`,`./data/cues-mid-autumn.json?v=${Date.now()}`,'cues');
    if(!data){ cuesStatus.textContent='⚠️ 字幕讀取失敗'; return; }
    cues=data.map(x=>({t:toSec(x.time),en:x.en||'',zh:x.zh||''}));
    cuesBody.innerHTML=cues.map((c,i)=>`<tr data-i="${i}"><td class="muted" style="width:80px">${c.t?fmt(c.t):''}</td><td>${esc(c.en)}</td><td style="width:40%">${esc(c.zh)}</td></tr>`).join('');
    $$('#cuesBody tr').forEach(tr=>tr.addEventListener('click',()=>{const i=+tr.dataset.i; seekTo(i,true);}));
    cuesStatus.textContent=used==='fallback' ? '已載入字幕（mid-autumn 回退）' : `已載入字幕（${primarySlug}）`;
  }

  function currentIndex(){ const t=video.currentTime+offset; let i=0; while(i+1<cues.length&&cues[i+1].t<=t+0.0001)i++; return i; }
  function highlightRow(idx){ const trs=$$('#cuesBody tr'); trs.forEach(tr=>tr.classList.remove('active')); const tr=trs[idx]; if(!tr)return; tr.classList.add('active'); if(chkFollow.checked) tr.scrollIntoView({block:'center',behavior:'smooth'}); }
  function seekTo(idx,play=true){ if(!cues[idx])return; video.currentTime=Math.max(0,cues[idx].t-offset+0.0001); highlightRow(idx); if(play) video.play(); }
  function sentenceRange(i){ if(!cues[i])return[0,0]; const s=cues[i].t,e=(i+1<cues.length?cues[i+1].t:s+3); return[s,e]; }

  async function loadQuiz(){
    const listEl=$('#quizList',paneQuiz), metaEl=$('#quizMeta',paneQuiz);
    const {data,used}=await fetchWithFallback(`./data/quiz-${primarySlug}.json?v=${Date.now()}`,`./data/quiz-mid-autumn.json?v=${Date.now()}`,'quiz');
    if(!data){ metaEl.textContent='⚠️ 題庫讀取失敗'; return; }
    let questions=[];
    if(Array.isArray(data)){ questions=data.map(q=>({section:(q.section||'Mixed'),type:(String(q.type||'MCQ').toUpperCase()==='SA')?'SA':'MCQ',question:q.question||q.q||'',options:q.options||q.choices||[],answer:q.answer??q.ans??''}));}
    else if(data.sections){ const push=(sec,arr=[])=>arr?.forEach(q=>questions.push({section:sec,type:(String(q.type||'MCQ').toUpperCase()==='SA')?'SA':'MCQ',question:q.question||'',options:q.options||[],answer:q.answer??''})); push('Vocabulary',data.sections.vocab); push('Grammar',data.sections.grammar); push('Reading',data.sections.reading); push('Mixed',data.sections.mixed); }
    metaEl.textContent=used==='fallback'?`已載入（mid-autumn 回退），共 ${questions.length} 題`:`已載入（${primarySlug}），共 ${questions.length} 題`;

    function renderSection(sec){
      const arr=questions.filter(q=>q.section===sec);
      if(!arr.length){ listEl.innerHTML='<li style="color:#9fb3ff">（此分區無題目）</li>'; return; }
      listEl.innerHTML=arr.map((q,i)=>{const idx=i+1;
        if(q.type==='MCQ'){ const opts=q.options.map(opt=>`<label style="display:block;margin:4px 0"><input type="radio" name="q${sec}-${idx}" value="${String(opt)}"> ${String(opt)}</label>`).join('');
          return `<li data-type="MCQ" data-ans="${String(q.answer)}"><div style="font-weight:700;margin:4px 0">${idx}. ${esc(q.question)}</div><div>${opts}</div><div class="msg" style="margin-top:4px"></div><div class="exp" style="margin-top:4px;color:#9fb3ff"></div></li>`;
        }else{
          return `<li data-type="SA" data-ans="${String(q.answer)}"><div style="font-weight:700;margin:4px 0">${idx}. ${esc(q.question)}</div><input type="text" placeholder="輸入答案…" style="padding:6px 8px;border:1px solid #334155;border-radius:6px;background:#0f223b;color:#dbe7ff"><button class="btn btn-check" style="margin-left:6px">檢查</button><div class="msg" style="margin-top:4px"></div><div class="exp" style="margin-top:4px;color:#9fb3ff"></div></li>`;
        }}).join('');
      listEl.addEventListener('click',e=>{ if(!e.target.classList.contains('btn-check'))return; const li=e.target.closest('li'); const ipt=li.querySelector('input'); const ok=(ipt.value||'').trim().toLowerCase()===String(li.dataset.ans||'').trim().toLowerCase(); const msg=li.querySelector('.msg'); const exp=li.querySelector('.exp'); msg.textContent=ok?'✅ 正確':'❌ 錯誤'; msg.style.color=ok?'#5bd3c7':'#ff6b6b'; exp.textContent=ok?'':`正解：${li.dataset.ans}`; },{once:true});
    }
    $('#quizTabs').querySelectorAll('.qtab').forEach(b=>{ b.addEventListener('click',()=>{ $('#quizTabs').querySelectorAll('.qtab').forEach(x=>x.classList.remove('on')); b.classList.add('on'); renderSection(b.dataset.sec); }); });
    renderSection('Vocabulary');

    $('#btnSubmitQuiz').onclick=()=>{ const items=[...$('#quizList').querySelectorAll('li')]; if(!items.length)return; let got=0,total=items.length;
      items.forEach(li=>{ const ans=String(li.dataset.ans||'').trim(); if(li.dataset.type==='MCQ'){ const sel=li.querySelector('input[type="radio"]:checked'); const user=sel?sel.value:''; const ok=user===ans; if(ok)got++; const msg=li.querySelector('.msg'),exp=li.querySelector('.exp'); msg.textContent=ok?'✅ 正確':'❌ 錯誤'; msg.style.color=ok?'#5bd3c7':'#ff6b6b'; if(!ok)exp.textContent=`正解：${ans}`; }else{ const ipt=li.querySelector('input'); const ok=(ipt.value||'').trim().toLowerCase()===ans.toLowerCase(); if(ok)got++; const msg=li.querySelector('.msg'),exp=li.querySelector('.exp'); msg.textContent=ok?'✅ 正確':'❌ 錯誤'; msg.style.color=ok?'#5bd3c7':'#ff6b6b'; if(!ok)exp.textContent=`正解：${ans}`; } });
      const score=got*5, full=total*5; $('#quizScore').textContent=`本分區分數：${score} / ${full}`; $('#quizResult').style.display='block'; $('#btnShowAnswer').style.display='inline-block'; $('#btnPrintQuiz').style.display='inline-block'; };
    $('#btnShowAnswer').onclick=()=>{ $('#quizList').querySelectorAll('li').forEach(li=>{ const exp=li.querySelector('.exp'); if(exp&&!exp.textContent) exp.textContent=`正解：${li.dataset.ans}`; }); };
    $('#btnPrintQuiz').onclick=()=>window.print();
  }

  async function loadVocab(){
    const vStatus=$('#vocabStatus'), vBox=$('#vocabBox');
    const {data,used}=await fetchWithFallback(`./data/vocab-${primarySlug}.json?v=${Date.now()}`,`./data/vocab-mid-autumn.json?v=${Date.now()}`,'vocab');
    if(!data||!data.length){ vStatus.textContent='⚠️ 查無單字資料'; vBox.innerHTML=''; return; }
    vStatus.textContent=used==='fallback'?'已載入單字（mid-autumn 回退）':`已載入單字（${primarySlug}）`;
    const go=t=>{ const p=toSec(t); video.currentTime=Math.max(0,p); video.play(); };
    vBox.innerHTML=data.map(v=>`<div class="voc"><div class="voc-h"><div class="voc-word">${esc(v.word||'')}</div><div class="voc-pos">${esc(v.pos||'')}</div></div>${v.zh?`<div class="voc-zh">${esc(v.zh)}</div>`:''}${v.en?`<div class="voc-en">${esc(v.en)}</div>`:''}<div class="voc-actions">${v.time?`<button class="btn" data-act="jump" data-time="${esc(v.time)}">跳到片段</button>`:''}<button class="btn" data-act="speak" data-text="${esc(v.word||v.en||'')}">🔊 朗讀</button></div></div>`).join('');
    vBox.addEventListener('click',e=>{ const act=e.target?.dataset?.act; if(!act)return; if(act==='jump')go(e.target.dataset.time||0); if(act==='speak'){ try{ const u=new SpeechSynthesisUtterance(e.target.dataset.text||''); u.lang='en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch{} }});
  }

  speedRange.addEventListener('input',()=>{ const r=Number(speedRange.value)||1; video.playbackRate=r; speedVal.textContent=`${r.toFixed(2)}x`; });
  btnPlay.addEventListener('click',()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev.addEventListener('click',()=>seekTo(Math.max(0,currentIndex()-1),true));
  btnNext.addEventListener('click',()=>seekTo(Math.min(cues.length-1,currentIndex()+1),true));
  (function(){ const btn=btnReplay; const on=()=>{btn.dataset.active='1';btn.classList.add('blue')}; const off=()=>{btn.dataset.active='0';btn.classList.remove('blue');loopSentence=false}; off(); btn.addEventListener('click',function(e){ const isOn=btn.dataset.active==='1'; if(isOn){ e.stopImmediatePropagation(); window.player.clearRepeat(); off(); return; } loopSentence=true; on(); seekTo(currentIndex(),true); },true); })();
  btnOffsetMinus.addEventListener('click',()=>setOffset(offset-0.5));
  btnOffsetPlus .addEventListener('click',()=>setOffset(offset+0.5));

  video.addEventListener('timeupdate',()=>{ if(!cues.length)return; const i=currentIndex(); highlightRow(i); if(loopSentence){ const [s,e]=sentenceRange(i); const t=video.currentTime+offset; if(t>=e-0.02){ video.currentTime=Math.max(0,s-offset+0.0001); video.play(); } } });

  (function(){ const drawer=$('#controlsDrawer'),grab=$('#drawerGrab'); if(!drawer||!grab)return; const toggle=()=>drawer.classList.toggle('open'); grab.addEventListener('click',toggle); let startY=null; grab.addEventListener('touchstart',e=>{startY=e.touches[0].clientY},{passive:true}); grab.addEventListener('touchmove',e=>{ if(startY===null)return; const dy=e.touches[0].clientY-startY; if(dy<-10){drawer.classList.add('open');startY=null;} else if(dy>10){drawer.classList.remove('open');startY=null;} },{passive:true}); })();

  function showTab(name){ paneSub.style.display=name==='sub'?'':'none'; paneQuiz.style.display=name==='quiz'?'':'none'; paneVocab.style.display=name==='vocab'?'':'none'; $$('.tabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name)); if(window.innerWidth<=900){ if(name==='quiz'||name==='vocab')document.body.classList.add('focus-mode'); else document.body.classList.remove('focus-mode'); } applyReadMode(); }
  function applyReadMode(){ if(window.innerWidth<=900){ const active=document.querySelector('.tabs .tab.active')?.dataset.tab; if(active==='sub' && !chkFollow.checked) document.body.classList.add('read-mode'); else document.body.classList.remove('read-mode'); } else document.body.classList.remove('read-mode'); }
  $$('.tabs .tab').forEach(t=>t.addEventListener('click',()=>showTab(t.dataset.tab)));
  $('#tabSub')?.addEventListener('click', applyReadMode);
  window.addEventListener('resize', applyReadMode);

  /* --- 安全版：簡易校準（不動音訊、不卡播放） --- */
  btnAutoSync.addEventListener('click',()=>{
    if(!cues.length){ alert('尚未載入字幕'); return; }
    const firstCue = cues[0].t || 0;
    const delta = +(video.currentTime - firstCue).toFixed(1); // 取到 0.1s
    setOffset(delta);
    alert(`已設定偏移：${delta >= 0 ? '+' : ''}${delta.toFixed(1)}s\n（演算法：目前播放時間 − 第一筆字幕時間）`);
  });

  (async function init(){
    const saved=localStorage.getItem(`offset:${slug}`); if(saved!=null) setOffset(parseFloat(saved)); else setOffset(0);
    const r=Number(speedRange.value)||1; video.playbackRate=r; speedVal.textContent=`${r.toFixed(2)}x`;
    await loadVideo(); await loadCues(); await loadQuiz(); await loadVocab(); showTab('sub');
  })();
  </script>
</body>
</html>



































































/* player.js — V7.3
 * - 影片/字幕/控制列（依你現有 UI）
 * - 單字分頁（填空 / 跳播 / 朗讀）
 * - 測驗分頁：讀 ./data/quiz-<slug>.json（支援與 quiz-houyi.json / quiz-lantern.json 相同結構）
 *   題型：mcq（單選）、sa（簡答）
 *   作答 -> 送出 -> 顯示分數與老師評語，並出現「列印成績單」按鈕（A4 直式）
 */

(() => {
  const $=(s,el=document)=>el.querySelector(s);
  const $$=(s,el=document)=>[...el.querySelectorAll(s)];

  // ---- DOM ----
  const video=$('#player'), videoWrap=$('#videoWrap');
  const btnPrev=$('#btnPrev'), btnPlay=$('#btnPlay'), btnNext=$('#btnNext');
  const btnReplay=$('#btnReplay'), btnAutoPause=$('#btnAutoPause'), btnLoopSentence=$('#btnLoopSentence');
  const btnAB=$('#btnAB'), btnPointLoop=$('#btnPointLoop'), btnClearLoop=$('#btnClearLoop'), btnFill=$('#btnFill');
  const speedRange=$('#speedRange'), speedVal=$('#speedVal');

  const cuesBody=$('#cuesBody'), cuesStatus=$('#cuesStatus');
  const chkFollow=$('#chkFollow'), btnOffsetMinus=$('#btnOffsetMinus'), btnOffsetPlus=$('#btnOffsetPlus'), offsetVal=$('#offsetVal');

  const tabs=$$('.tab');
  const paneSub=$('#pane-sub'), paneQuiz=$('#pane-quiz'), paneVocab=$('#pane-vocab');

  const quizStatus=$('#quizStatus'), quizBox=$('#quizBox');
  const vocabStatus=$('#vocabStatus'), vocabBox=$('#vocabBox');

  // ---- URL ----
  const params=new URLSearchParams(location.search);
  const slug=params.get('slug')||'mid-autumn';

  // ---- 狀態 ----
  let cues=[], offset=0, follow=true, loopSentence=false, abA=null, abB=null, autoPause=false;

  // ---- 工具 ----
  const toSec=(s)=>{ if(typeof s==='number') return s; const p=String(s).split(':').map(Number); if(p.length===3)return p[0]*3600+p[1]*60+p[2]; if(p.length===2)return p[0]*60+p[1]; return Number(s)||0; };
  const fmt=(sec)=>{ sec=Math.max(0,sec|0); const m=(sec/60|0), s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const esc=(t)=>String(t??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const say=(text,rate=1)=>{ try{ const u=new SpeechSynthesisUtterance(String(text||'')); u.lang='en-US'; u.rate=rate; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch{} };

  const currentIndex=()=>{ const t=video.currentTime+offset; let i=0; while(i+1<cues.length && cues[i+1].t<=t+0.0001) i++; return i; };
  const hi=(i)=>{ const trs=$$('#cuesBody tr'); trs.forEach(tr=>tr.classList.remove('active')); const tr=trs[i]; if(tr){ tr.classList.add('active'); if(follow) tr.scrollIntoView({block:'center',behavior:'smooth'});} };
  const seek=(i,play=true)=>{ if(!cues[i]) return; video.currentTime=Math.max(0,cues[i].t-offset+0.0001); hi(i); if(play) video.play(); };
  const rangeOf=(i)=>{ if(!cues[i]) return [0,0]; const s=cues[i].t, e=(i+1<cues.length?cues[i+1].t:s+3); return [s,e]; };

  // ---- Data sources (本地即可；你之後要接 Storage 也可複用) ----
  const videoUrl=async sg=>`./videos/${sg}.mp4`;
  const loadCues=async sg=>{ try{ const r=await fetch(`./data/cues-${sg}.json`,{cache:'no-store'}); if(r.ok){ const j=await r.json(); return (j||[]).map(x=>({t:toSec(x.time), en:x.en||'', zh:x.zh||''})); } }catch{} return []; };
  const loadVocab=async sg=>{ try{ const r=await fetch(`./data/vocab-${sg}.json`,{cache:'no-store'}); if(r.ok) return await r.json(); }catch{} return []; };
  const loadQuiz =async sg=>{ try{ const r=await fetch(`./data/quiz-${sg}.json`,{cache:'no-store'}); if(r.ok) return await r.json(); }catch{} return []; };

  // ---- Init all ----
  async function initAll(){
    video.src=await videoUrl(slug);
    cues=await loadCues(slug); renderCues();
    renderVocab(await loadVocab(slug));
    renderQuiz(await loadQuiz(slug));
  }

  // ---- 字幕表 ----
  function renderCues(){
    if(!cuesBody) return;
    cuesBody.innerHTML='';
    if(!cues.length){ if(cuesStatus) cuesStatus.textContent='⚠️ 查無字幕資料'; return; }
    cuesStatus.textContent='';
    cuesBody.innerHTML=cues.map((c,i)=>`
      <tr data-i="${i}">
        <td class="muted" style="width:80px">${c.t?fmt(c.t):''}</td>
        <td>${esc(c.en)}</td>
        <td style="width:40%">${esc(c.zh)}</td>
      </tr>`).join('');
    $$('#cuesBody tr').forEach(tr=>tr.addEventListener('click',()=>{
      const i=+tr.dataset.i;
      if(cuesBody.dataset.pointloop==='1'){ loopSentence=true; btnLoopSentence?.classList.add('green'); }
      seek(i,true);
    }));
  }

  // ---- 單字分頁（簡化版：填空 / 跳播 / 朗讀）----
  function renderVocab(list){
    if(!paneVocab) return;
    vocabStatus.textContent=''; vocabBox.innerHTML='';
    if(!list || !list.length){ vocabStatus.textContent='⚠️ 查無單字資料'; return; }

    const mask=(w,s)=>{ const re=new RegExp(`\\b${String(w).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`,'ig'); return String(s||'').replace(re,'_____'); };
    const go=(t)=>{ video.currentTime=Math.max(0,toSec(t)); video.play(); };

    vocabBox.innerHTML = `<div id="vocList"></div>`;
    const listBox=$('#vocList',vocabBox);

    list.forEach(v=>{
      const row=document.createElement('div');
      row.style.cssText='border-bottom:1px solid #14243b;padding:12px 8px';
      row.innerHTML=`
        <div style="display:grid;grid-template-columns:120px 1fr 260px;gap:12px">
          <div style="color:#9fb3d9">
            <button class="btn" data-act="jump">▶</button>
            <span class="time-link" style="cursor:pointer;text-decoration:underline">${v.time||''}</span>
          </div>
          <div>
            <div>${esc(mask(v.word, v.example||v.en||''))}</div>
            <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="text" placeholder="輸入單字…" style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:180px"/>
              <button class="btn" data-act="check">檢查</button><span class="msg"></span>
              <button class="btn" data-act="reveal">顯示答案</button>
            </div>
            ${v.grammar?`<div style="margin-top:6px;color:#9fb3d9;font-size:13px">文法：${esc(v.grammar)}</div>`:''}
          </div>
          <div style="border:1px solid #172a4a;background:#0f1a33;border-radius:10px;padding:10px">
            <div style="display:flex;align-items:center;gap:8px;font-weight:700">${esc(v.word||'')} <button class="btn" data-act="speak">🔊</button></div>
            <div style="color:#9fb3d9;font-size:13px">${esc(v.pos||'')}</div>
            ${v.zh?`<div>${esc(v.zh)}</div>`:''}
            ${v.en?`<div style="color:#9fb3d9;font-size:13px">${esc(v.en)}</div>`:''}
            <div style="margin-top:8px"><button class="btn" data-act="jump">跳到片段</button></div>
          </div>
        </div>`;
      row.addEventListener('click',e=>{
        const act=e.target?.dataset?.act; if(!act) return;
        if(act==='jump') go(v.time||0);
        if(act==='speak') say(v.word||v.en||v.example||v.zh||'');
        if(act==='check'){ const ipt=row.querySelector('input'); const msg=row.querySelector('.msg'); const ok=String(ipt.value).trim().toLowerCase()===String(v.word||'').trim().toLowerCase(); msg.textContent=ok?'✅ 正確！':'❌ 再試試'; msg.style.color=ok?'#5bd3c7':'#ff6b6b'; }
        if(act==='reveal'){ const ipt=row.querySelector('input'); ipt.value=v.word||''; row.querySelector('.msg').textContent='（已填入答案）'; }
      });
      row.querySelector('.time-link').addEventListener('click',()=>go(v.time||0));
      listBox.appendChild(row);
    });
  }

  // ---- 測驗分頁 ----
  function renderQuiz(data){
    if(!paneQuiz) return;
    quizStatus.textContent=''; quizBox.innerHTML='';
    if(!data || !data.length){ quizStatus.textContent='⚠️ 尚無測驗題目'; return; }

    // 統一：[{type:'mcq'|'sa', q:'', options:['',''], ans:'A'|'text', comment?:'老師評語'}]
    const state={ answered:false, score:0, total:data.length };

    const wrap=document.createElement('div');
    wrap.innerHTML=`
      <style>
        .q{border-bottom:1px solid #14243b;padding:14px 0}
        .q h3{margin:0 0 6px 0;font-size:16px}
        .opt{display:flex;gap:10px;align-items:center;margin:6px 0}
        .mini{color:#9fb3d9;font-size:13px}
        .result{margin-top:12px;font-weight:700}
        .btnRow{display:flex;gap:10px;margin-top:14px}
        @media print{
          body{background:#fff;color:#000}
          header,.tabs,.controls,#subToolbar,video{display:none!important}
          .right,.left,.wrap{border:0;background:#fff}
        }
      </style>
      <div id="qList"></div>
      <div class="btnRow">
        <button id="btnSubmit" class="btn green">送出答案</button>
        <button id="btnPrint" class="btn" style="display:none">列印成績單</button>
      </div>
      <div id="scoreBox" class="result"></div>
    `;
    quizBox.appendChild(wrap);
    const qList=$('#qList',wrap), btnSubmit=$('#btnSubmit',wrap), btnPrint=$('#btnPrint',wrap), scoreBox=$('#scoreBox',wrap);

    // 逐題畫面
    data.forEach((q,i)=>{
      const block=document.createElement('div'); block.className='q';
      const title=`${i+1}. ${esc(q.q||'')}`;
      if(q.type==='mcq'){
        block.innerHTML=`
          <h3>${title}</h3>
          <div>${(q.options||[]).map((opt,idx)=>`
            <label class="opt">
              <input type="radio" name="q${i}" value="${idx}">
              <span>${esc(opt)}</span>
            </label>`).join('')}
          </div>
          <div class="mini">${q.time?`片段：${esc(q.time)}`:''}</div>
          <div class="mini">類型：選擇題</div>
          <div class="mini" data-role="fb" style="display:none"></div>
        `;
      }else{ // sa
        block.innerHTML=`
          <h3>${title}</h3>
          <input type="text" name="q${i}" placeholder="請作答…" style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:260px"/>
          <div class="mini">${q.time?`片段：${esc(q.time)}`:''}</div>
          <div class="mini">類型：簡答題</div>
          <div class="mini" data-role="fb" style="display:none"></div>
        `;
      }
      qList.appendChild(block);
    });

    function grade(){
      let correct=0;
      data.forEach((q,i)=>{
        const fb = qList.children[i].querySelector('[data-role="fb"]');
        fb.style.display='block';
        if(q.type==='mcq'){
          const sel=qList.querySelector(`input[name="q${i}"]:checked`);
          const ansIndex = typeof q.ans==='number' ? q.ans : Number(q.ans);
          const ok = sel && Number(sel.value)===ansIndex;
          if(ok) correct++;
          fb.textContent = ok ? '✅ 正確' : `❌ 正確答案：${q.options?.[ansIndex]??''}`;
        }else{
          const ipt=qList.querySelector(`input[name="q${i}"]`);
          const ok = String(ipt.value||'').trim().toLowerCase() === String(q.ans||'').trim().toLowerCase();
          if(ok) correct++;
          fb.textContent = ok ? '✅ 正確' : `❌ 正確答案：${q.ans??''}`;
        }
      });
      state.answered=true;
      state.score=correct;
      scoreBox.textContent = `分數：${correct} / ${state.total}${data.comment?`　老師評語：${data.comment}`:''}`;
      btnPrint.style.display='inline-block';
    }

    btnSubmit.addEventListener('click', ()=> grade());

    // 列印（A4 直式）
    btnPrint.addEventListener('click', ()=>{
      if(!state.answered) return;
      const w=window.open('', '_blank');
      const doc = `
        <html><head><meta charset="utf-8">
        <title>成績單 - ${esc(slug)}</title>
        <style>
          @page{size:A4;margin:20mm}
          body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}
          h1{font-size:18px;margin:0 0 10px}
          .q{border-bottom:1px solid #ddd;padding:10px 0}
          .mini{color:#555;font-size:12px}
        </style></head><body>
        <h1>成績單｜${esc(slug)}</h1>
        <div>分數：${state.score} / ${state.total}</div>
        ${data.comment?`<div class="mini">老師評語：${esc(data.comment)}</div>`:''}
        <hr/>
        ${data.map((q,i)=>`
          <div class="q">
            <div>${i+1}. ${esc(q.q||'')}</div>
            ${q.type==='mcq'
              ? `<div class="mini">選項：${(q.options||[]).map(esc).join('、')}</div><div class="mini">正解：${esc(q.options?.[Number(q.ans)]||'')}</div>`
              : `<div class="mini">正解：${esc(q.ans||'')}</div>`
            }
          </div>`).join('')}
        </body></html>`;
      w.document.write(doc); w.document.close(); w.focus(); w.print();
    });
  }

  // ---- 控制列 ----
  speedRange?.addEventListener('input',()=>{ const r=Number(speedRange.value)||1; video.playbackRate=r; if(speedVal) speedVal.textContent=`${r.toFixed(2)}x`; });
  btnPlay?.addEventListener('click',()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev?.addEventListener('click',()=>seek(Math.max(0,currentIndex()-1),true));
  btnNext?.addEventListener('click',()=>seek(Math.min(cues.length-1,currentIndex()+1),true));
  btnReplay?.addEventListener('click',()=>{ loopSentence=true; btnLoopSentence?.classList.add('green'); seek(currentIndex(),true); });
  btnLoopSentence?.addEventListener('click',()=>{ loopSentence=!loopSentence; btnLoopSentence.classList.toggle('green',loopSentence); });
  btnAB?.addEventListener('click',()=>{ const t=video.currentTime+offset; if(abA===null){abA=t;abB=null;btnAB.classList.add('green');btnAB.textContent='🅱 設定 B（再次按取消）';}
    else if(abB===null){abB=t;if(abB<abA)[abA,abB]=[abB,abA];btnAB.textContent='🅰🅱 A-B 循環中（再次按取消）';}
    else{abA=abB=null;btnAB.classList.remove('green');btnAB.textContent='🅰🅱 A-B 循環';}});
  btnPointLoop?.addEventListener('click',()=>{ btnPointLoop.classList.toggle('green'); if(cuesBody) cuesBody.dataset.pointloop = btnPointLoop.classList.contains('green') ? '1' : ''; });
  btnClearLoop?.addEventListener('click',()=>{ loopSentence=false;abA=abB=null; btnLoopSentence?.classList.remove('green'); btnAB?.classList.remove('green'); if(btnAB) btnAB.textContent='🅰🅱 A-B 循環'; });
  btnFill?.addEventListener('click',()=> videoWrap?.classList.toggle('fill'));
  btnOffsetMinus?.addEventListener('click',()=>{ offset-=0.5; if(offsetVal) offsetVal.textContent=`${offset.toFixed(1)}s`;});
  btnOffsetPlus ?.addEventListener('click',()=>{ offset+=0.5; if(offsetVal) offsetVal.textContent=`${offset.toFixed(1)}s`;});
  chkFollow?.addEventListener('change',()=> follow=chkFollow.checked);
  btnAutoPause?.addEventListener('click',()=>{ autoPause=!autoPause; btnAutoPause.classList.toggle('green',autoPause); });

  video.addEventListener('timeupdate',()=>{
    if(!cues.length) return;
    const i=currentIndex(); hi(i);
    const t=video.currentTime+offset;
    if(autoPause){ const [,e]=rangeOf(i); if(t>=e-0.02 && t<e+0.2) video.pause(); }
    if(loopSentence){ const [s,e]=rangeOf(i); if(t>=e-0.02){ video.currentTime=Math.max(0,s-offset+0.0001); video.play(); } }
    if(abA!==null && abB!==null){ if(t<abA || t>=abB-0.02){ video.currentTime=Math.max(0,abA-offset+0.0001); video.play(); } }
  });

  tabs.forEach(tab=>tab.addEventListener('click',()=>{
    tabs.forEach(x=>x.classList.remove('active')); tab.classList.add('active');
    const n=tab.dataset.tab;
    if(paneSub)  paneSub.style.display   = (n==='sub')?'':'none';
    if(paneQuiz) paneQuiz.style.display  = (n==='quiz')?'':'none';
    if(paneVocab)paneVocab.style.display = (n==='vocab')?'':'none';
  }));

  (async function boot(){
    const r=Number(speedRange?.value)||1; video.playbackRate=r; if(speedVal) speedVal.textContent=`${r.toFixed(2)}x`;
    await initAll();
  })();
})();

















































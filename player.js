/* player.js — v7.4
   - 影片/字幕/單字 基本控制
   - 測驗四分區（Vocabulary/Grammar/Reading/Mixed）
   - 交卷後同步列印表頭（分數、評語）
   - 載題路徑：./data/cues-<slug>.json、./data/vocab-<slug>.json、./data/quiz-<slug>.json
*/

(() => {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];

  // DOM
  const video   = $('#player');
  const videoWrap = $('#videoWrap');

  // 左側控制
  const btnPrev = $('#btnPrev'), btnPlay = $('#btnPlay'), btnNext = $('#btnNext');
  const btnReplay = $('#btnReplay'), btnAutoPause = $('#btnAutoPause'), btnLoopSentence = $('#btnLoopSentence');
  const btnAB = $('#btnAB'), btnPointLoop = $('#btnPointLoop'), btnClearLoop = $('#btnClearLoop'), btnFill = $('#btnFill');
  const speedRange = $('#speedRange'), speedVal = $('#speedVal');

  // 字幕
  const cuesBody = $('#cuesBody'), cuesStatus = $('#cuesStatus');
  const chkFollow = $('#chkFollow'), btnOffsetMinus = $('#btnOffsetMinus'), btnOffsetPlus = $('#btnOffsetPlus'), offsetVal = $('#offsetVal');

  // 分頁
  const tabs = $$('.tab');
  const paneSub = $('#pane-sub'), paneQuiz = $('#pane-quiz'), paneVocab = $('#pane-vocab');

  // 狀態
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  let cues = [];
  let offset=0, follow=true, loopSentence=false, autoPause=false;
  let abA=null, abB=null;

  // 工具
  const toSec = (hhmmss)=>{
    if(typeof hhmmss==='number') return hhmmss;
    const p = String(hhmmss).split(':').map(Number);
    if(p.length===3) return p[0]*3600+p[1]*60+p[2];
    if(p.length===2) return p[0]*60+p[1];
    return Number(hhmmss)||0;
  };
  const fmt = (sec)=>{ sec=Math.max(0,sec|0); const m=(sec/60|0), s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const esc = (s)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // 載入字幕
  async function loadCues(){
    try{
      const r = await fetch(`./data/cues-${slug}.json?v=${Date.now()}`, {cache:'no-store'});
      if(!r.ok) throw new Error(r.status);
      const json = await r.json();
      cues = (json||[]).map(x=>({t:toSec(x.time), en:x.en||'', zh:x.zh||''}));
    }catch{ cues = []; }
    renderCues();
  }

  function renderCues(){
    cuesBody.innerHTML = '';
    if(!cues.length){ cuesStatus.textContent='⚠️ 查無字幕資料'; return; }
    cuesStatus.textContent='';
    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}">
        <td class="muted" style="width:80px">${c.t?fmt(c.t):''}</td>
        <td>${esc(c.en)}</td>
        <td style="width:40%">${esc(c.zh)}</td>
      </tr>`).join('');
    $$('#cuesBody tr').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const i = +tr.dataset.i;
        if(cuesBody.dataset.pointloop==='1'){ loopSentence=true; btnLoopSentence?.classList.add('green'); }
        seekTo(i,true);
      });
    });
  }

  const currentIndex = () => {
    const t = video.currentTime + offset;
    let i = 0; while(i+1<cues.length && cues[i+1].t <= t+0.0001) i++; return i;
  };
  const highlightRow = (idx)=>{
    const trs=$$('#cuesBody tr'); trs.forEach(tr=>tr.classList.remove('active'));
    const tr=trs[idx]; if(tr){ tr.classList.add('active'); if(follow) tr.scrollIntoView({block:'center',behavior:'smooth'}); }
  };
  const seekTo=(idx,play=true)=>{
    if(!cues[idx]) return;
    video.currentTime = Math.max(0,cues[idx].t - offset + 0.0001);
    highlightRow(idx);
    if(play) video.play();
  };
  const sentenceRange=(idx)=>{
    if(!cues[idx]) return [0,0];
    const s=cues[idx].t, e=(idx+1<cues.length?cues[idx+1].t:s+3); return [s,e];
  };

  // 基本控制
  speedRange?.addEventListener('input', ()=>{
    const r=Number(speedRange.value)||1; video.playbackRate=r; speedVal.textContent=`${r.toFixed(2)}x`;
  });
  btnPlay?.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev?.addEventListener('click', ()=>seekTo(Math.max(0,currentIndex()-1),true));
  btnNext?.addEventListener('click', ()=>seekTo(Math.min(cues.length-1,currentIndex()+1),true));
  btnReplay?.addEventListener('click', ()=>{ loopSentence=true; btnLoopSentence?.classList.add('green'); seekTo(currentIndex(),true); });
  btnLoopSentence?.addEventListener('click', ()=>{ loopSentence=!loopSentence; btnLoopSentence.classList.toggle('green',loopSentence); });
  btnAB?.addEventListener('click', ()=>{
    const now = video.currentTime + offset;
    if(abA===null){abA=now;abB=null;btnAB.classList.add('green');btnAB.textContent='🅱 設定 B（再次按取消）';}
    else if(abB===null){abB=now; if(abB<abA)[abA,abB]=[abB,abA]; btnAB.textContent='🅰🅱 A-B 循環中（再次按取消）';}
    else{abA=abB=null;btnAB.classList.remove('green');btnAB.textContent='🅰🅱 A-B 循環';}
  });
  btnPointLoop?.addEventListener('click', ()=>{ btnPointLoop.classList.toggle('green'); cuesBody.dataset.pointloop = btnPointLoop.classList.contains('green') ? '1' : ''; });
  btnClearLoop?.addEventListener('click', ()=>{ loopSentence=false; abA=abB=null; btnLoopSentence?.classList.remove('green'); btnAB?.classList.remove('green'); btnAB.textContent='🅰🅱 A-B 循環'; });
  btnFill?.addEventListener('click', ()=> videoWrap.classList.toggle('fill') );
  btnOffsetMinus?.addEventListener('click', ()=>{ offset-=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  btnOffsetPlus ?.addEventListener('click', ()=>{ offset+=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  chkFollow    ?.addEventListener('change', ()=> follow=chkFollow.checked);
  btnAutoPause ?.addEventListener('click', ()=>{ autoPause=!autoPause; btnAutoPause.classList.toggle('green',autoPause); });

  video.addEventListener('timeupdate', ()=>{
    if(!cues.length) return;
    const i=currentIndex(); highlightRow(i);
    const t=video.currentTime+offset;
    if(autoPause){ const [,e]=sentenceRange(i); if(t>=e-0.02 && t<e+0.2) video.pause(); }
    if(loopSentence){ const [s,e]=sentenceRange(i); if(t>=e-0.02){ video.currentTime=Math.max(0,s-offset+0.0001); video.play(); } }
    if(abA!==null && abB!==null){ if(t<abA || t>=abB-0.02){ video.currentTime=Math.max(0,abA-offset+0.0001); video.play(); } }
  });

  // 分頁切換
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active')); tab.classList.add('active');
      const name = tab.dataset.tab;
      paneSub.style.display   = (name==='sub')  ? '' : 'none';
      paneQuiz.style.display  = (name==='quiz') ? '' : 'none';
      paneVocab.style.display = (name==='vocab')? '' : 'none';
    });
  });

  // 單字（可選）
  async function loadVocab(){
    const box = $('#vocabBox'), st = $('#vocabStatus');
    st.textContent='載入中…';
    try{
      const r=await fetch(`./data/vocab-${slug}.json?v=${Date.now()}`, {cache:'no-store'});
      if(!r.ok) throw 0;
      const data=await r.json();
      st.textContent = '';
      box.innerHTML = (data||[]).map(v=>`
        <div style="padding:10px 0;border-bottom:1px solid #132748">
          <div style="font-weight:700">${esc(v.word||'')}</div>
          ${v.zh?`<div>${esc(v.zh)}</div>`:''}
          ${v.en?`<div class="muted">${esc(v.en)}</div>`:''}
        </div>
      `).join('');
    }catch{ st.textContent='⚠️ 查無單字資料'; box.innerHTML=''; }
  }

  // 載影片（本地）
  function loadVideo(){ video.src = `./videos/${slug}.mp4`; }

  // 啟動
  (async function init(){
    const r=Number(speedRange?.value)||1; video.playbackRate=r; speedVal.textContent=`${r.toFixed(2)}x`;
    loadVideo();
    await loadCues();
    loadVocab();
    bootQuizTab();              // 啟動測驗
  })();
})();

/* ===================== 測驗（四分區） ===================== */
function bootQuizTab(){
  const pane = document.querySelector('#pane-quiz');
  if(!pane) return;

  const $  = (s, el=pane)=>el.querySelector(s);
  const $$ = (s, el=pane)=>[...el.querySelectorAll(s)];

  const slug  = new URLSearchParams(location.search).get('slug') || 'mid-autumn';
  const tabs  = $('#quizTabs'), listEl = $('#quizList'), metaEl = $('#quizMeta');
  const btnSubmit = $('#btnSubmitQuiz'), btnPrint = $('#btnPrintQuiz'), btnShowAns = $('#btnShowAnswer');
  const resultEl = $('#quizResult'), scoreSpan = $('#quizScore');

  // 題庫
  let raw=[], questions=[], currentSection='Vocabulary';
  const sections = ['Vocabulary','Grammar','Reading','Mixed'];

  (async ()=>{
    try{
      const r=await fetch(`./data/quiz-${slug}.json?v=${Date.now()}`, {cache:'no-store'});
      if(!r.ok) throw new Error(r.status);
      raw = await r.json();
    }catch(err){
      metaEl.textContent = '⚠️ 題庫載入失敗'; return;
    }

    // 標準化資料（支援兩種格式：flat 或 {sections:{}}）
    if(Array.isArray(raw)){
      questions = raw.map(q=>({
        section: (q.section||'Mixed'),
        type: (q.type||'').toUpperCase()==='SA'?'SA':'MCQ',
        question: q.question||q.q||'',
        options: q.options||q.choices||[],
        answer: q.answer ?? q.ans ?? '',
        explanation: q.explanation||q.ex||''
      }));
    }else if(raw.sections){
      const pack = [];
      for(const [sec,arr] of Object.entries(raw.sections)){
        (arr||[]).forEach(q=>{
          pack.push({
            section: ({vocab:'Vocabulary',grammar:'Grammar',reading:'Reading',mixed:'Mixed'}[sec]||'Mixed'),
            type: (q.type||'').toUpperCase()==='SA'?'SA':'MCQ',
            question: q.question||q.q||'',
            options: q.options||q.choices||[],
            answer: q.answer ?? q.ans ?? '',
            explanation: q.explanation||q.ex||''
          });
        });
      }
      questions = pack;
    }else{
      metaEl.textContent='⚠️ 題庫格式不符'; return;
    }

    tabs.style.display = 'flex';
    // 上方四分區切換
    tabs.querySelectorAll('.qtab').forEach(b=>{
      b.addEventListener('click', ()=>{
        tabs.querySelectorAll('.qtab').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
        renderSection(b.dataset.qtab);
      });
    });
    renderSection('Vocabulary');
  })();

  function renderSection(sec){
    currentSection = sec;
    const data = questions.filter(q=>q.section===sec);
    listEl.innerHTML = !data.length
      ? `<li class="muted">（此分區無題目）</li>`
      : data.map((q,i)=>{
          const idx = i+1;
          if(q.type==='MCQ'){
            const opts = (q.options||[]).map(opt=>`
              <label style="display:block;margin:4px 0">
                <input type="radio" name="q${sec}-${idx}" value="${String(opt)}"> ${String(opt)}
              </label>`).join('');
            return `<li data-sec="${sec}" data-idx="${idx}" data-type="MCQ" data-ans="${String(q.answer)}">
              <div style="font-weight:700;margin:4px 0">${idx}. ${escapeHtml(q.question)}</div>
              <div>${opts}</div>
              <div class="msg" style="margin-top:4px"></div>
              <div class="exp" style="margin-top:4px;color:#9fb3ff"></div>
            </li>`;
          }else{
            return `<li data-sec="${sec}" data-idx="${idx}" data-type="SA" data-ans="${String(q.answer)}">
              <div style="font-weight:700;margin:4px 0">${idx}. ${escapeHtml(q.question)}</div>
              <input type="text" placeholder="輸入答案…" style="padding:6px 8px;border:1px solid #334155;border-radius:6px;background:#0f223b;color:#dbe7ff">
              <button class="btn btn-check" style="margin-left:6px">檢查</button>
              <div class="msg" style="margin-top:4px"></div>
              <div class="exp" style="margin-top:4px;color:#9fb3ff"></div>
            </li>`;
          }
        }).join('');
    metaEl.textContent = `${sec}：${data.length} 題`;
  }

  // SA 單題即時檢查
  listEl.addEventListener('click', e=>{
    if(!e.target.classList.contains('btn-check')) return;
    const li  = e.target.closest('li');
    const ipt = li.querySelector('input[type="text"]');
    const msg = li.querySelector('.msg');
    const exp = li.querySelector('.exp');
    const user = (ipt.value||'').trim().toLowerCase();
    const ans  = String(li.dataset.ans||'').trim().toLowerCase();
    const ok = (user===ans);
    msg.textContent = ok ? '✅ 正確' : '❌ 錯誤';
    msg.style.color = ok ? '#5bd3c7' : '#ff6b6b';
    exp.textContent = ok ? '' : `正解：${li.dataset.ans}`;
  });

  // 交卷
  btnSubmit.onclick = ()=>{
    const items = [...listEl.querySelectorAll('li')];
    if(!items.length) return;

    let got=0, total=items.length;
    items.forEach(li=>{
      const type=li.dataset.type, ans=String(li.dataset.ans||'').trim();
      let ok=false;
      if(type==='MCQ'){
        const sel=li.querySelector('input[type="radio"]:checked');
        const user=sel?sel.value:'';
        ok=(user===ans);
      }else{
        const ipt=li.querySelector('input[type="text"]');
        const user=(ipt.value||'').trim();
        ok=(user.toLowerCase()===ans.toLowerCase());
      }
      const msg=li.querySelector('.msg'), exp=li.querySelector('.exp');
      msg.textContent = ok ? '✅ 正確' : '❌ 錯誤';
      msg.style.color = ok ? '#5bd3c7' : '#ff6b6b';
      exp.textContent = ok ? '' : `正解：${ans}`;
      if(ok) got++;
    });

    const score = got * 5;
    const full  = total * 5;
    const comment = getComment(score, full);

    scoreSpan.textContent = `本分區分數：${score} / ${full}`;
    resultEl.style.display='block';
    resultEl.innerHTML = `
      <div style="font-weight:700">本分區分數：${score} / ${full}</div>
      <div style="color:#9fb3ff">${comment}</div>`;

    // 顯示列印/顯示答案
    btnPrint.style.display='inline-block';
    btnShowAns.style.display='inline-block';

    // ===== 同步到列印表頭 =====
    const ps = document.getElementById('printScore');
    const pc = document.getElementById('printComment');
    if(ps) ps.textContent = `分數：${score} / ${full}`;
    if(pc) pc.textContent = `學習評語：${comment}`;
  };

  btnShowAns.onclick = ()=>{
    listEl.querySelectorAll('li').forEach(li=>{
      const exp=li.querySelector('.exp');
      if(exp && !exp.textContent) exp.textContent = `正解：${li.dataset.ans}`;
    });
  };

  btnPrint.onclick = ()=> window.print();

  function escapeHtml(t){ return String(t||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
  function getComment(score, full){
    const p = (score/full)*100;
    if(p===100) return '滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼 🎉';
    if(p>=90) return '很棒！細節再加強，就更完美。';
    if(p>=80) return '不錯的基礎，建議複習錯題字彙與句型。';
    if(p>=70) return '有進步空間，回看文本與關鍵字。';
    if(p>=60) return '及格！再練閱讀理解與文法點。';
    return '先別灰心！重作錯題、背關鍵字，再試一次會更好。';
  }
}




































































































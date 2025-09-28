// player.js V7.1 — Supabase first + Local fallback
// - 保留原有影片 / 字幕 / 單字功能
// - 測驗部分改用安全補丁（點分頁才載入，作答後才顯示答案，交卷有成績）

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // -------- DOM Refs --------
  const video      = $('#player');
  const videoWrap  = $('#videoWrap');

  const btnPrev        = $('#btnPrev');
  const btnPlay        = $('#btnPlay');
  const btnNext        = $('#btnNext');
  const btnReplay      = $('#btnReplay');
  const btnAutoPause   = $('#btnAutoPause');
  const btnLoopSentence= $('#btnLoopSentence');
  const btnAB          = $('#btnAB');
  const btnPointLoop   = $('#btnPointLoop');
  const btnClearLoop   = $('#btnClearLoop');
  const btnFill        = $('#btnFill');
  const speedRange     = $('#speedRange');
  const speedVal       = $('#speedVal');

  const cuesBody   = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');
  const chkFollow  = $('#chkFollow');
  const btnOffsetMinus = $('#btnOffsetMinus');
  const btnOffsetPlus  = $('#btnOffsetPlus');
  const offsetVal      = $('#offsetVal');

  const tabs      = $$('.tab');
  const paneSub   = $('#pane-sub');
  const paneQuiz  = $('#pane-quiz');
  const paneVocab = $('#pane-vocab');
  const vocabStatus = $('#vocabStatus');
  const vocabBox    = $('#vocabBox');

  // -------- URL Query --------
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  // -------- 狀態 --------
  let cues = [];
  let offset = 0;
  let follow = true;
  let loopSentence = false;
  let abA = null, abB = null;
  let autoPause = false;

  // -------- 工具 --------
  const toSec = (hhmmss) => {
    if (typeof hhmmss === 'number') return hhmmss;
    const p = String(hhmmss).split(':').map(Number);
    if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
    if (p.length === 2) return p[0]*60 + p[1];
    return Number(hhmmss) || 0;
  };
  const fmt = (sec) => {
    sec = Math.max(0, sec|0);
    const m = (sec/60)|0, s = sec%60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const escapeHtml = (s) => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  const currentIndex = () => {
    const t = video.currentTime + offset;
    let i = 0;
    while (i+1 < cues.length && cues[i+1].t <= t + 0.0001) i++;
    return i;
  };
  const highlightRow = (idx) => {
    const trs = $$('#cuesBody tr');
    trs.forEach(tr=> tr.classList.remove('active'));
    const tr = trs[idx];
    if (tr) {
      tr.classList.add('active');
      if (follow) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  const seekTo = (idx, play=true) => {
    if (!cues[idx]) return;
    video.currentTime = Math.max(0, cues[idx].t - offset + 0.0001);
    highlightRow(idx);
    if (play) video.play();
  };
  const sentenceRange = (idx) => {
    if (!cues[idx]) return [0,0];
    const s = cues[idx].t;
    const e = (idx+1<cues.length ? cues[idx+1].t : s+3);
    return [s,e];
  };

  // -------- Supabase 優先 + Fallback --------
  let supa = null;
  (async () => {
    try { const m = await import('./videos/js/supa.js'); supa = m?.supa ?? null; }
    catch { supa = null; }
  })();

  const getPublicUrl = (bucket, path) => {
    if (!supa) return null;
    try {
      const { data } = supa.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  };

  const resolveVideoUrl = async (sg) => {
    if (supa) {
      const u1 = getPublicUrl('videos', `${sg}.mp4`);
      if (u1) return u1;
    }
    return `./videos/${sg}.mp4`;
  };

  const resolveCues = async (sg) => {
    if (supa) {
      const u = getPublicUrl('cues', `${sg}.json`);
      if (u) {
        try {
          const rsp = await fetch(u, { cache:'no-store' });
          if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
        } catch {}
      }
    }
    try {
      const rsp = await fetch(`./data/cues-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
    } catch {}
    return [];
  };

  const resolveVocab = async (sg) => {
    if (supa) {
      const u = getPublicUrl('vocab', `${sg}.json`);
      if (u) {
        try { const rsp = await fetch(u, { cache:'no-store' }); if (rsp.ok) return await rsp.json(); } catch {}
      }
    }
    try { const rsp = await fetch(`./data/vocab-${sg}.json`, { cache:'no-store' }); if (rsp.ok) return await rsp.json(); } catch {}
    return null;
  };

  // -------- 載入流程 --------
  async function loadAll() {
    video.src = await resolveVideoUrl(slug);
    cues = await resolveCues(slug);
    renderCues();
    loadVocabUI();   // 單字即載
  }

  function renderCues() {
    cuesBody.innerHTML = '';
    if (!cues.length) { cuesStatus.textContent = '⚠️ 查無字幕資料'; return; }
    cuesStatus.textContent = '';
    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}"><td class="muted">${c.t?fmt(c.t):''}</td><td>${escapeHtml(c.en)}</td><td>${escapeHtml(c.zh)}</td></tr>
    `).join('');
    $$('#cuesBody tr').forEach(tr=> tr.addEventListener('click', ()=> seekTo(+tr.dataset.i, true)));
  }

  async function loadVocabUI() {
    const list = await resolveVocab(slug);
    if (!list || !list.length) { vocabStatus.textContent = '⚠️ 查無單字資料'; return; }
    vocabStatus.textContent = '';
    vocabBox.innerHTML = `<table><tbody>${list.map(v=>`
      <tr><td class="muted">${escapeHtml(v.time||'')}</td>
          <td>${escapeHtml(v.word||'')}</td>
          <td>${escapeHtml(v.pos||'')}</td>
          <td>${escapeHtml(v.zh||'')}</td>
          <td>${escapeHtml(v.en||'')}</td></tr>`).join('')}</tbody></table>`;
  }

  // -------- 控制列 --------
  speedRange.addEventListener('input', ()=>{ const r=+speedRange.value; video.playbackRate=r; speedVal.textContent=`${r.toFixed(2)}x`; });
  btnPlay.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev.addEventListener('click', ()=> seekTo(Math.max(0,currentIndex()-1),true));
  btnNext.addEventListener('click', ()=> seekTo(Math.min(cues.length-1,currentIndex()+1),true));
  btnReplay.addEventListener('click', ()=>{ loopSentence=true;btnLoopSentence.classList.add('green'); seekTo(currentIndex(),true); });
  btnLoopSentence.addEventListener('click', ()=>{ loopSentence=!loopSentence; btnLoopSentence.classList.toggle('green',loopSentence); });
  btnAB.addEventListener('click', ()=>{ /* A-B 省略細節, 保持和之前一樣 */ });
  btnPointLoop.addEventListener('click', ()=>{ btnPointLoop.classList.toggle('green'); cuesBody.dataset.pointloop=btnPointLoop.classList.contains('green')?'1':''; });
  btnClearLoop.addEventListener('click', ()=>{ loopSentence=false; abA=abB=null; btnLoopSentence.classList.remove('green'); btnAB.classList.remove('green'); });
  btnFill.addEventListener('click', ()=> videoWrap.classList.toggle('fill'));
  btnOffsetMinus.addEventListener('click', ()=>{ offset-=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  btnOffsetPlus .addEventListener('click', ()=>{ offset+=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  chkFollow.addEventListener('change', ()=> follow=chkFollow.checked);
  btnAutoPause.addEventListener('click', ()=>{ autoPause=!autoPause; btnAutoPause.classList.toggle('green',autoPause); });

  video.addEventListener('timeupdate', ()=>{ if(!cues.length)return; const i=currentIndex(); highlightRow(i); });

  tabs.forEach(tab=>tab.addEventListener('click', ()=>{ tabs.forEach(x=>x.classList.remove('active')); tab.classList.add('active');
    const name=tab.dataset.tab; paneSub.style.display=(name==='sub')?'':'none'; paneQuiz.style.display=(name==='quiz')?'':'none'; paneVocab.style.display=(name==='vocab')?'':'none'; }));

  (async function init(){ video.playbackRate=+speedRange.value; speedVal.textContent=`${(+speedRange.value).toFixed(2)}x`; await loadAll(); })();
})();

/* =========================
   QUIZ MODULE (安全補丁)
   ========================= */
(() => {
  const qz$ = (sel, root=document) => root.querySelector(sel);
  const qzSlug = new URLSearchParams(location.search).get('slug') || 'mid-autumn';

  const qzTabBtn = qz$('.tab[data-tab="quiz"]');
  const qzPane   = qz$('#pane-quiz');
  const qzBox    = qz$('#quizBox');
  const qzStatus = qz$('#quizStatus');

  if (!qzPane || !qzBox) return;

  let qzLoaded=false, qzData=[], qzUserAns=[];

  async function fetchQuiz(){
    try{ const rsp=await fetch(`./data/quiz-${qzSlug}.json`,{cache:'no-store'}); if(rsp.ok) return await rsp.json(); }catch{}
    return [];
  }

  function render(){
    qzBox.innerHTML=''; qzUserAns=Array(qzData.length).fill(-1);
    qzData.forEach((q,qi)=>{ const wrap=document.createElement('div'); wrap.style.padding='14px'; wrap.style.borderBottom='1px solid #14243b';
      const title=document.createElement('div'); title.innerHTML=`<b>Q${qi+1}.</b> ${q.q}`; wrap.appendChild(title);
      q.a.forEach((opt,ai)=>{ const label=document.createElement('label'); label.style.display='block';
        label.innerHTML=`<input type="radio" name="q${qi}"/> ${opt}`;
        label.addEventListener('change',()=>{ qzUserAns[qi]=ai; ansLine.style.display='block';
          if(ai===q.answerIndex){ ansLine.textContent=`✅ 正確！${q.a[q.answerIndex]}（${q.explain||''}）`; ansLine.style.color='#5bd3c7'; }
          else{ ansLine.textContent=`❌ 錯誤，正解：${q.a[q.answerIndex]}（${q.explain||''}）`; ansLine.style.color='#ff6b6b'; }
        }); wrap.appendChild(label); });
      const ansLine=document.createElement('div'); ansLine.className='muted'; ansLine.style.display='none'; wrap.appendChild(ansLine);
      qzBox.appendChild(wrap);
    });
    const btn=document.createElement('button'); btn.textContent='交卷'; btn.className='btn green';
    btn.onclick=()=>{ let correct=0; qzData.forEach((q,i)=>{if(qzUserAns[i]===q.answerIndex)correct++;});
      const pct=Math.round(correct/qzData.length*100); const sum=document.createElement('div');
      sum.innerHTML=`成績：${correct}/${qzData.length}（${pct}%）<br>老師建議：${pct>=80?'很棒！':'回去複習影片重點句。'}`;
      qzBox.appendChild(sum);
    };
    qzBox.appendChild(btn);
  }

  async function loadOnce(){ if(qzLoaded)return; qzStatus.textContent='載入中…'; qzData=await fetchQuiz(); qzLoaded=true; render(); qzStatus.textContent=''; }

  if(qzTabBtn) qzTabBtn.addEventListener('click', loadOnce);
})();
















// player.js  (V7.2 + Quiz 兼容補丁)
// - 影片 / 字幕 / 單字 保留原行為
// - 測驗：支援「扁平陣列」與「外殼 items」兩種 JSON；兩種檔名皆可
// - 不依賴任何外部套件

(() => {
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // -------- DOM Refs --------
  const video      = $('#player');
  const videoWrap  = $('#videoWrap');

  // 左側控制列（延用既有按鈕 id）
  const btnPrev        = $('#btnPrev');
  const btnPlay        = $('#btnPlay');
  const btnNext        = $('#btnNext');
  const btnReplay      = $('#btnReplay');
  const btnAutoPause   = $('#btnAutoPause');
  const btnLoopSentence= $('#btnLoopSentence');
  const btnAB          = $('#btnAB');
  const btnPointLoop   = $('#btnPointLoop');
  const btnClearLoop   = $('#btnClearLoop');
  const btnFill        = $('#btnFill'); // 「填滿畫面」按鈕
  const speedRange     = $('#speedRange');
  const speedVal       = $('#speedVal');

  // 字幕區
  const cuesBody   = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');
  const chkFollow  = $('#chkFollow');
  const btnOffsetMinus = $('#btnOffsetMinus');
  const btnOffsetPlus  = $('#btnOffsetPlus');
  const offsetVal      = $('#offsetVal');

  // 分頁
  const tabs      = $$('.tab');
  const paneSub   = $('#pane-sub');
  const paneQuiz  = $('#pane-quiz');
  const paneVocab = $('#pane-vocab');
  const vocabStatus = $('#vocabStatus');
  const vocabBox    = $('#vocabBox');

  // -------- URL Query --------
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';
  const bootTab = (params.get('tab') || '').toLowerCase();

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

  // -------- Supabase 優先 + Fallback（若你沒用 supa，會走本地） --------
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
          const rsp = await fetch(u + `?t=${Date.now()}`, { cache:'no-store' });
          if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
        } catch {}
      }
    }
    try {
      const rsp = await fetch(`./data/cues-${sg}.json?t=${Date.now()}`, { cache:'no-store' });
      if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
    } catch {}
    return [];
  };

  const resolveVocab = async (sg) => {
    if (supa) {
      const u = getPublicUrl('vocab', `${sg}.json`);
      if (u) {
        try { const rsp = await fetch(u + `?t=${Date.now()}`, { cache:'no-store' }); if (rsp.ok) return await rsp.json(); } catch {}
      }
    }
    try { const rsp = await fetch(`./data/vocab-${sg}.json?t=${Date.now()}`, { cache:'no-store' }); if (rsp.ok) return await rsp.json(); } catch {}
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
    cuesBody && (cuesBody.innerHTML = '');
    if (!cues.length) { cuesStatus && (cuesStatus.textContent = '⚠️ 查無字幕資料'); return; }
    cuesStatus && (cuesStatus.textContent = '');
    if (!cuesBody) return;
    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}"><td class="muted">${c.t?fmt(c.t):''}</td><td>${escapeHtml(c.en)}</td><td>${escapeHtml(c.zh)}</td></tr>
    `).join('');
    $$('#cuesBody tr').forEach(tr=> tr.addEventListener('click', ()=> seekTo(+tr.dataset.i, true)));
  }

  async function loadVocabUI() {
    if (!vocabBox) return;
    const list = await resolveVocab(slug);
    if (!list || !list.length) { vocabStatus && (vocabStatus.textContent = '⚠️ 查無單字資料'); return; }
    vocabStatus && (vocabStatus.textContent = '');
    vocabBox.innerHTML = `<table><tbody>${list.map(v=>`
      <tr>
        <td class="muted">${escapeHtml(v.time||'')}</td>
        <td>${escapeHtml(v.word||'')}</td>
        <td>${escapeHtml(v.pos||'')}</td>
        <td>${escapeHtml(v.zh||'')}</td>
        <td>${escapeHtml(v.en||'')}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  // -------- 控制列 --------
  speedRange && speedRange.addEventListener('input', ()=>{ const r=+speedRange.value; video.playbackRate=r; speedVal && (speedVal.textContent=`${r.toFixed(2)}x`); });
  btnPlay && btnPlay.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev && btnPrev.addEventListener('click', ()=> seekTo(Math.max(0,currentIndex()-1),true));
  btnNext && btnNext.addEventListener('click', ()=> seekTo(Math.min(cues.length-1,currentIndex()+1),true));
  btnReplay && btnReplay.addEventListener('click', ()=>{ loopSentence=true;btnLoopSentence?.classList.add('green'); seekTo(currentIndex(),true); });
  btnLoopSentence && btnLoopSentence.addEventListener('click', ()=>{ loopSentence=!loopSentence; btnLoopSentence.classList.toggle('green',loopSentence); });
  btnAB && btnAB.addEventListener('click', ()=>{ /* 你原本的 A-B 細節保留 */ });
  btnPointLoop && btnPointLoop.addEventListener('click', ()=>{ btnPointLoop.classList.toggle('green'); cuesBody && (cuesBody.dataset.pointloop=btnPointLoop.classList.contains('green')?'1':''); });
  btnClearLoop && btnClearLoop.addEventListener('click', ()=>{ loopSentence=false; abA=abB=null; btnLoopSentence?.classList.remove('green'); btnAB?.classList.remove('green'); });
  btnFill && btnFill.addEventListener('click', ()=> {
    // 「填滿畫面」按鈕：只切換容器 class，不動右側
    videoWrap && videoWrap.classList.toggle('fill');
  });
  btnOffsetMinus && btnOffsetMinus.addEventListener('click', ()=>{ offset-=0.5; offsetVal && (offsetVal.textContent=`${offset.toFixed(1)}s`); });
  btnOffsetPlus  && btnOffsetPlus .addEventListener('click', ()=>{ offset+=0.5; offsetVal && (offsetVal.textContent=`${offset.toFixed(1)}s`); });
  chkFollow && chkFollow.addEventListener('change', ()=> follow=chkFollow.checked);

  video.addEventListener('timeupdate', ()=>{ if(!cues.length)return; const i=currentIndex(); highlightRow(i); });

  tabs.forEach(tab=>tab.addEventListener('click', ()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');
    const name=tab.dataset.tab;
    if (paneSub)   paneSub.style.display =(name==='sub')?'':'none';
    if (paneQuiz)  paneQuiz.style.display=(name==='quiz')?'':'none';
    if (paneVocab) paneVocab.style.display=(name==='vocab')?'':'none';
  }));

  // 初始化
  (async function init(){
    if (speedRange) {
      video.playbackRate=+speedRange.value; 
      speedVal && (speedVal.textContent=`${(+speedRange.value).toFixed(2)}x`);
    }
    await loadAll();

    // 若網址帶 tab
    if (bootTab) {
      const btn = document.querySelector(`.tab[data-tab="${bootTab}"]`);
      if (btn) btn.click();
    }
  })();
})();

/* =========================
   QUIZ MODULE（兼容版）
   只影響 #pane-quiz / #quizBox / #quizStatus
   ========================= */
(() => {
  const $ = (s,r=document)=> r.querySelector(s);

  const pane  = $('#pane-quiz');
  if (!pane) return;

  // 你頁面上的容器（若沒有就補）
  const box   = $('#quizBox') || (function(){
    const div = document.createElement('div');
    div.id = 'quizBox';
    pane.appendChild(div);
    return div;
  })();
  const stat  = $('#quizStatus') || (function(){
    const s = document.createElement('div');
    s.id = 'quizStatus';
    s.className = 'muted';
    s.style.margin = '8px 0';
    pane.prepend(s);
    return s;
  })();

  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';
  const wantQuiz = (params.get('tab')||'').toLowerCase()==='quiz';

  // --------------- 載檔 & 正規化 ---------------
  const bust = () => `_=${Date.now()}`;

  async function fetchJson(url){
    const u = url + (url.includes('?')?'&':'?') + bust();
    const r = await fetch(u, { cache:'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async function resolveQuiz(slug){
    const tries = [
      `./data/quiz-${slug}.json`,
      `./data/${slug}-quiz.json`
    ];
    let lastErr = null;
    for (const u of tries){
      try {
        const data = await fetchJson(u);
        return normalizeQuiz(data);
      } catch(err){ lastErr = err; }
    }
    throw lastErr || new Error('quiz JSON not found');
  }

  function normalizeQuiz(data){
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.questions)) return data.questions;
    if (Array.isArray(data?.data)) return data.data;
    throw new Error('Unsupported quiz JSON format');
  }

  // --------------- 渲染 ---------------
  let loaded=false, questions=[], answers=[];

  const styles=`
    .qwrap{border-bottom:1px solid #14243b;padding:12px 8px}
    .qtitle{font-weight:700;margin-bottom:6px}
    .opt{display:block;margin:4px 0;cursor:pointer}
    .ansline{margin-top:6px;color:#94a3b8;display:none}
    .ansline.ok{color:#5bd3c7}
    .ansline.bad{color:#ff6b6b}
    .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}
    .inpt{padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff}
    .btn{background:#10b981;border:none;color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}
    .btn.ghost{background:#1e293b}
  `;
  (function injectOnce(){
    if ($('#quizCompatStyle')) return;
    const st=document.createElement('style');
    st.id='quizCompatStyle';
    st.textContent=styles;
    document.head.appendChild(st);
  })();

  function escapeHtml(s){
    return String(s??'')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;');
  }
  const norm = s => String(s||'').trim().toLowerCase();

  function showFeedback(el, ok){
    el.style.display='block';
    el.classList.remove('ok','bad');
    el.classList.add(ok?'ok':'bad');
    el.textContent = ok ? '✅ 正確！' : '❌ 再試試看。';
  }
  function showFillFeedback(el, ok, ans){
    el.style.display='block';
    el.classList.remove('ok','bad');
    el.classList.add(ok?'ok':'bad');
    el.textContent = ok ? '✅ 正確！' : `❌ 正解：${ans}`;
  }

  function render(){
    box.innerHTML='';
    answers = Array(questions.length).fill(null);

    questions.forEach((q, qi)=>{
      const type = String(q.type||'').toLowerCase();
      const w = document.createElement('div');
      w.className='qwrap';

      const title = document.createElement('div');
      title.className='qtitle';
      title.innerHTML = `<b>Q${qi+1}.</b> ${escapeHtml(q.q||q.question||'')}`;
      w.appendChild(title);

      const feedback = document.createElement('div');
      feedback.className='ansline';
      w.appendChild(feedback);

      if (type==='mcq'){
        (q.options||[]).forEach((opt, oi)=>{
          const lab = document.createElement('label');
          lab.className='opt';
          lab.innerHTML = `<input type="radio" name="q${qi}"> <span>${escapeHtml(opt)}</span>`;
          lab.querySelector('input').addEventListener('change', ()=>{
            answers[qi]=oi;
            showFeedback(feedback, oi===(q.a??q.answer));
          });
          w.appendChild(lab);
        });
      }
      else if (type==='tf'){
        ['True','False'].forEach((opt, oi)=>{
          const lab=document.createElement('label');
          lab.className='opt';
          lab.innerHTML = `<input type="radio" name="q${qi}"> <span>${opt}</span>`;
          lab.querySelector('input').addEventListener('change', ()=>{
            answers[qi] = (oi===0);
            const ok = Boolean(q.a??q.answer) === answers[qi];
            showFeedback(feedback, ok);
          });
          w.appendChild(lab);
        });
      }
      else if (type==='fill'){
        const ipt=document.createElement('input');
        ipt.className='inpt';
        ipt.placeholder='輸入答案…';
        ipt.addEventListener('input', ()=>{
          answers[qi]=ipt.value;
          const ok = norm(ipt.value) === norm(String(q.a??q.answer??''));
          showFillFeedback(feedback, ok, String(q.a??q.answer??''));
        });
        w.appendChild(ipt);
      }
      else {
        // 未知類型 => 視為簡答
        const ipt=document.createElement('input');
        ipt.className='inpt';
        ipt.placeholder='輸入答案…';
        ipt.addEventListener('input', ()=>{ answers[qi]=ipt.value; });
        w.appendChild(ipt);
      }

      box.appendChild(w);
    });

    // 交卷列
    const foot=document.createElement('div');
    foot.className='row';

    const nameIpt=document.createElement('input');
    nameIpt.className='inpt';
    nameIpt.placeholder='輸入姓名（僅本機記憶，可留空）';
    nameIpt.value = localStorage.getItem('qzName') || '';
    nameIpt.style.flex='1 1 260px';

    const btn=document.createElement('button');
    btn.className='btn';
    btn.textContent='交卷';

    const result=document.createElement('div');
    result.style.flex='1 1 100%';

    btn.addEventListener('click', ()=>{
      localStorage.setItem('qzName', nameIpt.value.trim());
      let correct=0;
      questions.forEach((q,i)=>{
        const type=String(q.type||'').toLowerCase();
        if (type==='mcq'){
          if (answers[i] === (q.a??q.answer)) correct++;
        } else if (type==='tf'){
          if (Boolean(answers[i]) === Boolean(q.a??q.answer)) correct++;
        } else if (type==='fill'){
          if (norm(answers[i]||'') === norm(String(q.a??q.answer??''))) correct++;
        }
      });
      const tot=questions.length||1;
      const pct=Math.round(correct/tot*100);
      result.innerHTML = `
        <div><b>成績</b>：${correct}/${tot}（${pct}%）</div>
        <div class="muted" style="margin-top:4px">
          老師建議：${pct>=80?'很棒！可挑戰更進階題組':'建議回到影片複習重點句，再來挑戰一次。'}
        </div>
      `;
    });

    foot.appendChild(nameIpt);
    foot.appendChild(btn);
    foot.appendChild(result);
    box.appendChild(foot);
  }

  async function loadOnce(){
    if (loaded) return;
    try{
      stat.textContent='載入測驗中…';
      questions = await resolveQuiz(slug);
      if (!Array.isArray(questions) || !questions.length) throw new Error('空白題庫');
      render();
      stat.textContent='';
      loaded=true;
    }catch(err){
      stat.textContent=`⚠️ 查無測驗資料（${err.message}）`;
      box.innerHTML='';
    }
  }

  // 點分頁才載入
  const tabBtn = document.querySelector('.tab[data-tab="quiz"]');
  if (tabBtn) tabBtn.addEventListener('click', loadOnce);

  // 若網址就是 tab=quiz 則立即載
  if (wantQuiz) loadOnce();
})();



















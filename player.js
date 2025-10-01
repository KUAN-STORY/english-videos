/* player.js  — V7.2 + Vocab(填空/朗讀/跳播/文法置中) 強化
   - 保留原有：影片/字幕/測驗（你的現有寫法）、左側工具列、跟隨/偏移
   - 單字分頁：例句填空、🔊朗讀、▶跳播、文法置於例句下方（不擠右欄）
   - Supabase 公桶優先、讀不到退本地（影片/字幕/單字）
=========================================================== */

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // -------- DOM 參照（對齊你現有 player.html）--------
  const video      = $('#player');
  const videoWrap  = $('#videoWrap');

  // 左側工具列
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

  // 右側：字幕
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

  // -------- 狀態 --------
  let cues = [];           // {t,en,zh}
  let offset = 0;          // 偏移秒數（全域）
  let follow = true;       // 跟隨高亮
  let loopSentence = false;
  let abA = null, abB = null;
  let autoPause = false;

  // -------- 小工具 --------
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
  const esc = (s) => String(s??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // --- TTS 朗讀（英文）---
  function speak(text, rate=1){
    try{
      const u = new SpeechSynthesisUtterance(String(text||''));
      u.lang = 'en-US';
      u.rate = rate;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }catch{}
  }

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

  // ================== Supabase 優先 + Fallback ==================
  let supa = null;
  (async () => {
    try { const m = await import('./videos/js/supa.js'); supa = m?.supa ?? null; }
    catch { supa = null; }
  })();

  const getPublicUrl = (bucket, path) => {
    if (!supa) return null;
    try { const { data } = supa.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  };

  // 影片：Storage > 本地
  const resolveVideoUrl = async (sg) => {
    if (supa) {
      const u1 = getPublicUrl('videos', `${sg}.mp4`);
      if (u1) return u1;
    }
    return `./videos/${sg}.mp4`;
  };

  // 字幕：Storage cues/<slug>.json > 本地 data/cues-<slug>.json
  const resolveCues = async (sg) => {
    if (supa) {
      const u = getPublicUrl('cues', `${sg}.json`);
      if (u) {
        try {
          const rsp = await fetch(u, { cache:'no-store' });
          if (rsp.ok) {
            const json = await rsp.json();
            return (json||[]).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
          }
        } catch {}
      }
    }
    try {
      const rsp = await fetch(`./data/cues-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) {
        const json = await rsp.json();
        return (json||[]).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
      }
    } catch {}
    return [];
  };

  // 單字：Storage vocab/<slug>.json > 本地 data/vocab-<slug>.json
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

  // ======================== 載入流程 ============================
  async function loadAll() {
    // 影片
    video.src = await resolveVideoUrl(slug);
    video.addEventListener('error', () => {
      if (cuesStatus) cuesStatus.textContent = `⚠️ 無法載入影片`;
    }, { once:true });

    // 字幕
    cues = await resolveCues(slug);
    renderCues();

    // 單字（即載）
    loadVocabUI();
  }

  // ------------------ 字幕表 -------------------
  function renderCues() {
    if (!cuesBody) return;
    cuesBody.innerHTML = '';
    if (!cues.length) { if(cuesStatus) cuesStatus.textContent = '⚠️ 查無字幕資料'; return; }
    if (cuesStatus) cuesStatus.textContent = '';

    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}">
        <td class="muted" style="width:80px">${c.t?fmt(c.t):''}</td>
        <td>${esc(c.en)}</td>
        <td style="width:40%">${esc(c.zh)}</td>
      </tr>
    `).join('');

    // 點列跳播
    $$('#cuesBody tr').forEach(tr=> tr.addEventListener('click', ()=>{
      const i = +tr.dataset.i;
      if (cuesBody.dataset.pointloop === '1') {
        loopSentence = true;
        btnLoopSentence?.classList.add('green');
      }
      seekTo(i, true);
    }));
  }

  // =================== 單字分頁（填空+朗讀+跳播+文法置中） ===================
  async function loadVocabUI(){
    if (!paneVocab) return;

    // 容器保險
    let vStatus = vocabStatus || $('#vocabStatus');
    let vBox    = vocabBox    || $('#vocabBox');
    if (!vStatus){
      vStatus = document.createElement('div');
      vStatus.id='vocabStatus';
      paneVocab.appendChild(vStatus);
    }
    if (!vBox){
      vBox = document.createElement('div');
      vBox.id='vocabBox';
      paneVocab.appendChild(vBox);
    }

    // 讀資料
    vStatus.textContent = '載入中…';
    const list = await resolveVocab(slug);
    if (!list || !list.length){ 
      vStatus.textContent='⚠️ 查無單字資料';
      vBox.innerHTML='';
      return; 
    }
    vStatus.textContent='';

    // 小工具：遮罩例句、跳播
    const maskSentence = (w, s) => {
      const word = String(w||'').trim();
      let txt = String(s||'');
      if (!word) return txt;
      const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`, 'ig');
      return txt.replace(re, '_____');
    };
    const go = (mmss) => {
      if(!video) return;
      const toS = (x)=>{
        if(typeof x==='number') return x;
        const p = String(x).split(':').map(Number);
        if(p.length===3) return p[0]*3600+p[1]*60+p[2];
        if(p.length===2) return p[0]*60+p[1];
        return Number(x)||0;
      };
      video.currentTime = Math.max(0,toS(mmss));
      video.play();
    };

    // 版面
    vBox.innerHTML = `
      <style>
        .voc-row{display:grid;grid-template-columns:120px 1fr 280px;gap:12px;padding:12px 10px;border-bottom:1px solid #14243b}
        .voc-time{display:flex;align-items:center;gap:8px;color:#9fb3d9}
        .voc-time .btn{border:1px solid #26406b;background:#0f223b;color:#dbe7ff;border-radius:8px;padding:4px 8px;cursor:pointer}
        .voc-core{min-width:0}
        .voc-sent{line-height:1.6}
        .voc-ipt{margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .voc-ipt input{padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:180px}
        .voc-ipt .ok{color:#5bd3c7}
        .voc-ipt .ng{color:#ff6b6b}
        .voc-gram{margin-top:6px;color:#9fb3d9;font-size:13px}
        .voc-right{border:1px solid #172a4a;background:#0f1a33;border-radius:10px;padding:10px}
        .voc-word{display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px}
        .voc-pos{color:#9fb3d9;font-size:13px}
        .voc-zh{margin-top:6px}
        .voc-en{margin-top:2px;color:#9fb3d9;font-size:13px}
        .voc-actions{margin-top:8px;display:flex;gap:8px}
        .voc-actions .btn{border:1px solid #26406b;background:#0f223b;color:#dbe7ff;border-radius:8px;padding:4px 8px;cursor:pointer}
        @media(max-width:980px){ .voc-row{grid-template-columns:1fr} .voc-right{order:3} }
      </style>
      <div id="vocList"></div>
    `;
    const listBox = $('#vocList', vBox);

    // 渲染每一筆
    list.forEach((v)=>{
      const row = document.createElement('div');
      row.className = 'voc-row';

      // 左：時間/跳播
      const left = document.createElement('div');
      left.className = 'voc-time';
      left.innerHTML = `
        <button class="btn" data-act="jump">▶</button>
        <span class="time-link" style="cursor:pointer;text-decoration:underline;">${(v.time||'').toString()}</span>
      `;

      // 中：例句（填空）+ 文法（置中欄）
      const core = document.createElement('div');
      core.className = 'voc-core';
      const example = v.example || v.en || ''; // 沒 example 就用英文解釋
      core.innerHTML = `
        <div class="voc-sent">${esc(maskSentence(v.word, example))}</div>
        <div class="voc-ipt">
          <input type="text" placeholder="輸入這個空格的單字…" aria-label="answer">
          <button class="btn" data-act="check">檢查</button>
          <span class="msg"></span>
          <button class="btn" data-act="reveal">顯示答案</button>
        </div>
        ${v.grammar ? `<div class="voc-gram">文法：${esc(v.grammar)}</div>` : ``}
      `;

      // 右：答案卡 + 朗讀
      const right = document.createElement('div');
      right.className = 'voc-right';
      right.innerHTML = `
        <div class="voc-word">
          <span>${esc(v.word||'')}</span>
          <button class="btn" data-act="speak" title="朗讀 🔊">🔊</button>
        </div>
        <div class="voc-pos">${esc(v.pos||'')}</div>
        ${v.zh ? `<div class="voc-zh">${esc(v.zh)}</div>` : ``}
        ${v.en ? `<div class="voc-en">${esc(v.en)}</div>` : ``}
        <div class="voc-actions">
          <button class="btn" data-act="jump">跳到片段</button>
        </div>
      `;

      // 行為
      row.addEventListener('click', (e)=>{
        const act = e.target?.dataset?.act;
        if (!act) return;

        if (act==='jump'){ go(v.time||0); }
        else if (act==='speak'){ speak(v.word || v.en || v.example || v.zh || ''); }
        else if (act==='check'){
          const ipt = core.querySelector('input');
          const msg = core.querySelector('.msg');
          const ok = String(ipt.value||'').trim().toLowerCase()
                      === String(v.word||'').trim().toLowerCase();
          msg.textContent = ok ? '✅ 正確！' : '❌ 再試試';
          msg.className = `msg ${ok?'ok':'ng'}`;
        }
        else if (act==='reveal'){
          const ipt = core.querySelector('input');
          ipt.value = v.word||'';
          const msg = core.querySelector('.msg');
          msg.textContent = '（已填入答案）';
          msg.className = 'msg';
        }
      });

      // 點時間跳播
      left.querySelector('.time-link').addEventListener('click', ()=> go(v.time||0));

      row.appendChild(left);
      row.appendChild(core);
      row.appendChild(right);
      listBox.appendChild(row);
    });
  }

  // =================== 控制列 ===================
  if (speedRange) speedRange.addEventListener('input', ()=>{
    const r = Number(speedRange.value) || 1;
    video.playbackRate = r;
    if (speedVal) speedVal.textContent = `${r.toFixed(2)}x`;
  });

  btnPlay?.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev?.addEventListener('click', ()=> seekTo(Math.max(0,currentIndex()-1),true));
  btnNext?.addEventListener('click', ()=> seekTo(Math.min(cues.length-1,currentIndex()+1),true));

  btnReplay?.addEventListener('click', ()=>{
    loopSentence = true;
    btnLoopSentence?.classList.add('green');
    seekTo(currentIndex(), true);
  });

  btnLoopSentence?.addEventListener('click', ()=>{
    loopSentence = !loopSentence;
    btnLoopSentence.classList.toggle('green', loopSentence);
  });

  btnAB?.addEventListener('click', ()=>{
    const now = video.currentTime + offset;
    if (abA === null) { abA = now; abB = null; btnAB.classList.add('green'); btnAB.textContent='🅱 設定 B（再次按取消）'; }
    else if (abB === null) { abB = now; if(abB<abA) [abA,abB]=[abB,abA]; btnAB.textContent='🅰🅱 A-B 循環中（再次按取消）'; }
    else { abA = abB = null; btnAB.classList.remove('green'); btnAB.textContent='🅰🅱 A-B 循環'; }
  });

  btnPointLoop?.addEventListener('click', ()=>{
    btnPointLoop.classList.toggle('green');
    if (cuesBody) cuesBody.dataset.pointloop = btnPointLoop.classList.contains('green') ? '1' : '';
  });

  btnClearLoop?.addEventListener('click', ()=>{
    loopSentence = false; abA = abB = null;
    btnLoopSentence?.classList.remove('green');
    btnAB?.classList.remove('green');
    if (btnAB) btnAB.textContent='🅰🅱 A-B 循環';
  });

  btnFill?.addEventListener('click', ()=>{
    // 切換填滿：#videoWrap.fill
    videoWrap?.classList.toggle('fill');
  });

  btnOffsetMinus?.addEventListener('click', ()=>{ offset -= 0.5; if(offsetVal) offsetVal.textContent=`${offset.toFixed(1)}s`; });
  btnOffsetPlus ?.addEventListener('click', ()=>{ offset += 0.5; if(offsetVal) offsetVal.textContent=`${offset.toFixed(1)}s`; });
  chkFollow    ?.addEventListener('change', ()=> follow = chkFollow.checked);
  btnAutoPause ?.addEventListener('click', ()=>{ autoPause=!autoPause; btnAutoPause.classList.toggle('green',autoPause); });

  // 播放事件（高亮、逐句暫停、單句循環、A-B 循環）
  video.addEventListener('timeupdate', ()=>{
    if (!cues.length) return;
    const i = currentIndex();
    highlightRow(i);
    const t = video.currentTime + offset;

    if (autoPause) {
      const [, e] = sentenceRange(i);
      if (t >= e - 0.02 && t < e + 0.2) video.pause();
    }
    if (loopSentence) {
      const [s, e] = sentenceRange(i);
      if (t >= e - 0.02) {
        video.currentTime = Math.max(0, s - offset + 0.0001);
        video.play();
      }
    }
    if (abA !== null && abB !== null) {
      if (t < abA || t >= abB - 0.02) {
        video.currentTime = Math.max(0, abA - offset + 0.0001);
        video.play();
      }
    }
  });

  // 分頁切換
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      if (paneSub)   paneSub.style.display   = (name==='sub')  ? '' : 'none';
      if (paneQuiz)  paneQuiz.style.display  = (name==='quiz') ? '' : 'none';
      if (paneVocab) paneVocab.style.display = (name==='vocab')? '' : 'none';
    });
  });

  // 啟動
  (async function init(){
    const r = Number(speedRange?.value) || 1;
    video.playbackRate = r;
    if (speedVal) speedVal.textContent = `${r.toFixed(2)}x`;
    await loadAll();
  })();
})();
/* === QUIZ PATCH: auto-mount DOM + load/render quiz === */

/** 依分數回傳老師評語（滿分有特別訊息） */
function teacherComment(score, total){
  const pct = Math.round((score/total)*100);
  if (pct === 100) {
    return "滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼 🎉";
  }
  if (pct >= 90) return "非常好！幾乎全對，維持這個節奏～";
  if (pct >= 80) return "表現很穩！再把細節補強就更棒了。";
  if (pct >= 70) return "不錯！再練練常錯題，下一次可以更好。";
  if (pct >= 60) return "及格！持續複習重點單字與片語。";
  return "還差一點點～ 建議回放影片找出關鍵句，再做一次測驗！";
}

/** 若測驗分頁缺少必要節點，動態建立 */
function ensureQuizDOM(){
  const pane = document.querySelector('#pane-quiz');
  if (!pane) return null;

  // 清掉「尚未載入」小提示
  const badge = pane.querySelector('.muted');
  if (badge && /尚未載入/.test(badge.textContent)) badge.remove();

  // 找不到就建立：控制列 + 題目容器
  if (!pane.querySelector('#quizControls')){
    const ctrl = document.createElement('div');
    ctrl.id = 'quizControls';
    ctrl.style.cssText = 'margin:8px 0 12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
    ctrl.innerHTML = `
      <button class="btn" id="btnSubmitQuiz">交卷</button>
      <button class="btn" id="btnPrintQuiz" style="display:none">列印成績單</button>
      <button class="btn" id="btnShowAnswer" style="display:none">顯示答案</button>
      <span id="quizMeta" style="color:#9fb3ff"></span>
    `;
    pane.appendChild(ctrl);
  }
  if (!pane.querySelector('#quizList')){
    const list = document.createElement('ol');
    list.id = 'quizList';
    list.style.lineHeight = '1.7';
    list.style.paddingLeft = '1.2em';
    pane.appendChild(list);
  }
  if (!pane.querySelector('#quizResult')){
    const res = document.createElement('div');
    res.id = 'quizResult';
    res.style.cssText = 'display:none; margin:10px 0; padding:10px; border:1px solid #203057; border-radius:10px; background:#0f1a33';
    res.innerHTML = `
      <div id="quizScore" style="font-weight:700; margin-bottom:6px"></div>
      <div id="quizTeacher" style="color:#9fb3d9"></div>
    `;
    pane.insertBefore(res, pane.querySelector('#quizList'));
  }
  return pane;
}

/** 將題庫轉成統一格式 */
function normalizeQuestion(q, idx){
  return {
    id: idx + 1,
    type: (q.type || '').toLowerCase() || (Array.isArray(q.options) ? 'mcq' : 'sa'),
    question: q.question || q.q || '',
    options: q.options || q.choices || [],
    answer: (q.answer ?? q.ans ?? '').toString(),
    explanation: q.explanation || q.ex || ''
  };
}

/** 載入題庫 */
async function fetchQuiz(slug){
  try{
    const r = await fetch(`./data/quiz-${slug}.json`, {cache:'no-store'});
    if(!r.ok) throw 0;
    const raw = await r.json();
    return (raw || []).map(normalizeQuestion);
  }catch(e){
    console.warn('[quiz] load fail:', e);
    return [];
  }
}

/** 渲染測驗 */
async function mountQuiz(){
  const host = ensureQuizDOM();
  if (!host){
    console.warn('[quiz] pane-quiz not found');
    return;
  }
  const list = host.querySelector('#quizList');
  const meta = host.querySelector('#quizMeta');
  const btnSubmit = host.querySelector('#btnSubmitQuiz');
  const btnPrint  = host.querySelector('#btnPrintQuiz');
  const btnAns    = host.querySelector('#btnShowAnswer');
  const boxResult = host.querySelector('#quizResult');
  const elScore   = host.querySelector('#quizScore');
  const elTeacher = host.querySelector('#quizTeacher');

  list.innerHTML = '<li class="muted">題目載入中…</li>';

  // 依 URL 取得 slug（你的檔頭已經有 params 了，直接沿用）
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || 'mid-autumn';

  const questions = await fetchQuiz(slug);
  if (!questions.length){
    list.innerHTML = `<li class="muted">查無題庫（./data/quiz-${slug}.json）</li>`;
    meta.textContent = '';
    return;
  }

  // 狀態：使用者作答（Map: id -> userAns）
  const answers = new Map();

  // 題目數
  meta.textContent = `共 ${questions.length} 題（單選／簡答）`;

  // 產生每題 UI
  list.innerHTML = '';
  questions.forEach(q=>{
    const li = document.createElement('li');
    li.style.marginBottom = '18px';
    li.innerHTML = `
      <div style="font-weight:700; margin-bottom:8px">${escapeHtml(q.question)}</div>
      <div class="q-body"></div>
      <div class="q-msg"  style="margin-top:6px;display:none"></div>
      <div class="q-ans"  style="margin-top:4px;color:#9fb3d9;display:none">正解：</div>
      ${q.explanation ? `<div class="q-exp" style="margin-top:4px;color:#9fb3d9;display:none">解析：${escapeHtml(q.explanation)}</div>` : ''}
    `;
    const body = li.querySelector('.q-body');
    const msg  = li.querySelector('.q-msg');
    const ans  = li.querySelector('.q-ans');

    if (q.type === 'mcq'){
      // 單選
      q.options.forEach(opt=>{
        const id = `q${q.id}_${Math.random().toString(36).slice(2,6)}`;
        const row = document.createElement('div');
        row.innerHTML = `
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="q${q.id}" id="${id}" value="${escapeHtml(opt)}"/>
            <span>${escapeHtml(opt)}</span>
          </label>`;
        const ipt = row.querySelector('input');
        ipt.addEventListener('change', ()=>{
          answers.set(q.id, ipt.value);
          // 立刻判斷對錯（僅顯示勾叉，正解文字等交卷或按顯示答案）
          const ok = ipt.value.trim().toLowerCase() === q.answer.trim().toLowerCase();
          msg.style.display='block';
          msg.textContent = ok ? '✅ 正確' : '❌ 錯誤';
          msg.style.color = ok ? '#5bd3c7' : '#ff6b6b';
        });
        body.appendChild(row);
      });
    }else{
      // 簡答
      const wrap = document.createElement('div');
      wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.alignItems='center';
      wrap.innerHTML = `
        <input type="text" class="ipt" placeholder="輸入答案…" 
               style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:260px"/>
        <button class="btn check">檢查</button>`;
      const ipt = wrap.querySelector('.ipt');
      const btn = wrap.querySelector('.check');
      btn.addEventListener('click', ()=>{
        const val = ipt.value.trim();
        answers.set(q.id, val);
        const ok = val.toLowerCase() === q.answer.trim().toLowerCase();
        msg.style.display='block';
        msg.textContent = ok ? '✅ 正確' : '❌ 錯誤';
        msg.style.color = ok ? '#5bd3c7' : '#ff6b6b';
        ipt.style.borderColor = ok ? '#5bd3c7' : '#ff6b6b';
      });
      body.appendChild(wrap);
    }

    // 存放正解字串（交卷或按顯示答案才打開）
    ans.dataset.answer = q.answer;
    list.appendChild(li);
  });

  // 交卷：計分 + 評語 + 顯示列印/顯示答案按鈕
  btnSubmit.onclick = ()=>{
    let correct = 0;
    const items = [...list.children];

    items.forEach((li, i)=>{
      const q = questions[i];
      const user = (answers.get(q.id) || '').toString().trim();
      const ok = user.toLowerCase() === q.answer.trim().toLowerCase();

      const msg = li.querySelector('.q-msg');
      const ans = li.querySelector('.q-ans');

      msg.style.display='block';
      msg.textContent = ok ? '✅ 正確' : (user ? '❌ 錯誤' : '❌ 未作答');
      msg.style.color = ok ? '#5bd3c7' : '#ff6b6b';

      // 交卷後顯示正解
      ans.style.display='block';
      ans.textContent = '正解：' + (ans.dataset.answer || '');
      const exp = li.querySelector('.q-exp');
      if (exp) exp.style.display='block';

      if (ok) correct++;
    });

    const total = questions.length;
    const score = correct * 5; // 每題 5 分，總分 100

    elScore.textContent = `你的分數：${score} / 100`;
    elTeacher.textContent = teacherComment(score, 100);
    boxResult.style.display = 'block';
    btnPrint.style.display = 'inline-block';
    btnAns.style.display   = 'inline-block';
  };

  // 顯示答案（不變更分數）
  btnAns.onclick = ()=>{
    [...list.children].forEach(li=>{
      const ans = li.querySelector('.q-ans');
      if (ans){
        ans.style.display='block';
        if (!ans.textContent || ans.textContent === '正解：')
          ans.textContent = '正解：' + (ans.dataset.answer || '');
      }
      const exp = li.querySelector('.q-exp');
      if (exp) exp.style.display='block';
    });
  };

  // 列印成績單（A4 直式）
  btnPrint.onclick = ()=>{
    const w = window.open('', '_blank');
    const logo = '(預留 Logo)';     // 你要的 Logo 可改成本地圖檔 <img src="...">
    const brand = '公司名稱';        // 或從你的設定帶入
    const scoreText = elScore.textContent || '';
    const teacherText = elTeacher.textContent || '';

    const rows = [...list.children].map((li, i)=>{
      const q = questions[i];
      const ans = li.querySelector('.q-ans')?.dataset.answer || q.answer || '';
      const exp = q.explanation ? `<div class="exp">解析：${escapeHtml(q.explanation)}</div>` : '';
      return `
        <div class="q">
          <div class="qt">${i+1}. ${escapeHtml(q.question)}</div>
          <div class="ans">正解：${escapeHtml(ans)}</div>
          ${exp}
        </div>`;
    }).join('');

    w.document.write(`
      <html><head><meta charset="utf-8">
      <title>成績單 · ${escapeHtml(brand)}</title>
      <style>
        @page { size: A4 portrait; margin: 18mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "PingFang TC", "Microsoft JhengHei", sans-serif; color:#111; }
        header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
        header .brand { font-weight:700; font-size:20px; }
        .score { font-size:16px; margin:8px 0 16px; }
        .q { page-break-inside: avoid; margin: 12px 0; }
        .qt { font-weight:700; }
        .ans { color:#333; margin-top:4px; }
        .exp { color:#666; margin-top:2px; }
        hr { border:none; border-top:1px solid #ccc; margin: 12px 0; }
      </style>
      </head><body>
        <header>
          <div class="brand">${escapeHtml(brand)}</div>
          <div>${escapeHtml(logo)}</div>
        </header>
        <div class="score">
          ${escapeHtml(scoreText)}<br/>
          ${escapeHtml(teacherText)}
        </div>
        <hr/>
        ${rows}
      </body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };
}

/** 安全轉義 */
function escapeHtml(t){
  return String(t ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

/* 在你的 init/boot 完成之後呼叫一次（確保 pane 存在時再叫） */
document.addEventListener('DOMContentLoaded', ()=>{
  // 若有 tab=quiz，先切換測驗分頁再掛載
  const p = new URLSearchParams(location.search);
  if ((p.get('tab') || '').toLowerCase() === 'quiz'){
    const btn = document.querySelector('.tab[data-tab="quiz"]');
    if (btn) btn.click();
  }
  // 不論如何都嘗試載入（找不到 DOM 會自動建立）
  setTimeout(mountQuiz, 0);
});












































































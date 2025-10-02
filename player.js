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
/* ====== 從第 463 行以下換成這段（A/B/C 三套題庫）====== */

async function bootQuizTab() {
  // 1) 取 slug（與上面播放器一致）
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || 'mid-autumn';

  // 2) 取得測驗面板；若不存在就動態建立一個簡單面板
  const pane = document.querySelector('#pane-quiz') || (() => {
    const right = document.querySelector('.right') || document.body;
    const d = document.createElement('div');
    d.id = 'pane-quiz';
    right.prepend(d);
    return d;
  })();

  // 基礎樣式（避免換行）
  const ensureCss = () => {
    if (document.getElementById('quiz-css')) return;
    const s = document.createElement('style');
    s.id = 'quiz-css';
    s.textContent = `
      .quizTabs { display:flex; gap:8px; flex-wrap:nowrap; margin-bottom:10px; }
      .quizTabs .qtab { padding:8px 14px; border-radius:10px; background:#132033; color:#dbe7ff; cursor:pointer; white-space:nowrap; }
      .quizTabs .qtab.active { background:#244d7a; }
      .quizPanel { display:none; }
      .quizPanel.active { display:block; }
      .quiz-controls { display:flex; gap:8px; align-items:center; margin:8px 0 12px; }
      .quiz-controls .btn { padding:6px 10px; border-radius:8px; background:#1d2b45; color:#dbe7ff; cursor:pointer; border:0; }
      .quiz-controls .btn[disabled] { opacity:.55; cursor:not-allowed; }
      .q-item { border-bottom:1px solid #14243b; padding:12px 4px; }
      .q-title { font-weight:700; margin-bottom:6px; }
      .q-opt { display:flex; gap:10px; align-items:center; margin:6px 0; }
      .q-msg { font-size:13px; margin-top:6px; }
      .ok { color:#5bd3c7; }
      .bad { color:#ff6b6b; }
      .ans { color:#9fb3d9; font-size:13px; }
      .muted { color:#9fb3d9; font-size:13px; }
      @media print {
        body { background:#fff; color:#000; }
        .quizTabs, .quiz-controls { display:none !important; }
        .q-item { page-break-inside:avoid; }
      }
    `;
    document.head.appendChild(s);
  };
  ensureCss();

  // 3) 製作 A/B/C 分頁容器（若已存在就不重建）
  if (!pane.dataset.prepared) {
    pane.innerHTML = `
      <div class="quizTabs">
        <div class="qtab" data-set="A">測驗 A</div>
        <div class="qtab" data-set="B">測驗 B</div>
        <div class="qtab" data-set="C">測驗 C</div>
      </div>

      <div id="panelA" class="quizPanel">
        <div class="quiz-controls">
          <button class="btn" data-act="submit">交卷</button>
          <button class="btn" data-act="print" disabled>列印成績單</button>
          <button class="btn" data-act="reveal" disabled>顯示答案</button>
          <span class="muted" id="metaA">（載入中…）</span>
        </div>
        <ol id="listA" style="line-height:1.6"></ol>
      </div>

      <div id="panelB" class="quizPanel">
        <div class="quiz-controls">
          <button class="btn" data-act="submit">交卷</button>
          <button class="btn" data-act="print" disabled>列印成績單</button>
          <button class="btn" data-act="reveal" disabled>顯示答案</button>
          <span class="muted" id="metaB">（載入中…）</span>
        </div>
        <ol id="listB" style="line-height:1.6"></ol>
      </div>

      <div id="panelC" class="quizPanel">
        <div class="quiz-controls">
          <button class="btn" data-act="submit">交卷</button>
          <button class="btn" data-act="print" disabled>列印成績單</button>
          <button class="btn" data-act="reveal" disabled>顯示答案</button>
          <span class="muted" id="metaC">（載入中…）</span>
        </div>
        <ol id="listC" style="line-height:1.6"></ol>
      </div>
    `;
    pane.dataset.prepared = '1';
  }

  // 4) 小工具
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const asArr = v => Array.isArray(v) ? v : (v == null ? [] : [v]);
  const same = (a,b) => String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase();

  const normalize = (q,i) => ({
    id: i+1,
    type: (q.type || (q.options ? 'MCQ' : 'SA')).toUpperCase(),
    question: q.question || q.q || '',
    options: q.options || q.choices || [],
    answer: q.answer || q.ans || '',
    explanation: q.explanation || q.ex || ''
  });

  async function loadJson(url) {
    try { const r = await fetch(url, {cache:'no-store'}); if (r.ok) return await r.json(); }
    catch(e){ console.warn('[quiz] load fail:', url, e); }
    return null;
  }

  function renderSet(where, questions) {
    const list = $('#list'+where);
    const meta = $('#meta'+where);
    const panel = $('#panel'+where);
    if (!list || !meta || !panel) return;

    list.innerHTML = '';
    if (!questions || !questions.length) {
      meta.textContent = '⚠️ 查無題庫資料';
      return;
    }
    meta.textContent = `共 ${questions.length} 題（單選 / 簡答）`;

    // 每題渲染
    questions.forEach(q => {
      const li = document.createElement('li');
      li.className = 'q-item';
      li.dataset.qid = q.id;

      // 共同：題幹
      const title = `<div class="q-title">${esc(q.question)}</div>`;
      let body = '';

      if (q.type === 'MCQ') {
        body = q.options.map((opt,j)=>`
          <label class="q-opt">
            <input type="radio" name="q${q.id}-${where}" value="${esc(opt)}">
            <span>${esc(opt)}</span>
          </label>
        `).join('');
      } else {
        body = `
          <div class="q-opt">
            <input type="text" class="ipt" placeholder="輸入答案…" style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:220px">
            <button class="btn" data-act="check">檢查</button>
          </div>
        `;
      }

      li.innerHTML = `
        ${title}
        <div class="q-body">${body}</div>
        <div class="q-msg"></div>
        <div class="ans"></div>
      `;
      list.appendChild(li);

      // 事件：單題判分
      if (q.type === 'MCQ') {
        $$(`input[type=radio][name="q${q.id}-${where}"]`, li).forEach(r=>{
          r.addEventListener('change', ()=>{
            const msg = $('.q-msg', li);
            const ansBox = $('.ans', li);
            if (same(r.value, q.answer)) {
              msg.textContent = '✅ 正確';
              msg.className = 'q-msg ok';
              ansBox.textContent = '';
            } else {
              msg.textContent = '❌ 錯誤';
              msg.className = 'q-msg bad';
              ansBox.textContent = `正解：${esc(q.answer)}`;
            }
          });
        });
      } else {
        $('.btn[data-act=check]', li).addEventListener('click', ()=>{
          const ipt = $('.ipt', li);
          const msg = $('.q-msg', li);
          const ansBox = $('.ans', li);
          const user = ipt.value;
          const ok = asArr(q.answer).some(a => same(a, user));
          if (ok) {
            msg.textContent = '✅ 正確';
            msg.className = 'q-msg ok';
            ansBox.textContent = '';
          } else {
            msg.textContent = '❌ 錯誤';
            msg.className = 'q-msg bad';
            ansBox.textContent = `正解：${esc(asArr(q.answer)[0])}`;
          }
        });
      }
    });

    // 面板控制：交卷 / 顯示答案 / 列印
    const btnSubmit = $('.btn[data-act=submit]', panel);
    const btnReveal = $('.btn[data-act=reveal]', panel);
    const btnPrint  = $('.btn[data-act=print]',  panel);

    btnSubmit.onclick = ()=>{
      let score = 0;
      const per = 100 / questions.length;

      questions.forEach(q=>{
        const li = list.querySelector(`.q-item[data-qid="${q.id}"]`);
        if (!li) return;

        if (q.type === 'MCQ') {
          const checked = li.querySelector('input[type=radio]:checked');
          if (checked && same(checked.value, q.answer)) score += per;
          if (!checked) { // 未答視為錯
            const msg = $('.q-msg', li);
            const ansBox = $('.ans', li);
            msg.textContent = '❌ 未作答';
            msg.className = 'q-msg bad';
            ansBox.textContent = `正解：${esc(q.answer)}`;
          }
        } else {
          const ipt = li.querySelector('.ipt');
          const val = ipt?.value ?? '';
          const ok = asArr(q.answer).some(a=>same(a,val));
          if (ok) score += per;
          if (!val) {
            const msg = $('.q-msg', li);
            const ansBox = $('.ans', li);
            msg.textContent = '❌ 未作答';
            msg.className = 'q-msg bad';
            ansBox.textContent = `正解：${esc(asArr(q.answer)[0])}`;
          }
        }
      });

      score = Math.round(score);
      // 評語（>=60 正向，否則建設性）
      const remarksGood = [
        '滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼 🎉',
        '很棒！觀念紮實，繼續保持！',
        '進步明顯，細節再更穩就完美了！',
        '做得很好，錯的部分回到影片片段再看一次試試！',
        '越來越熟練了，再接再厲！'
      ];
      const remarksBad = [
        '別灰心，先把題目關鍵字劃線，再回影片定位比對一次！',
        '建議先做單字練習頁，再回來挑戰會更穩！',
        '可以先看解析再作答，下次一定更好！',
        '多利用「跟隨」＋「偏移」微調字幕位置，理解會更清楚！',
        '把易錯題記在小筆記，下次就不會再錯了！'
      ];
      const remark = score >= 60 ? remarksGood[Math.floor(Math.random()*remarksGood.length)]
                                 : remarksBad[Math.floor(Math.random()*remarksBad.length)];

      meta.innerHTML = `你的分數：<b>${score}</b> / 100　<span class="muted">（${score>=60?'及格':'未及格'}）</span>　|　${remark}`;
      btnReveal.disabled = false;
      btnPrint.disabled  = false;
    };

    btnReveal.onclick = ()=>{
      questions.forEach(q=>{
        const li = list.querySelector(`.q-item[data-qid="${q.id}"]`);
        const ansBox = $('.ans', li);
        if (ansBox && !ansBox.textContent) ansBox.textContent = `正解：${esc(asArr(q.answer)[0])}`;
      });
    };

    btnPrint.onclick = ()=>{
      // 簡單版列印（A4 直式）
      const win = window.open('', '_blank');
      const html = `
        <html>
          <head>
            <meta charset="utf-8">
            <title>成績單 - 測驗 ${where}</title>
            <style>
              body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, "Microsoft JhengHei", sans-serif; padding:24px; }
              h1 { margin:0 0 12px; }
              .logo { height:28px; vertical-align:middle; margin-right:8px; }
              .muted { color:#555; }
              ol { padding-left:20px; }
              li { margin:10px 0; }
              .q { font-weight:700; }
              .a { color:#333; }
              .ex { color:#777; font-size:13px; }
            </style>
          </head>
          <body>
            <h1><img class="logo" src="" alt="">成績單（測驗 ${where}）</h1>
            <div class="muted">影片：${esc(slug)}　｜　列印時間：${new Date().toLocaleString()}</div>
            <hr>
            <ol>
              ${questions.map(q => `
                <li>
                  <div class="q">${esc(q.question)}</div>
                  <div class="a">正解：${esc(asArr(q.answer)[0])}</div>
                  ${q.explanation ? `<div class="ex">解析：${esc(q.explanation)}</div>`:''}
                </li>
              `).join('')}
            </ol>
            <script>window.print()</script>
          </body>
        </html>
      `;
      win.document.write(html);
      win.document.close();
    };
  }

  // 5) 載入三套題庫
  const map = {
    A: `./data/quizA-${slug}.json`,
    B: `./data/quizB-${slug}.json`,
    C: `./data/quizC-${slug}.json`,
  };

  const data = { A:null, B:null, C:null };

  // 分頁切換
  const qtabs = $$('.quizTabs .qtab', pane);
  const panels = { A: $('#panelA'), B: $('#panelB'), C: $('#panelC') };

  async function activate(which) {
    qtabs.forEach(t=>t.classList.toggle('active', t.dataset.set===which));
    Object.entries(panels).forEach(([k,p]) => p.classList.toggle('active', k===which));

    if (!data[which]) {
      const raw = await loadJson(map[which]);
      const arr = (raw||[]).map(normalize);
      data[which] = arr;
      renderSet(which, arr);
    }
  }

  qtabs.forEach(t=>t.onclick = ()=> activate(t.dataset.set));
  // 預設打開 A
  activate('A');
}

// 啟動（與你的主流程一致）
(async function bootQuizEntrypoint(){
  try { await bootQuizTab(); } catch(err){ console.error('[quiz] 載入失敗：', err); }
})();























































































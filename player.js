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
/* ==== QUIZ MODULE (drop-in / player.js only) ================================= */
(async function(){
  const $=(s,el=document)=>el.querySelector(s);

  // 依你的網址 ?slug=xxx
  const params=new URLSearchParams(location.search);
  const slug=params.get('slug')||'mid-autumn';

  // 1) 保障 DOM：在 #pane-quiz 裡動態建所需節點（不改你的 HTML 檔）
  function ensureQuizDOM(){
    const pane = $('#pane-quiz');
    if(!pane){ console.warn('[quiz] #pane-quiz not found'); return null; }

    // 若不存在就動態建立
    if(!$('#quizControls', pane)){
      const wrap = document.createElement('div');
      wrap.id = 'quizControls';
      wrap.style.cssText = 'padding:10px 14px;display:flex;gap:8px;align-items:center';
      wrap.innerHTML = `
        <button class="btn" id="btnSubmitQuiz">交卷</button>
        <button class="btn" id="btnPrintQuiz" style="display:none">列印題目</button>
        <button class="btn" id="btnShowAnswer" style="display:none">顯示答案</button>
        <span id="quizMeta" class="muted"></span>
      `;
      pane.appendChild(wrap);
    }
    if(!$('#quizResult', pane)){
      const res = document.createElement('div');
      res.id = 'quizResult';
      res.style.cssText = 'display:none;padding:0 14px 10px;color:#9fb3d9';
      res.innerHTML = `
        <div id="quizScore" style="font-weight:700;color:#e7eaf3"></div>
        <div id="quizComment"></div>
      `;
      pane.appendChild(res);
    }
    if(!$('#quizList', pane)){
      const ol = document.createElement('ol');
      ol.id = 'quizList';
      ol.style.cssText = 'line-height:1.6;padding:0 14px 14px';
      pane.appendChild(ol);
    }
    return pane;
  }

  // 2) 資料正規化：容忍 q/choices/ans 與 question/options/answer 命名差異
  function normalizeQuestion(q, idx){
    const type = (q.type||'').toUpperCase();
    const isMCQ = type==='MCQ' || Array.isArray(q.options||q.choices);
    return {
      id: idx+1,
      type: isMCQ ? 'MCQ' : 'SA',
      question: q.question ?? q.q ?? '',
      options: (q.options ?? q.choices ?? []).map(String),
      answer: String(q.answer ?? q.ans ?? ''),
      explanation: q.explanation ?? q.ex ?? ''
    };
  }

  async function loadQuiz(slug){
    try{
      const r = await fetch(`./data/quiz-${slug}.json`, {cache:'no-store'});
      if(!r.ok) throw new Error(r.status);
      const raw = await r.json();
      return (raw||[]).map(normalizeQuestion);
    }catch(err){
      console.error('[quiz] load failed:', err);
      return [];
    }
  }

  // 3) 渲染＋互動
  function renderQuiz(questions){
    const pane = ensureQuizDOM();
    if(!pane) return;

    const list = $('#quizList', pane);
    const meta = $('#quizMeta', pane);
    const btnSubmit = $('#btnSubmitQuiz', pane);
    const btnPrint  = $('#btnPrintQuiz', pane);
    const btnReveal = $('#btnShowAnswer', pane);
    const boxResult = $('#quizResult', pane);
    const scoreEl   = $('#quizScore', pane);
    const cmtEl     = $('#quizComment', pane);

    list.innerHTML = '';
    boxResult.style.display = 'none';
    btnPrint.style.display = 'none';
    btnReveal.style.display = 'none';
    meta.textContent = questions.length ? `（共 ${questions.length} 題）` : '⚠️ 查無測驗資料';

    // 使用者作答暫存
    const userAns = new Map(); // key: q.id, val: string
    let finished  = false;

    // 單題立即判斷：MCQ 選就判、SA 按檢查才判
    function judge(q, val, row){
      const correct = String(val).trim().toLowerCase() === q.answer.trim().toLowerCase();
      const msg = row.querySelector('.msg');
      msg.textContent = correct ? '✅ 正確' : '❌ 錯誤';
      msg.style.color = correct ? '#5bd3c7' : '#ff6b6b';
      return correct;
    }

    // 建每題
    questions.forEach(q=>{
      const li = document.createElement('li');
      li.style.cssText='border-bottom:1px solid #14243b;padding:12px 6px';
      li.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px">${q.id}. ${q.question}</div>
        <div class="options"></div>
        ${q.explanation ? `<div class="ex muted" style="display:none;margin-top:6px">${q.explanation}</div>` : ''}
        <div class="msg" style="margin-top:6px"></div>
      `;
      const optBox = li.querySelector('.options');

      if(q.type==='MCQ'){
        q.options.forEach(opt=>{
          const id = `q${q.id}-${btoa(opt).slice(0,6)}`;
          const line = document.createElement('div');
          line.style.cssText='display:flex;align-items:center;gap:8px;margin:4px 0';
          line.innerHTML = `
            <input type="radio" name="q${q.id}" id="${id}" value="${opt}">
            <label for="${id}" style="cursor:pointer">${opt}</label>
          `;
          line.querySelector('input').addEventListener('change', e=>{
            if(finished) return;
            userAns.set(q.id, e.target.value);
            judge(q, e.target.value, li);
          });
          optBox.appendChild(line);
        });
      }else{ // SA: 簡答
        const line = document.createElement('div');
        line.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';
        line.innerHTML = `
          <input type="text" style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:240px">
          <button class="btn btnCheck">檢查</button>
        `;
        const ipt  = line.querySelector('input');
        const btnC = line.querySelector('.btnCheck');
        btnC.addEventListener('click', ()=>{
          if(finished) return;
          userAns.set(q.id, ipt.value);
          judge(q, ipt.value, li);
        });
        optBox.appendChild(line);
      }

      list.appendChild(li);
    });

    // 交卷：算總分、顯示評語，並解鎖列印/顯示答案
    btnSubmit.onclick = ()=>{
      if(!questions.length) return;
      finished = true;

      let score = 0;
      questions.forEach(q=>{
        const row = list.children[q.id-1];
        const val = userAns.get(q.id) ?? '';
        if(judge(q, val, row)) score++;
        // 交卷後才顯示解析
        const ex = row.querySelector('.ex');
        if(ex) ex.style.display='block';
      });

      boxResult.style.display = 'block';
      scoreEl.textContent = `你的分數：${score} / ${questions.length}`;
      const ratio = score / Math.max(1,questions.length);
      cmtEl.textContent = ratio>=0.9 ? '太優秀了！' : ratio>=0.7 ? '很不錯，繼續加油！' : '再努力一下，下次更棒！';

      btnPrint.style.display  = 'inline-block';
      btnReveal.style.display = 'inline-block';
    };

    // 顯示答案（切換）
    btnReveal.onclick = ()=>{
      list.querySelectorAll('li').forEach((li,i)=>{
        const q = questions[i];
        const msg = li.querySelector('.msg');
        const line = document.createElement('div');
        line.className = 'ans';
        line.style.cssText='margin-top:4px;color:#9fb3d9';
        line.textContent = `正解：${q.answer}`;
        if(!li.querySelector('.ans')) li.appendChild(line);
      });
    };

    // 列印（單張 A4 直式）
    btnPrint.onclick = ()=>{
      const html = `
        <html><head>
        <meta charset="utf-8">
        <title>Quiz - ${slug}</title>
        <style>
          @page { size: A4 portrait; margin: 14mm; }
          body{ font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif; }
          h1{ margin:0 0 8px }
          ol{ padding-left: 20px }
          .q{ margin: 10px 0 6px; font-weight:700 }
          .a{ color:#1f6feb }
          .ex{ color:#666; font-size: 12px }
        </style>
        </head><body>
          <h1>測驗（${slug}）</h1>
          <div>得分：${$('#quizScore').textContent}</div>
          <div>${$('#quizComment').textContent}</div>
          <hr>
          <ol>
            ${questions.map(q=>`
              <li>
                <div class="q">${q.question}</div>
                <div>作答：${String(userAns.get(q.id)||'（未作答）')}</div>
                <div class="a">正解：${q.answer}</div>
                ${q.explanation?`<div class="ex">解析：${q.explanation}</div>`:''}
              </li>
            `).join('')}
          </ol>
        </body></html>`;
      const w = window.open('', '_blank');
      w.document.open(); w.document.write(html); w.document.close();
      w.focus(); w.print();
    };
  }

  // 4) 封裝：外部只需呼叫一次
  async function setupQuiz(slug){
    const pane = ensureQuizDOM();
    if(!pane) return;
    const qs = await loadQuiz(slug);
    renderQuiz(qs);
  }

  // 自動執行（不需要你改現有初始化）
  setupQuiz(slug).catch(console.error);
})();






















































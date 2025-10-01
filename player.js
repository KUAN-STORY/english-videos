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
/* -------------------------- QUIZ (auto-mount, paste below L463) -------------------------- */
(() => {
  const $ = (s, el = document) => el.querySelector(s);

  // 找到測驗分頁；若沒有就不啟動
  const paneQuiz = $('#pane-quiz');
  if (!paneQuiz) { console.warn('[quiz] #pane-quiz not found — skip quiz'); return; }

  // 若測驗容器不存在，動態建立（不改 HTML 也能跑）
  if (!paneQuiz.querySelector('#quizList')) {
    paneQuiz.innerHTML = `
      <div id="quiz-controls" style="margin:8px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <button class="btn" id="btnSubmitQuiz">交卷</button>
        <button class="btn" id="btnPrintQuiz"  style="display:none">列印成績單</button>
        <button class="btn" id="btnShowAnswer" style="display:none">顯示答案</button>
        <span id="quizMeta" class="muted" style="color:#9fb3ff"></span>
      </div>
      <div id="quizResult" style="display:none; margin:8px 0; padding:10px; border:1px solid #1e293b; background:#0f1a33; border-radius:10px;">
        <div id="quizScore" style="font-weight:700; margin-bottom:4px;"></div>
        <div id="quizComment" class="muted"></div>
      </div>
      <ol id="quizList" style="line-height:1.6;"></ol>
    `;
  }

  const listEl       = $('#quizList', paneQuiz);
  const submitBtn    = $('#btnSubmitQuiz', paneQuiz);
  const printBtn     = $('#btnPrintQuiz', paneQuiz);
  const showAnsBtn   = $('#btnShowAnswer', paneQuiz);
  const metaEl       = $('#quizMeta', paneQuiz);
  const resultWrap   = $('#quizResult', paneQuiz);
  const scoreEl      = $('#quizScore', paneQuiz);
  const commentEl    = $('#quizComment', paneQuiz);
  if (!listEl) { console.warn('[quiz] #quizList not found'); return; }

  // ---------- 工具：更強的語意比對（忽略標點、大小寫、彎引號等） ----------
  const norm = (t) => String(t ?? '')
    .normalize('NFKC')                       // 全半形/相近字元正規化
    .replace(/[’`]/g, "'")                   // 彎引號→直引號
    .toLowerCase()
    .replace(/[\u2000-\u206F]/g, '')         // 一般標點
    .replace(/[.,!?;:()"\[\]{}<>]/g, '')     // 常見標點
    .replace(/\s+/g, ' ')                    // 多空白→單一空白
    .trim();
  const same = (a,b) => norm(a) === norm(b);
  const esc  = (t) => String(t ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // 評語：>=60 正向；<60 建設；100 分加貼圖文案
  const POS = [
    '表現很穩！再多練幾題會更快更準！',
    '觀念清楚、答題節奏棒極了！',
    '已具備良好理解力，繼續保持！',
    '邏輯清楚，細節再抓穩就是滿分！',
    '超讚表現！離滿分只差臨門一腳！'
  ];
  const CON = [
    '先別急，逐題檢視關鍵字，下一次會更好！',
    '把不熟的單字/線索圈起來，回放影片核對！',
    '題意理解偏差，建議先看例句再作答！',
    '再多讀一次文本、比對關鍵詞會更準！',
    '差一點就過關了，持續練習一定能達標！'
  ];

  // 統一題目鍵名
  const normalizeQ = (q,i) => ({
    id: i + 1,
    type: (q.type || (q.options ? 'MCQ' : 'SA')).toUpperCase(),
    question: q.question || q.q || '',
    options: q.options  || q.choices || [],
    answer:  q.answer   || q.ans     || '',
    explanation: q.explanation || q.ex || '',
    user: null
  });

  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';
  let QUESTIONS = [];

  async function loadQuiz() {
    try {
      const r = await fetch(`./data/quiz-${slug}.json`, { cache:'no-store' });
      if (!r.ok) throw 0;
      const raw = await r.json();
      QUESTIONS = (raw || []).map(normalizeQ);
      if (metaEl) metaEl.textContent = `共 ${QUESTIONS.length} 題（ 單選 / 簡答 ）`;
      renderQuiz();
    } catch {
      metaEl && (metaEl.textContent = '題庫載入失敗');
    }
  }

  function renderQuiz() {
    listEl.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
      const li = document.createElement('li');
      li.style.margin = '16px 0';
      li.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">${i+1}. ${esc(q.question)}</div>
        <div class="q-opts"></div>
        <div class="q-feedback" style="margin-top:6px;"></div>
        <div class="q-correct"  style="margin-top:2px;">
          <span class="muted">正解：</span><span class="ans"></span>
        </div>
        ${q.explanation ? `<div class="q-exp muted" style="margin-top:2px;">解析：${esc(q.explanation)}</div>` : '' }
      `;
      const opts     = li.querySelector('.q-opts');
      const fb       = li.querySelector('.q-feedback');
      const ansSpan  = li.querySelector('.q-correct .ans');

      const showOK = () => {
        fb.textContent = '✅ 正確';
        fb.style.color = '#34d399';
        ansSpan.textContent = q.answer;       // 同步顯示「正解」
      };
      const showNG = () => {
        fb.textContent = '❌ 錯誤';
        fb.style.color = '#f87171';
        ansSpan.textContent = q.answer;       // 同步顯示「正解」
      };

      if (q.type === 'MCQ') {
        q.options.forEach(opt => {
          const row = document.createElement('label');
          row.style.display = 'block';
          row.innerHTML = `<input type="radio" name="q${i}" style="margin-right:8px"> ${esc(opt)}`;
          const ipt = row.querySelector('input');
          ipt.addEventListener('change', () => {
            q.user = opt;
            same(q.user, q.answer) ? showOK() : showNG();
          });
          opts.appendChild(row);
        });
      } else {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
          <input class="ipt" type="text" placeholder="輸入答案…" 
                 style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:220px">
          <button class="btn check" style="margin-left:8px">檢查</button>
        `;
        const ipt = wrap.querySelector('.ipt');
        const chk = wrap.querySelector('.check');
        chk.addEventListener('click', () => {
          const val = ipt.value.trim();
          if (!val) { fb.textContent='請先作答'; fb.style.color='#fbbf24'; return; }
          q.user = val;
          same(q.user, q.answer) ? showOK() : showNG();
        });
        opts.appendChild(wrap);
      }

      listEl.appendChild(li);
    });
  }

  // 交卷：未作答 = 錯；分數 = 對/總題 * 100
  submitBtn?.addEventListener('click', () => {
    let correct = 0;
    QUESTIONS.forEach(q => { if (same(q.user, q.answer)) correct++; });
    const score = Math.round((correct / Math.max(QUESTIONS.length, 1)) * 100);

    let msg;
    if (score === 100) {
      msg = '🎉 滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼。';
    } else if (score >= 60) {
      msg = POS[Math.min(POS.length - 1, Math.floor((score - 60) / 10))];
    } else {
      msg = CON[Math.min(CON.length - 1, Math.floor((60 - score) / 10))];
    }

    resultWrap.style.display = 'block';
    scoreEl.textContent = `你的分數：${score} / 100`;
    commentEl.textContent = msg;

    // 交卷後保險：補齊所有題目的正解顯示
    [...listEl.querySelectorAll('.q-correct .ans')].forEach((el, idx) => {
      if (!el.textContent) el.textContent = QUESTIONS[idx].answer;
    });

    printBtn.style.display   = 'inline-block';
    showAnsBtn.style.display = 'inline-block';
  });

  // 顯示答案（補齊正解）
  showAnsBtn?.addEventListener('click', () => {
    [...listEl.querySelectorAll('.q-correct .ans')].forEach((el, idx) => {
      el.textContent = QUESTIONS[idx].answer;
    });
  });

  // 列印（A4 直式，保留 LOGO / 公司名稱佔位）
  printBtn?.addEventListener('click', () => {
    const win = window.open('', '_blank');
    const rows = QUESTIONS.map((q, i) => `
      <div style="margin:10px 0;">
        <div><b>${i+1}. ${esc(q.question)}</b></div>
        ${q.type==='MCQ' ? `<div style="margin:4px 0 6px 0;">
          ${q.options.map(o=>`<div style="margin-left:10px;">${esc(o)}</div>`).join('')}
        </div>` : ''}
        <div>你的作答：<u>${esc(q.user ?? '未作答')}</u></div>
        <div>正解：<b>${esc(q.answer)}</b></div>
        ${q.explanation ? `<div class="muted">解析：${esc(q.explanation)}</div>` : ''}
      </div>
    `).join('');

    win.document.write(`
      <html><head><meta charset="utf-8"><title>閱讀測驗成績單</title>
        <style>
          @page { size: A4 portrait; margin: 18mm; }
          body  { font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif; color:#111827; }
          h1    { margin:0 0 8px 0; font-size:20px; }
          .muted{ color:#6b7280; }
          .head { display:flex; justify-content:space-between; align-items:center;
                  border-bottom:1px solid #e5e7eb; padding-bottom:8px; margin-bottom:10px; }
          .logo { width:140px; height:40px; border:1px dashed #cbd5e1;
                  display:flex; align-items:center; justify-content:center; color:#94a3b8; }
          .corp { font-weight:700; }
        </style>
      </head><body>
        <div class="head">
          <div>
            <h1>閱讀測驗成績單</h1>
            <div class="muted">${new Date().toLocaleString()}</div>
            <div class="corp">（公司名稱）</div>
          </div>
          <div class="logo">LOGO</div>
        </div>
        ${rows}
        <script>window.onload = () => window.print()</script>
      </body></html>
    `);
    win.document.close();
  });

  loadQuiz();
})();
































































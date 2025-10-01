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
/* =========================
   QUIZ: mount UI + logic
   ========================= */

/** 小工具 */
const _qs  = (s, el=document) => el.querySelector(s);
const _qsa = (s, el=document) => [...el.querySelectorAll(s)];
const _esc = (t='') => String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

/** 規格統一（不同檔案格式也能吃） */
function normalizeQuestion(raw, idx) {
  // 支援 mcq / short(簡答)；也容忍 type: 'MCQ' / 'sa' / 'fib'
  const type = (raw.type || (raw.options ? 'mcq' : 'short')).toLowerCase();
  return {
    id: raw.id ?? (idx + 1),
    type: (type === 'mcq' || type === 'multiple' ? 'mcq' : 'short'),
    question: raw.question || raw.q || '',
    options: raw.options || raw.choices || [],
    answer: String(raw.answer ?? raw.ans ?? '').trim(),
    explanation: raw.explanation || raw.ex || ''
  };
}

/** 建 UI（不動你的 HTML；若 pane-quiz 裡沒有容器就自動補） */
function ensureQuizDOM() {
  let host = _qs('#pane-quiz');
  if (!host) {
    // 最保險：沒有 pane-quiz 也幫你生一個在畫面右側（不建議長期這樣用，但能救急）
    host = document.createElement('section');
    host.id = 'pane-quiz';
    host.className = 'pane';
    host.style.display = 'none';
    const sidebar = document.createElement('div');
    sidebar.appendChild(host);
    document.body.appendChild(sidebar);
  }
  // 若尚未放控件，建立一次即可
  if (!_qs('#quizList', host)) {
    host.innerHTML = `
      <div id="quizControls" style="display:flex;gap:10px;align-items:center;margin:8px 0">
        <button class="btn" id="btnSubmitQuiz">交卷</button>
        <button class="btn" id="btnToggleAnswers" style="display:none">顯示答案</button>
        <span id="quizMeta" style="color:#9fb3ff"></span>
      </div>
      <div id="quizHeader" class="muted" style="margin:6px 0">( 尚未載入 )</div>
      <ol id="quizList" style="line-height:1.6"></ol>
      <div id="quizResult" style="display:none;margin-top:10px;border-top:1px solid #173; padding-top:10px">
        <div id="quizScore" style="font-weight:700;margin-bottom:6px"></div>
        <div id="quizComment"></div>
      </div>
    `;
  }
  return {
    host,
    list: _qs('#quizList', host),
    header: _qs('#quizHeader', host),
    meta: _qs('#quizMeta', host),
    btnSubmit: _qs('#btnSubmitQuiz', host),
    btnToggle: _qs('#btnToggleAnswers', host),
    boxResult: _qs('#quizResult', host),
    boxScore: _qs('#quizScore', host),
    boxComment: _qs('#quizComment', host),
  };
}

/** 讀題庫（依 slug） */
async function loadQuizData(sg) {
  try {
    const r = await fetch(`./data/quiz-${sg}.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const raw = await r.json();
    return (raw || []).map(normalizeQuestion);
  } catch (e) {
    console.warn('[quiz] load error:', e);
    return [];
  }
}

/** 每題渲染 + 行為 */
function renderQuizList(listEl, questions) {
  listEl.innerHTML = '';
  questions.forEach((q, i) => {
    const li = document.createElement('li');
    li.style.margin = '16px 0';
    li.dataset.qid = q.id;

    // 共同：題幹 & 回饋區
    const title = `<div style="margin-bottom:8px">${_esc(q.question)}</div>`;
    const feedback = `
      <div class="quiz-feedback" style="margin-top:6px;min-height:20px">
        <span class="quiz-mark"></span>
        <div class="quiz-solution muted" style="margin-top:4px"></div>
      </div>`;

    if (q.type === 'mcq') {
      // 單選題
      const opts = q.options.map((opt, k) => {
        const id = `q${q.id}_${k}`;
        return `
          <label for="${id}" style="display:flex;gap:8px;align-items:center;margin:4px 0;cursor:pointer">
            <input type="radio" id="${id}" name="q${q.id}" value="${_esc(opt)}"/>
            <span>${_esc(opt)}</span>
          </label>`;
      }).join('');
      li.innerHTML = `${title}${opts}${feedback}`;
      // 事件：選了就判
      _qsa(`input[name="q${q.id}"]`, li).forEach(radio => {
        radio.addEventListener('change', () => {
          const val = radio.value.trim().toLowerCase();
          const ans = q.answer.trim().toLowerCase();
          const isOK = (val === ans);
          q.userAnswer = radio.value;
          q.isCorrect = !!isOK;
          paintFeedback(li, q, /*forceShowAnsWhenWrong*/true);
        });
      });
    } else {
      // 簡答題
      const inputId = `q${q.id}_input`;
      li.innerHTML = `
        ${title}
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="${inputId}" type="text" placeholder="輸入答案…" 
                 style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:260px"/>
          <button class="btn btnCheck" data-qid="${q.id}">檢查</button>
        </div>
        ${feedback}
      `;
      li.querySelector('.btnCheck').addEventListener('click', () => {
        const ipt = li.querySelector(`#${inputId}`);
        const val = (ipt.value || '').trim().toLowerCase();
        const ans = q.answer.trim().toLowerCase();
        q.userAnswer = ipt.value;
        q.isCorrect = !!(val && val === ans);
        paintFeedback(li, q, /*forceShowAnsWhenWrong*/true);
      });
    }
    listEl.appendChild(li);
  });
}

/** 呈現單題回饋 + 正解 */
function paintFeedback(li, q, forceShowAnsWhenWrong=false) {
  const mk = _qs('.quiz-mark', li);
  const sol = _qs('.quiz-solution', li);
  const ua = (q.userAnswer ?? '').trim();

  // 未作答
  if (!ua) {
    mk.textContent = '❌ 未作答';
    mk.style.color = '#ff6b6b';
    sol.textContent = '';
    return;
  }

  if (q.isCorrect) {
    mk.textContent = '✅ 正確';
    mk.style.color = '#46e2c3';
    // 顯示正解（正確也可提示，方便列印/檢閱）
    sol.innerHTML = `正解：${_esc(q.answer)}${q.explanation ? `　<span style="color:#9fb3ff">${_esc(q.explanation)}</span>` : ''}`;
  } else {
    mk.textContent = '❌ 錯誤';
    mk.style.color = '#ff6b6b';
    if (forceShowAnsWhenWrong) {
      sol.innerHTML = `正解：${_esc(q.answer)}${q.explanation ? `　<span style="color:#9fb3ff">${_esc(q.explanation)}</span>` : ''}`;
    }
  }
}

/** 交卷計分 + 評語（滿分 100；未作答 = 錯） */
function gradeAndComment(questions) {
  const total = questions.length;
  const correct = questions.reduce((n, q) => n + (q.isCorrect ? 1 : 0), 0);
  // 有題目時才計算；每題同權重；四捨五入到整數
  const score = total ? Math.round((correct / total) * 100) : 0;

  // 評語（五組）
  let comment = '';
  if (score >= 100) {
    comment = '🌕 滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼！';
  } else if (score >= 80) {
    comment = '👍 很不錯！再努力一下就能滿分！';
  } else if (score >= 60) {
    comment = '🙂 恭喜及格，還有進步空間，加油！';
  } else if (score >= 40) {
    comment = '⚠️ 需要加強，建議重看影片與重作題目。';
  } else {
    comment = '💡 不要灰心，先看解析，再回去看影片，會更有感覺！';
  }

  return { score, correct, total, comment };
}

/** 顯示 / 隱藏 所有正解（交卷後才能按） */
function toggleAllSolutions(listEl, show) {
  _qsa('li', listEl).forEach(li => {
    const mk  = _qs('.quiz-mark', li);
    const sol = _qs('.quiz-solution', li);
    if (show) {
      // 若還沒作答或答錯 → 也要把正解補上（避免沒有顯示）
      const qid = Number(li.dataset.qid || 0);
      // 安全：找不到對應題也略過
      const q = window.__QUIZ_STATE?.questions.find(x => Number(x.id) === qid);
      if (q) {
        if (!q.userAnswer || !q.isCorrect) {
          mk.textContent = q.userAnswer ? '❌ 錯誤' : '❌ 未作答';
          mk.style.color = '#ff6b6b';
          sol.innerHTML = `正解：${_esc(q.answer)}${q.explanation ? `　<span style="color:#9fb3ff">${_esc(q.explanation)}</span>` : ''}`;
        }
      }
      sol.style.display = '';
    } else {
      // 只把解析區隱藏，不動已經顯示的正確/錯誤圖示
      sol.style.display = 'none';
    }
  });
}

/** 啟動「測驗」分頁：建立 UI → 載題 → 綁定 */
async function bootQuizTab() {
  // 若你的程式已有 tabs 切換，這裡不干擾，只負責把 quiz 面板準備好
  const { host, list, header, meta, btnSubmit, btnToggle, boxResult, boxScore, boxComment } = ensureQuizDOM();

  // 載題
  header.textContent = '( 載入題目中… )';
  const qs = await loadQuizData(slug);  // ← 這裡用了你前面已存在的 slug
  window.__QUIZ_STATE = { questions: qs, finished: false, showAnswers: false };

  if (!qs.length) {
    header.textContent = '⚠️ 查無題目資料';
    list.innerHTML = '';
    btnSubmit.style.display = 'none';
    btnToggle.style.display = 'none';
    meta.textContent = '';
    return;
  }

  header.textContent = `共 ${qs.length} 題（單選 / 簡答）`;
  meta.textContent = '';

  // 畫題目
  renderQuizList(list, qs);

  // 綁定交卷
  btnSubmit.style.display = 'inline-block';
  btnSubmit.onclick = () => {
    // 將未作答的題目標記（未作答 = 錯）
    _qsa('li', list).forEach(li => {
      const qid = Number(li.dataset.qid || 0);
      const q = qs.find(x => Number(x.id) === qid);
      if (!q) return;

      if (q.type === 'mcq') {
        const chosen = _qs(`input[name="q${q.id}"]:checked`, li);
        if (!chosen) {
          q.userAnswer = '';
          q.isCorrect  = false;
        }
      } else {
        if (!('userAnswer' in q)) {
          q.userAnswer = '';
          q.isCorrect  = false;
        }
      }
      // 交卷時一併把正解顯示出來（未作答/答錯）
      paintFeedback(li, q, true);
    });

    const { score, correct, total, comment } = gradeAndComment(qs);
    boxResult.style.display = 'block';
    boxScore.textContent = `你的分數：${score} / 100　（答對 ${correct} / ${total} 題）`;
    boxComment.textContent = comment;

    // 交卷後才開放「顯示答案」切換
    btnToggle.style.display = 'inline-block';
    btnToggle.textContent = '顯示答案';
    window.__QUIZ_STATE.finished = true;
    window.__QUIZ_STATE.showAnswers = false;
    toggleAllSolutions(list, false);
  };

  // 顯示 / 隱藏所有答案
  btnToggle.onclick = () => {
    if (!window.__QUIZ_STATE.finished) return;
    window.__QUIZ_STATE.showAnswers = !window.__QUIZ_STATE.showAnswers;
    btnToggle.textContent = window.__QUIZ_STATE.showAnswers ? '隱藏答案' : '顯示答案';
    toggleAllSolutions(list, window.__QUIZ_STATE.showAnswers);
  };
}

/* 將測驗啟動掛到整體 boot 完成後（不影響你現有流程）
   如果你有自己的 initAll/boot，可以把這行搬到那些流程之後 */
try { bootQuizTab(); } catch (err) { console.warn('[quiz] boot error:', err); }
















































































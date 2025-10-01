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
 * QUIZ v2 — paste from here
 * ========================= */
const QUIZ_COMPANY_NAME = '（公司名稱 Company, Inc.）';
const QUIZ_LOGO_URL     = ''; // 例如 'https://example.com/logo.png'，不放就留空

// 將不同題庫欄位統一
function normalizeQuestion(q, idx) {
  const type = (q.type || (q.options ? 'MCQ' : 'SA')).toUpperCase(); // MCQ/SA
  return {
    id: idx + 1,
    type,                              // 'MCQ' | 'SA'
    question: q.question || q.q || '',
    options: q.options || q.choices || [],
    answer: String(q.answer ?? q.ans ?? ''),
    explanation: q.explanation || q.ex || ''
  };
}

async function loadQuiz(slug) {
  try {
    const r = await fetch(`./data/quiz-${slug}.json`, { cache: 'no-store' });
    if (!r.ok) return [];
    const raw = await r.json();
    return raw.map(normalizeQuestion);
  } catch {
    return [];
  }
}

// 內部狀態：每題的作答/是否檢查過/對錯
let quizState = []; // [{ userAnswer:'', checked:false, correct:false } ...]
let quizQuestions = [];

function renderQuiz(questions) {
  quizQuestions = questions || [];
  quizState = quizQuestions.map(() => ({ userAnswer: '', checked: false, correct: false }));

  const list = document.getElementById('quizList');
  if (!list) return;
  list.innerHTML = '';

  if (!quizQuestions.length) {
    list.innerHTML = '<li style="color:#9fb3d9">⚠️ 查無測驗資料</li>';
    return;
  }

  quizQuestions.forEach((q, i) => {
    const li = document.createElement('li');
    li.style.margin = '14px 0';
    li.style.lineHeight = '1.7';
    li.innerHTML = `
      <div style="font-weight:700;font-size:18px;margin-bottom:6px">${q.id}. ${esc(q.question)}</div>
      <div class="q-body"></div>
      <div class="q-actions" style="margin-top:8px">
        <button class="btn" data-act="check">檢查</button>
        <span class="q-msg" style="margin-left:10px"></span>
      </div>
      <div class="q-ex" style="margin-top:6px;color:#9fb3d9;display:none"></div>
    `;

    const body = li.querySelector('.q-body');

    if (q.type === 'MCQ') {
      // 單選題：radio + label
      q.options.forEach((opt, k) => {
        const id = `q${q.id}-opt${k}`;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.margin = '4px 0';
        row.innerHTML = `
          <input type="radio" name="q${q.id}" id="${id}" value="${esc(opt)}" style="accent-color:#5bd3c7">
          <label for="${id}" style="cursor:pointer">${esc(opt)}</label>
        `;
        row.querySelector('input').addEventListener('change', e => {
          quizState[i].userAnswer = e.target.value;
        });
        body.appendChild(row);
      });
    } else {
      // 簡答題：input + 檢查
      const ipt = document.createElement('input');
      ipt.type = 'text';
      ipt.placeholder = '請輸入答案…';
      ipt.style.cssText = 'padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:240px';
      ipt.addEventListener('input', e => {
        quizState[i].userAnswer = String(e.target.value || '').trim();
      });
      body.appendChild(ipt);
    }

    // 檢查按鈕
    li.querySelector('[data-act="check"]').addEventListener('click', () => {
      checkOne(i, li);
    });

    list.appendChild(li);
  });

  // 交卷
  const btnSubmit = document.getElementById('btnSubmitQuiz');
  const resBox    = document.getElementById('quizResult');
  const scoreEl   = document.getElementById('quizScore');
  const cmtEl     = document.getElementById('quizComment');
  const btnPrint  = document.getElementById('btnPrintQuiz');
  const btnShow   = document.getElementById('btnShowAnswer');

  if (btnSubmit) {
    btnSubmit.onclick = () => {
      // 所有題目都檢查（沒按檢查的也一併評分）
      const items = document.querySelectorAll('#quizList > li');
      quizQuestions.forEach((_, i) => checkOne(i, items[i], { silentIfUnchecked:false }));

      const total = quizQuestions.length;
      const got   = quizState.filter(s => s.correct).length;
      if (resBox) resBox.style.display = 'block';
      if (scoreEl) scoreEl.textContent = `你的分數：${got} / ${total}`;

      if (cmtEl) {
        const ratio = total ? (got / total) : 0;
        cmtEl.textContent = ratio >= 0.8 ? '太棒了！表現非常好！'
                          : ratio >= 0.6 ? '不錯喔，還可以更穩！'
                          : '再努力一下，下次會更好！';
      }

      // 交卷後才出現列印/顯示答案
      if (btnPrint) btnPrint.style.display = 'inline-block';
      if (btnShow)  btnShow.style.display  = 'inline-block';
    };
  }

  // 顯示所有答案（用於老師講解）
  if (btnShow) {
    btnShow.onclick = () => {
      const items = document.querySelectorAll('#quizList > li');
      quizQuestions.forEach((_, i) => revealAnswer(i, items[i]));
    };
  }

  // 列印（A4 直式 + LOGO/公司名）
  if (btnPrint) {
    btnPrint.onclick = () => printQuizA4();
  }
}

// 檢查單題；未作答就提示「請先作答」，不顯示正解
function checkOne(i, li, opt = { silentIfUnchecked:true }) {
  const q   = quizQuestions[i];
  const st  = quizState[i];
  const msg = li.querySelector('.q-msg');
  const ex  = li.querySelector('.q-ex');

  const user = (st.userAnswer ?? '').trim();
  if (!user) {
    if (!opt.silentIfUnchecked) {
      msg.textContent = '請先作答再檢查';
      msg.style.color = '#f59f00';
    }
    return;
  }

  // 評分（不分大小寫）
  const correct = user.toLowerCase() === String(q.answer).trim().toLowerCase();

  st.checked = true;
  st.correct = correct;

  if (correct) {
    msg.textContent = '✅ 正確';
    msg.style.color = '#5bd3c7';
    ex.style.display = q.explanation ? 'block' : 'none';
    ex.textContent = q.explanation ? `解析：${q.explanation}` : '';
  } else {
    // 錯誤：清楚顯示正解（文字）
    msg.textContent = '❌ 錯誤';
    msg.style.color = '#ff6b6b';
    ex.style.display = 'block';
    ex.textContent = `正解：${q.answer}${q.explanation ? `　｜　解析：${q.explanation}` : ''}`;
  }
}

// 顯示單題答案（不改對錯，只是展示）
function revealAnswer(i, li) {
  const q  = quizQuestions[i];
  const ex = li.querySelector('.q-ex');
  ex.style.display = 'block';
  ex.textContent = `正解：${q.answer}${q.explanation ? `　｜　解析：${q.explanation}` : ''}`;
}

// 列印成績單（A4 直式）
function printQuizA4() {
  const total = quizQuestions.length;
  const got   = quizState.filter(s => s.correct).length;

  const rows = quizQuestions.map((q, i) => {
    const st = quizState[i];
    const ua = (st.userAnswer ?? '').trim() ? esc(st.userAnswer) : '（未作答）';
    const ca = esc(q.answer);
    const ok = st.correct ? '✅' : '❌';
    const ex = q.explanation ? `<div class="ex">解析：${esc(q.explanation)}</div>` : '';
    return `
      <div class="q">
        <div class="qq"><span class="num">${q.id}.</span> ${esc(q.question)}</div>
        <div class="ans"><span class="tag">作答</span>${ua}　${ok}</div>
        <div class="ans"><span class="tag good">正解</span>${ca}</div>
        ${ex}
      </div>`;
  }).join('');

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>測驗成績單</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; color:#111; }
  .header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .logo{width:48px;height:48px;object-fit:contain}
  .title{font-size:18px;font-weight:700}
  .meta{margin-bottom:12px;color:#444}
  .score{font-weight:700}
  .q{page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:10px;margin:10px 0}
  .qq{font-weight:700;margin-bottom:6px}
  .num{margin-right:6px}
  .ans{margin:4px 0}
  .tag{display:inline-block;border:1px solid #999;border-radius:999px;padding:0 8px;margin-right:8px;font-size:12px}
  .tag.good{border-color:#0a7}
  .ex{color:#444}
</style>
</head>
<body>
  <div class="header">
    ${QUIZ_LOGO_URL ? `<img class="logo" src="${QUIZ_LOGO_URL}">` : `<div class="logo" style="border:1px dashed #bbb;border-radius:6px"></div>`}
    <div class="title">${QUIZ_COMPANY_NAME}</div>
  </div>
  <div class="meta">
    測驗日期：${new Date().toLocaleString()}　
    成績：<span class="score">${got} / ${total}</span>
  </div>
  ${rows}
  <script>window.print();</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.open();
  w.document.write(html);
  w.document.close();
}
/* =========================
 * end of QUIZ v2
 * ========================= */
























































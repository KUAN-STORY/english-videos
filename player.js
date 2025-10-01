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
   Quiz Module (paste here)
   ========================= */

// 小工具：安全轉文字
const _esc = (typeof esc === 'function')
  ? esc
  : (t)=>String(t ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

// 題目欄位正規化：兼容 quiz-houyi.json / quiz-lantern.json / quiz-mid-autumn.json
function normalizeQuestion(q, i){
  // 支援 {type, question, options, answer, explanation} 與 {q, choices, ans, ex}
  const type = (q.type || (q.options || q.choices ? 'MCQ' : 'SA')).toUpperCase();
  return {
    id: (q.id ?? (i+1)),
    type: (type === 'MCQ' || type === 'SA') ? type : 'MCQ',
    question: q.question || q.q || '',
    options: q.options || q.choices || [],
    answer: (q.answer ?? q.ans ?? '').toString(),
    explanation: q.explanation || q.ex || ''
  };
}

// 讀題庫
async function loadQuizJSON(slug){
  try{
    const r = await fetch(`./data/quiz-${slug}.json`, {cache:'no-store'});
    if(!r.ok) return [];
    const raw = await r.json();
    return (raw || []).map(normalizeQuestion);
  }catch(e){
    console.error('[quiz] load error:', e);
    return [];
  }
}

// 評語（>=60 正向；<60 建設性）｜滿分加強版
function getComment(score) {
  if (score >= 100) return '滿分！觀念清楚、細節到位，太強了！集滿 5 張滿分可兌換一組 LINE 表情貼 🎁';
  if (score >= 90)  return '很棒！只差一點點，檢查易混淆字或細節就完美。';
  if (score >= 80)  return '表現不錯！再複習幾個觀念會更穩。';
  if (score >= 70)  return '達到目標！建議回顧錯題並做延伸練習。';
  if (score >= 60)  return '及格！保持節奏，多做幾回加強速度與準確度。';

  if (score >= 50)  return '接近及格！先專注在錯題重點與關鍵字彙。';
  if (score >= 40)  return '需要加油：把影片前半重看一次並配合單字練習。';
  if (score >= 30)  return '基礎待補：建議分段練習，每次 3–5 題累積熟悉度。';
  if (score >= 20)  return '建議從「字幕」分頁同步看/聽，再回來做題會更有感。';
  return '別氣餒！從單字與例句開始暖身，下一次一定更好。';
}

// 給單題畫面打勾打叉，必要時顯示正解
function markQuestion(li, ok, answer, forceShowAns=false){
  li.dataset.done = '1';
  li.dataset.correct = ok ? '1' : '0';

  const msg = li.querySelector('.q-msg');
  if(!msg) return;

  if(ok){
    msg.innerHTML = '✅ 正確';
    msg.style.color = '#5bd3c7';
    // 正確不顯示正解內容
    const ansLine = li.querySelector('.q-ans');
    if(ansLine) ansLine.textContent = '正解：';
  }else{
    msg.innerHTML = '❌ 錯誤';
    msg.style.color = '#ff6b6b';
    // 錯誤要顯示正解
    const ansLine = li.querySelector('.q-ans');
    if(ansLine) ansLine.textContent = `正解： ${answer}`;
  }

  // 若是「顯示答案」模式，無論對錯都印正解
  if(forceShowAns){
    const ansLine = li.querySelector('.q-ans');
    if(ansLine) ansLine.textContent = `正解： ${answer}`;
  }
}

// 產生一題的 DOM
function createQuestionItem(q){
  const li = document.createElement('li');
  li.className = 'q-item';
  li.style.cssText = 'margin:14px 0;padding:14px 14px 10px;border:1px solid #182a44;background:#0f1a33;border-radius:10px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;margin-bottom:10px;';
  title.innerHTML = `${_esc(q.id)}. ${_esc(q.question)}`;
  li.appendChild(title);

  const body = document.createElement('div');
  li.appendChild(body);

  if(q.type === 'MCQ'){
    q.options.forEach((opt, idx)=>{
      const id = `q${q.id}_opt${idx}`;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;';
      row.innerHTML = `
        <input type="radio" name="q${q.id}" id="${id}" value="${_esc(opt)}" />
        <label for="${id}">${_esc(opt)}</label>
      `;
      body.appendChild(row);
    });
  }else{
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0;';
    wrap.innerHTML = `
      <input class="q-input" type="text" placeholder="輸入答案…" 
             style="flex:0 0 260px;padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff"/>
      <button class="btn q-check">檢查</button>
    `;
    body.appendChild(wrap);
  }

  const foot = document.createElement('div');
  foot.style.cssText = 'margin-top:8px;';
  foot.innerHTML = `
    <span class="q-msg"></span>
    <div class="q-ans" style="margin-top:6px;color:#9fb3d9">正解：</div>
    ${q.explanation ? `<div style="margin-top:6px;color:#9fb3d9">解析：${_esc(q.explanation)}</div>` : ''}
    ${q.type === 'MCQ' ? `<button class="btn q-check" style="margin-top:8px">檢查</button>` : ''}
  `;
  li.appendChild(foot);

  // 綁定「檢查」：只有按了才判定
  li.addEventListener('click', (e)=>{
    if(!e.target.matches('.q-check')) return;

    let userAns = '';
    if(q.type === 'MCQ'){
      const checked = li.querySelector('input[type=radio]:checked');
      userAns = checked ? checked.value : '';
    }else{
      const ipt = li.querySelector('.q-input');
      userAns = ipt ? ipt.value.trim() : '';
    }
    const ok = userAns !== '' && userAns.toLowerCase() === String(q.answer).trim().toLowerCase();
    markQuestion(li, ok, q.answer);
  });

  return li;
}

// 渲染整個測驗（搭配你頁面上的 quiz 容器）
async function renderQuizV2(slug){
  const list   = document.getElementById('quizList');
  const meta   = document.getElementById('quizMeta') || document.getElementById('quizStatus');
  const btnSubmit = document.getElementById('btnSubmitQuiz');
  const btnPrint  = document.getElementById('btnPrintQuiz');
  const btnShowAns= document.getElementById('btnShowAnswer');

  if(!list){ console.warn('[quiz] #quizList not found'); return; }

  // 初始狀態
  list.innerHTML = '';
  if(meta) meta.textContent = '題目載入中…';
  if(btnPrint)  btnPrint.style.display = 'none';
  if(btnShowAns)btnShowAns.style.display = 'none';

  const questions = await loadQuizJSON(slug);
  if(!questions.length){
    if(meta) meta.textContent = '⚠️ 查無測驗資料';
    return;
  }
  if(meta) meta.textContent = '';

  // 生成題目
  questions.forEach(q => list.appendChild(createQuestionItem(q)));

  // 交卷：統計分數（每題 5 分；封頂 100）、評語、滿分徽章
  if(btnSubmit){
    btnSubmit.onclick = () => {
      let correct = 0;
      const items = [...list.children];

      // 未作答視為錯，並印正解
      items.forEach((li, i) => {
        if(li.dataset.done !== '1'){
          const q = questions[i];
          markQuestion(li, false, q.answer, true);
        }
        if(li.dataset.correct === '1') correct += 1;
      });

      let score = correct * 5;
      if(score > 100) score = 100;

      // ★ 滿分徽章累積
      let fullCount = Number(localStorage.getItem('full_marks_count') || 0);
      if(score === 100){
        fullCount += 1;
        localStorage.setItem('full_marks_count', fullCount);
      }
      const badgeNote = (score === 100)
        ? `｜🎉 滿分徽章 ${Math.min(fullCount,5)}/5（集滿 5 張可兌換一組 LINE 表情貼）`
        : '';

      const comment = getComment(score);
      if(meta){
        meta.textContent = `已交卷：得分 ${score} / 100（正確 ${correct} / ${questions.length} 題）｜${comment}${badgeNote}`;
      }

      if(btnPrint)   btnPrint.style.display   = 'inline-block';
      if(btnShowAns) btnShowAns.style.display = 'inline-block';
    };
  }

  // 顯示答案：將每題強制展示正解
  if(btnShowAns){
    btnShowAns.onclick = ()=>{
      [...list.children].forEach((li, i)=>{
        const q = questions[i];
        markQuestion(li, li.dataset.correct === '1', q.answer, true);
      });
    };
  }

  // 列印：A4 直式（保留 LOGO 與公司名稱）
  if(btnPrint){
    btnPrint.onclick = ()=>{
      const LOGO = window.QUIZ_LOGO_URL || '';
      const COMPANY = window.QUIZ_COMPANY || 'Your Company';
      const rows = [...list.children].map((li,i)=>{
        const q = questions[i];
        const userAns = (()=>{
          if(q.type === 'MCQ'){
            const checked = li.querySelector('input[type=radio]:checked');
            return checked ? checked.value : '（未作答）';
          }else{
            const ipt = li.querySelector('.q-input');
            return ipt && ipt.value ? ipt.value : '（未作答）';
          }
        })();
        const ok = li.dataset.correct === '1';
        return `
          <tr>
            <td style="vertical-align:top;padding:8px 10px;border:1px solid #ccc;width:40px">${q.id}</td>
            <td style="vertical-align:top;padding:8px 10px;border:1px solid #ccc">${_esc(q.question)}</td>
            <td style="vertical-align:top;padding:8px 10px;border:1px solid #ccc">${_esc(userAns)}</td>
            <td style="vertical-align:top;padding:8px 10px;border:1px solid #ccc">${ok?'✔':'✘'}</td>
            <td style="vertical-align:top;padding:8px 10px;border:1px solid #ccc">${_esc(q.answer)}</td>
            <td style="vertical-align:top;padding:8px 10px;border:1px solid #ccc">${_esc(q.explanation||'')}</td>
          </tr>
        `;
      }).join('');

      const w = window.open('', '_blank');
      w.document.write(`
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>測驗成績單</title>
          <style>
            @page { size: A4 portrait; margin: 16mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, "PingFang TC", "Microsoft JhengHei", sans-serif; color:#111; }
            .header { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
            .header img { height:40px; }
            h1 { font-size:18px; margin:6px 0 2px; }
            .muted{ color:#666; font-size:12px; }
            table { border-collapse:collapse; width:100%; font-size:12px; }
            th,td{ border:1px solid #bbb; padding:8px 10px; vertical-align:top; }
            th { background:#f1f3f5; }
          </style>
        </head>
        <body>
          <div class="header">
            ${LOGO ? `<img src="${LOGO}" alt="logo"/>` : ''}
            <div>
              <h1>${COMPANY}｜測驗成績單</h1>
              <div class="muted">${new Date().toLocaleString()}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th><th>題目</th><th>作答</th><th>對錯</th><th>正解</th><th>解析</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <script>window.onload=()=>setTimeout(()=>window.print(),50)</script>
        </body>
        </html>
      `);
      w.document.close();
    };
  }
}

// 讓外層初始化完成後呼叫（沿用你現有的 slug 變數）
try{
  // 若你的程式裡已有 slug 變數，這行會使用同一個；否則退回 URL 參數
  const _slug = (typeof slug !== 'undefined' && slug) ? slug : (new URLSearchParams(location.search).get('slug')||'mid-autumn');
  renderQuizV2(_slug);
}catch(e){
  console.warn('[quiz] init later by renderQuizV2(slug)');
}


























































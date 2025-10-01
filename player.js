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
/* ----------------------- QUIZ (auto-mount, no HTML change) ----------------------- */
(function attachQuiz() {
  const host = document.querySelector('#pane-quiz');
  if (!host) return;                // 沒有「測驗」分頁就不做
  if (host.dataset.wired === '1') return;

  // 1) 動態建立整個測驗區塊（不改 player.html）
  host.innerHTML = `
    <div id="quizControls" style="display:flex;gap:10px;align-items:center;margin:8px 0 14px 0">
      <button id="btnSubmitQuiz" class="btn">交卷</button>
      <button id="btnPrintQuiz" class="btn" style="display:none">列印成績單</button>
      <button id="btnShowAnswer" class="btn" style="display:none">顯示答案</button>
      <span id="quizMeta" style="color:#9fb3ff"></span>
    </div>
    <div id="quizStatus" class="muted">( 尚未載入 )</div>
    <ol id="quizList" style="line-height:1.6;margin:0;padding-left:22px"></ol>
    <div id="quizResult" style="display:none;margin-top:12px;border-top:1px solid #23334f;padding-top:10px">
      <div id="quizScore" style="font-weight:700"></div>
      <div id="quizComment" style="margin-top:6px"></div>
    </div>
  `;
  host.dataset.wired = '1';

  // 2) 工具
  const $ = (sel, el = host) => el.querySelector(sel);
  const esc = (t) => String(t ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // 3) 將不同題庫欄位正規化
  const normalize = (q, i) => ({
    id: i + 1,
    type: (q.type || (q.options ? 'MCQ' : 'SA')).toUpperCase(), // MCQ 或 SA
    question: q.question || q.q || '',
    options: q.options || q.choices || [],
    answer: (q.answer ?? q.ans ?? '').toString().trim(),
    explanation: q.explanation || q.ex || ''
  });

  // 4) 依 URL slug 載入對應題庫
  const slug = new URLSearchParams(location.search).get('slug') || 'mid-autumn';
  let QUESTIONS = [];
  let answered = new Map(); // id -> { ok:boolean, given:string }

  (async function loadQuiz() {
    try {
      const res = await fetch(`./data/quiz-${slug}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.statusText);
      const raw = await res.json();
      QUESTIONS = (raw || []).map(normalize);
      $('#quizStatus').textContent = '';
      renderQuiz();
      $('#quizMeta').textContent = `共 ${QUESTIONS.length} 題（單選 / 簡答）`;
    } catch (e) {
      console.warn('[quiz] load error:', e);
      $('#quizStatus').textContent = '⚠️ 無法載入測驗題庫';
    }
  })();

  // 5) 渲染題目 / 綁定即時判題
  function renderQuiz() {
    const list = $('#quizList');
    list.innerHTML = '';
    if (!QUESTIONS.length) return;

    QUESTIONS.forEach(q => {
      const li = document.createElement('li');
      li.style.margin = '12px 0 18px';
      li.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px">${esc(q.question)}</div>
        <div class="qa"></div>
        <div class="feedback" style="margin-top:6px"></div>
        <div class="explain" style="margin-top:4px;color:#9fb3d9"></div>
      `;
      const qa = $('.qa', li);
      const fb = $('.feedback', li);
      const ex = $('.explain', li);

      if (q.type === 'MCQ') {
        q.options.forEach(opt => {
          const id = `q${q.id}-${Math.random().toString(36).slice(2,8)}`;
          const row = document.createElement('div');
          row.style.margin = '4px 0';
          row.innerHTML = `
            <label for="${id}" style="display:flex;gap:8px;align-items:center;cursor:pointer">
              <input id="${id}" type="radio" name="q-${q.id}" value="${esc(opt)}" />
              <span>${esc(opt)}</span>
            </label>
          `;
          row.querySelector('input').addEventListener('change', (ev) => {
            const val = ev.target.value.trim();
            const ok = val.toLowerCase() === q.answer.toLowerCase();
            answered.set(q.id, { ok, given: val });
            fb.innerHTML = ok
              ? `<span style="color:#5bd3c7">✅ 正確</span>`
              : `<span style="color:#ff6b6b">❌ 錯誤</span>`;
            ex.innerHTML = `正解：<b>${esc(q.answer)}</b>${q.explanation ? `　解析：${esc(q.explanation)}` : ''}`;
          });
          qa.appendChild(row);
        });
      } else { // SA：簡答
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.alignItems = 'center';
        wrap.innerHTML = `
          <input class="ipt" type="text" placeholder="在此作答…" 
                 style="flex:0 0 280px;padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff"/>
          <button class="btn chk">檢查</button>
        `;
        const ipt = $('.ipt', wrap);
        $('.chk', wrap).addEventListener('click', () => {
          const val = ipt.value.trim();
          if (!val) { fb.innerHTML = `<span class="muted">請先作答</span>`; return; }
          const ok = val.toLowerCase() === q.answer.toLowerCase();
          answered.set(q.id, { ok, given: val });
          fb.innerHTML = ok
            ? `<span style="color:#5bd3c7">✅ 正確</span>`
            : `<span style="color:#ff6b6b">❌ 錯誤</span>`;
          ex.innerHTML = `正解：<b>${esc(q.answer)}</b>${q.explanation ? `　解析：${esc(q.explanation)}` : ''}`;
        });
        qa.appendChild(wrap);
      }
      list.appendChild(li);
    });
  }

  // 6) 交卷 → 出分數 + 評語（滿分 100；一題 5 分；及格 60）
  $('#btnSubmitQuiz').addEventListener('click', () => {
    if (!QUESTIONS.length) return;
    // 未作答者視為錯
    let correct = 0;
    QUESTIONS.forEach(q => {
      const rec = answered.get(q.id);
      if (rec?.ok) correct++;
    });
    const score = correct * 5; // 每題 5 分
    const commentsPositive = [
      '表現非常亮眼，繼續保持！',
      '觀念扎實，細節再雕琢會更棒！',
      '解題流暢，值得讚賞！',
      '邏輯清晰，學習成效很穩定！',
      '幹得好！你正在建立很強的英文基礎！'
    ];
    const commentsConstructive = [
      '離目標不遠了，建議重看關鍵句型與單字。',
      '再多練幾題相似題型，熟能生巧！',
      '可把錯題整理一下，下次會更快掌握重點。',
      '先專注在易錯點，逐步拉高整體正確率。',
      '建議重播影片重點片段，搭配字幕再練一次。'
    ];
    const comment = score >= 100
      ? '💯 滿分！表現完美，連續拿滿五次可兌換 LINE 表情貼一組！'
      : (score >= 60
          ? commentsPositive[Math.floor(Math.random()*commentsPositive.length)]
          : commentsConstructive[Math.floor(Math.random()*commentsConstructive.length)]
        );

    $('#quizResult').style.display = 'block';
    $('#quizScore').textContent = `本次得分：${score} / 100（正確 ${correct}/${QUESTIONS.length} 題）`;
    $('#quizComment').textContent = comment;

    // 顯示列印 / 顯示答案
    $('#btnPrintQuiz').style.display = 'inline-block';
    $('#btnShowAnswer').style.display = 'inline-block';
  });

  // 7) 顯示答案（僅將所有題目的「正解」與解析展開，不改選取）
  $('#btnShowAnswer').addEventListener('click', () => {
    const rows = host.querySelectorAll('#quizList > li');
    rows.forEach((li, idx) => {
      const ex = li.querySelector('.explain');
      const q = QUESTIONS[idx];
      if (ex && q) {
        ex.innerHTML = `正解：<b>${esc(q.answer)}</b>${q.explanation ? `　解析：${esc(q.explanation)}` : ''}`;
      }
    });
  });

  // 8) 列印（A4 直式；標頭含 LOGO 佔位與公司名）
  $('#btnPrintQuiz').addEventListener('click', () => {
    const score = $('#quizScore')?.textContent || '';
    const comment = $('#quizComment')?.textContent || '';
    const html = `
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>成績單 - ${slug}</title>
        <style>
          @page { size: A4 portrait; margin: 14mm; }
          body { font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans TC",sans-serif; color:#111; }
          h1 { margin:0 0 8px 0; }
          .hdr{ display:flex;justify-content:space-between;align-items:center;margin-bottom:14px }
          .logo{ width:90px;height:90px;border:1px dashed #bbb;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px }
          .company{ font-size:14px;color:#333 }
          .score{ margin:10px 0 6px 0;font-size:16px;font-weight:700 }
          .comment{ margin-bottom:10px }
          ol{ padding-left:20px;margin:0 }
          li{ margin:10px 0 }
          .ans{ color:#0b6; }
          .exp{ color:#555; }
        </style>
      </head>
      <body>
        <div class="hdr">
          <div class="logo">LOGO</div>
          <div class="company">公司名稱 Company Name</div>
        </div>
        <h1>英語影片測驗成績單</h1>
        <div class="score">${esc(score)}</div>
        <div class="comment">${esc(comment)}</div>
        <hr/>
        <h2>題目與答案</h2>
        <ol>
          ${QUESTIONS.map((q,i)=>`
            <li>
              <div><b>${esc(q.question)}</b></div>
              <div class="ans">正解：${esc(q.answer)}</div>
              ${q.explanation ? `<div class="exp">解析：${esc(q.explanation)}</div>` : ``}
            </li>`).join('')}
        </ol>
      </body>
      </html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    // w.close(); // 若需列印後自動關閉可打開這行
  });
})();




























































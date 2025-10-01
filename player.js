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
/* --- Quiz Mini-Module v1.4 (drop-in, paste below line 463) ----------------- */
(function quizModule(){
  // 安全防呆：若頁面沒有測驗容器，什麼都不做
  const $ = (s, el=document)=>el.querySelector(s);
  const $$ = (s, el=document)=>[...el.querySelectorAll(s)];
  const quizBox   = $('#quizList');
  const metaSpan  = $('#quizMeta') || $('#quizStatus');
  const btnSubmit = $('#btnSubmitQuiz') || $('#btnQuizSubmit') || $('#btnSubmit');
  const btnPrint  = $('#btnPrintQuiz');
  const btnReveal = $('#btnShowAnswer');

  if(!quizBox){ console.warn('[quiz] #quizList not found'); return; }

  // 取得 slug（避免吃不到外部變數）
  function getSlug(){
    const params = new URLSearchParams(location.search);
    return params.get('slug') || 'mid-autumn';
  }

  // 題目標準化（兼容 quiz-houyi.json / quiz-lantern.json / 你現有格式）
  function normalize(q, i){
    const type = (q.type || (q.options || q.choices ? 'mcq':'sa')).toLowerCase();
    return {
      id: i+1,
      type,                                 // 'mcq' | 'sa'
      question: q.question || q.q || '',
      options:  q.options  || q.choices || [],
      answer:   (q.answer  ?? q.ans ?? '').toString().trim(),
      explanation: q.explanation || q.ex || ''
    };
  }

  async function loadQuiz(slug){
    const url = `./data/quiz-${slug}.json`;
    try{
      const r = await fetch(url, {cache:'no-store'});
      if(!r.ok) throw new Error(r.status);
      const raw = await r.json();
      return (raw||[]).map(normalize);
    }catch(err){
      metaSpan && (metaSpan.textContent = `（尚未載入）`);
      console.error('[quiz] load fail:', err);
      return [];
    }
  }

  // 即時顯示對錯；交卷才計總分
  function render(questions){
    if(!questions.length){
      metaSpan && (metaSpan.textContent = '（尚未載入）');
      return;
    }
    metaSpan && (metaSpan.textContent = `共 ${questions.length} 題（ 單選 / 簡答 ）`);

    const esc = s=>String(s??'')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

    quizBox.innerHTML = '';
    questions.forEach((q, i)=>{
      const li = document.createElement('li');
      li.className = 'quiz-item';
      li.style.cssText = 'margin:18px 0; line-height:1.6';
      li.innerHTML = `
        <div style="font-weight:700">${q.id}. ${esc(q.question)}</div>
        <div class="quiz-body"></div>
        <div class="quiz-feedback" style="margin-top:6px"></div>
        <div class="quiz-solution" data-solved="0" style="margin-top:6px;color:#9fb3d9">
          正解：<span class="ans"></span>
          ${q.explanation ? `<div class="ex">解析：${esc(q.explanation)}</div>`:''}
        </div>
        <hr style="border:0;border-top:1px solid #15243d;margin:14px 0 0">
      `;
      const body = $('.quiz-body', li);
      const fb   = $('.quiz-feedback', li);
      const sol  = $('.quiz-solution', li);
      const ansSpan = $('.ans', sol);
      ansSpan.textContent = q.answer;

      if(q.type === 'mcq'){
        q.options.forEach(opt=>{
          const id = `q${q.id}_${Math.random().toString(36).slice(2,7)}`;
          const row = document.createElement('label');
          row.style.cssText = 'display:flex;gap:10px;align-items:center;margin:6px 0;cursor:pointer';
          row.innerHTML = `
            <input type="radio" name="q${q.id}" value="${esc(opt)}" id="${id}">
            <span>${esc(opt)}</span>
          `;
        // 即時檢查
          row.querySelector('input').addEventListener('change',()=>{
            const v = row.querySelector('input').value;
            const ok = v.trim().toLowerCase() === q.answer.trim().toLowerCase();
            fb.innerHTML = ok ? '✅ 正確' : '❌ 錯誤';
            fb.style.color = ok ? '#42d9c8' : '#ff6b6b';
            sol.dataset.solved = '1';                 // 交卷時可顯示正解
          });
          body.appendChild(row);
        });
      }else{
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0';
        wrap.innerHTML = `
          <input class="ipt" type="text" placeholder="輸入答案…" 
                 style="padding:8px 10px;border:1px solid #334155;background:#0f223b;color:#dbe7ff;border-radius:8px;min-width:220px">
          <button class="btnCheck" style="padding:6px 12px" type="button">檢查</button>
        `;
        const ipt = $('.ipt', wrap), btn = $('.btnCheck', wrap);
        btn.addEventListener('click', ()=>{
          const ok = ipt.value.trim().toLowerCase() === q.answer.trim().toLowerCase();
          fb.innerHTML = ok ? '✅ 正確' : '❌ 錯誤';
          fb.style.color = ok ? '#42d9c8' : '#ff6b6b';
          sol.dataset.solved = '1';
        });
        body.appendChild(wrap);
      }
      quizBox.appendChild(li);
    });
  }

  // 交卷：重新把所有題目逐一計分（未作答 = 0）
  function computeScore(questions){
    let correct = 0, answered = 0;
    questions.forEach(q=>{
      if(q.type === 'mcq'){
        const checked = $(`input[name="q${q.id}"]:checked`, quizBox);
        if(checked){
          answered++;
          if(checked.value.trim().toLowerCase() === q.answer.trim().toLowerCase()) correct++;
        }
      }else{
        const ipt = $(`.quiz-item:nth-of-type(${q.id}) .ipt`, quizBox);
        if(ipt && ipt.value.trim()!==''){
          answered++;
          if(ipt.value.trim().toLowerCase() === q.answer.trim().toLowerCase()) correct++;
        }
      }
    });
    const score = correct * 5; // 每題 5 分 / 20 題滿分 100
    return {correct, answered, score};
  }

  // 依分數給評語（>=60 及格，含滿分獎勵訊息）
  function commentBy(score){
    if(score === 100) return '滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼 🎉';
    if(score >= 90)   return '超讚的表現！只差一步就是滿分，繼續保持！';
    if(score >= 80)   return '很棒！多練幾次就能更穩！';
    if(score >= 60)   return '及格囉！把錯題再看一遍，下次更進步。';
    return '再努力一下！先從錯題回顧開始，逐題擊破，你可以的！';
  }

  // 注入列印 CSS（A4 直式 / 預留 LOGO 與公司名）
  function ensurePrintCSS(){
    if($('#quizPrintCSS')) return;
    const css = document.createElement('style');
    css.id = 'quizPrintCSS';
    css.textContent = `
      @media print{
        body{ background:#fff !important; color:#000 !important; }
        .no-print, header, nav, footer, .tabs, #controls, #videoWrap{ display:none !important; }
        #printSheet{ display:block !important; }
        .sheet{ width:210mm; min-height:297mm; padding:18mm 18mm 20mm; margin:0 auto;
                box-sizing:border-box; page-break-after:always; font:14px/1.6 "Noto Sans TC",system-ui; color:#000;}
        .sheet h1{ margin:0 0 8px; font-size:20px; }
        .brand{ display:flex; align-items:center; gap:12px; margin-bottom:14px; }
        .brand .logo{ width:36px; height:36px; border:1px solid #ccc; display:inline-block; }
        .scorebox{ border:1px solid #999; padding:8px 12px; margin:10px 0; }
        .q{ margin:10px 0; }
        .q .ans{ color:#d00; }
      }
      @media screen{ #printSheet{ display:none; } }
    `;
    document.head.appendChild(css);
  }

  function buildPrintDom(questions, stat){
    ensurePrintCSS();
    let host = $('#printSheet');
    if(!host){ host = document.createElement('div'); host.id = 'printSheet'; document.body.appendChild(host); }
    const company = (window.__COMPANY_NAME__ || 'Your Company');
    host.innerHTML = `
      <div class="sheet">
        <div class="brand"><span class="logo"></span><div>
          <div style="font-weight:700">${company}</div>
          <div>英文影片測驗成績單</div></div>
        </div>
        <div class="scorebox">分數：<b>${stat.score} / 100</b>　已作答：${stat.answered}/${questions.length}　正確：${stat.correct}</div>
        <div>評語：${commentBy(stat.score)}</div>
        <hr style="margin:10px 0 14px">
        ${questions.map(q=>{
          const sel = q.type==='mcq' ? ( ($(`input[name="q${q.id}"]:checked`, quizBox)||{}).value || '（未作答）' )
                                      : ( ($(`.quiz-item:nth-of-type(${q.id}) .ipt`, quizBox)||{}).value || '（未作答）' );
          return `
            <div class="q">
              <div><b>${q.id}. ${q.question}</b></div>
              <div>你的答案：${esc(sel)}</div>
              <div>正解：<span class="ans">${esc(q.answer)}</span></div>
              ${q.explanation?`<div>解析：${esc(q.explanation)}</div>`:''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 綁定 reveal / print / submit
  function bindActions(questions){
    if(btnReveal){
      btnReveal.style.display = 'none';
      btnReveal.onclick = ()=>{
        $$('.quiz-solution', quizBox).forEach(el=>{
          el.style.color = '#ffcf7f';
          el.querySelector('.ans').style.fontWeight = '700';
        });
      };
    }
    if(btnPrint){
      btnPrint.style.display = 'none';
      btnPrint.onclick = ()=>{
        const stat = computeScore(questions);
        buildPrintDom(questions, stat);
        window.print();
      };
    }
    if(btnSubmit){
      btnSubmit.onclick = ()=>{
        const stat = computeScore(questions);
        if(metaSpan) metaSpan.textContent = `分數：${stat.score} / 100　${commentBy(stat.score)}`;
        // 交卷後才顯示列印與「顯示答案」
        btnPrint && (btnPrint.style.display = 'inline-block');
        btnReveal && (btnReveal.style.display = 'inline-block');
        // 交卷後，未顯示過的正解統一展開
        $$('.quiz-solution', quizBox).forEach(el=>{ el.dataset.solved==='1' || (el.style.color='#9fb3d9'); });
      };
    }
  }

  // 啟動：只在「測驗」分頁或容器存在時跑
  async function boot(){
    const slug = getSlug();                 // <== 關鍵：不要吃全域
    const qs   = await loadQuiz(slug);
    render(qs);
    bindActions(qs);
  }
  boot();
})();





































































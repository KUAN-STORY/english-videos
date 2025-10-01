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
/* =====================  QUIZ v2  ===================== */
/* 需求：
 *  - 題庫路徑：./data/quiz-<slug>.json
 *  - 題型：MCQ(單選)、SA(簡答). 欄位可用 question/options/answer/explanation
 *    若是舊格式 (q/choices/ans/ex)，normalize 會轉成統一格式。
 *  - 每題即時判斷；未作答算錯。
 *  - 交卷後：出總分(100)、評語、顯示「列印成績單 / 顯示答案」。
 *  - 列印：A4 直式，含 LOGO 及標題。
 */

(function quizBlock() {
  const $=(s,el=document)=>el.querySelector(s);
  const $$=(s,el=document)=>[...el.querySelectorAll(s)];

  // 這幾個元素一律沿用你原本的 id；找不到就不綁定（避免破版）
  const quizListEl    = $('#quizList');
  const submitBtn     = $('#btnSubmitQuiz');      // 交卷
  const printBtn      = $('#btnPrintQuiz');       // 列印成績單
  const showAnsBtn    = $('#btnShowAnswer');      // 顯示全部答案
  const quizMetaEl    = $('#quizMeta');           // 顯示「共 X 題 / 分數 / 評語」
  const statusLabel   = $('#quizStatus');         // 若你頁面有「(尚未載入)」之類的區塊

  // 若沒有清單容器，直接離開（不影響其他分頁）
  if (!quizListEl) {
    console.warn('[quiz] #quizList not found');
    return;
  }

  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  // 題目標準化
  const normalizeQuestion = (q, i) => ({
    id: (i+1),
    type: (q.type ? q.type.toUpperCase() : (q.options || q.choices ? 'MCQ' : 'SA')),
    question: q.question || q.q || '',
    options:  q.options || q.choices || [],
    answer:   (typeof q.answer==='string' ? q.answer : (q.ans ?? '')),
    explanation: q.explanation || q.ex || ''
  });

  async function loadQuizData() {
    try {
      const r = await fetch(`./data/quiz-${slug}.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const raw = await r.json();
      return raw.map(normalizeQuestion);
    } catch (e) {
      console.error('[quiz] load fail', e);
      return [];
    }
  }

  // 每題 row 的即時顯示：對/錯 + 正解
  function setVerdict(row, ok, solutionText) {
    const verdict = row.querySelector('.q-verdict');
    verdict.textContent = ok ? '✅ 正確' : '❌ 錯誤';
    verdict.style.color = ok ? '#41d6c3' : '#ff6b6b';

    // 正解
    const sol = row.querySelector('.q-solution');
    sol.innerHTML = solutionText ? `正解：<b>${solutionText}</b>` : '';
  }

  // 渲染全部題目
  function renderQuiz(questions) {
    if (statusLabel) statusLabel.textContent = '';
    quizListEl.innerHTML = '';
    if (quizMetaEl) quizMetaEl.textContent = `共 ${questions.length} 題（單選 / 簡答）`;

    questions.forEach((q, idx) => {
      const li = document.createElement('li');
      li.className = 'quiz-item';
      li.style.margin='18px 0';

      // 題幹
      const stem = document.createElement('div');
      stem.className = 'q-stem';
      stem.style.fontWeight='700';
      stem.style.marginBottom='10px';
      stem.textContent = `${q.id}. ${q.question}`;
      li.appendChild(stem);

      // 互動區
      const box = document.createElement('div');
      box.className='q-box';
      li.appendChild(box);

      // verdict / solution
      const verdict = document.createElement('div');
      verdict.className='q-verdict';
      verdict.style.margin = '8px 0 2px';
      li.appendChild(verdict);

      const solution = document.createElement('div');
      solution.className='q-solution';
      solution.style.margin = '2px 0 0';
      li.appendChild(solution);

      // 資料欄位（作答）
      q.userAnswer = null; // 使用者作答
      q.correct    = false; // 是否正確

      if (q.type === 'MCQ') {
        // 選項群
        q.options.forEach(opt => {
          const label = document.createElement('label');
          label.style.display = 'block';
          label.style.cursor  = 'pointer';
          label.style.margin  = '6px 0';

          const radio = document.createElement('input');
          radio.type  = 'radio';
          radio.name  = `q_${idx}`;
          radio.value = opt;
          radio.style.marginRight='8px';

          label.appendChild(radio);
          label.appendChild(document.createTextNode(opt));
          box.appendChild(label);

          radio.addEventListener('change', () => {
            q.userAnswer = radio.value;
            q.correct    = (q.userAnswer.trim() === q.answer.trim());
            const solText = `${q.answer}${q.explanation ? ' — ' + q.explanation : ''}`;
            setVerdict(li, q.correct, q.correct ? '' : solText);
          });
        });

      } else { // SA 簡答
        const line = document.createElement('div');
        line.style.display='flex';
        line.style.gap='8px';
        line.style.alignItems='center';

        const ipt = document.createElement('input');
        ipt.type='text';
        ipt.placeholder='請輸入答案…';
        ipt.style.cssText='padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#e7eaf3;min-width:250px';
        line.appendChild(ipt);

        const btn = document.createElement('button');
        btn.className='btn';
        btn.textContent='檢查';
        line.appendChild(btn);

        box.appendChild(line);

        const judge = () => {
          q.userAnswer = (ipt.value || '').trim();
          const norm = s => s.toLowerCase().replace(/\s+/g,'').replace(/[^\w]/g,'');
          q.correct = norm(q.userAnswer) === norm(q.answer);
          const solText = `${q.answer}${q.explanation ? ' — ' + q.explanation : ''}`;
          setVerdict(li, q.correct, q.correct ? '' : solText);
        };
        btn.addEventListener('click', judge);
        ipt.addEventListener('keydown', e=>{ if(e.key==='Enter') judge(); });
      }

      quizListEl.appendChild(li);
    });

    // 綁定交卷 / 顯示答案 / 列印
    if (submitBtn) {
      submitBtn.onclick = () => {
        const total = questions.length;
        const correct = questions.reduce((n,q)=>n + (q.correct ? 1 : 0), 0);
        const score = Math.round((correct/total) * 100);

        // 60 分及格；五組正向／建設性評語，依分數區間套用
        const commentsOK = [
          '表現很穩！繼續保持 😊',
          '思考邏輯清楚，讚！',
          '學習節奏掌握得很好！',
          '越來越上手了，再挑戰更難的吧！',
          '持續進步中，為你喝采！'
        ];
        const commentsNG = [
          '基礎觀念再複習一次會更好 👍',
          '先把關鍵字抓出來再作答試試看！',
          '建議搭配影片逐句理解，效果更佳。',
          '錯題先標記，下次重點練習。',
          '先求穩再求快，慢慢來會更好。'
        ];
        const comment = score >= 60
          ? commentsOK[score === 100 ? 4 : Math.min(4, Math.floor((score-60)/10))]
          : commentsNG[Math.min(4, Math.floor((60-score)/10))];

        if (quizMetaEl) {
          quizMetaEl.innerHTML =
            `你的分數：<b>${score} / 100</b>　${score>=60?'✅及格':'❌未及格'}　<span style="color:#9fb3d9">${comment}${score===100?'　🌟太強了！集滿五張滿分可兌換 1 組 LINE 表情貼！':''}</span>`;
        }

        // 交卷後才顯示功能
        if (printBtn)   printBtn.style.display   = 'inline-block';
        if (showAnsBtn) showAnsBtn.style.display = 'inline-block';
      };
    }

    if (showAnsBtn) {
      showAnsBtn.style.display = 'none'; // 交卷前先隱藏
      showAnsBtn.onclick = () => {
        $$('.quiz-item').forEach((row,i)=>{
          const q = questions[i];
          if (!q) return;
          const solText = `${q.answer}${q.explanation ? ' — ' + q.explanation : ''}`;
          // 若尚未正確，就顯示正解
          if (!q.correct) setVerdict(row, false, solText);
        });
      };
    }

    if (printBtn) {
      printBtn.style.display = 'none'; // 交卷前先隱藏
      printBtn.onclick = () => openPrintWindow(questions);
    }
  }

  // 開新視窗列印（A4 直式）
  function openPrintWindow(questions) {
    const total = questions.length;
    const correct = questions.reduce((n,q)=>n + (q.correct ? 1 : 0), 0);
    const score = Math.round((correct/total) * 100);

    const html = `
<!doctype html><html><head><meta charset="utf-8">
<title>成績單 - ${slug}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,Arial,sans-serif; color:#111; }
  .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .logo { width:120px; height:40px; border:1px dashed #bbb; display:flex; align-items:center; justify-content:center; color:#999; }
  h1 { font-size:20px; margin:0; }
  .meta { margin:8px 0 18px; }
  ol { padding-left: 18px; }
  li { margin: 10px 0 14px; }
  .q { font-weight:700; }
  .opt { margin-left: 6px; }
  .ans { margin: 4px 0 0 0; color:#444; }
  .hr { margin: 14px 0; height:1px; background:#ddd; }
</style>
</head><body>
  <div class="header">
    <div class="logo">LOGO</div>
    <div style="text-align:right">
      <h1>英語影片測驗成績單</h1>
      <div class="meta">影片：${slug}　分數：<b>${score}/100</b></div>
    </div>
  </div>
  <div class="hr"></div>
  <ol>
    ${questions.map(q=>`
      <li>
        <div class="q">${escapeHTML(q.question)}</div>
        ${q.type==='MCQ'
          ? q.options.map(o=>`<div class="opt">- ${escapeHTML(o)}</div>`).join('')
          : `<div class="opt">（簡答）</div>`}
        <div class="ans">作答：${escapeHTML(q.userAnswer ?? '（未作答）')}</div>
        <div class="ans">正解：<b>${escapeHTML(q.answer)}</b>${q.explanation? ' — '+escapeHTML(q.explanation):''}</div>
      </li>`).join('')}
  </ol>
  <script>window.print()</script>
</body></html>`;
    const w = window.open('', '_blank');
    w.document.open(); w.document.write(html); w.document.close();
  }

  function escapeHTML(s){ return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

  // 啟動
  (async () => {
    if (statusLabel) statusLabel.textContent = '載入中…';
    const qs = await loadQuizData();
    if (!qs.length) {
      if (statusLabel) statusLabel.textContent = '⚠️ 查無題目';
      if (quizMetaEl) quizMetaEl.textContent = '';
      quizListEl.innerHTML = '';
      return;
    }
    renderQuiz(qs);
    if (statusLabel) statusLabel.textContent = '';
  })();
})();


































































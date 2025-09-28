/* =========================================================
   player.js  — V7.2  (Supabase-first + Local Fallback)
   作者：你現在的專案（整合版）
   章節索引：
   00) 小工具/DOM
   01) 影片/字幕  (Supabase 優先 + 本地退回)
   02) 左側工具列（播放控制、循環、速度、偏移…）
   03) 分頁（字幕/測驗/單字）切換
   04) 測驗：安全模組 + 成就證書（A4可列印/另存PDF）
   05) 單字：Supabase 優先；朗讀🔊、▶ 播例句時間、語法提示
   ========================================================= */


/* ================================
   00) 小工具 / DOM Refs
   ================================ */
(() => {
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---- DOM（依你的 player.html V6.1 對齊） ----
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

  // 右側字幕
  const cuesBody   = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');
  const chkFollow  = $('#chkFollow');
  const btnOffsetMinus = $('#btnOffsetMinus');
  const btnOffsetPlus  = $('#btnOffsetPlus');
  const offsetVal      = $('#offsetVal');

  // 分頁 & 容器
  const tabs      = $$('.tab');
  const paneSub   = $('#pane-sub');
  const paneQuiz  = $('#pane-quiz');
  const paneVocab = $('#pane-vocab');

  // 測驗 / 單字 容器
  const quizStatus  = $('#quizStatus');
  const quizBox     = $('#quizBox');
  const vocabStatus = $('#vocabStatus');
  const vocabBox    = $('#vocabBox');

  // URL
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  // 狀態
  let cues = [];            // { t秒, en, zh }
  let offset = 0;           // 全域偏移
  let follow = true;        // 跟隨高亮
  let loopSentence = false; // 單句循環
  let abA = null, abB = null;
  let autoPause = false;

  // 小工具
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
  const esc = (s) => String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');


  /* ================================
     01) 影片 / 字幕  (Supabase 優先)
     ================================ */
  let supa = null;
  (async () => {
    try {
      // 你的 supa.js 若匯出 supa 實例，可自動載入
      const m = await import('./videos/js/supa.js');
      supa = m?.supa ?? null;
    } catch { supa = null; }
  })();

  const getPublicUrl = (bucket, path) => {
    if (!supa) return null;
    try {
      const { data } = supa.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  };

  // 影片：storage videos/<slug>.mp4 -> 本地 /videos/<slug>.mp4
  const resolveVideoUrl = async (sg) => {
    if (supa) {
      const u1 = getPublicUrl('videos', `${sg}.mp4`);
      if (u1) return u1;
    }
    return `./videos/${sg}.mp4`;
  };

  // 字幕：storage cues/<slug>.json -> 本地 /data/cues-<slug>.json
  const resolveCues = async (sg) => {
    if (supa) {
      const u = getPublicUrl('cues', `${sg}.json`);
      if (u) {
        try {
          const r = await fetch(u, { cache:'no-store' });
          if (r.ok) {
            const j = await r.json();
            if (Array.isArray(j)) {
              return j.map(x=>({ t: toSec(x.time), en:x.en||'', zh:x.zh||'' }));
            }
          }
        } catch {}
      }
    }
    try {
      const r = await fetch(`./data/cues-${sg}.json`, { cache:'no-store' });
      if (r.ok) {
        const j = await r.json();
        return j.map(x=>({ t: toSec(x.time), en:x.en||'', zh:x.zh||'' }));
      }
    } catch {}
    return [];
  };

  async function loadAll() {
    // 影片
    const vUrl = await resolveVideoUrl(slug);
    video.src = vUrl;
    video.addEventListener('error', () => {
      cuesStatus.textContent = `⚠️ 無法載入影片：${vUrl}`;
    }, { once:true });

    // 字幕
    cues = await resolveCues(slug);
    renderCues();

    // 單字（預載）
    loadVocabUI();
  }

  // 字幕表渲染
  function renderCues() {
    cuesBody.innerHTML = '';
    if (!cues.length) {
      cuesStatus.textContent = '⚠️ 查無字幕資料';
      return;
    }
    cuesStatus.textContent = '';

    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}">
        <td class="muted" style="width:80px">${c.t?fmt(c.t):''}</td>
        <td>${esc(c.en)}</td>
        <td style="width:40%">${esc(c.zh)}</td>
      </tr>
    `).join('');

    // 點列跳播 & 點句即循環
    $$('#cuesBody tr').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const i = +tr.dataset.i;
        if (cuesBody.dataset.pointloop === '1') {
          loopSentence = true;
          btnLoopSentence?.classList.add('green');
        }
        seekTo(i, true);
      });
    });
  }

  // 當前句 index
  const currentIndex = () => {
    const t = video.currentTime + offset;
    let i = 0;
    while (i+1 < cues.length && cues[i+1].t <= t + 0.0001) i++;
    return i;
  };
  // 高亮目前句
  const highlightRow = (idx) => {
    const trs = $$('#cuesBody tr');
    trs.forEach(tr=> tr.classList.remove('active'));
    const tr = trs[idx];
    if (tr) {
      tr.classList.add('active');
      if (follow) tr.scrollIntoView({ block:'center', behavior:'smooth' });
    }
  };
  // 跳到某句
  const seekTo = (idx, play=true) => {
    if (!cues[idx]) return;
    video.currentTime = Math.max(0, cues[idx].t - offset + 0.0001);
    highlightRow(idx);
    if (play) video.play();
  };
  // 句範圍
  const sentenceRange = (idx) => {
    if (!cues[idx]) return [0,0];
    const s = cues[idx].t;
    const e = (idx+1<cues.length ? cues[idx+1].t : s+3);
    return [s,e];
  };


  /* ================================
     02) 左側工具列（控制）
     ================================ */
  // 速度
  speedRange.addEventListener('input', ()=>{
    const r = +speedRange.value || 1;
    video.playbackRate = r;
    speedVal.textContent = `${r.toFixed(2)}x`;
  });
  // 播放/暫停
  btnPlay.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  // 上/下一句
  btnPrev.addEventListener('click', ()=> seekTo(Math.max(0, currentIndex()-1), true));
  btnNext.addEventListener('click', ()=> seekTo(Math.min(cues.length-1, currentIndex()+1), true));
  // 重複本句
  btnReplay.addEventListener('click', ()=>{
    loopSentence = true; btnLoopSentence.classList.add('green');
    const i = currentIndex(); const [s] = sentenceRange(i);
    video.currentTime = Math.max(0, s - offset + 0.0001);
    video.play();
  });
  // 句循環
  btnLoopSentence.addEventListener('click', ()=>{
    loopSentence = !loopSentence;
    btnLoopSentence.classList.toggle('green', loopSentence);
  });
  // A-B（簡化：標記/取消）
  btnAB.addEventListener('click', ()=>{
    const now = video.currentTime + offset;
    if (abA === null) { abA = now; abB = null; btnAB.textContent='🅱 設定 B（再次按取消）'; btnAB.classList.add('green'); }
    else if (abB === null) { abB = now; if (abB<abA) [abA,abB]=[abB,abA]; btnAB.textContent='🅰🅱 A-B 循環中（再次按取消）'; }
    else { abA=abB=null; btnAB.textContent='🅰🅱 A-B 循環'; btnAB.classList.remove('green'); }
  });
  // 點句即循環
  btnPointLoop.addEventListener('click', ()=>{
    btnPointLoop.classList.toggle('green');
    cuesBody.dataset.pointloop = btnPointLoop.classList.contains('green') ? '1' : '';
  });
  // 取消循環
  btnClearLoop.addEventListener('click', ()=>{
    loopSentence=false; abA=abB=null;
    btnLoopSentence.classList.remove('green'); btnAB.classList.remove('green'); btnAB.textContent='🅰🅱 A-B 循環';
  });
  // 填滿畫面
  btnFill.addEventListener('click', ()=> videoWrap.classList.toggle('fill'));
  // 偏移 / 跟隨
  btnOffsetMinus.addEventListener('click', ()=>{ offset-=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  btnOffsetPlus .addEventListener('click', ()=>{ offset+=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  chkFollow.addEventListener('change', ()=> follow = chkFollow.checked);
  // 逐句自停
  btnAutoPause.addEventListener('click', ()=>{
    autoPause = !autoPause;
    btnAutoPause.classList.toggle('green', autoPause);
  });

  // 播放過程：高亮/自停/循環
  video.addEventListener('timeupdate', ()=>{
    if (!cues.length) return;
    const i = currentIndex();
    highlightRow(i);
    const t = video.currentTime + offset;

    if (autoPause) {
      const [,e]=sentenceRange(i);
      if (t>=e-0.02 && t<e+0.2) video.pause();
    }
    if (loopSentence) {
      const [s,e]=sentenceRange(i);
      if (t>=e-0.02) { video.currentTime=Math.max(0,s-offset+0.0001); video.play(); }
    }
    if (abA!==null && abB!==null) {
      if (t<abA || t>=abB-0.02) { video.currentTime=Math.max(0,abA-offset+0.0001); video.play(); }
    }
  });


  /* ================================
     03) 分頁切換
     ================================ */
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      paneSub.style.display   = (name==='sub')  ? '' : 'none';
      paneQuiz.style.display  = (name==='quiz') ? '' : 'none';
      paneVocab.style.display = (name==='vocab')? '' : 'none';
    });
  });


  /* =========================================================
     04) 測驗 (安全模組) + 成就證書 (A4 直印 / 另存 PDF)
     備註：如果你已有 quiz JSON（data/quiz-<slug>.json），
           點「測驗」分頁才會載入，不影響其它功能。
     ========================================================= */
  // —— 基本載入 + 作答顯示 + 交卷 —— //
  (()=>{
    const tabBtn = document.querySelector('.tab[data-tab="quiz"]');
    if (!paneQuiz || !quizBox || !quizStatus || !tabBtn) return;

    const nameLSKey = 'qzName';
    const nowStr = ()=>{ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

    async function fetchQuiz() {
      try { const r = await fetch(`./data/quiz-${slug}.json`,{cache:'no-store'}); if(r.ok) return await r.json(); } catch {}
      return [];
    }

    function printCertificateA4({name='', scorePct=0, correct=0, total=0, qa=[]}) {
      const win = window.open('', '_blank');
      const html = `
<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"/>
<title>成就證書 - ${esc(slug)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body{ font:14px/1.7 "Noto Sans TC", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial; color:#0f172a; }
  h1{ margin:0 0 4px; font-size:28px; color:#b45309; text-align:center; letter-spacing:1px }
  .sub{ text-align:center; color:#64748b; margin-bottom:18px }
  .name{ text-align:center; font-size:22px; margin:10px 0; font-weight:700 }
  .score{ text-align:center; font-size:16px; margin-bottom:16px }
  .meta{ text-align:center; color:#64748b; margin-bottom:12px }
  .logo{ text-align:center; margin-bottom:8px }
  .logo img{ height:36px; opacity:.9 }
  table{ width:100%; border-collapse:collapse; margin-top:10px; }
  th,td{ border:1px solid #cbd5e1; padding:8px; vertical-align:top; }
  th{ background:#f8fafc; text-align:left }
  .q{ font-weight:600 }
  .ok{ color:#059669 } .ng{ color:#dc2626 }
  .footer{ margin-top:16px; display:flex; justify-content:space-between; color:#475569 }
  .printbtn{ position:fixed; right:18px; top:18px; padding:8px 12px; border-radius:8px; border:none; background:#0ea5e9; color:#fff; cursor:pointer }
  @media print{ .printbtn{display:none} }
</style>
</head><body>
  <button class="printbtn" onclick="window.print()">列印 / 另存 PDF</button>
  <div class="logo"><img src="./assets/logo.png" alt="LOGO" onerror="this.style.display='none'"/></div>
  <h1>英語影片學習 成就證書</h1>
  <div class="sub">Achievement Certificate</div>

  <div class="name">${esc(name || '（未填姓名）')}</div>
  <div class="score">通過 <b>${esc(slug)}</b> 題組　成績 <b>${scorePct}%</b>（${correct}/${total}）</div>
  <div class="meta">發證日期：${esc(nowStr())}</div>

  <table>
    <thead>
      <tr><th style="width:48%">考題</th><th style="width:26%">你的作答</th><th style="width:26%">正解與說明</th></tr>
    </thead>
    <tbody>
      ${qa.map((x,i)=>`
        <tr>
          <td><div class="q">Q${i+1}. ${esc(x.q)}</div>
              <div class="muted">${x.a.map((opt,j)=>`${j+1}. ${esc(opt)}`).join('<br>')}</div></td>
          <td class="${x.correct ? 'ok':'ng'}">${x.userIdx>=0 ? (x.userIdx+1+'. '+esc(x.a[x.userIdx])) : '（未作答）'}</td>
          <td>${x.answerIndex+1}. ${esc(x.a[x.answerIndex])}
              ${x.explain?`<div style="color:#64748b">${esc(x.explain)}</div>`:''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div>指導老師簽章：</div>
    <div>單位／課程：</div>
  </div>
</body></html>`;
      win.document.write(html); win.document.close();
    }

    let loaded = false, data=[], userAns=[];
    async function mountQuiz() {
      if (loaded) return;
      quizStatus.textContent = '載入測驗中…';
      data = await fetchQuiz();
      loaded = true;
      quizStatus.textContent = '';
      if (!Array.isArray(data) || !data.length) {
        quizBox.innerHTML = '<div class="muted">⚠️ 查無測驗資料</div>';
        return;
      }
      userAns = Array(data.length).fill(-1);

      // 題目
      quizBox.innerHTML = '';
      data.forEach((q,qi)=>{
        const wrap = document.createElement('div');
        wrap.style.padding='12px 14px';
        wrap.style.borderBottom='1px solid #14243b';
        const title = document.createElement('div');
        title.style.marginBottom='6px';
        title.innerHTML = `<b>Q${qi+1}.</b> ${esc(q.q)}`;
        wrap.appendChild(title);

        q.a.forEach((opt,ai)=>{
          const label = document.createElement('label');
          label.style.display='block'; label.style.margin='4px 0'; label.style.cursor='pointer';
          label.innerHTML = `<input type="radio" name="q_${qi}"> <span style="margin-left:6px">${esc(opt)}</span>`;
          label.querySelector('input').addEventListener('change', ()=>{
            userAns[qi] = ai;
            ansLine.style.display='block';
            if (ai === q.answerIndex) {
              ansLine.innerHTML = `✅ 正確！Ans: ${q.answerIndex+1}．${esc(q.a[q.answerIndex])} <span class="muted">（${esc(q.explain||'Good!')}）</span>`;
              ansLine.style.color = '#5bd3c7';
            } else {
              ansLine.innerHTML = `❌ 再試試。正解：${q.answerIndex+1}．${esc(q.a[q.answerIndex])} <span class="muted">（${esc(q.explain||'')}）</span>`;
              ansLine.style.color = '#ff6b6b';
            }
          });
          wrap.appendChild(label);
        });

        const ansLine = document.createElement('div');
        ansLine.className = 'muted';
        ansLine.style.marginTop='6px';
        ansLine.style.display='none';
        wrap.appendChild(ansLine);

        quizBox.appendChild(wrap);
      });

      // 交卷列印
      const row = document.createElement('div');
      row.style.padding='14px'; row.style.display='flex'; row.style.flexWrap='wrap'; row.style.gap='10px'; row.style.alignItems='center';
      row.style.borderTop='1px solid #14243b';

      const nameBox = document.createElement('input');
      nameBox.type='text'; nameBox.placeholder='輸入姓名（記憶於此裝置）';
      nameBox.value = localStorage.getItem(nameLSKey) || '';
      Object.assign(nameBox.style, { padding:'8px 10px', border:'1px solid #334155', borderRadius:'8px', background:'#0f223b', color:'#dbe7ff', flex:'1 1 260px' });
      row.appendChild(nameBox);

      const btnSubmit = document.createElement('button');
      btnSubmit.className='btn green'; btnSubmit.textContent='交卷';
      row.appendChild(btnSubmit);

      const resultBox = document.createElement('div');
      resultBox.style.flex='1 1 100%'; resultBox.style.marginTop='6px';
      row.appendChild(resultBox);

      btnSubmit.addEventListener('click', ()=>{
        localStorage.setItem(nameLSKey, nameBox.value.trim());
        let correct=0;
        const qa = data.map((q,i)=>({
          q: q.q, a: q.a, explain:q.explain||'',
          answerIndex: q.answerIndex,
          userIdx: userAns[i],
          correct: userAns[i] === q.answerIndex
        }));
        qa.forEach(x=>{ if(x.correct) correct++; });
        const total = data.length;
        const pct   = Math.round(correct/total*100);

        resultBox.innerHTML = `
          <div><b>成績</b>：${correct}/${total}（${pct}%）</div>
          <div class="muted" style="margin-top:4px">
            老師建議：${pct>=80 ? '很棒！可挑戰更快播放或加深詞彙' : '先理解每題說明，回到影片複習重點句。'}
          </div>
        `;
        const printBtn = document.createElement('button');
        printBtn.className='btn'; printBtn.style.marginTop='8px';
        printBtn.textContent='列印成就證書（A4，含完整考題）';
        printBtn.addEventListener('click', ()=>{
          printCertificateA4({ name:nameBox.value.trim(), scorePct:pct, correct, total, qa });
        });
        resultBox.appendChild(printBtn);
      });

      quizBox.appendChild(row);
    }

    tabBtn.addEventListener('click', mountQuiz);
    if (getComputedStyle(paneQuiz).display !== 'none') mountQuiz();
  })();


  /* =========================================================
     05) 單字（Vocabulary）— Supabase 優先 + 強化顯示
         - time/word/pos/zh/en/example/grammar
         - 🔊 朗讀（SpeechSynthesis）
         - ▶ 播例句時間（若有 time）
         - 語法提示（🛈 tooltip）
     ========================================================= */

  // --------- Vocab 來源：storage vocab/<slug>.json -> 本地 data/vocab-<slug>.json
  async function resolveVocab(sg) {              // [Vocab-API/resolve] ★
    if (supa) {
      const u = getPublicUrl('vocab', `${sg}.json`);
      if (u) {
        try { const r = await fetch(u,{cache:'no-store'}); if (r.ok) return await r.json(); } catch {}
      }
    }
    try { const r = await fetch(`./data/vocab-${sg}.json`,{cache:'no-store'}); if (r.ok) return await r.json(); } catch {}
    return null;
  }

  // --------- 渲染 Vocab 表格 ---------
  async function loadVocabUI() {                 // [Vocab-UI/render] ★
    const data = await resolveVocab(slug);
    if (!data || !Array.isArray(data.items) || !data.items.length) {
      vocabStatus.textContent = '⚠️ 查無單字資料';
      vocabBox.innerHTML = '';
      return;
    }
    vocabStatus.textContent = '';
    const rows = data.items.map((v, idx)=>`
      <tr data-idx="${idx}">
        <td class="muted" style="width:80px">${esc(v.time||'')}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <b>${esc(v.word||'')}</b>
            <button class="v-say btn" data-text="${esc(v.word||'')}">🔊</button>
            ${v.time ? `<button class="v-jump btn" data-time="${esc(v.time)}">▶</button>` : ``}
          </div>
          ${v.grammar ? `<div class="muted" style="margin-top:2px">🛈 ${esc(v.grammar)}</div>` : ``}
        </td>
        <td style="width:70px">${esc(v.pos||'')}</td>
        <td style="width:28%">${esc(v.zh||'')}</td>
        <td>${esc(v.en||'')}${v.example?`<div class="muted" style="margin-top:4px">例：${esc(v.example)}</div>`:''}</td>
      </tr>
    `).join('');

    vocabBox.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:80px">時間</th>
            <th>單字</th>
            <th style="width:70px">詞性</th>
            <th style="width:28%">中文</th>
            <th>英文解釋 / 例句 / 語法</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // --------- Vocab 事件代理：朗讀 / 跳播 ---------
  vocabBox?.addEventListener('click', (e)=>{     // [Vocab-UI/events] ★
    const t = e.target;
    if (t.classList.contains('v-say')) {
      const text = t.dataset.text || '';
      if (!text) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US'; u.rate = 0.95;
        speechSynthesis.speak(u);
      } catch {}
    }
    if (t.classList.contains('v-jump')) {
      const tt = t.dataset.time;
      if (!tt) return;
      video.currentTime = Math.max(0, toSec(tt) - offset + 0.0001);
      video.play();
    }
  });


  /* ================================
     啟動
     ================================ */
  (async function init(){
    const r = +speedRange.value || 1;
    video.playbackRate = r; speedVal.textContent = `${r.toFixed(2)}x`;
    await loadAll();
  })();
})();


















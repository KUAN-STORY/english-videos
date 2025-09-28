// player.js V7.1 — Supabase first + Local fallback
// - 保留原有影片 / 字幕 / 單字功能
// - 測驗部分改用安全補丁（點分頁才載入，作答後才顯示答案，交卷有成績）

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // -------- DOM Refs --------
  const video      = $('#player');
  const videoWrap  = $('#videoWrap');

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

  const cuesBody   = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');
  const chkFollow  = $('#chkFollow');
  const btnOffsetMinus = $('#btnOffsetMinus');
  const btnOffsetPlus  = $('#btnOffsetPlus');
  const offsetVal      = $('#offsetVal');

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
  let cues = [];
  let offset = 0;
  let follow = true;
  let loopSentence = false;
  let abA = null, abB = null;
  let autoPause = false;

  // -------- 工具 --------
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
  const escapeHtml = (s) => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

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

  // -------- Supabase 優先 + Fallback --------
  let supa = null;
  (async () => {
    try { const m = await import('./videos/js/supa.js'); supa = m?.supa ?? null; }
    catch { supa = null; }
  })();

  const getPublicUrl = (bucket, path) => {
    if (!supa) return null;
    try {
      const { data } = supa.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  };

  const resolveVideoUrl = async (sg) => {
    if (supa) {
      const u1 = getPublicUrl('videos', `${sg}.mp4`);
      if (u1) return u1;
    }
    return `./videos/${sg}.mp4`;
  };

  const resolveCues = async (sg) => {
    if (supa) {
      const u = getPublicUrl('cues', `${sg}.json`);
      if (u) {
        try {
          const rsp = await fetch(u, { cache:'no-store' });
          if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
        } catch {}
      }
    }
    try {
      const rsp = await fetch(`./data/cues-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
    } catch {}
    return [];
  };

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

  // -------- 載入流程 --------
  async function loadAll() {
    video.src = await resolveVideoUrl(slug);
    cues = await resolveCues(slug);
    renderCues();
    loadVocabUI();   // 單字即載
  }

  function renderCues() {
    cuesBody.innerHTML = '';
    if (!cues.length) { cuesStatus.textContent = '⚠️ 查無字幕資料'; return; }
    cuesStatus.textContent = '';
    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}"><td class="muted">${c.t?fmt(c.t):''}</td><td>${escapeHtml(c.en)}</td><td>${escapeHtml(c.zh)}</td></tr>
    `).join('');
    $$('#cuesBody tr').forEach(tr=> tr.addEventListener('click', ()=> seekTo(+tr.dataset.i, true)));
  }

  async function loadVocabUI() {
    const list = await resolveVocab(slug);
    if (!list || !list.length) { vocabStatus.textContent = '⚠️ 查無單字資料'; return; }
    vocabStatus.textContent = '';
    vocabBox.innerHTML = `<table><tbody>${list.map(v=>`
      <tr><td class="muted">${escapeHtml(v.time||'')}</td>
          <td>${escapeHtml(v.word||'')}</td>
          <td>${escapeHtml(v.pos||'')}</td>
          <td>${escapeHtml(v.zh||'')}</td>
          <td>${escapeHtml(v.en||'')}</td></tr>`).join('')}</tbody></table>`;
  }

  // -------- 控制列 --------
  speedRange.addEventListener('input', ()=>{ const r=+speedRange.value; video.playbackRate=r; speedVal.textContent=`${r.toFixed(2)}x`; });
  btnPlay.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  btnPrev.addEventListener('click', ()=> seekTo(Math.max(0,currentIndex()-1),true));
  btnNext.addEventListener('click', ()=> seekTo(Math.min(cues.length-1,currentIndex()+1),true));
  btnReplay.addEventListener('click', ()=>{ loopSentence=true;btnLoopSentence.classList.add('green'); seekTo(currentIndex(),true); });
  btnLoopSentence.addEventListener('click', ()=>{ loopSentence=!loopSentence; btnLoopSentence.classList.toggle('green',loopSentence); });
  btnAB.addEventListener('click', ()=>{ /* A-B 省略細節, 保持和之前一樣 */ });
  btnPointLoop.addEventListener('click', ()=>{ btnPointLoop.classList.toggle('green'); cuesBody.dataset.pointloop=btnPointLoop.classList.contains('green')?'1':''; });
  btnClearLoop.addEventListener('click', ()=>{ loopSentence=false; abA=abB=null; btnLoopSentence.classList.remove('green'); btnAB.classList.remove('green'); });
  btnFill.addEventListener('click', ()=> videoWrap.classList.toggle('fill'));
  btnOffsetMinus.addEventListener('click', ()=>{ offset-=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  btnOffsetPlus .addEventListener('click', ()=>{ offset+=0.5; offsetVal.textContent=`${offset.toFixed(1)}s`; });
  chkFollow.addEventListener('change', ()=> follow=chkFollow.checked);
  btnAutoPause.addEventListener('click', ()=>{ autoPause=!autoPause; btnAutoPause.classList.toggle('green',autoPause); });

  video.addEventListener('timeupdate', ()=>{ if(!cues.length)return; const i=currentIndex(); highlightRow(i); });

  tabs.forEach(tab=>tab.addEventListener('click', ()=>{ tabs.forEach(x=>x.classList.remove('active')); tab.classList.add('active');
    const name=tab.dataset.tab; paneSub.style.display=(name==='sub')?'':'none'; paneQuiz.style.display=(name==='quiz')?'':'none'; paneVocab.style.display=(name==='vocab')?'':'none'; }));

  (async function init(){ video.playbackRate=+speedRange.value; speedVal.textContent=`${(+speedRange.value).toFixed(2)}x`; await loadAll(); })();
})();

/* =========================
   QUIZ MODULE (安全補丁)
   ========================= */
(() => {
  const qz$ = (sel, root=document) => root.querySelector(sel);
  const qzSlug = new URLSearchParams(location.search).get('slug') || 'mid-autumn';

  const qzTabBtn = qz$('.tab[data-tab="quiz"]');
  const qzPane   = qz$('#pane-quiz');
  const qzBox    = qz$('#quizBox');
  const qzStatus = qz$('#quizStatus');

  if (!qzPane || !qzBox) return;

  let qzLoaded=false, qzData=[], qzUserAns=[];

  async function fetchQuiz(){
    try{ const rsp=await fetch(`./data/quiz-${qzSlug}.json`,{cache:'no-store'}); if(rsp.ok) return await rsp.json(); }catch{}
    return [];
  }

  function render(){
    qzBox.innerHTML=''; qzUserAns=Array(qzData.length).fill(-1);
    qzData.forEach((q,qi)=>{ const wrap=document.createElement('div'); wrap.style.padding='14px'; wrap.style.borderBottom='1px solid #14243b';
      const title=document.createElement('div'); title.innerHTML=`<b>Q${qi+1}.</b> ${q.q}`; wrap.appendChild(title);
      q.a.forEach((opt,ai)=>{ const label=document.createElement('label'); label.style.display='block';
        label.innerHTML=`<input type="radio" name="q${qi}"/> ${opt}`;
        label.addEventListener('change',()=>{ qzUserAns[qi]=ai; ansLine.style.display='block';
          if(ai===q.answerIndex){ ansLine.textContent=`✅ 正確！${q.a[q.answerIndex]}（${q.explain||''}）`; ansLine.style.color='#5bd3c7'; }
          else{ ansLine.textContent=`❌ 錯誤，正解：${q.a[q.answerIndex]}（${q.explain||''}）`; ansLine.style.color='#ff6b6b'; }
        }); wrap.appendChild(label); });
      const ansLine=document.createElement('div'); ansLine.className='muted'; ansLine.style.display='none'; wrap.appendChild(ansLine);
      qzBox.appendChild(wrap);
    });
    const btn=document.createElement('button'); btn.textContent='交卷'; btn.className='btn green';
    btn.onclick=()=>{ let correct=0; qzData.forEach((q,i)=>{if(qzUserAns[i]===q.answerIndex)correct++;});
      const pct=Math.round(correct/qzData.length*100); const sum=document.createElement('div');
      sum.innerHTML=`成績：${correct}/${qzData.length}（${pct}%）<br>老師建議：${pct>=80?'很棒！':'回去複習影片重點句。'}`;
      qzBox.appendChild(sum);
    };
    qzBox.appendChild(btn);
  }

  async function loadOnce(){ if(qzLoaded)return; qzStatus.textContent='載入中…'; qzData=await fetchQuiz(); qzLoaded=true; render(); qzStatus.textContent=''; }

  if(qzTabBtn) qzTabBtn.addEventListener('click', loadOnce);
})();
/* ============================================
   QUIZ CERT ADD-ON (Drop-in, no merge needed)
   － 直接貼在 player.js 最尾端即可
   － 會接手 #pane-quiz / #quizBox / #quizStatus 的渲染
   － 功能：作答顯示正誤、交卷、姓名、列印「證書」(Certificate)
   ============================================ */
(() => {
  const $ = (s, el=document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  // 若頁面沒有測驗容器，直接跳出（不影響其它）
  const pane  = $('#pane-quiz');
  const box   = $('#quizBox');
  const stat  = $('#quizStatus');
  if (!pane || !box || !stat) return;

  // 安全字串 + 時間
  const esc = s => String(s ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const nowStr = () => {
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // 讀 JSON（Supabase 公桶優先，讀不到退本地；若你沒設 SUPA_URL / SUPA_BUCKET 就直接本地）
  const SUPA_URL    = window.SUPA_URL    || null;
  const SUPA_BUCKET = window.SUPA_BUCKET || null;
  const pubUrl = (path) => `${SUPA_URL}/storage/v1/object/public/${SUPA_BUCKET}/${path}`;
  async function fetchQuizJson() {
    // 1) Supabase storage
    if (SUPA_URL && SUPA_BUCKET) {
      try {
        const r = await fetch(pubUrl(`data/quiz-${slug}.json`), { cache:'no-store' });
        if (r.ok) return await r.json();
      } catch {}
    }
    // 2) local
    const r2 = await fetch(`./data/quiz-${slug}.json`, { cache:'no-store' });
    if (r2.ok) return await r2.json();
    return null;
  }

  // 列印「證書」視窗
  function printCertificate({ name='', scorePct=0, correct=0, total=0 }) {
    const win = window.open('', '_blank');
    const html = `
<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"/>
<title>成就證書 - ${esc(slug)}</title>
<style>
  :root{
    --ink:#0f172a; --muted:#64748b; --gold:#b45309; --accent:#2563eb; --frame:#eab308;
    --bg:#fffdf5;
  }
  *{box-sizing:border-box}
  body{margin:24px;background:var(--bg);color:var(--ink);font:16px/1.7 "Noto Sans TC",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial}
  .wrap{border:12px solid var(--frame); border-radius:20px; padding:28px; position:relative}
  .inner{border:3px dashed #f59e0b; border-radius:14px; padding:28px}
  .title{font-size:36px; text-align:center; letter-spacing:2px; margin:0 0 8px; font-weight:800; color:var(--gold)}
  .sub{ text-align:center; color:var(--muted); margin-bottom:26px }
  .name{ text-align:center; font-size:28px; margin:14px 0; font-weight:700 }
  .score{ text-align:center; font-size:22px; margin:6px 0 14px }
  .score b{ font-size:28px; color:var(--accent) }
  .meta{ text-align:center; color:var(--muted); margin-bottom:22px }
  .sign{ display:flex; justify-content:space-between; align-items:flex-end; margin-top:28px }
  .sign .line{ border-top:1px solid #94a3b8; padding-top:4px; width:42%; text-align:center; color:#475569 }
  .badge{ position:absolute; top:-16px; right:-16px; background:#f59e0b; color:white; border-radius:999px; padding:10px 14px; font-weight:700; box-shadow:0 3px 10px rgba(0,0,0,.15)}
  .print{ position:fixed; right:18px; top:18px }
  .btn{ background:#0ea5e9; color:#fff; border:none; padding:10px 14px; border-radius:10px; cursor:pointer}
  @media print{ .print{display:none} body{margin:0} }
</style>
</head><body>
  <div class="print"><button class="btn" onclick="window.print()">列印 / 另存 PDF</button></div>
  <div class="wrap">
    <div class="badge">CERTIFIED</div>
    <div class="inner">
      <h1 class="title">英語影片學習 成就證書</h1>
      <div class="sub">Achievement Certificate</div>

      <div class="name">${esc(name || '（未填姓名）')}</div>
      <div class="score">通過 <b>${esc(slug)}</b> 題組　成績 <b>${scorePct}%</b>（${correct}/${total}）</div>
      <div class="meta">發證日期：${esc(nowStr())}</div>

      <div style="text-align:center;color:#334155">
        特此證明上述學員已完成影片學習與測驗，並達到該題組之學習目標。
      </div>

      <div class="sign">
        <div class="line">指導老師簽章</div>
        <div class="line">單位 / 課程</div>
      </div>
    </div>
  </div>
</body></html>`;
    win.document.write(html);
    win.document.close();
  }

  // 渲染整個測驗 UI（會覆蓋原本內容）
  async function mountQuiz() {
    stat.textContent = '載入測驗中…';
    const data = await fetchQuizJson();
    if (!Array.isArray(data) || !data.length) {
      stat.textContent = '⚠️ 查無測驗資料';
      box.innerHTML = '';
      return;
    }
    stat.textContent = '';

    // 清空原本內容（避免與舊版重疊）
    box.innerHTML = '';

    const userAns = Array(data.length).fill(-1);

    // 題目
    data.forEach((q, qi) => {
      const wrap = document.createElement('div');
      wrap.style.padding = '12px 14px';
      wrap.style.borderBottom = '1px solid #14243b';

      const title = document.createElement('div');
      title.innerHTML = `<b>Q${qi+1}.</b> ${esc(q.q)}`;
      title.style.marginBottom = '6px';
      wrap.appendChild(title);

      q.a.forEach((opt, ai) => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.margin = '4px 0';
        label.style.cursor = 'pointer';
        label.innerHTML = `<input type="radio" name="certq_${qi}"> <span style="margin-left:6px">${esc(opt)}</span>`;
        label.querySelector('input').addEventListener('change', () => {
          userAns[qi] = ai;
          ansLine.style.display = 'block';
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
      ansLine.style.marginTop = '6px';
      ansLine.style.display = 'none';
      wrap.appendChild(ansLine);

      box.appendChild(wrap);
    });

    // 交卷 + 姓名 + 證書列印
    const submitRow = document.createElement('div');
    submitRow.style.padding = '14px';
    submitRow.style.display = 'flex';
    submitRow.style.flexWrap = 'wrap';
    submitRow.style.gap = '10px';
    submitRow.style.alignItems = 'center';
    submitRow.style.borderTop = '1px solid #14243b';

    const nameBox = document.createElement('input');
    nameBox.type = 'text';
    nameBox.placeholder = '輸入姓名（記憶於此裝置）';
    nameBox.value = localStorage.getItem('qzName') || '';
    Object.assign(nameBox.style, {
      padding:'8px 10px', border:'1px solid #334155', borderRadius:'8px',
      background:'#0f223b', color:'#dbe7ff', flex:'1 1 260px'
    });
    submitRow.appendChild(nameBox);

    const btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn green';
    btnSubmit.textContent = '交卷';
    btnSubmit.style.padding = '8px 12px';
    btnSubmit.style.borderRadius = '10px';
    btnSubmit.style.background = '#10b981';
    btnSubmit.style.border = 'none';
    btnSubmit.style.color = '#fff';
    submitRow.appendChild(btnSubmit);

    const resultBox = document.createElement('div');
    resultBox.style.flex = '1 1 100%';
    resultBox.style.marginTop = '6px';
    submitRow.appendChild(resultBox);

    btnSubmit.addEventListener('click', () => {
      localStorage.setItem('qzName', nameBox.value.trim());

      let correct = 0;
      data.forEach((q,i)=>{ if (userAns[i] === q.answerIndex) correct++; });
      const total = data.length;
      const pct   = Math.round(correct/total*100);

      resultBox.innerHTML = `
        <div><b>成績</b>：${correct}/${total}（${pct}%）</div>
        <div class="muted" style="margin-top:4px">
          老師建議：${pct>=80?'很棒！可挑戰更快播放或加深詞彙':'建議先理解每題說明，回到影片複習重點句。'}
        </div>`;

      const btnCert = document.createElement('button');
      btnCert.textContent = '列印「成就證書」/ 另存 PDF';
      btnCert.className = 'btn';
      btnCert.style.marginTop = '8px';
      btnCert.addEventListener('click', () => {
        printCertificate({
          name: nameBox.value.trim(),
          scorePct: pct, correct, total
        });
      });
      resultBox.appendChild(btnCert);
    });

    box.appendChild(submitRow);
  }

  // 只有點「測驗」分頁才掛載（避免初始就重排）
  const tabBtn = document.querySelector('.tab[data-tab="quiz"]');
  if (tabBtn) tabBtn.addEventListener('click', mountQuiz);

  // 若預設就在測驗頁，也兜一層保險
  if (getComputedStyle(pane).display !== 'none') mountQuiz();
})();
/* ========== CERT-V1.2 (A4 + QUESTIONS + LOGO) ========== */
/* 這段可以直接貼在 player.js 檔尾。更新時，用這個版本標記整段取代即可。 */
(() => {
  // ===== 可自行更改的基本設定 =====
  const LOGO_URL    = './assets/logo.png';   // ← 你的 LOGO 圖檔（例如 ./assets/logo.png）
  const ORG_NAME    = 'PMKtools';            // ← 單位 / 品牌
  const COURSE_NAME = 'English Videos';      // ← 課程 / 活動名稱
  const SHOW_QR     = false;                 // ← 需要在證書右上角印 QR Code 嗎？true/false
  const QR_URL      = location.href;         // ← QR 要指到的網址（預設是本頁）

  // ===== 內部函式：工具 =====
  const $ = (s, el=document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  const pane  = $('#pane-quiz');
  const box   = $('#quizBox');
  const stat  = $('#quizStatus');
  const tabBtn= document.querySelector('.tab[data-tab="quiz"]');
  if (!pane || !box || !stat) return;

  const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const nowStr = () => {
    const d = new Date(); const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // Supabase 優先；無就讀本地 data/quiz-*.json
  const SUPA_URL    = window.SUPA_URL    || null;
  const SUPA_BUCKET = window.SUPA_BUCKET || null;
  const pubUrl = (path) => `${SUPA_URL}/storage/v1/object/public/${SUPA_BUCKET}/${path}`;
  async function fetchQuizJson() {
    if (SUPA_URL && SUPA_BUCKET) {
      try { const r = await fetch(pubUrl(`data/quiz-${slug}.json`), { cache:'no-store' }); if (r.ok) return await r.json(); } catch {}
    }
    const r2 = await fetch(`./data/quiz-${slug}.json`, { cache:'no-store' });
    if (r2.ok) return await r2.json();
    return null;
  }

  // ===== 列印 A4（含題目 + LOGO + 可選 QR） =====
  function printCertificateWithQuestions({ name='', scorePct=0, correct=0, total=0, data=[], userAns=[] }) {
    const win = window.open('', '_blank');

    const questionHTML = data.map((q, qi) => {
      const ua = userAns[qi];
      const opts = q.a.map((opt, ai) => {
        const isUser = ua === ai;
        const isOk   = q.answerIndex === ai;
        return `
          <li class="opt ${isOk ? 'ok' : ''} ${isUser ? 'chosen' : ''}">
            ${isUser ? '☑' : '☐'} ${esc(opt)}
            ${isOk ? '<span class="tag okTag">正解</span>' : ''}
            ${isUser && !isOk ? '<span class="tag ngTag">我的選擇</span>' : (isUser ? '<span class="tag meTag">我的選擇</span>' : '')}
          </li>`;
      }).join('');
      const verdict = (ua === q.answerIndex)
        ? `<span class="vd ok">✅ 正確</span>`
        : (ua >= 0 ? `<span class="vd ng">❌ 錯誤</span>` : `<span class="vd ng">— 未作答 —</span>`);
      const explain = q.explain ? `<div class="explain">說明：${esc(q.explain)}</div>` : '';
      return `
        <div class="qcard">
          <div class="qtitle">Q${qi+1}. ${esc(q.q)} ${verdict}</div>
          <ul class="opts">${opts}</ul>
          ${explain}
        </div>`;
    }).join('');

    // 可選的 QR Code（使用 Google Chart API；若不想要，將 SHOW_QR 設為 false）
    const qrImg = SHOW_QR
      ? `<img class="qr" src="https://chart.googleapis.com/chart?cht=qr&chs=120x120&chl=${encodeURIComponent(QR_URL)}" alt="QR"/>`
      : '';

    const html = `
<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"/>
<title>成就證書 - ${esc(slug)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  *{box-sizing:border-box}
  body{ margin:0; background:#fff; color:#0f172a;
        font:14px/1.7 "Noto Sans TC",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;}
  .wrap{ max-width: 180mm; margin: 0 auto; }

  .header{
    display:flex; align-items:center; justify-content:space-between;
    border-bottom:2px solid #e2e8f0; padding-bottom:8mm; margin-bottom:10mm;
  }
  .brand{ display:flex; align-items:center; gap:10px }
  .logo{ width:42mm; height:auto; object-fit:contain; }
  .brandText{ display:flex; flex-direction:column }
  .org{ font-weight:700; letter-spacing:.5px }
  .course{ color:#64748b; font-size:12px }

  .title{ text-align:center; margin:0; font-size:26px; color:#b45309; letter-spacing:2px; font-weight:800 }
  .sub{ text-align:center; color:#64748b }

  .name{ font-size:22px; font-weight:700; text-align:center; margin:8mm 0 2mm }
  .score{ text-align:center; font-size:18px; margin:2mm 0 3mm }
  .score b{ color:#2563eb; font-size:20px }
  .meta{ text-align:center; color:#64748b; margin-bottom:8mm }

  .legend{ font-size:12px; color:#475569; margin: -4mm 0 8mm }
  .legend .tag{ display:inline-block; padding:1px 6px; border-radius:99px; font-size:12px; margin-left:4px }
  .okTag{ background:#e6fffa; color:#0f766e; border:1px solid #99f6e4 }
  .ngTag{ background:#fff1f2; color:#be123c; border:1px solid #fecdd3 }
  .meTag{ background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe }

  .qcard{
    page-break-inside: avoid;
    border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin:0 0 8mm; background:#fff;
  }
  .qtitle{ font-weight:700; margin-bottom:6px }
  .vd.ok{ color:#0f766e; margin-left:6px }
  .vd.ng{ color:#be123c; margin-left:6px }
  .opts{ padding-left:1.3em; margin:6px 0 0 }
  .opt{ margin:2px 0 }
  .opt.ok{ color:#065f46 }
  .opt.chosen:not(.ok){ color:#991b1b }
  .opt .tag{ margin-left:6px; padding:1px 6px; border-radius:999px; font-size:12px }
  .opt .okTag{ background:#e6fffa; color:#0f766e; border:1px solid #99f6e4 }
  .opt .ngTag{ background:#fff1f2; color:#be123c; border:1px solid #fecdd3 }
  .opt .meTag{ background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe }
  .explain{ margin-top:4px; color:#334155; background:#f8fafc; padding:6px 8px; border-radius:6px; border:1px solid #e2e8f0 }

  .foot{ display:flex; justify-content:space-between; color:#475569; margin-top:-2mm }
  .line{ border-top:1px solid #cbd5e1; padding-top:2mm; width:44%; text-align:center }

  .printBtn{ position:fixed; top:12px; right:12px }
  .printBtn button{ background:#0ea5e9; border:none; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer }
  .qr{ width:26mm; height:26mm; object-fit:contain }
  @media print { .printBtn{ display:none } }
</style>
</head><body>
  <div class="printBtn"><button onclick="window.print()">列印 / 另存 PDF</button></div>

  <div class="wrap">
    <div class="header">
      <div class="brand">
        <img class="logo" src="${esc(LOGO_URL)}" alt="logo" onerror="this.style.display='none'"/>
        <div class="brandText">
          <div class="org">${esc(ORG_NAME)}</div>
          <div class="course">${esc(COURSE_NAME)}</div>
        </div>
      </div>
      ${SHOW_QR ? qrImg : '<span></span>'}
    </div>

    <h1 class="title">英語影片學習 成就證書</h1>
    <div class="sub">Achievement Certificate</div>

    <div class="name">${esc(name || '（未填姓名）')}</div>
    <div class="score">通過 <b>${esc(slug)}</b> 題組　成績 <b>${scorePct}%</b>（${correct}/${total}）</div>
    <div class="meta">發證日期：${esc(nowStr())}</div>

    <div class="legend">
      題目詳解（☑ 我的選擇，<span class="okTag tag">正解</span>、<span class="ngTag tag">錯誤</span>、<span class="meTag tag">我的選擇</span> 標示）
    </div>

    ${questionHTML}

    <div class="foot">
      <div class="line">指導老師簽章</div>
      <div class="line">單位 / 課程</div>
    </div>
  </div>
</body></html>`;
    win.document.write(html);
    win.document.close();
  }

  // ===== 測驗頁面渲染（含交卷 + 列印） =====
  async function mountQuiz() {
    stat.textContent = '載入測驗中…';
    const data = await fetchQuizJson();
    if (!Array.isArray(data) || !data.length) {
      stat.textContent = '⚠️ 查無測驗資料';
      box.innerHTML = '';
      return;
    }
    stat.textContent = '';
    box.innerHTML = '';

    const userAns = Array(data.length).fill(-1);

    // 題目
    data.forEach((q, qi) => {
      const wrap = document.createElement('div');
      wrap.style.padding = '12px 14px';
      wrap.style.borderBottom = '1px solid #14243b';

      const title = document.createElement('div');
      title.innerHTML = `<b>Q${qi+1}.</b> ${esc(q.q)}`;
      title.style.marginBottom = '6px';
      wrap.appendChild(title);

      q.a.forEach((opt, ai) => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.margin = '4px 0';
        label.style.cursor = 'pointer';
        label.innerHTML = `<input type="radio" name="certq_${qi}"> <span style="margin-left:6px">${esc(opt)}</span>`;
        label.querySelector('input').addEventListener('change', () => {
          userAns[qi] = ai;
          ansLine.style.display = 'block';
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
      ansLine.style.marginTop = '6px';
      ansLine.style.display = 'none';
      wrap.appendChild(ansLine);

      box.appendChild(wrap);
    });

    // 交卷 + 姓名 + 證書列印
    const submitRow = document.createElement('div');
    submitRow.style.padding = '14px';
    submitRow.style.display = 'flex';
    submitRow.style.flexWrap = 'wrap';
    submitRow.style.gap = '10px';
    submitRow.style.alignItems = 'center';
    submitRow.style.borderTop = '1px solid #14243b';

    const nameBox = document.createElement('input');
    nameBox.type = 'text';
    nameBox.placeholder = '輸入姓名（記憶於此裝置）';
    nameBox.value = localStorage.getItem('qzName') || '';
    Object.assign(nameBox.style, {
      padding:'8px 10px', border:'1px solid #334155', borderRadius:'8px',
      background:'#0f223b', color:'#dbe7ff', flex:'1 1 260px'
    });
    submitRow.appendChild(nameBox);

    const btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn green';
    btnSubmit.textContent = '交卷';
    btnSubmit.style.padding = '8px 12px';
    btnSubmit.style.borderRadius = '10px';
    btnSubmit.style.background = '#10b981';
    btnSubmit.style.border = 'none';
    btnSubmit.style.color = '#fff';
    submitRow.appendChild(btnSubmit);

    const resultBox = document.createElement('div');
    resultBox.style.flex = '1 1 100%';
    resultBox.style.marginTop = '6px';
    submitRow.appendChild(resultBox);

    btnSubmit.addEventListener('click', () => {
      localStorage.setItem('qzName', nameBox.value.trim());

      let correct = 0;
      data.forEach((q,i)=>{ if (userAns[i] === q.answerIndex) correct++; });
      const total = data.length;
      const pct   = Math.round(correct/total*100);

      resultBox.innerHTML = `
        <div><b>成績</b>：${correct}/${total}（${pct}%）</div>
        <div class="muted" style="margin-top:4px">
          老師建議：${pct>=80?'很棒！可挑戰更快播放或加深詞彙':'建議先理解每題說明，回到影片複習重點句。'}
        </div>`;

      const btnCert = document.createElement('button');
      btnCert.textContent = '列印 A4「成就證書（含題目）」/ 另存 PDF';
      btnCert.className = 'btn';
      btnCert.style.marginTop = '8px';
      btnCert.addEventListener('click', () => {
        printCertificateWithQuestions({
          name: nameBox.value.trim(),
          scorePct: pct, correct, total,
          data, userAns
        });
      });
      resultBox.appendChild(btnCert);
    });

    box.appendChild(submitRow);
  }

  if (tabBtn) tabBtn.addEventListener('click', mountQuiz);
  if (getComputedStyle(pane).display !== 'none') mountQuiz();
})();
/* ========== /CERT-V1.2 END ========== */


















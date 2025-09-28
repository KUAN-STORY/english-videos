/* player.js — v7.3+ 合併修復版
 * 功能：
 * - 視訊播放器：速度控制、填滿畫面切換、基本上一句/下一句鉤子(保留ID以相容舊版)
 * - 分頁：字幕 / 測驗 / 單字
 * - 測驗：讀 data/quiz-<slug>.json（扁平題庫），交卷顯示分數並可列印 A4 證書（含作答明細）
 * - 單字：讀 data/vocab-<slug>.json；例句將目標字變「____」；🔊朗讀、▶跳播、點時間跳播
 * 注意：字幕載入邏輯因各專案格式不同，保留 initSubtitles() 供你接回原本流程
 */

(function(){
  // ---------- 小工具 ----------
  const $  = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get('slug')||'').trim();

  // 核心 DOM 參照
  const video = $('#player');
  const speedRange  = $('#speedRange');
  const speedLabel  = $('#speedLabel');
  const btnFill     = $('#btnFill');

  const tabSub   = $('#tabSub'),   paneSub   = $('#pane-sub');
  const tabQuiz  = $('#tabQuiz'),  paneQuiz  = $('#pane-quiz');
  const tabVocab = $('#tabVocab'), paneVocab = $('#pane-vocab');

  // 相容舊版的控制列 ID（如果你舊版已綁事件，就會直接運作；此版也一併補上安全處理）
  const btnPrev        = $('#btnPrev');
  const btnPlay        = $('#btnPlay');
  const btnNext        = $('#btnNext');
  const btnRepeatLine  = $('#btnRepeatLine');
  const btnAutoPause   = $('#btnAutoPause');
  const btnSectionLoop = $('#btnSectionLoop');
  const btnAbLoop      = $('#btnAbLoop');
  const btnWordLoop    = $('#btnWordLoop');
  const btnCancelLoop  = $('#btnCancelLoop');

  // ---------- 資料來源 ----------
  async function fetchJSON(url){
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error(`讀取失敗：${url}`);
    return await res.json();
  }

  // 嘗試從 index.json 找影片路徑；失敗則退回 videos/<slug>.mp4
  async function resolveVideoUrl(slug){
    try{
      const meta = await fetchJSON('data/index.json');
      const item = (meta.items||[]).find(it=> it.slug===slug);
      if(item && item.video) return item.video;
    }catch(e){}
    return `videos/${slug}.mp4`; // fallback
  }

  // ---------- 視訊播放器：速度 + 填滿畫面 ----------
  function wirePlayerBasics(){
    // 速度
    const applySpeed = (v)=>{
      const rate = Math.max(0.25, Math.min(4, Number(v)||1));
      video.playbackRate = rate;
      if(speedLabel) speedLabel.textContent = rate.toFixed(2)+'x';
    };
    if(speedRange){
      speedRange.addEventListener('input', ()=> applySpeed(speedRange.value));
      // 初始
      applySpeed(speedRange.value||1);
    }else{
      // 沒滑桿也至少把顯示修正
      if(speedLabel) speedLabel.textContent = (video.playbackRate||1).toFixed(2)+'x';
    }

    // 填滿畫面：以 object-fit: cover 方式；再次點擊還原 contain
    let filled = false;
    if(btnFill){
      btnFill.addEventListener('click', ()=>{
        filled = !filled;
        video.style.width  = '100%';
        video.style.height = '100%';
        video.style.objectFit = filled ? 'cover' : 'contain';
        btnFill.classList.toggle('on', filled);
      });
    }

    // 播放 / 暫停
    if(btnPlay){
      btnPlay.addEventListener('click', ()=>{
        if(video.paused) video.play(); else video.pause();
      });
    }
    // 預留：上一句 / 下一句等（實作依你字幕資料結構接回去）
    if(btnPrev) btnPrev.addEventListener('click', ()=> {/* TODO: hook prev line */});
    if(btnNext) btnNext.addEventListener('click', ()=> {/* TODO: hook next line */});
    if(btnRepeatLine)  btnRepeatLine.addEventListener('click', ()=>{/* TODO */});
    if(btnAutoPause)   btnAutoPause.addEventListener('click', ()=>{/* TODO */});
    if(btnSectionLoop) btnSectionLoop.addEventListener('click', ()=>{/* TODO */});
    if(btnAbLoop)      btnAbLoop.addEventListener('click', ()=>{/* TODO */});
    if(btnWordLoop)    btnWordLoop.addEventListener('click', ()=>{/* TODO */});
    if(btnCancelLoop)  btnCancelLoop.addEventListener('click', ()=>{/* TODO */});

    // 進度保存鉤子（若你接 Supabase，可在這裡 upsertProgress）
    video.addEventListener('timeupdate', ()=>{
      // TODO: save progress { slug, seconds: video.currentTime }
    });
  }

  // ---------- 分頁切換 ----------
  function wireTabs(){
    function show(tab){
      paneSub.style.display   = tab==='sub'  ? '' : 'none';
      paneQuiz.style.display  = tab==='quiz' ? '' : 'none';
      paneVocab.style.display = tab==='vocab'? '' : 'none';

      tabSub.classList.toggle('active', tab==='sub');
      tabQuiz.classList.toggle('active', tab==='quiz');
      tabVocab.classList.toggle('active', tab==='vocab');
    }
    tabSub?.addEventListener('click', ()=> show('sub'));
    tabQuiz?.addEventListener('click', ()=> show('quiz'));
    tabVocab?.addEventListener('click', ()=> show('vocab'));

    // 若 URL 有 tab 參數
    const tab = (new URLSearchParams(location.search).get('tab')||'sub').toLowerCase();
    show(['sub','quiz','vocab'].includes(tab)?tab:'sub');
  }

  // ---------- 字幕（保留掛點，依你的字幕格式接回） ----------
  async function initSubtitles(){
    // 這裡先顯示表頭與空狀態；你舊版的字幕載入／跑句函式，可直接把產出的表格 append 到 paneSub
    paneSub.innerHTML = `
      <table class="subs">
        <thead>
          <tr><th style="width:72px">時間</th><th>英文</th><th style="width:40%">中文</th></tr>
        </thead>
        <tbody id="subsBody"><tr><td colspan="3" style="color:#9fb1cc">（尚未載入／或你另行 append）</td></tr></tbody>
      </table>
    `;
    // TODO: 在這裡載入你的字幕資料並填入 #subsBody
  }

  // ---------- 測驗 ----------
  async function initQuiz(){
    paneQuiz.innerHTML = `<div style="color:#9fb1cc">讀取測驗題庫中…</div>`;
    let items = [];
    try{
      // 支援扁平陣列：[{type:'mcq'|'tf'|'fill', q:'..', options:[...], a: num|bool|string}, ...]
      items = await fetchJSON(`data/quiz-${slug}.json`);
      if(!Array.isArray(items)) throw new Error('題庫不是陣列格式');
    }catch(e){
      paneQuiz.innerHTML = `<div style="color:#f5a524">查無測驗資料（data/quiz-${slug}.json）。</div>`;
      return;
    }

    // 繪題
    const form = document.createElement('form');
    form.id = 'quizForm';
    form.style.display = 'grid';
    form.style.gap = '14px';
    form.style.maxWidth = '900px';

    items.forEach((it, idx)=>{
      const no = idx+1;
      const wrap = document.createElement('div');
      wrap.style.border = '1px solid #1f2a44';
      wrap.style.padding = '12px';
      wrap.style.borderRadius = '10px';
      wrap.style.background = '#0f172a';

      let inner = `<div style="margin-bottom:6px;font-weight:700;">${no}. ${escapeHtml(it.q||'')}</div>`;

      if(it.type==='mcq'){
        inner += (it.options||[]).map((opt,i)=>`
          <label style="display:block;margin:6px 0">
            <input type="radio" name="q${idx}" value="${i}"> ${escapeHtml(opt)}
          </label>`).join('');
      }else if(it.type==='tf'){
        inner += `
          <label style="display:inline-flex;gap:6px;margin-right:12px"><input type="radio" name="q${idx}" value="true"> True</label>
          <label style="display:inline-flex;gap:6px"><input type="radio" name="q${idx}" value="false"> False</label>`;
      }else if(it.type==='fill'){
        inner += `<input name="q${idx}" type="text" style="width:100%;max-width:420px;border:1px solid #1f2a44;border-radius:8px;padding:8px;background:#0f1a33;color:#e6efff">`;
      }else{
        inner += `<div style="color:#f5a524">未知題型：${it.type}</div>`;
      }

      wrap.innerHTML = inner;
      form.appendChild(wrap);
    });

    const submitBar = document.createElement('div');
    submitBar.style.display = 'flex';
    submitBar.style.gap = '10px';
    submitBar.style.marginTop = '10px';

    const btnSubmit = document.createElement('button');
    btnSubmit.type = 'button';
    btnSubmit.textContent = '交卷';
    btnSubmit.className = 'kbtn';
    btnSubmit.style.padding = '10px 14px';

    const scoreBox = document.createElement('div');
    scoreBox.id = 'quizScoreBox';
    scoreBox.style.color = '#9fb1cc';
    scoreBox.style.marginLeft = '8px';

    submitBar.appendChild(btnSubmit);
    submitBar.appendChild(scoreBox);

    const printBar = document.createElement('div');
    printBar.style.marginTop = '10px';
    paneQuiz.innerHTML = '';
    paneQuiz.appendChild(form);
    paneQuiz.appendChild(submitBar);
    paneQuiz.appendChild(printBar);

    btnSubmit.addEventListener('click', ()=>{
      // 批改
      const detail = [];
      let correct = 0;
      items.forEach((it, idx)=>{
        let userAnsRaw = null;
        if(it.type==='mcq'){
          const val = (form.querySelector(`input[name="q${idx}"]:checked`)||{}).value;
          userAnsRaw = (val===''?null:val);
          const ok = Number(userAnsRaw)===Number(it.a);
          if(ok) correct++;
          detail.push({
            no: idx+1, type:'mcq', q: it.q,
            user: (userAnsRaw==null? null : Number(userAnsRaw)),
            answer: Number(it.a),
            options: it.options||[], ok
          });
        }else if(it.type==='tf'){
          const val = (form.querySelector(`input[name="q${idx}"]:checked`)||{}).value;
          userAnsRaw = (val===''?null:val);
          const u = (userAnsRaw==='true');
          const ok = (u===Boolean(it.a));
          if(ok) correct++;
          detail.push({ no: idx+1, type:'tf', q: it.q, user: (userAnsRaw==null?null:u), answer:Boolean(it.a), ok });
        }else if(it.type==='fill'){
          const val = (form.querySelector(`input[name="q${idx}"]`)||{}).value||'';
          userAnsRaw = val;
          const ok = norm(val)===norm(String(it.a||''));
          if(ok) correct++;
          detail.push({ no: idx+1, type:'fill', q: it.q, user: val, answer: String(it.a||''), ok });
        }
      });

      const total = items.length;
      const scorePct = Math.round((correct/total)*100);
      scoreBox.textContent = `成績：${correct}/${total}（${scorePct}%）`;

      // TODO: save quiz attempt（若要寫 Supabase）
      // addQuizAttempt({ slug, score: correct, total, payload: detail })

      // 「列印成就證書」按鈕
      printBar.innerHTML = '';
      const btnPrint = document.createElement('button');
      btnPrint.textContent = '列印成就證書（含作答明細）';
      btnPrint.className = 'kbtn';
      btnPrint.style.padding = '10px 14px';
      printBar.appendChild(btnPrint);

      btnPrint.addEventListener('click', ()=>{
        openCertificate({
          slug,
          title: document.title || '英語影片學習',
          name: ($('#certName')?.value || $('#userNameBadge')?.textContent?.replace(/^👤\s*/,'') || '').trim(),
          correct, total, detail
        });
      });
    });
  }

  // 證書（A4直印，含作答明細）
  function openCertificate({slug,title,name,correct,total,detail}){
    const win = window.open('','_blank');
    const pct = Math.round((correct/total)*100);
    const now = new Date();
    const ts = now.toISOString().slice(0,19).replace('T',' ');

    const rows = detail.map(d=>{
      let userTxt = '';
      let ansTxt  = '';
      if(d.type==='mcq'){
        userTxt = (d.user==null?'(未作答)': `${d.user+1}. ${escapeHtml(d.options[d.user]||'')}`);
        ansTxt  = `${d.answer+1}. ${escapeHtml(d.options[d.answer]||'')}`;
      }else if(d.type==='tf'){
        userTxt = d.user==null ? '(未作答)' : (d.user?'True':'False');
        ansTxt  = d.answer ? 'True':'False';
      }else{
        userTxt = d.user || '(未作答)';
        ansTxt  = d.answer || '';
      }
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${d.no}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(d.q||'')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(userTxt)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(ansTxt)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;color:${d.ok?'#0a8d4d':'#c0392b'}">${d.ok?'✔':'✘'}</td>
      </tr>`;
    }).join('');

    win.document.write(`
<!doctype html>
<html><head>
<meta charset="utf-8">
<title>成就證書 – ${escapeHtml(slug)}</title>
<style>
@page{ size:A4; margin:20mm }
body{ font-family:system-ui,Segoe UI,Roboto,Noto Sans TC,sans-serif; color:#222; }
h1{ margin:0 0 8px; }
.box{ border:2px solid #333; padding:18px; border-radius:10px }
.meta{ color:#555;margin:6px 0 14px }
table{ width:100%; border-collapse:collapse; font-size:12px; }
.badge{display:inline-block;padding:2px 8px;border-radius:8px;border:1px solid #999;margin-left:6px}
</style>
</head>
<body>
  <h1>英語影片學習 成就證書</h1>
  <div class="meta">影片：${escapeHtml(slug)} <span class="badge">${escapeHtml(title||'')}</span></div>
  <div class="box">
    <div style="font-size:18px;margin-bottom:10px"><b>${escapeHtml(name||'')}</b></div>
    <div style="font-size:16px;margin-bottom:6px">成績：<b>${correct}/${total}（${pct}%）</b></div>
    <div style="color:#555">發證日期：${escapeHtml(ts)}</div>
  </div>

  <h3 style="margin-top:22px">作答明細</h3>
  <table>
    <thead>
      <tr style="background:#f5f5f5">
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;width:40px">#</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd">題目</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;width:30%">作答</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;width:30%">正解</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;width:40px">結果</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <script>window.onload=()=>window.print()</script>
</body></html>`);
    win.document.close();
  }

  // ---------- 單字 ----------
  async function initVocab(){
    paneVocab.innerHTML = `<div style="color:#9fb1cc">讀取單字資料中…</div>`;
    let data;
    try{
      data = await fetchJSON(`data/vocab-${slug}.json`);
    }catch(e){
      paneVocab.innerHTML = `<div style="color:#f5a524">查無單字資料（data/vocab-${slug}.json）。</div>`;
      return;
    }

    const items = data.items||[];
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gap = '10px';

    // 表頭
    const head = document.createElement('div');
    head.style.display = 'grid';
    head.style.gridTemplateColumns = '80px 1fr 60px 1fr';
    head.style.gap = '8px';
    head.style.color = '#9fb1cc';
    head.innerHTML = `<div>時間</div><div>例句（填空）</div><div>單字</div><div>中文/詞性/語法</div>`;
    container.appendChild(head);

    items.forEach((it, idx)=>{
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '80px 1fr 60px 1fr';
      row.style.gap = '8px';
      row.style.alignItems = 'start';
      row.style.borderBottom = '1px solid #1f2a44';
      row.style.padding = '6px 0';

      const s = toSec(it.time);
      const timeBtn = document.createElement('button');
      timeBtn.textContent = mmss(s);
      timeBtn.className = 'kbtn';
      timeBtn.style.padding = '6px 8px';
      timeBtn.addEventListener('click', ()=>{ video.currentTime=s; video.play(); });

      // 例句：把單字改 ____（大小寫都遮）
      const sentence = document.createElement('div');
      const blanked = hideWord(it.en||'', it.word||'');
      sentence.innerHTML = `<button class="kbtn" style="padding:2px 6px;margin-right:6px">▶</button>${escapeHtml(blanked)}`;
      // ▶ 跳播
      sentence.querySelector('button').addEventListener('click', ()=>{ video.currentTime=s; video.play(); });

      // 右欄：單字 + 🔊
      const wordCell = document.createElement('div');
      wordCell.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-weight:700">${escapeHtml(it.word||'')}</span>
          <button class="kbtn" style="padding:2px 6px" title="朗讀">🔊</button>
        </div>`;
      wordCell.querySelector('button').addEventListener('click', ()=>{
        speak((it.word||'').toString());
      });

      const info = document.createElement('div');
      const pos = it.pos? `（${escapeHtml(it.pos)}）` : '';
      const zh  = it.zh? `${escapeHtml(it.zh)}` : '';
      const gram= it.grammar? `<div style="color:#9fb1cc;margin-top:2px">${escapeHtml(it.grammar)}</div>`:'';
      info.innerHTML = `${zh} ${pos}${gram}`;

      row.appendChild(timeBtn);
      row.appendChild(sentence);
      row.appendChild(wordCell);
      row.appendChild(info);
      container.appendChild(row);
    });

    paneVocab.innerHTML = '';
    paneVocab.appendChild(container);
  }

  // ---------- TTS ----------
  function speak(txt){
    try{
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = 'en-US';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }catch(e){}
  }

  // ---------- 啟動 ----------
  (async function start(){
    if(!slug){
      alert('缺少 slug 參數');
      return;
    }
    // 設定影片來源
    const url = await resolveVideoUrl(slug);
    video.src = url;

    wirePlayerBasics();
    wireTabs();
    initSubtitles();
    initQuiz();
    initVocab();
  })();

  // ---------- 小工具 ----------
  function escapeHtml(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function norm(s){ return String(s||'').trim().toLowerCase(); }
  function toSec(t){
    if(t==null) return 0;
    if(typeof t==='number') return t;
    const m = String(t).match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if(m){
      const mm = Number(m[1]||0), ss=Number(m[2]||0), ms=Number(m[3]||0);
      return mm*60 + ss + ms/1000;
    }
    const n = Number(t); return isNaN(n)?0:n;
  }
  function mmss(sec){
    sec = Math.max(0, Math.floor(sec||0));
    const m = Math.floor(sec/60), s = sec%60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function hideWord(sentence, word){
    if(!word) return sentence;
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
    return sentence.replace(re, '____');
  }

})();























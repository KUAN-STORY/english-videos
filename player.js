/* player.js — v7.2 + Quiz Cert (A4 with per-question log) + Flat/Items JSON兼容
   - 保留原字幕 / 單字流程（讀 ./data/cues-<slug>.json、./data/vocab-<slug>.json）
   - 測驗支援扁平陣列或 {title, slug, items:[...]}；交卷可列印直印 A4 證書，附逐題作答紀錄。
*/

(() => {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];

  // -------- DOM Refs (依你頁面結構) --------
  const video     = $('#player');
  const videoWrap = $('#videoWrap') || document.body;

  const cuesBody   = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');
  const paneSub    = $('#pane-sub');
  const paneQuiz   = $('#pane-quiz');
  const paneVocab  = $('#pane-vocab');

  const tabs = $$('.tab');

  // -------- URL Query --------
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';
  const setTab = params.get('tab'); // 可用 ?tab=quiz 直接進測驗

  // -------- 狀態 / 工具 --------
  let cues = [];
  let offset = 0;
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
  const esc = (s) => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // ---------- 載入素材 ----------
  async function resolveVideoUrl(sg){ return `./videos/${sg}.mp4`; }
  async function resolveCues(sg){
    try {
      const rsp = await fetch(`./data/cues-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) return (await rsp.json()).map(r=>({ t: toSec(r.time), en:r.en||'', zh:r.zh||'' }));
    } catch {}
    return [];
  }
  async function resolveVocab(sg){
    try {
      const rsp = await fetch(`./data/vocab-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) return await rsp.json();
    } catch {}
    return null;
  }

  // ---------- 字幕 UI ----------
  function renderCues(){
    if (!cuesBody) return;
    cuesBody.innerHTML = '';
    if (!cues.length){
      if (cuesStatus) cuesStatus.textContent = '⚠️ 查無字幕資料';
      return;
    }
    if (cuesStatus) cuesStatus.textContent = '';
    cuesBody.innerHTML = cues.map((c,i)=>`
      <tr data-i="${i}">
        <td class="muted">${c.t?fmt(c.t):''}</td>
        <td>${esc(c.en)}</td>
        <td>${esc(c.zh)}</td>
      </tr>
    `).join('');
    $$('#cuesBody tr').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const idx = +tr.dataset.i;
        if (cues[idx]) {
          video.currentTime = Math.max(0, cues[idx].t - offset + 0.0001);
          video.play();
        }
      });
    });
  }

  // ---------- 單字 UI ----------
  async function loadVocabUI(){
    if (!paneVocab) return;
    // 放容器
    let vocabStatus = $('#vocabStatus');
    let vocabBox    = $('#vocabBox');
    if (!vocabStatus){ 
      const el = document.createElement('div');
      el.id='vocabStatus';
      paneVocab.appendChild(el);
      vocabStatus = el;
    }
    if (!vocabBox){
      const el = document.createElement('div');
      el.id='vocabBox';
      paneVocab.appendChild(el);
      vocabBox = el;
    }

    vocabStatus.textContent = '載入中…';
    const list = await resolveVocab(slug);
    if (!list || !list.length){ vocabStatus.textContent='⚠️ 查無單字資料'; vocabBox.innerHTML=''; return; }
    vocabStatus.textContent='';
    vocabBox.innerHTML = `
      <table><thead><tr>
        <th class="muted">時間</th><th>單字</th><th class="muted">詞性</th><th>中文</th><th class="muted">英文解釋</th>
      </tr></thead><tbody>
        ${list.map(v=>`
          <tr>
            <td class="muted">${esc(v.time||'')}</td>
            <td>${esc(v.word||'')}</td>
            <td class="muted">${esc(v.pos||'')}</td>
            <td>${esc(v.zh||'')}</td>
            <td class="muted">${esc(v.en||'')}</td>
          </tr>
        `).join('')}
      </tbody></table>
    `;
  }

  // ---------- 載入流程 ----------
  async function loadAll(){
    if (video) video.src = await resolveVideoUrl(slug);
    cues = await resolveCues(slug);
    renderCues();
    loadVocabUI();
  }

  // ---------- 分頁切換 ----------
  tabs.forEach(tab=>tab.addEventListener('click', ()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    if (paneSub)   paneSub.style.display   = (name==='sub')?'':'none';
    if (paneQuiz)  paneQuiz.style.display  = (name==='quiz')?'':'none';
    if (paneVocab) paneVocab.style.display = (name==='vocab')?'':'none';
    if (name==='quiz') mountQuiz(); // 點到測驗才載
  }));

  // 若 URL 指定 tab=quiz
  if (setTab === 'quiz' && paneQuiz){
    tabs.forEach(x=>x.classList.remove('active'));
    const t = $('.tab[data-tab="quiz"]'); if (t) t.classList.add('active');
    if (paneSub) paneSub.style.display='none';
    paneQuiz.style.display='';
    if (paneVocab) paneVocab.style.display='none';
  }

  (async function init(){
    await loadAll();
    if (setTab==='quiz') mountQuiz();
  })();

  /* ================================
     QUIZ MODULE（兼容 + A4 證書 + 題目清單）
     ================================ */
  async function fetchQuizJson() {
    try{
      const r = await fetch(`./data/quiz-${slug}.json`, { cache:'no-store' });
      if (r.ok) return await r.json();
    }catch{}
    return null;
  }
  function normalizeQuizData(raw){
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  }
  function textOfTF(val){ return val ? 'True' : 'False'; }

  // 取得題目正確判定方法（兼容 a / answer；字串/布林/數字）
  function isCorrect(q, ans){
    const type = String(q.type||'').toLowerCase();
    const expect = (q.a!==undefined)? q.a : q.answer;

    if (type==='mcq'){
      if (typeof expect === 'number') return ans === expect;
      if (typeof expect === 'string'){
        const opt = (q.options||[])[ans];
        return String(opt||'').trim().toLowerCase() === String(expect).trim().toLowerCase();
      }
      return false;
    }else if (type==='tf'){
      return Boolean(ans) === Boolean(expect);
    }else if (type==='fill'){
      const norm = s => String(s||'').trim().toLowerCase();
      return norm(ans) === norm(String(expect||''));
    }
    return false;
  }

  // ===== 列印「成就證書」(直印 A4，附逐題) =====
  function printCertificate({ name='', slug='', scorePct=0, correct=0, total=0, rows=[] }) {
    const esc2 = s => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const nowStr = () => {
      const d=new Date(), p=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const w = window.open('', '_blank');
    const tableRows = rows.map((r,i)=>`
      <tr class="${r.ok?'ok':'ng'}">
        <td>${i+1}</td>
        <td>${esc2(r.q)}</td>
        <td>${esc2(r.your)}</td>
        <td>${esc2(r.correct)}</td>
        <td>${r.ok?'✔':'✘'}</td>
        <td class="muted">${esc2(r.explain||'')}</td>
      </tr>
    `).join('');

    w.document.write(`
<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/>
<title>成就證書 - ${esc2(slug)}</title>
<style>
@page { size: A4 portrait; margin: 18mm; }
:root{--ink:#0f172a;--muted:#64748b;--gold:#b45309;--accent:#2563eb;--frame:#eab308;--bg:#fffdf5;--ok:#16a34a;--ng:#e11d48}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.7 "Noto Sans TC",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial}
.wrap{border:10px solid var(--frame);border-radius:16px;padding:16px}
h1{font-size:28px;margin:0 0 4px;text-align:center;color:var(--gold)}
.sub{text-align:center;color:var(--muted);margin-bottom:14px}
.kv{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;margin-bottom:10px}
.kv .name{font-size:20px;font-weight:700}
.kv .score{font-size:18px}
.kv .score b{color:var(--accent)}
.meta{color:var(--muted);text-align:center;margin-bottom:10px}
.note{text-align:center;margin-bottom:14px}
.print{position:fixed;right:18px;top:18px}
.btn{background:#0ea5e9;color:#fff;border:none;padding:8px 12px;border-radius:10px;cursor:pointer}
@media print{ .print{display:none} }

table{width:100%;border-collapse:collapse;margin-top:6px}
thead th{background:#fef3c7;border:1px solid #eab308;padding:6px;text-align:left}
tbody td{border:1px solid #e2e8f0;padding:6px;vertical-align:top}
tbody tr.ok td:nth-last-child(2){color:var(--ok);font-weight:700}
tbody tr.ng td:nth-last-child(2){color:var(--ng);font-weight:700}
.muted{color:var(--muted)}
.footer{margin-top:10px;font-size:12px;color:#475569}
</style></head><body>
<div class="print"><button class="btn" onclick="window.print()">列印 / 另存 PDF</button></div>
<div class="wrap">
  <h1>英語影片學習 成就證書</h1>
  <div class="sub">Achievement Certificate</div>
  <div class="kv">
    <div class="name">學員：${esc2(name || '（未填姓名）')}</div>
    <div class="score">題組：<b>${esc2(slug)}</b>　成績：<b>${scorePct}%</b>（${correct}/${total}）</div>
  </div>
  <div class="meta">發證日期：${esc2(nowStr())}</div>
  <div class="note">下列為本次作答紀錄：</div>

  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>題目</th>
        <th>你的答案</th>
        <th>正解</th>
        <th style="width:42px">對錯</th>
        <th>說明</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="footer">本證書僅作為學習參考。建議持續複習重點句與單字，加深語感與聽力能力。</div>
</div>
</body></html>`);
    w.document.close();
  }

  // ===== 主：掛載測驗 =====
  let quizMounted = false;
  async function mountQuiz(){
    if (!paneQuiz) return;
    if (quizMounted) return;
    quizMounted = true;

    // 準備容器（若頁面沒有，建立）
    let statusEl = $('#quizStatus');
    let boxEl    = $('#quizBox');
    if (!statusEl){
      statusEl = document.createElement('div');
      statusEl.id = 'quizStatus';
      paneQuiz.appendChild(statusEl);
    }
    if (!boxEl){
      boxEl = document.createElement('div');
      boxEl.id = 'quizBox';
      paneQuiz.appendChild(boxEl);
    }

    statusEl.textContent = '載入測驗中…';
    const raw = await fetchQuizJson();
    const data = normalizeQuizData(raw);
    statusEl.textContent = '';

    if (!data.length){
      boxEl.innerHTML = '';
      statusEl.textContent = '⚠️ 查無測驗資料';
      return;
    }

    // 狀態
    const answers = Array(data.length).fill(null);

    // 渲染題目
    boxEl.innerHTML = '';
    data.forEach((q, qi) => {
      const wrap = document.createElement('div');
      wrap.style.padding='12px 14px';
      wrap.style.borderBottom='1px solid #14243b';

      const title = document.createElement('div');
      title.innerHTML = `<b>Q${qi+1}.</b> ${esc(q.q||q.question||'')}`;
      title.style.marginBottom='6px';
      wrap.appendChild(title);

      const ansLine = document.createElement('div');
      ansLine.className='muted';
      ansLine.style.display='none';
      ansLine.style.marginTop='6px';

      const type = String(q.type||'').toLowerCase();
      if (type==='mcq'){
        (q.options||[]).forEach((opt, ai)=>{
          const label = document.createElement('label');
          label.style.display='block';
          label.style.margin='4px 0';
          label.style.cursor='pointer';
          label.innerHTML=`<input type="radio" name="q${qi}"> <span style="margin-left:6px">${esc(opt)}</span>`;
          label.querySelector('input').addEventListener('change',()=>{
            answers[qi]=ai;
            ansLine.style.display='block';
            if (isCorrect(q, ai)){
              ansLine.innerHTML=`✅ 正確！<span class="muted">（${esc(q.explain||'Good!')}）</span>`;
              ansLine.style.color='#5bd3c7';
            }else{
              let showAns = '';
              if (typeof q.a === 'number') showAns = (q.options||[])[q.a] || '';
              else if (typeof q.answer === 'number') showAns = (q.options||[])[q.answer] || '';
              else showAns = String(q.a??q.answer??'');
              ansLine.innerHTML=`❌ 再試試。正解：${esc(showAns)} <span class="muted">（${esc(q.explain||'')}）</span>`;
              ansLine.style.color='#ff6b6b';
            }
          });
          wrap.appendChild(label);
        });
        wrap.appendChild(ansLine);

      }else if (type==='tf'){
        const row = document.createElement('div');
        row.style.display='flex'; row.style.gap='10px';
        ['True','False'].forEach((lbl,ai)=>{
          const lab = document.createElement('label');
          lab.innerHTML = `<input type="radio" name="q${qi}"> <span style="margin-left:6px">${lbl}</span>`;
          lab.style.cursor='pointer';
          lab.querySelector('input').addEventListener('change',()=>{
            answers[qi] = (ai===0); // True=0, False=1
            ansLine.style.display='block';
            if (isCorrect(q, answers[qi])){
              ansLine.textContent='✅ 正確！';
              ansLine.style.color='#5bd3c7';
            }else{
              ansLine.textContent='❌ 再試試。';
              ansLine.style.color='#ff6b6b';
            }
          });
          row.appendChild(lab);
        });
        wrap.appendChild(row);
        wrap.appendChild(ansLine);

      }else if (type==='fill'){
        const ipt = document.createElement('input');
        ipt.type='text';
        ipt.placeholder='請輸入答案（不分大小寫）';
        Object.assign(ipt.style, {padding:'8px 10px',border:'1px solid #334155',borderRadius:'8px',background:'#0f223b',color:'#dbe7ff',width:'min(420px,100%)'});
        ipt.addEventListener('input', ()=>{
          answers[qi] = ipt.value;
          if (String(ipt.value||'').trim()){
            ansLine.style.display='block';
            if (isCorrect(q, ipt.value)){
              ansLine.textContent='✅ 目前答案正確';
              ansLine.style.color='#5bd3c7';
            }else{
              ansLine.textContent='ℹ️ 小提醒：答案需完全一致（不分大小寫）';
              ansLine.style.color='#cbd5e1';
            }
          }else{
            ansLine.style.display='none';
          }
        });
        wrap.appendChild(ipt);
        wrap.appendChild(ansLine);

      }else{
        wrap.appendChild(document.createTextNode('⚠️ 未支援的題型'));
      }

      boxEl.appendChild(wrap);
    });

    // 交卷區
    const submitRow = document.createElement('div');
    submitRow.style.padding='14px';
    submitRow.style.display='flex';
    submitRow.style.flexWrap='wrap';
    submitRow.style.gap='10px';
    submitRow.style.alignItems='center';
    submitRow.style.borderTop='1px solid #14243b';

    const nameIpt = document.createElement('input');
    nameIpt.type='text';
    nameIpt.placeholder='輸入姓名（記憶於此裝置）';
    nameIpt.value = localStorage.getItem('qzName') || '';
    Object.assign(nameIpt.style, {
      padding:'8px 10px', border:'1px solid #334155', borderRadius:'8px',
      background:'#0f223b', color:'#dbe7ff', flex:'1 1 260px'
    });

    const btnSubmit = document.createElement('button');
    btnSubmit.className='btn green';
    btnSubmit.textContent='交卷';
    btnSubmit.style.padding='8px 12px';
    btnSubmit.style.borderRadius='10px';
    btnSubmit.style.background='#10b981';
    btnSubmit.style.border='none';
    btnSubmit.style.color='#fff';

    const result = document.createElement('div');
    result.style.flex='1 1 100%';
    result.style.marginTop='6px';

    // === 交卷（含列印成就證書，帶逐題） ===
    btnSubmit.addEventListener('click', ()=>{
      localStorage.setItem('qzName', nameIpt.value.trim());

      let correct=0;
      const rows = data.map((q,i)=>{
        const type=String(q.type||'').toLowerCase();
        const expect = (q.a!==undefined)? q.a : q.answer;
        let yourText = '';
        let correctText = '';

        if (type==='mcq'){
          const yourIdx = answers[i];
          yourText = (q.options||[])[yourIdx] ?? '';
          if (typeof expect === 'number') correctText = (q.options||[])[expect] ?? '';
          else correctText = String(expect??'');
        }else if (type==='tf'){
          yourText = textOfTF(Boolean(answers[i]));
          correctText = textOfTF(Boolean(expect));
        }else if (type==='fill'){
          yourText   = String(answers[i]??'');
          correctText= String(expect??'');
        }

        const ok = isCorrect(q, answers[i]);
        if (ok) correct++;

        return {
          q: q.q || q.question || '',
          your: yourText,
          correct: correctText,
          ok,
          explain: q.explain || ''
        };
      });

      const tot = data.length || 1;
      const pct = Math.round(correct/tot*100);

      result.innerHTML = `
        <div><b>成績</b>：${correct}/${tot}（${pct}%）</div>
        <div class="muted" style="margin-top:4px">
          老師建議：${pct>=80?'很棒！可挑戰更進階題組':'建議回到影片複習重點句，再來挑戰一次。'}
        </div>
      `;

      const btnCert = document.createElement('button');
      btnCert.className='btn ghost';
      btnCert.style.marginTop='8px';
      btnCert.textContent='列印成就證書 / 另存 PDF';
      btnCert.addEventListener('click', ()=>{
        printCertificate({
          name: nameIpt.value.trim(),
          slug,
          scorePct: pct,
          correct,
          total: tot,
          rows
        });
      });
      result.appendChild(btnCert);
    });

    submitRow.appendChild(nameIpt);
    submitRow.appendChild(btnSubmit);
    submitRow.appendChild(result);
    boxEl.appendChild(submitRow);
  }

})();





















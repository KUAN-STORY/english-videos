/* ---------------------------------------------------------
   player.js  — quiz 整合版
   需求：
   1) 右側面板已有 <div id="pane-quiz">、<ol id="quizList">、
      <span id="quizMeta">、<button id="btnPrintQuiz">、
      <button id="btnShowAnswer">
   2) 題庫路徑：data/quiz-<slug>.json
      （你已提供：quiz-mid-autumn.json / quiz-lantern.json / quiz-houyi.json）
   3) 影片 slug 從 URL 取得：?slug=<slug>
--------------------------------------------------------- */

/* ====== 小工具 ====== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/** 取得 URL 上的 slug，預設 mid-autumn */
function getSlug() {
  const u = new URL(location.href);
  return u.searchParams.get('slug') || 'mid-autumn';
}

/* ====== Quiz 讀取/渲染 ====== */

/** 初始化測驗（可在頁面載入或切到「測驗」分頁時呼叫） */
async function loadQuizForCurrentVideo() {
  const slug  = getSlug();
  const url   = `data/quiz-${slug}.json?v=${Date.now()}`;
  const list  = $('#quizList');
  const meta  = $('#quizMeta');

  if (!list) return; // 安全保護：沒有面板就不做

  list.innerHTML = `<li style="list-style:none;color:#9fb3ff">載入測驗中…</li>`;
  if (meta) meta.textContent = '';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    /** @type {Array<{type:string,q:string,options?:string[],a:any}>} */
    const questions = await res.json();

    renderQuiz(questions, list);
    if (meta) meta.textContent = `共 ${questions.length} 題`;

    // 綁定按鈕
    const btnPrint = $('#btnPrintQuiz');
    const btnShow  = $('#btnShowAnswer');
    if (btnPrint) btnPrint.onclick = () => printQuiz(questions);
    if (btnShow)  btnShow.onclick  = () => toggleAnswers(list, true);

  } catch (err) {
    list.innerHTML = `<li style="list-style:none;color:#f66">讀取測驗失敗：${escapeHTML(err.message)}</li>`;
  }
}

/** 產生題目列表 */
function renderQuiz(questions, listEl) {
  listEl.innerHTML = '';
  questions.forEach((q, i) => {
    const li = document.createElement('li');
    li.style.margin = '10px 0';

    // 題幹
    const stem = document.createElement('div');
    stem.innerHTML = escapeHTML(q.q);
    stem.style.marginBottom = '6px';
    li.appendChild(stem);

    // 題型
    if (q.type === 'mcq' && Array.isArray(q.options)) {
      const ul = document.createElement('ul');
      ul.style.margin = '0'; ul.style.paddingLeft = '18px';
      q.options.forEach((opt, idx) => {
        const liOpt = document.createElement('li');
        liOpt.textContent = opt;
        liOpt.dataset.idx = idx;
        ul.appendChild(liOpt);
      });
      li.appendChild(ul);

      const ans = document.createElement('div');
      ans.className = 'quiz-answer';
      ans.style.display = 'none';
      ans.style.color = '#8ef5b3';
      ans.style.marginTop = '6px';
      ans.textContent = `答案：${String.fromCharCode(65 + Number(q.a))}（${q.options[q.a]}）`;
      li.appendChild(ans);

    } else if (q.type === 'tf') {
      const row = document.createElement('div');
      row.style.opacity = '0.9';
      row.innerHTML = '（是 / 否）';
      li.appendChild(row);

      const ans = document.createElement('div');
      ans.className = 'quiz-answer';
      ans.style.display = 'none';
      ans.style.color = '#8ef5b3';
      ans.style.marginTop = '6px';
      ans.textContent = `答案：${q.a === true ? '是' : '否'}`;
      li.appendChild(ans);

    } else if (q.type === 'fill') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '在此作答';
      Object.assign(input.style, {
        padding:'6px 8px', borderRadius:'8px', border:'1px solid #334',
        background:'#0f1a33', color:'#fff', marginTop:'4px'
      });
      li.appendChild(input);

      const ans = document.createElement('div');
      ans.className = 'quiz-answer';
      ans.style.display = 'none';
      ans.style.color = '#8ef5b3';
      ans.style.marginTop = '6px';
      ans.textContent = `答案：${q.a}`;
      li.appendChild(ans);

    } else {
      const warn = document.createElement('div');
      warn.style.color = '#f6a';
      warn.textContent = '（未知題型或資料格式錯誤）';
      li.appendChild(warn);
    }

    // 題型小字
    const tag = document.createElement('div');
    tag.style.color = '#789';
    tag.style.fontSize = '12px';
    tag.style.marginTop = '6px';
    tag.textContent = `題型：${String(q.type).toUpperCase()}`;
    li.appendChild(tag);

    // 分隔線
    const hr = document.createElement('div');
    hr.style.borderTop = '1px dashed #223';
    hr.style.marginTop = '10px';
    li.appendChild(hr);

    listEl.appendChild(li);
  });
}

/** 顯示/隱藏答案 */
function toggleAnswers(listEl, show = true) {
  listEl.querySelectorAll('.quiz-answer').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
}

/** 列印題目（題目頁 + 答案頁） */
function printQuiz(questions) {
  const titleMap = {
    'mid-autumn': 'Mid-Autumn Festival',
    'lantern':    'The Lantern Festival',
    'houyi':      'Hou Yi Shoots the Suns'
  };
  const slug  = getSlug();
  const title = titleMap[slug] || slug;

  const css = `
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,sans-serif;line-height:1.6;padding:20px;}
      h1{margin:0 0 12px 0}
      .muted{color:#666}
      ol{padding-left:20px}
      li{margin:10px 0}
      .opt{margin-left:18px}
      .page-break{page-break-before:always;}
      .ans{color:#0a7a53}
      .ft12{font-size:12px}
    </style>`;

  // 題目頁
  const qHtml = questions.map((q, i) => {
    if (q.type === 'mcq') {
      const opts = q.options.map((o, j) => `<div class="opt">${String.fromCharCode(65+j)}. ${escapeHTML(o)}</div>`).join('');
      return `<li>${escapeHTML(q.q)}${opts}</li>`;
    }
    if (q.type === 'tf')   return `<li>${escapeHTML(q.q)}　（　是 / 否　）</li>`;
    if (q.type === 'fill') return `<li>${escapeHTML(q.q)}　（　）</li>`;
    return `<li>${escapeHTML(q.q)}</li>`;
  }).join('');

  // 答案頁
  const aHtml = questions.map((q, i) => {
    if (q.type === 'mcq') return `<li>第 ${i+1} 題：<span class="ans">${String.fromCharCode(65+Number(q.a))}. ${escapeHTML(q.options[q.a])}</span></li>`;
    if (q.type === 'tf')  return `<li>第 ${i+1} 題：<span class="ans">${q.a===true?'是':'否'}</span></li>`;
    if (q.type === 'fill')return `<li>第 ${i+1} 題：<span class="ans">${escapeHTML(String(q.a))}</span></li>`;
    return `<li>第 ${i+1} 題：<span class="ans">（未知題型）</span></li>`;
  }).join('');

  const html = `
    <!doctype html><html><head><meta charset="utf-8">${css}</head><body>
      <h1>${escapeHTML(title)} 測驗題目</h1>
      <div class="muted ft12">（列印本：題目頁）</div>
      <ol>${qHtml}</ol>

      <div class="page-break"></div>
      <h1>${escapeHTML(title)} 測驗答案</h1>
      <div class="muted ft12">（列印本：答案頁）</div>
      <ol>${aHtml}</ol>
      <script>window.print();<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

/* ====== 你原本的初始化 ======
   若你已經有 initPlayer() 就把 loadQuizForCurrentVideo()
   放到你的 initPlayer() 最後面。這裡做兼容：若沒有就自己跑。 */
function initPlayerIfAny() {
  // 若你的既有 player 初始化函式名稱不是 initPlayer，
  // 可以在這裡改寫或直接呼叫現成的初始化。
  if (typeof initPlayer === 'function') {
    try { initPlayer(); } catch(e) { console.warn('initPlayer 執行時出錯（忽略）', e); }
  }
}

/* ====== 啟動 ====== */
document.addEventListener('DOMContentLoaded', () => {
  // 1) 保留你原先的播放器初始化
  initPlayerIfAny();
  // 2) 啟動測驗載入
  loadQuizForCurrentVideo();

  // 如果你是用 Tabs，且想在「切換到測驗」時再載入一次，可解除以下註解：
  // const tabQuiz = document.querySelector('[data-tab="quiz"]');
  // if (tabQuiz) tabQuiz.addEventListener('click', () => loadQuizForCurrentVideo());
});























































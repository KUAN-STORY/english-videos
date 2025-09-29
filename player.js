/* player.js — Hotfix v7.2-f2
 * 1) 左側工具列：速度、填滿畫面 綁定
 * 2) 右側：字幕 / 測驗 / 單字 — 安全載入，多檔名候選
 * 3) DOM 安全：找不到節點不報錯、不中斷
 */

/* ---------------- 小工具 ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function getSlug() {
  const slug = new URLSearchParams(location.search).get('slug') || 'mid-autumn';
  return slug.trim();
}

async function tryFetchJSON(paths) {
  for (const p of paths) {
    try {
      const res = await fetch(p, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* 忽略，試下一個 */ }
  }
  return null;
}

/* 右側狀態顯示 */
function setPaneStatus(text) {
  const pane = $('#pane-sub') || $('#pane-quiz') || $('#pane-vocab');
  if (!pane) return;
  pane.innerHTML = `<div style="padding:12px;color:#9fb0d4">${text}</div>`;
}

/* ---------------- 左側：影片控件 ---------------- */
function initVideoControls() {
  const video = $('#player');
  if (!video) return;

  // 速度
  const speedRange = $('#speedRange');
  const speedLabel = $('#speedLabel');
  if (speedRange) {
    const apply = v => {
      const rate = parseFloat(v) || 1;
      video.playbackRate = rate;
      if (speedLabel) speedLabel.textContent = `${rate.toFixed(2)}x`;
    };
    apply(speedRange.value || 1);
    speedRange.addEventListener('input', () => apply(speedRange.value));
  }

  // 填滿畫面（object-fit: contain/cover）
  const btnFill = $('#btnFill');
  if (btnFill) {
    let cover = false;
    const apply = () => {
      cover = !cover;
      video.style.objectFit = cover ? 'cover' : 'contain';
      video.style.backgroundColor = '#000';
      btnFill.dataset.state = cover ? 'cover' : 'contain';
      // 你原本按鈕文字若需要改，可在此同步處理
    };
    // 初始保留 contain
    video.style.objectFit = 'contain';
    video.style.backgroundColor = '#000';
    btnFill.addEventListener('click', apply);
  }
}

/* ---------------- 右側：字幕 / 測驗 / 單字 ---------------- */

/** 渲染簡版字幕表（只為了確保有東西，避免整體掛掉）
 * subs 格式期望：[{t: "00:01", en:"text", zh:"中文"}, ...] 或類似鍵名
 */
function renderSubsTable(rows) {
  const host = $('#pane-sub');
  if (!host) return;
  if (!rows || !rows.length) {
    host.innerHTML = `<div style="padding:12px;color:#9fb0d4">查無字幕資料</div>`;
    return;
  }
  const to = (s) => s ?? '';
  let html = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">時間</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">英文</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">中文</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const r of rows) {
    const t  = r.time || r.t || '';
    const en = r.en   || r.text_en || '';
    const zh = r.zh   || r.text_zh || '';
    html += `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${to(t)}</td>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${to(en)}</td>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${to(zh)}</td>
      </tr>`;
  }
  html += `</tbody></table>`;
  host.innerHTML = html;
}

/** 渲染簡版測驗（僅確保能顯示，交卷仍走你原流程）
 * quiz 格式扁平：[ {type:'mcq'|'tf'|'fill', q:'', options?:[], a}, ... ]
 */
function renderQuizList(items) {
  const host = $('#pane-quiz');
  if (!host) return;
  if (!items || !items.length) {
    host.innerHTML = `<div style="padding:12px;color:#9fb0d4">查無測驗資料</div>`;
    return;
  }
  let html = `<ol style="padding:16px 22px">`;
  items.forEach((it, i) => {
    html += `<li style="margin:10px 0">
      <div style="margin-bottom:6px">${it.q || '(無題目)'} <span style="opacity:.6">[${it.type||''}]</span></div>`;
    if (Array.isArray(it.options)) {
      html += `<ul style="margin:0 0 8px 20px">`;
      it.options.forEach((op, idx) => {
        html += `<li>${String.fromCharCode(65+idx)}. ${op}</li>`;
      });
      html += `</ul>`;
    }
    html += `</li>`;
  });
  html += `</ol>`;
  host.innerHTML = html;
}

/** 渲染簡版單字（填空 + 朗讀圖示占位）
 * vocab 格式：{ title, items:[ {time:"00:01", word:"", pos:"", zh:"", en:"", example:"", grammar:""}, ... ] }
 */
function renderVocabList(vdata) {
  const host = $('#pane-vocab');
  if (!host) return;

  if (!vdata || !Array.isArray(vdata.items) || !vdata.items.length) {
    host.innerHTML = `<div style="padding:12px;color:#9fb0d4">查無單字資料</div>`;
    return;
  }

  let html = `<div style="padding:10px 12px">`;
  if (vdata.title) html += `<div style="margin-bottom:8px;opacity:.8">${vdata.title}</div>`;
  html += `<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">時間</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">單字</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">詞性</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">中文</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #1f2a44">英文解釋／例句／語法</th>
      </tr>
    </thead>
    <tbody>`;

  for (const it of vdata.items) {
    const t   = it.time || '';
    const w   = it.word || '';
    const pos = it.pos  || '';
    const zh  = it.zh   || '';
    // 例句填空
    const exampleRaw = it.example || '';
    const regex = new RegExp(`\\b${w}\\b`, 'gi');
    const exampleMasked = exampleRaw ? exampleRaw.replace(regex, '____') : '';

    let right = '';
    if (it.en)      right += `<div style="margin-bottom:4px;opacity:.9">${it.en}</div>`;
    if (exampleRaw) right += `<div style="margin-bottom:4px">例：${exampleMasked}</div>`;
    if (it.grammar) right += `<div style="opacity:.75">📌 ${it.grammar}</div>`;

    html += `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${t}</td>
        <td style="padding:8px;border-bottom:1px solid #1b2544">
          ${w}
          <button style="margin-left:8px;border:1px solid #2a3a66;background:#0f1a33;color:#cde; border-radius:6px;padding:2px 6px;cursor:pointer"
                  data-say="${w}">🔊</button>
        </td>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${pos}</td>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${zh}</td>
        <td style="padding:8px;border-bottom:1px solid #1b2544">${right}</td>
      </tr>`;
  }
  html += `</tbody></table></div>`;
  host.innerHTML = html;

  // 朗讀
  host.querySelectorAll('[data-say]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      try {
        const u = new SpeechSynthesisUtterance(btn.dataset.say || '');
        u.lang = 'en-US';
        speechSynthesis.speak(u);
      } catch(e){}
    });
  });
}

/* ---------------- 載入器 ---------------- */
async function loadSubs(slug) {
  const cands = [
    `data/subs-${slug}.json`,
    `data/${slug}-subs.json`,
    `data/${slug}.subs.json`
  ];
  const data = await tryFetchJSON(cands);
  if (!data) {
    const host = $('#pane-sub');
    if (host) host.innerHTML = `<div style="padding:12px;color:#9fb0d4">查無字幕資料（嘗試：${cands.join(', ')}）</div>`;
    return;
  }
  const rows = Array.isArray(data) ? data : (data.items || data.rows || []);
  renderSubsTable(rows);
}

async function loadQuiz(slug) {
  const cands = [
    `data/quiz-${slug}.json`,
    `data/${slug}-quiz.json`,
    `data/${slug}.quiz.json`
  ];
  const data = await tryFetchJSON(cands);
  const host = $('#pane-quiz');
  if (!data) {
    if (host) host.innerHTML = `<div style="padding:12px;color:#9fb0d4">查無測驗資料（嘗試：${cands.join(', ')}）</div>`;
    return;
  }
  const items = Array.isArray(data) ? data : (data.items || []);
  renderQuizList(items);
}

async function loadVocab(slug) {
  const cands = [
    `data/vocab-${slug}.json`,
    `data/${slug}-vocab.json`,
    `data/${slug}.vocab.json`
  ];
  const data = await tryFetchJSON(cands);
  const host = $('#pane-vocab');
  if (!data) {
    if (host) host.innerHTML = `<div style="padding:12px;color:#9fb0d4">查無單字資料（嘗試：${cands.join(', ')}）</div>`;
    return;
  }
  renderVocabList(data);
}

/* ---------------- 啟動 ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initVideoControls();

    const slug = getSlug();

    // Tabs 綁定（若你本來就有就不影響）
    const tabs = $$('.tab,[data-tab]');
    tabs.forEach(tb=>{
      tb.addEventListener('click', ()=>{
        $$('.tab,[data-tab]').forEach(x=>x.classList.remove('active'));
        tb.classList.add('active');
        const t = tb.getAttribute('data-tab') || '';
        $('#pane-sub')?.style && ($('#pane-sub').style.display = (t==='sub' || t==='')?'block':'none');
        $('#pane-quiz')?.style && ($('#pane-quiz').style.display = (t==='quiz')?'block':'none');
        $('#pane-vocab')?.style && ($('#pane-vocab').style.display = (t==='vocab')?'block':'none');
      });
    });

    // 預設載入三個（若你的頁籤是切換時才載，這段也可保留，至少頁面進來就有資料）
    await Promise.allSettled([
      loadSubs(slug),
      loadQuiz(slug),
      loadVocab(slug)
    ]);

  } catch (err) {
    console.error('[player.js] 初始化失敗：', err);
    setPaneStatus('初始化失敗，請按 F12 查看 Console 錯誤訊息。');
  }
});
























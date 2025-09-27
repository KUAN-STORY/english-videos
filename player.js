/* =========================
 * Player – 整合：影片 / 字幕 / 測驗 / 單字
 * ========================= */

const qs = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => [...p.querySelectorAll(s)];
const byId = (id) => document.getElementById(id);

const video = byId('video');
const subsBody  = byId('subsBody');
const quizBody  = byId('quizBody');
const vocabBody = byId('vocabBody');
const offsetValEl = byId('offsetVal');

const params = new URLSearchParams(location.search);
const slug = params.get('slug') || 'mid-autumn'; // 預設給一個，避免空值

/* -------- 影片路徑：用 URL 保證絕對路徑 -------- */
const videoURL = new URL(`./videos/${slug}.mp4`, location.href).href;
video.src = videoURL;
video.load();

video.addEventListener('canplay', () => {
  console.log('[video] canplay:', videoURL);
});
video.addEventListener('error', (e) => {
  console.error('[video] load error:', videoURL, e, video?.error);
});

/* -------- 偏移與跟隨 -------- */
let follow = true;
let offset = 0.0;

byId('followBtn').addEventListener('click', (e) => {
  follow = !follow;
  e.currentTarget.classList.toggle('on', follow);
});

qsa('.ctrlRow .chip[data-delta]').forEach(btn => {
  btn.addEventListener('click', () => {
    const d = parseFloat(btn.dataset.delta);
    offset = Math.round((offset + d) * 10) / 10;
    offsetValEl.textContent = offset.toFixed(1);
  });
});

/* -------- Tab 切換 -------- */
qsa('.tab').forEach(t => {
  t.addEventListener('click', () => {
    qsa('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const pane = t.dataset.pane;
    byId('pane-subs').hidden  = pane !== 'subs';
    byId('pane-quiz').hidden  = pane !== 'quiz';
    byId('pane-vocab').hidden = pane !== 'vocab';
  });
});

/* -------- 載入 JSON -------- */
const dataBase = new URL('./data/', location.href).href;

async function fetchJSON(name) {
  const url = new URL(name, dataBase).href;
  try {
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    const j = await r.json();
    console.log('[data] loaded:', name, j);
    return j;
  } catch (err) {
    console.error('[data] load error:', name, err);
    return {__error: err.message, __url: name};
  }
}

/* -------- 字幕：cues-<slug>.json --------
 * 期待格式：
 *   [{ "start": 1.23, "end": 5.67, "en": "text", "zh": "文字" }, ...]
 * ---------------------------------------- */
let cueRows = [];

async function loadSubs() {
  const name = `cues-${slug}.json`;
  const j = await fetchJSON(name);
  subsBody.innerHTML = '';
  cueRows = [];

  if (j.__error) {
    subsBody.innerHTML = `<tr><td colspan="3" class="warn">查無字幕（./data/${name}）</td></tr>`;
    return;
  }
  if (!Array.isArray(j) || j.length === 0) {
    subsBody.innerHTML = `<tr><td colspan="3" class="muted">目前沒有字幕資料</td></tr>`;
    return;
  }

  j.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.className = 'row';
    tr.dataset.start = c.start ?? 0;
    tr.dataset.end   = c.end ?? (c.start ?? 0) + 4;
    tr.innerHTML = `
      <td><span class="timeBtn" data-t="${c.start??0}">${secToClock(c.start??0)}</span></td>
      <td>${escapeHTML(c.en ?? '')}</td>
      <td>${escapeHTML(c.zh ?? '')}</td>`;
    subsBody.appendChild(tr);
    cueRows.push(tr);
  });

  // 點時間 → 跳播
  qsa('.timeBtn', subsBody).forEach(a => {
    a.addEventListener('click', () => {
      const t = parseFloat(a.dataset.t || '0');
      video.currentTime = Math.max(0, t + offset);
      video.play();
    });
  });

  // 影片播放 → 高亮當前句
  video.addEventListener('timeupdate', highlightActiveRow);
}

function highlightActiveRow() {
  if (!follow) return;
  const t = video.currentTime - offset;
  let active;
  for (const tr of cueRows) {
    const st = parseFloat(tr.dataset.start);
    const ed = parseFloat(tr.dataset.end);
    if (t >= st && t < ed) { active = tr; break; }
  }
  qsa('#subsBody .row.active').forEach(x => x.classList.remove('active'));
  if (active) {
    active.classList.add('active');
    // 若不在視窗中，捲動
    const box = byId('pane-subs');
    const top = active.offsetTop - 120;
    if (box.scrollTop > top || (active.offsetTop > box.scrollTop + box.clientHeight - 120)) {
      box.scrollTo({top, behavior:'smooth'});
    }
  }
}

/* -------- 測驗：quiz-<slug>.json --------
 * 期待格式：
 *   [{q:"...", a:["...","...","...","..."], answerIndex:2, explain:"..."}, ...]
 * ---------------------------------------- */
async function loadQuiz() {
  const name = `quiz-${slug}.json`;
  const j = await fetchJSON(name);
  quizBody.innerHTML = '';

  if (j.__error) {
    quizBody.innerHTML = `<tr><td colspan="3" class="warn">查無測驗資料（./data/${name}）</td></tr>`;
    return;
  }
  if (!Array.isArray(j) || j.length === 0) {
    quizBody.innerHTML = `<tr><td colspan="3" class="muted">目前沒有測驗資料</td></tr>`;
    return;
  }

  j.forEach((q, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${escapeHTML(q.q ?? '')}</td>
      <td>
        <div>
          ${q.a.map((opt, i) => `
            <label style="display:block; margin:4px 0">
              <input type="radio" name="q${idx}" value="${i}"> ${escapeHTML(opt)}
            </label>
          `).join('')}
        </div>
        <div class="muted" style="margin-top:6px">答對：第 ${Number(q.answerIndex)+1} 項</div>
        ${q.explain ? `<div style="margin-top:6px">${escapeHTML(q.explain)}</div>`:''}
      </td>`;
    quizBody.appendChild(tr);
  });
}

/* -------- 單字：vocab-<slug>.json --------
 * 期待格式：
 *   [{time:1.23, word:"festival", pos:"n.", cn:"節日",
 *     en:"a special day...", eg:[{t:1.23, s:"..."}] }, ...]
 * ---------------------------------------- */
let speech;
try {
  speech = window.speechSynthesis;
} catch(_) {}

async function loadVocab() {
  const name = `vocab-${slug}.json`;
  const j = await fetchJSON(name);
  vocabBody.innerHTML = '';

  if (j.__error) {
    vocabBody.innerHTML = `<tr><td colspan="3" class="warn">查無單字資料（./data/${name}）</td></tr>`;
    return;
  }
  if (!Array.isArray(j) || j.length === 0) {
    vocabBody.innerHTML = `<tr><td colspan="3" class="muted">目前沒有單字資料</td></tr>`;
    return;
  }

  j.forEach((v) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="timeBtn" data-t="${v.time??0}">${secToClock(v.time??0)}</span></td>
      <td>
        <span class="playWord" title="朗讀">🔊</span>
        <strong>${escapeHTML(v.word ?? '')}</strong>
        <span class="muted">${escapeHTML(v.pos ?? '')}</span>
        ${v.cn ? `<div class="vocab-cn">${escapeHTML(v.cn)}</div>`:''}
      </td>
      <td>
        ${v.en ? `<div class="vocab-en">${escapeHTML(v.en)}</div>`:''}
        ${Array.isArray(v.eg) && v.eg.length ? `
          <div style="margin-top:6px">
            ${v.eg.map(e => `<span class="egAnchor" data-t="${e.t??0}">${escapeHTML(e.s ?? '')}</span>`).join('<br/>')}
          </div>` : ''
        }
      </td>`;
    vocabBody.appendChild(tr);

    // 朗讀
    tr.querySelector('.playWord')?.addEventListener('click', () => speak(v.word));
  });

  // 點「時間 / 例句」→ 跳到該時間
  qsa('.timeBtn', vocabBody).forEach(el => {
    el.addEventListener('click', () => {
      const t = parseFloat(el.dataset.t || '0');
      video.currentTime = Math.max(0, t + offset);
      video.play();
    });
  });
  qsa('.egAnchor', vocabBody).forEach(el => {
    el.addEventListener('click', () => {
      const t = parseFloat(el.dataset.t || '0');
      video.currentTime = Math.max(0, t + offset);
      video.play();
    });
  });
}

/* -------- helper -------- */
function secToClock(s) {
  s = Math.max(0, Number(s)||0);
  const m = Math.floor(s/60);
  const sec = Math.floor(s%60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function escapeHTML(str=''){ return String(str)
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

function speak(text=''){
  if (!speech) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 1;
  speech.cancel();
  speech.speak(u);
}

/* -------- 啟動 -------- */
(async function init(){
  await Promise.all([loadSubs(), loadQuiz(), loadVocab()]);
})();

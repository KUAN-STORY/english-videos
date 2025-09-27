<script>
// ---------- 基本工具 ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const qs = new URLSearchParams(location.search);
const slug = qs.get('slug') || 'mid-autumn';

const video = $('#video');
const subtitleBody = $('#subtitleTable');
const quizBox = $('#quizContainer');
const wordsBox = $('#wordsContainer');

// 某些檔案可能不存在，這個 helper 會吃錯誤、回傳 null
async function safeFetchJSON(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// 00:01 / [00:01] 轉秒
function toSec(t) {
  if (!t) return 0;
  const s = ('' + t).replace(/\[|\]/g, '');
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return Number(s) || 0;
  const mm = Number(m[1]), ss = Number(m[2]), hh = Number(m[3] || 0);
  return hh * 3600 + mm * 60 + ss;
}

// 秒轉 00:00
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `[${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}]`;
}

// ---------- 載入影片 ----------
async function setupVideo() {
  // 先嘗試從 data/index.json 找影片路徑；找不到就用 videos/<slug>.mp4
  const idx = await safeFetchJSON('data/index.json');
  let src = `videos/${slug}.mp4`;
  if (idx?.items?.length) {
    const it = idx.items.find(x => x.slug === slug);
    if (it?.video) src = it.video;
  }
  video.src = src;
}

// ---------- 字幕 ----------
let cues = [];          // {start,en,zh}
let currentRowIndex = -1;
let repeatOne = false;  // 重複本句
let ab = { a: null, b: null, on: false };

async function setupSubtitles() {
  // 支援 data/cues-<slug>.json
  const data = await safeFetchJSON(`data/cues-${slug}.json`);
  cues = [];

  if (Array.isArray(data)) {
    // 直接是陣列 [{time,en,zh} 或 {t...}]
    for (const c of data) {
      const start = c.start ?? toSec(c.time ?? c.t);
      cues.push({ start, en: c.en || c.eng || '', zh: c.zh || c.cn || '' });
    }
  } else if (Array.isArray(data?.items)) {
    for (const c of data.items) {
      const start = c.start ?? toSec(c.time ?? c.t);
      cues.push({ start, en: c.en || '', zh: c.zh || '' });
    }
  }

  cues.sort((a, b) => a.start - b.start);
  renderSubtitleTable();
}

function renderSubtitleTable() {
  subtitleBody.innerHTML = '';
  if (!cues.length) {
    subtitleBody.innerHTML = `<tr><td colspan="3" style="color:#94a3b8">尚無字幕資料</td></tr>`;
    return;
  }
  for (let i = 0; i < cues.length; i++) {
    const tr = document.createElement('tr');
    tr.dataset.i = i;
    tr.innerHTML = `
      <td style="white-space:nowrap;color:#94a3b8">${fmtTime(cues[i].start)}</td>
      <td>${cues[i].en || ''}</td>
      <td style="color:#cbd5e1">${cues[i].zh || ''}</td>
    `;
    tr.addEventListener('click', () => {
      const t = cues[i].start + 0.05;
      video.currentTime = t;
      video.play();
    });
    subtitleBody.appendChild(tr);
  }
}

function highlightByTime(t) {
  if (!cues.length) return;
  let i = cues.findIndex((c, idx) => {
    const next = cues[idx + 1]?.start ?? 999999;
    return t >= c.start && t < next;
  });
  if (i < 0) {
    if (t < cues[0].start) i = 0;
    else i = cues.length - 1;
  }
  if (i !== currentRowIndex) {
    if (currentRowIndex >= 0) {
      const old = subtitleBody.querySelector(`tr[data-i="${currentRowIndex}"]`);
      old && old.classList.remove('active-row');
    }
    currentRowIndex = i;
    const row = subtitleBody.querySelector(`tr[data-i="${i}"]`);
    if (row) {
      row.classList.add('active-row');
      row.style.background = '#0b1220';
      row.scrollIntoView({ block: 'center' });
    }
  }
}

// ---------- 測驗 ----------
async function setupQuiz() {
  const q = await safeFetchJSON(`data/quiz-${slug}.json`);
  if (!q?.items?.length) {
    quizBox.innerHTML = `<div style="color:#94a3b8">尚無測驗資料</div>`;
    return;
  }
  // 只做最簡單的單題選擇展示
  quizBox.innerHTML = q.items.map((x, i) => `
    <div style="margin:12px 0;padding:12px;border:1px solid #334155;border-radius:8px">
      <div style="margin-bottom:8px">${i+1}. ${x.question}</div>
      <div>
        ${x.options.map((op, j) => `
          <label style="display:block;margin:4px 0;cursor:pointer">
            <input type="radio" name="q${i}" value="${op}">
            <span style="margin-left:6px">${op}</span>
          </label>
        `).join('')}
      </div>
      ${x.explain ? `<div style="color:#94a3b8;margin-top:6px">提示：${x.explain}</div>`:''}
    </div>
  `).join('');
}

// ---------- 單字 ----------
async function setupWords() {
  const v = await safeFetchJSON(`data/vocab-${slug}.json`);
  if (!v?.items?.length) {
    wordsBox.innerHTML = `<div style="color:#94a3b8">尚無單字資料</div>`;
    return;
  }
  wordsBox.innerHTML = v.items.map(w => `
    <div style="padding:10px 12px;border-bottom:1px solid #334155">
      <div style="font-weight:700">${w.word} <small style="color:#94a3b8">${w.pos || ''}</small></div>
      ${w.zh ? `<div style="margin-top:2px">${w.zh}</div>`:''}
      ${w.en ? `<div style="margin-top:2px;color:#cbd5e1">${w.en}</div>`:''}
      ${w.example ? `<div style="margin-top:6px;color:#93c5fd">例：${w.example}</div>`:''}
    </div>
  `).join('');
}

// ---------- 控制列：上一句 / 下一句 / 重複本句 / A-B 循環 ----------
function seekToIndex(i, play = true) {
  if (!cues.length) return;
  i = Math.max(0, Math.min(cues.length - 1, i));
  currentRowIndex = i;
  video.currentTime = cues[i].start + 0.05;
  if (play) video.play();
}

$('#btnPrevLine').addEventListener('click', () => {
  if (currentRowIndex <= 0) seekToIndex(0);
  else seekToIndex(currentRowIndex - 1);
});
$('#btnNextLine').addEventListener('click', () => {
  if (currentRowIndex < 0) seekToIndex(0);
  else seekToIndex(currentRowIndex + 1);
});
$('#btnPlayPause').addEventListener('click', () => {
  if (video.paused) video.play(); else video.pause();
});
$('#btnRepeatLine').addEventListener('click', () => {
  repeatOne = !repeatOne;
  alert(repeatOne ? '重複本句：開' : '重複本句：關');
});
$('#btnAB').addEventListener('click', () => {
  if (ab.a == null) {
    ab.a = video.currentTime;
    alert(`A 點已設定：${fmtTime(ab.a)}`);
  } else if (ab.b == null) {
    ab.b = video.currentTime;
    if (ab.b <= ab.a) {
      alert('B 必須大於 A，已清除');
      ab = { a: null, b: null, on: false };
      return;
    }
    ab.on = true;
    alert(`A-B 循環啟動：${fmtTime(ab.a)} ~ ${fmtTime(ab.b)}`);
  } else {
    // 第三次點：清除
    ab = { a: null, b: null, on: false };
    alert('A-B 循環已清除');
  }
});
$('#btnCancelAB').addEventListener('click', () => {
  ab = { a: null, b: null, on: false };
  repeatOne = false;
  alert('循環/重複已關閉');
});

// 影片時間變動：滾動標示 + 控循環
video.addEventListener('timeupdate', () => {
  const t = video.currentTime;
  highlightByTime(t);

  // 重複本句
  if (repeatOne && currentRowIndex >= 0) {
    const s = cues[currentRowIndex].start;
    const e = cues[currentRowIndex + 1]?.start ?? (s + 3);
    if (t >= e - 0.05) video.currentTime = s + 0.02;
  }

  // A-B loop
  if (ab.on && ab.a != null && ab.b != null) {
    if (t >= ab.b - 0.02) video.currentTime = ab.a + 0.02;
  }
});

// ---------- Tabs ----------
$$('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    ['subtitles','quiz','words'].forEach(id => {
      $('#' + id).style.display = (id === tab ? 'block' : 'none');
    });
  });
});

// ---------- 啟動 ----------
(async function init() {
  await setupVideo();
  await setupSubtitles();
  await setupQuiz();
  await setupWords();

  // 簡單的 row 高亮樣式
  const style = document.createElement('style');
  style.textContent = `
    #subtitleTable tr.active-row { outline: 2px solid #60a5fa; }
    #subtitleTable tr:hover { background:#0b1324; }
  `;
  document.head.appendChild(style);
})();
</script>

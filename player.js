/* player.js v5.1 – safe init + subtitles follow/offset/speed + row seek */

(() => {
  // -------- helpers --------
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ---- required DOM (請確認這些 id 已存在於 player.html) ----
  const el = {
    video:        $('#player-video'),
    speed:        $('#speed-range'),
    speedText:    $('#speed-text'),
    followBtn:    $('#btn-follow'),
    offsetMinus:  $('#btn-offset-minus'),
    offsetReset:  $('#btn-offset-reset'),
    offsetPlus:   $('#btn-offset-plus'),
    offsetText:   $('#offset-text'),
    prevBtn:      $('#btn-prev'),
    nextBtn:      $('#btn-next'),
    tbody:        $('#cues-tbody'),
  };

  // 若有元素找不到，直接提示並停止，避免整頁空白
  const missing = Object.entries(el).filter(([,node]) => !node).map(([k]) => k);
  if (missing.length) {
    console.error('[player.js] Missing DOM:', missing);
    return;
  }

  // -------- state --------
  let cues = [];            // {time:'MM:SS', en:'', zh:''}
  let follow = true;
  let offsetMs = 0;
  let currentIdx = -1;

  // -------- speed --------
  const setSpeed = (v) => {
    v = Number(v) || 1;
    el.video.playbackRate = v;
    el.speed.value = v;
    el.speedText.textContent = `${v.toFixed(2)}x`;
  };
  setSpeed(el.speed.value || 1);
  el.speed.addEventListener('input', e => setSpeed(e.target.value));

  // -------- follow --------
  const setFollow = (on) => {
    follow = !!on;
    el.followBtn.classList.toggle('is-on', follow);
    el.followBtn.setAttribute('aria-pressed', follow);
  };
  setFollow(true);
  el.followBtn.addEventListener('click', () => setFollow(!follow));

  // -------- offset --------
  const displayOffset = () => (el.offsetText.textContent = (offsetMs/1000).toFixed(1) + 's');
  displayOffset();
  el.offsetMinus.addEventListener('click', () => { offsetMs -= 500; displayOffset(); });
  el.offsetPlus.addEventListener('click',  () => { offsetMs += 500; displayOffset(); });
  el.offsetReset.addEventListener('click', () => { offsetMs = 0; displayOffset(); });

  // -------- time helpers --------
  const timeToSec = (t) => {
    const [m, s] = t.split(':').map(Number);
    return m * 60 + s;
  };
  const findIdxByTime = (sec) => {
    // 從後往前找；sec 已加上偏移
    for (let i = cues.length - 1; i >= 0; i--) {
      if (timeToSec(cues[i].time) <= sec) return i;
    }
    return 0;
  };

  // -------- render & behaviors --------
  const renderCues = () => {
    el.tbody.innerHTML = cues.map((c, i) => `
      <tr data-idx="${i}">
        <td class="tc">${c.time}</td>
        <td>${c.en}</td>
        <td>${c.zh || ''}</td>
      </tr>
    `).join('');
  };

  // 點字幕跳播
  el.tbody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr');
    if (!tr) return;
    const i = +tr.dataset.idx;
    el.video.currentTime = timeToSec(cues[i].time);
    el.video.play();
  });

  const highlight = (i) => {
    if (i === currentIdx) return;
    currentIdx = i;
    const rows = $$('#cues-tbody tr');
    rows.forEach((tr, idx) => tr.classList.toggle('active', idx === i));
    if (follow) {
      const row = rows[i];
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  // 播放時根據「時間 + 偏移」高亮當前列
  el.video.addEventListener('timeupdate', () => {
    if (!cues.length) return;
    const sec = el.video.currentTime + offsetMs / 1000;
    highlight(findIdxByTime(sec));
  });

  // 上/下一句
  el.prevBtn.addEventListener('click', () => {
    if (!cues.length) return;
    const sec = el.video.currentTime + offsetMs / 1000;
    const i = Math.max(0, findIdxByTime(sec) - 1);
    el.video.currentTime = timeToSec(cues[i].time);
  });
  el.nextBtn.addEventListener('click', () => {
    if (!cues.length) return;
    const sec = el.video.currentTime + offsetMs / 1000;
    const i = Math.min(cues.length - 1, findIdxByTime(sec) + 1);
    el.video.currentTime = timeToSec(cues[i].time);
  });

  // -------- load cues --------
  async function loadCues() {
    const slug = new URL(location.href).searchParams.get('slug') || 'mid-autumn';
    const url  = `./data/cues-${slug}.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cues = await res.json();
      if (!Array.isArray(cues)) throw new Error('Invalid cues json');
      renderCues();
    } catch (err) {
      console.error('[player.js] loadCues error:', err);
      el.tbody.innerHTML = `<tr><td colspan="3" class="tc text-danger">查無字幕（${url}）</td></tr>`;
    }
  }

  // 啟動
  loadCues();
})();
// --- player core (video + subtitle wiring) -------------------------------
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // 1) 取得 slug
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || 'mid-autumn';

  // 2) DOM
  const video = $('#video');
  const tbody = $('#cue-body');        // <tbody id="cue-body"> ... </tbody>
  const followChk = $('#follow');      // <input type="checkbox" id="follow">
  const offsetText = $('#offsetText'); // <span id="offsetText">0.0s</span>
  const minusBtn = $('#offsetMinus');  // <button id="offsetMinus">-0.5s</button>
  const plusBtn = $('#offsetPlus');    // <button id="offsetPlus">+0.5s</button>
  const speed = $('#speed');           // <input type="range" id="speed">
  const speedVal = $('#speedVal');     // <span id="speedVal">1.00x</span>

  // 3) 設定影片來源
  // 以相對路徑，確保 GitHub Pages 下子路徑也能正確載入
  video.src = `./videos/${slug}.mp4`;

  // 4) 偏移（每個 slug 各自記錄）
  const LS_KEY = `offset:${slug}`;
  let cueOffset = parseFloat(localStorage.getItem(LS_KEY) || '0');
  function renderOffset() {
    offsetText.textContent = `${cueOffset.toFixed(1)}s`;
  }
  renderOffset();
  minusBtn.removeAttribute('disabled');
  plusBtn.removeAttribute('disabled');
  minusBtn.addEventListener('click', () => {
    cueOffset = +(cueOffset - 0.5).toFixed(1);
    localStorage.setItem(LS_KEY, cueOffset);
    renderOffset();
  });
  plusBtn.addEventListener('click', () => {
    cueOffset = +(cueOffset + 0.5).toFixed(1);
    localStorage.setItem(LS_KEY, cueOffset);
    renderOffset();
  });

  // 5) 速度
  function renderSpeed() {
    speedVal.textContent = `${(+video.playbackRate).toFixed(2)}x`;
  }
  speed.addEventListener('input', () => {
    // 你的 range 0.5~2.0；如果不是，可改成 parseFloat(speed.value)
    video.playbackRate = parseFloat(speed.value);
    renderSpeed();
  });
  // 初始
  video.addEventListener('loadedmetadata', renderSpeed);

  // 6) 讀取字幕 JSON
  const cueUrl = `./data/cues-${slug}.json?ts=${Date.now()}`;
  let cues = []; // {time:'00:01', en:'...', zh:'...'}
  fetch(cueUrl)
    .then(r => {
      if (!r.ok) throw new Error(`load cues fail: ${r.status}`);
      return r.json();
    })
    .then(list => {
      cues = list;
      paintCues(cues);
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `
        <tr><td colspan="3" style="opacity:.7">查無字幕（${cueUrl}）</td></tr>`;
    });

  // 7) 字幕渲染 + 點擊跳播
  function toSec(mmss) {
    const [m, s] = mmss.split(':').map(Number);
    return m * 60 + s;
  }
  function paintCues(arr) {
    tbody.innerHTML = arr.map((c, i) => `
      <tr data-i="${i}" data-t="${toSec(c.time)}">
        <td class="time">${c.time}</td>
        <td class="en">${c.en}</td>
        <td class="zh">${c.zh ?? ''}</td>
      </tr>
    `).join('');

    // 點擊跳播
    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const t = parseFloat(tr.dataset.t || '0');
      video.currentTime = Math.max(0, t + cueOffset);
      video.play();
      if (followChk.checked) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  // 8) 播放時高亮 & 跟隨
  let lastHi = -1;
  function highlightByTime(cur) {
    if (!cues.length) return;
    // 找到目前時間對應的 cue index
    let idx = -1;
    for (let i = cues.length - 1; i >= 0; i--) {
      const t = toSec(cues[i].time) + cueOffset;
      if (cur >= t) { idx = i; break; }
    }
    if (idx === -1 || idx === lastHi) return;
    lastHi = idx;
    $$('#cue-body tr').forEach(tr => tr.classList.remove('active'));
    const tr = $(`#cue-body tr[data-i="${idx}"]`);
    tr?.classList.add('active');
    if (followChk.checked) tr?.scrollIntoView({ block: 'center' });
  }
  video.addEventListener('timeupdate', () => {
    highlightByTime(video.currentTime);
  });

  // 9) 可選：當偏移改變時，立即重算高亮（使用者調整後直覺效果）
  function reevalHighlightSoon() {
    requestAnimationFrame(() => highlightByTime(video.currentTime));
  }
  minusBtn.addEventListener('click', reevalHighlightSoon);
  plusBtn.addEventListener('click', reevalHighlightSoon);
})();







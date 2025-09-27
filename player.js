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






// ---------- Subtitles (cues) ----------
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const videoEl = document.getElementById('video');     // 你的 <video id="video">
const subBody  = $('#subBody');
const chkFollow = $('#chkFollow');
const btnMinus = $('#btnOffsetMinus');
const btnPlus  = $('#btnOffsetPlus');
const lblOffset = $('#lblOffset');

const qs = new URLSearchParams(location.search);
const slug = qs.get('slug') || 'mid-autumn';

let cues = [];            // {time:"00:01", en:"...", zh:"...", t: 秒數}
let currentIdx = -1;
let follow = true;
let offset = 0;           // 秒

if (chkFollow) {
  chkFollow.addEventListener('change', e => follow = e.target.checked);
}
if (btnMinus) btnMinus.addEventListener('click', () => adjustOffset(-0.5));
if (btnPlus)  btnPlus .addEventListener('click', () => adjustOffset(+0.5));

function adjustOffset(delta) {
  offset = Math.round((offset + delta) * 10) / 10;
  if (lblOffset) lblOffset.textContent = `${offset.toFixed(1)}s`;
}

function toSec(mmss) {
  // "MM:SS" or "HH:MM:SS"
  const p = mmss.split(':').map(Number);
  return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1];
}
const esc = s => (s ?? '').replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

async function loadCues() {
  try {
    const url = `./data/cues-${slug}.json?v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} fail`);
    const json = await res.json();
    cues = json.map((c, i) => ({ ...c, t: toSec(c.time), idx: i }));
    renderCues();
  } catch (err) {
    console.error(err);
    subBody.innerHTML =
      `<tr><td colspan="3" style="color:#ff9aa2">查無字幕資料（./data/cues-${slug}.json）</td></tr>`;
  }
}

function renderCues() {
  subBody.innerHTML = cues.map(c => `
    <tr data-idx="${c.idx}">
      <td class="time">[${c.time}]</td>
      <td>${esc(c.en)}</td>
      <td>${esc(c.zh)}</td>
    </tr>
  `).join('');

  // 點一列 → 跳播到該句
  subBody.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-idx]');
    if (!tr) return;
    const i = +tr.dataset.idx;
    videoEl.currentTime = Math.max(0, cues[i].t + offset);
    videoEl.play();
  });
}

// 播放時，依時間高亮／自動捲動
function highlight(idx) {
  if (idx === currentIdx) return;
  currentIdx = idx;
  subBody.querySelectorAll('tr').forEach(tr => tr.classList.remove('active'));
  const tr = subBody.querySelector(`tr[data-idx="${idx}"]`);
  if (tr) {
    tr.classList.add('active');
    if (follow && chkFollow?.checked) tr.scrollIntoView({ block: 'center' });
  }
}

videoEl?.addEventListener('timeupdate', () => {
  if (!cues.length) return;
  const t = videoEl.currentTime - offset;           // 套用偏移後的比對時間
  // 找出目前落在哪一段（最後一個 t <= 當前時間）
  let i = cues.length - 1;
  while (i >= 0 && t < cues[i].t) i--;
  if (i < 0) return;                                 // 還沒到第一句
  highlight(i);
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 你的影片來源若已經處理就不用動；否則可確保一下：
  // videoEl.src = `./videos/${slug}.mp4`; // 若你沒用 index.json 對應
  loadCues();                                        // <-- 關鍵：載入字幕
});

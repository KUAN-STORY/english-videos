// player.js  (V6) — Supabase + fallback 完整整合版
// --------------------------------------------------
// 特色：
// 1) 依 URL ?slug=mid-autumn 讀取對應影片與字幕
// 2) 先試 Supabase (tables: videos, cues; storage: videos bucket)，失敗就 fallback 本地 /data + /videos
// 3) 字幕：點列跳播、跟隨高亮、偏移 +/-0.5s、顯示偏移值
// 4) 工具列：上一句/下一句/重複本句/逐句自停/A-B 循環/取消循環/速度
// 5) 預留「測驗/單字」分頁掛載點（loadQuiz/loadVocab 之後可以補）
//
// 使用方式：在 player.html 用 <script type="module" src="./player.js"></script> 載入
// --------------------------------------------------

/* eslint-disable no-console */

let supa = null;
// 嘗試載入 Supabase client（如果沒放 supa.js，也不會報錯）
try {
  const mod = await import('./videos/js/supa.js');
  supa = mod?.supa ?? null;
} catch (e) {
  // 沒有 supa.js 或 import 失敗就當作無 Supabase
  supa = null;
}

// ----------------- DOM shortcuts -----------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ----------------- 元件參考 -----------------
const video = $('#player') || $('video');
const cuesTbody =
  $('#cuesBody') || $('#cues-tbody') || $('#tbody-cues') || $('#cuesTable tbody');
const followChk = $('#follow') || $('#followChk') || $('[data-x="follow"]');
const offsetLabel = $('#offsetVal') || $('#offsetLabel') || $('[data-x="offset-val"]');
const btnOffsetMinus = $('#btnOffsetMinus') || $('#btn-minus') || $('[data-x="offset-minus"]');
const btnOffsetPlus = $('#btnOffsetPlus') || $('#btn-plus') || $('[data-x="offset-plus"]');

// 左側工具列（若不存在就忽略）
const btnPrev = $('#btnPrev') || $('[data-x="prev"]');
const btnNext = $('#btnNext') || $('[data-x="next"]');
const btnRepeat = $('#btnRepeat') || $('[data-x="repeat"]');
const btnAB = $('#btnAB') || $('[data-x="ab"]');
const btnClearLoop = $('#btnClearLoop') || $('[data-x="clear-loop"]');
const btnAutoPause = $('#btnAutoPause') || $('[data-x="auto-pause"]');
const speedSlider = $('#speed') || $('[data-x="speed"]');
const speedVal = $('#speedVal') || $('[data-x="speed-val"]');

// ----------------- 狀態 -----------------
let slug = new URLSearchParams(location.search).get('slug') || 'mid-autumn';
let cues = []; // { t:秒數, en, zh }
let follow = true;
let offset = 0; // 秒
let activeIndex = -1;

let autoPause = false; // 逐句自停
let repeatOnce = false; // 重複本句（播完自動回到該句起點再播一次）
let loopA = null; // A-B 循環 A 秒
let loopB = null; // A-B 循環 B 秒

// ----------------- 輔助 -----------------
const hhmmssToSec = (s) => {
  if (typeof s === 'number') return s;
  const parts = s.trim().split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return m * 60 + sec;
  }
  return Number(s) || 0;
};

const fmtTime = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// 影片路徑 Fallback：./videos/<slug>.mp4
const localVideoUrl = (sg) => `./videos/${sg}.mp4`;
// 字幕路徑 Fallback：./data/cues-<slug>.json
const localCuesUrl = (sg) => `./data/cues-${sg}.json`;

// ----------------- Supabase 端讀取 -----------------
async function tryLoadVideoFromSupabase(sg) {
  if (!supa) return null;
  try {
    // 1) 先試資料表 videos，找欄位 url or storage_path
    const { data, error } = await supa
      .from('videos')
      .select('slug,url,storage_path')
      .eq('slug', sg)
      .maybeSingle();

    if (!error && data) {
      if (data.url) return data.url;

      if (data.storage_path) {
        // 有 storage 路徑，去 videos bucket 拿 publicURL
        const { data: pub } = supa.storage.from('videos').getPublicUrl(data.storage_path);
        if (pub?.publicUrl) return pub.publicUrl;
      }

      // 沒有欄位或都為空，繼續往下嘗試 storage 直接用 <slug>.mp4
    }

    // 2) 直接試 storage: 'videos/<slug>.mp4'
    const guess = `${sg}.mp4`;
    const { data: got } = supa.storage.from('videos').getPublicUrl(guess);
    if (got?.publicUrl) return got.publicUrl;
  } catch (e) {
    console.warn('[Supabase video] 讀取錯誤：', e);
  }
  return null;
}

async function tryLoadCuesFromSupabase(sg) {
  if (!supa) return null;
  try {
    // 取出欄位 time,en,zh 並依時間排序
    const { data, error } = await supa
      .from('cues')
      .select('time,en,zh')
      .eq('slug', sg)
      .order('time', { ascending: true });

    if (error) {
      console.warn('[Supabase cues] 錯誤：', error);
      return null;
    }
    if (!data || !data.length) return null;

    // 轉換成 {t, en, zh}
    return data.map((r) => ({
      t: hhmmssToSec(r.time),
      en: r.en ?? '',
      zh: r.zh ?? '',
    }));
  } catch (e) {
    console.warn('[Supabase cues] 讀取錯誤：', e);
    return null;
  }
}

// ----------------- Fallback 端讀取 -----------------
async function loadLocalCues(sg) {
  try {
    const res = await fetch(localCuesUrl(sg), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return (json || []).map((r) => ({
      t: hhmmssToSec(r.time),
      en: r.en ?? '',
      zh: r.zh ?? '',
    }));
  } catch (e) {
    return null;
  }
}

// ----------------- 主要載入流程 -----------------
async function loadAll() {
  // 影片
  let vurl = await tryLoadVideoFromSupabase(slug);
  if (!vurl) vurl = localVideoUrl(slug);
  if (video) {
    video.src = vurl;
  }

  // 字幕
  let supaCues = await tryLoadCuesFromSupabase(slug);
  if (!supaCues) supaCues = await loadLocalCues(slug);
  cues = (supaCues || []).sort((a, b) => a.t - b.t);

  paintCues();
  bindEvents();
}

// ----------------- 字幕渲染 -----------------
function paintCues() {
  if (!cuesTbody) return;
  cuesTbody.innerHTML = '';

  if (!cues?.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="opacity:.6;padding:16px">尚未載入字幕，等第 2 步串接即可</td>`;
    cuesTbody.appendChild(tr);
    return;
  }

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const nextT = i < cues.length - 1 ? cues[i + 1].t : c.t + 5;
    const tr = document.createElement('tr');
    tr.className = 'cue-row';
    tr.dataset.index = String(i);
    tr.innerHTML = `
      <td style="width:70px" class="mono">${fmtTime(c.t)}</td>
      <td class="en">${escapeHtml(c.en)}</td>
      <td class="zh" style="opacity:.85">${escapeHtml(c.zh)}</td>
    `;
    tr.addEventListener('click', () => {
      if (!video) return;
      video.currentTime = Math.max(0, c.t + offset);
      video.play?.();
    });
    cuesTbody.appendChild(tr);

    // 為了反白高亮，先加個 class 名稱；樣式在 CSS 裡加:
    // .cue-row.active { background: rgba(255,255,255,.06); }
  }
}

// ----------------- 高亮 + 跟隨 -----------------
function updateActiveByTime() {
  if (!video || !cues?.length) return;

  // 進度(以 offset 調整過)
  const t = video.currentTime - offset;

  // A-B 迴圈邏輯
  if (loopA != null && loopB != null) {
    if (video.currentTime > loopB) {
      video.currentTime = loopA;
    }
  }

  // 找到目前位於哪一句
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    const start = cues[i].t;
    const end = i < cues.length - 1 ? cues[i + 1].t : start + 9e9;
    if (t >= start && t < end) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return;

  if (idx !== activeIndex) {
    // 逐句自停：上一句播完時觸發
    if (autoPause && activeIndex !== -1) {
      const prevEnd = activeIndex < cues.length - 1 ? cues[activeIndex + 1].t : cues[activeIndex].t + 5;
      if (t >= prevEnd) {
        video.pause?.();
      }
    }

    // 重複本句：當上一句結束剛進下一句時，回跳一次
    if (repeatOnce && activeIndex !== -1) {
      const prevEnd = activeIndex < cues.length - 1 ? cues[activeIndex + 1].t : cues[activeIndex].t + 5;
      if (t >= prevEnd) {
        // 回到上一句起點
        video.currentTime = cues[activeIndex].t + offset;
        repeatOnce = false; // 只重複一次
        return; // 等 next timeupdate 再處理高亮
      }
    }

    activeIndex = idx;

    // 高亮 UI
    $$('.cue-row', cuesTbody).forEach((tr) => tr.classList.remove('active'));
    const row = $(`.cue-row[data-index="${activeIndex}"]`, cuesTbody);
    row?.classList.add('active');

    // 跟隨滾動
    if (follow && row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // 右側偏移顯示
  if (offsetLabel) {
    offsetLabel.textContent = `${offset.toFixed(1)}s`;
  }
}

// ----------------- 綁定事件 -----------------
function bindEvents() {
  if (!video) return;

  // 播放速度
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      const rate = Number(speedSlider.value) || 1;
      video.playbackRate = rate;
      if (speedVal) speedVal.textContent = `${rate.toFixed(2)}x`;
    });
    // 初始
    const r0 = Number(speedSlider.value) || 1;
    video.playbackRate = r0;
    if (speedVal) speedVal.textContent = `${r0.toFixed(2)}x`;
  }

  // timeupdate
  video.addEventListener('timeupdate', updateActiveByTime);

  // 偏移按鈕
  btnOffsetMinus?.addEventListener('click', () => {
    offset -= 0.5;
    updateActiveByTime();
    flashOffset();
  });
  btnOffsetPlus?.addEventListener('click', () => {
    offset += 0.5;
    updateActiveByTime();
    flashOffset();
  });
  if (offsetLabel) offsetLabel.textContent = `${offset.toFixed(1)}s`;

  // 跟隨
  if (followChk) {
    followChk.addEventListener('change', () => {
      follow = !!followChk.checked;
      // 立即跟到當前 active
      if (follow && activeIndex >= 0) {
        const row = $(`.cue-row[data-index="${activeIndex}"]`, cuesTbody);
        row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
    // 初始預設為勾選
    followChk.checked = true;
    follow = true;
  }

  // 上一句 / 下一句
  btnPrev?.addEventListener('click', gotoPrevCue);
  btnNext?.addEventListener('click', gotoNextCue);

  // 重複本句：播完當句後回到起點再播一次
  btnRepeat?.addEventListener('click', () => {
    if (activeIndex < 0 || !cues.length) return;
    repeatOnce = true;
  });

  // 逐句自停
  btnAutoPause?.addEventListener('click', () => {
    autoPause = !autoPause;
    toggleBtnActive(btnAutoPause, autoPause);
  });

  // A-B 循環
  btnAB?.addEventListener('click', () => {
    if (!video) return;
    const now = video.currentTime;
    if (loopA == null) {
      loopA = now;
      loopB = null;
      toggleBtnActive(btnAB, true);
      toast('循環 A 點已設');
    } else if (loopB == null) {
      if (now <= loopA + 0.2) {
        toast('B 需大於 A，已略過');
        return;
      }
      loopB = now;
      toast(`已建立 A-B 循環（${(loopB - loopA).toFixed(1)}s）`);
    } else {
      // 已有 A-B，再按一次則更新 B
      loopB = now;
      toast(`更新 B 點（長度 ${(loopB - loopA).toFixed(1)}s）`);
    }
  });

  // 取消循環
  btnClearLoop?.addEventListener('click', () => {
    loopA = loopB = null;
    toggleBtnActive(btnAB, false);
    toast('已取消 A-B 循環');
  });
}

// 上一句 / 下一句
function gotoPrevCue() {
  if (!video || !cues.length) return;
  const t = video.currentTime - offset;
  // 找到 t 之前的 cue
  let idx = 0;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].t < t) idx = i;
  }
  // 若剛好命中 activeIndex，也再往前一個（避免卡在同一句）
  if (activeIndex >= 0 && cues[activeIndex].t >= t && idx > 0) idx--;
  video.currentTime = Math.max(0, cues[idx].t + offset);
  video.play?.();
}

function gotoNextCue() {
  if (!video || !cues.length) return;
  const t = video.currentTime - offset;
  let idx = cues.length - 1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].t > t) {
      idx = i;
      break;
    }
  }
  video.currentTime = Math.max(0, cues[idx].t + offset);
  video.play?.();
}

// ----------------- 小工具 -----------------
function toggleBtnActive(btn, on) {
  if (!btn) return;
  btn.classList.toggle('active', !!on);
}

function flashOffset() {
  if (!offsetLabel) return;
  offsetLabel.textContent = `${offset.toFixed(1)}s`;
  offsetLabel.classList.add('flash');
  setTimeout(() => offsetLabel.classList.remove('flash'), 300);
}

function toast(msg) {
  // 簡易提示（若你有自己的 UI，可改走你的）
  console.info('[INFO]', msg);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// ----------------- 分頁預留（之後補） -----------------
async function loadQuiz(/* sg */) {
  // TODO: 之後接 Supabase / data/quiz-*.json
}
async function loadVocab(/* sg */) {
  // TODO: 之後接 Supabase / data/vocab-*.json
}

// ----------------- 啟動 -----------------
await loadAll();







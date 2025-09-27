/* eslint-disable */
(function () {
  // ---------- 工具 ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 影片來源（以 slug 計算為絕對 URL） ----------
  const url = new URL(location.href);
  const slug = url.searchParams.get('slug') || 'mid-autumn';
  const absVideo = `${location.origin}/english-videos/videos/${slug}.mp4`;
  const video = $('#video');
  video.src = absVideo;

  // ---------- 左側控制：狀態 ----------
  let autoPause = false;      // 逐句自動暫停 (先保留，下一步接字幕)
  let loopAll = false;        // 整段循環
  let fitCover = false;       // 填滿畫面(cover) / contain
  let abStart = null, abEnd = null; // AB 循環點

  // 占位：上一句/下一句/重複本句，先用時間段模擬
  const STEP = 5;       // 上/下一句先 5 秒
  const LINE_LEN = 2;   // 重複本句先 2 秒範圍

  // ---------- 控制列元素 ----------
  const btnPrev = $('#btn-prev');
  const btnPlay = $('#btn-play');
  const btnNext = $('#btn-next');
  const btnRepeatLine = $('#btn-repeat-line');
  const btnAutoPause = $('#btn-auto-pause');
  const btnLoopAll = $('#btn-loop-all');
  const btnAb = $('#btn-ab');
  const btnClearLoop = $('#btn-clear-loop');
  const btnFit = $('#btn-fit');
  const abInd = $('#ab-ind');

  const speed = $('#speed');
  const speedVal = $('#speedVal');

  // ---------- 右側分頁 ----------
  const tabs = $$('.tab');
  const panels = {
    sub: $('#panel-sub'),
    quiz: $('#panel-quiz'),
    vocab: $('#panel-vocab'),
  };
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const key = t.dataset.tab;
      Object.values(panels).forEach(p => p.classList.remove('active'));
      panels[key]?.classList.add('active');
    });
  });

  // ---------- 字幕工具列（跟隨/偏移） ----------
  const follow = $('#follow');
  const offsetView = $('#offsetView');
  const offMinus = $('#offMinus');
  const offPlus = $('#offPlus');
  // 持久化
  const LS_FOLLOW = `ev.follow.${slug}`;
  const LS_OFFSET = `ev.offset.${slug}`;
  let offset = parseFloat(localStorage.getItem(LS_OFFSET) || '0');
  offsetView.textContent = `${offset.toFixed(1)}s`;
  follow.checked = localStorage.getItem(LS_FOLLOW) === '1';

  follow.addEventListener('change', () => {
    localStorage.setItem(LS_FOLLOW, follow.checked ? '1' : '0');
  });
  offMinus.addEventListener('click', () => {
    offset = +(offset - 0.5).toFixed(1);
    localStorage.setItem(LS_OFFSET, String(offset));
    offsetView.textContent = `${offset.toFixed(1)}s`;
  });
  offPlus.addEventListener('click', () => {
    offset = +(offset + 0.5).toFixed(1);
    localStorage.setItem(LS_OFFSET, String(offset));
    offsetView.textContent = `${offset.toFixed(1)}s`;
  });

  // ---------- 影片控制 ------------
  btnPlay.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  btnPrev.addEventListener('click', () => {
    // 下一步接「上一句時間點」，目前占位：-5s
    video.currentTime = clamp(video.currentTime - STEP, 0, video.duration || 1e9);
  });

  btnNext.addEventListener('click', () => {
    // 下一步接「下一句時間點」，目前占位：+5s
    video.currentTime = clamp(video.currentTime + STEP, 0, video.duration || 1e9);
  });

  btnRepeatLine.addEventListener('click', () => {
    // 下一步改為「當前句的起訖」，目前占位：以 now 為中心反覆 2 秒
    const now = video.currentTime;
    abStart = Math.max(now - LINE_LEN/2, 0);
    abEnd = Math.min(now + LINE_LEN/2, video.duration || now + LINE_LEN/2);
    abInd.textContent = `🅐🅑 A-B 循環（${abStart.toFixed(1)} ~ ${abEnd.toFixed(1)}）`;
    abInd.classList.add('active');
  });

  btnAutoPause.addEventListener('click', () => {
    autoPause = !autoPause;
    btnAutoPause.classList.toggle('active', autoPause);
    // 第 2 步取得句點後：在 timeupdate 內偵測超過句末就暫停
  });

  btnLoopAll.addEventListener('click', () => {
    loopAll = !loopAll;
    btnLoopAll.classList.toggle('active', loopAll);
  });

  btnAb.addEventListener('click', () => {
    // 點一下：若沒 A，設定 A；第二下設定 B；第三下清除
    if (abStart == null) {
      abStart = video.currentTime;
      abInd.textContent = `🅐 A 已標記：${abStart.toFixed(1)}`;
      abInd.classList.add('active');
    } else if (abEnd == null) {
      abEnd = Math.max(video.currentTime, abStart + 0.1);
      abInd.textContent = `🅐🅑 A-B 循環（${abStart.toFixed(1)} ~ ${abEnd.toFixed(1)}）`;
      abInd.classList.add('active');
    } else {
      abStart = abEnd = null;
      abInd.textContent = `🅐🅑 A-B 循環`;
      abInd.classList.remove('active');
    }
  });

  btnClearLoop.addEventListener('click', () => {
    abStart = abEnd = null;
    abInd.textContent = `🅐🅑 A-B 循環`;
    abInd.classList.remove('active');
  });

  btnFit.addEventListener('click', () => {
    fitCover = !fitCover;
    video.style.objectFit = fitCover ? 'cover' : 'contain';
    btnFit.classList.toggle('active', fitCover);
  });

  // 速度
  const updateSpeed = () => {
    video.playbackRate = +speed.value;
    speedVal.textContent = `${(+speed.value).toFixed(2)}x`;
  };
  speed.addEventListener('input', updateSpeed);
  updateSpeed();

  // 播放循環控制
  video.addEventListener('timeupdate', () => {
    // A-B 循環
    if (abStart != null && abEnd != null && video.currentTime >= abEnd) {
      video.currentTime = abStart;
      if (video.paused) video.play();
    }
    // 整段循環
    if (loopAll && video.duration && Math.abs(video.currentTime - video.duration) < 0.05) {
      video.currentTime = 0;
      if (video.paused) video.play();
    }
    // 自動暫停（下一步接字幕句點，目前先保留）
    // if (autoPause) { ... }
  });

  // 首次載入：套用 cover/contain
  video.style.objectFit = 'contain';
})();


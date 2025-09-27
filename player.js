/**
 * english-videos / player.js  — 可直接覆蓋
 * 功能：
 *  - 依 ?slug=xxx 讀取影片 ./videos/<slug>.mp4 與資料 ./data/*
 *  - 字幕：載入 cues-<slug>.json、點列跳播、跟隨高亮、偏移微調
 *  - 影片：速度滑桿、偏移、跟隨皆可記憶 localStorage
 *  - 測驗：quiz-<slug>.json 自動掛載（若無則顯示提示）
 *  - 單字：vocab-<slug>.json 自動掛載（若無則顯示提示）
 *
 * DOM 需求（預設 id）：
 *   <video id="player"> … </video>
 *   <tbody id="cuesBody"></tbody>
 *   <input  id="followToggle" type="checkbox">
 *   <span   id="offsetText">0.0s</span>
 *   <button id="offsetMinus">-0.5s</button>
 *   <button id="offsetPlus">+0.5s</button>
 *   <input  id="speedRange" type="range" min="0.5" max="2" step="0.05">
 *   <span   id="speedText">1.00x</span>
 *   <div    id="quizBody"></div>
 *   <div    id="vocabBody"></div>
 *
 * 若你的 id 不同，請搜尋本文中的 querySelector 對應修改即可。
 */
(() => {
  /* ------------------ 小工具 ------------------ */
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const getSlug = () => {
    const usp = new URLSearchParams(location.search);
    // 預設 mid-autumn（避免沒帶參數）
    return (usp.get('slug') || 'mid-autumn').trim();
  };

  const hhmmssToSec = (t) => {
    // 支援 00:01 / 01:23:45 / "1.2"(秒)
    if (typeof t === 'number') return t;
    if (!t) return 0;
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    const parts = t.split(':').map(Number);
    if (parts.length === 2) { // mm:ss
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) { // hh:mm:ss
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const fmtTime = (sec) => {
    sec = Math.max(0, sec|0);
    const m = (sec/60|0).toString().padStart(2,'0');
    const s = (sec%60|0).toString().padStart(2,'0');
    return `${m}:${s}`;
  };

  const fetchJSON = async (url) => {
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  };

  /* ------------------ 取得 DOM ------------------ */
  const video        = $('#player') || $('video');
  const cuesBody     = $('#cuesBody');
  const followToggle = $('#followToggle');
  const offsetText   = $('#offsetText');
  const btnMinus     = $('#offsetMinus');
  const btnPlus      = $('#offsetPlus');
  const speedRange   = $('#speedRange');
  const speedText    = $('#speedText');
  const quizBody     = $('#quizBody');
  const vocabBody    = $('#vocabBody');

  if (!video) {
    console.warn('[player] 找不到 <video>，請確認 id="player" 或改成 document.querySelector("video")。');
  }

  /* ------------------ 讀設定 ------------------ */
  const slug = getSlug();

  // localStorage key
  const LS = {
    speed : 'ev_speed',
    offset: 'ev_offset',
    follow: 'ev_follow'
  };

  // 速度
  const clampSpeed = v => Math.min(2, Math.max(0.5, v));
  let speed = clampSpeed(parseFloat(localStorage.getItem(LS.speed) || '1'));
  if (video) video.playbackRate = speed;
  if (speedRange) speedRange.value = speed;
  if (speedText)  speedText.textContent = `${speed.toFixed(2)}x`;

  // 偏移（秒）
  let offsetSec = parseFloat(localStorage.getItem(LS.offset) || '0');
  const renderOffset = () => offsetText && (offsetText.textContent = `${offsetSec.toFixed(1)}s`);
  renderOffset();

  // 跟隨
  let follow = localStorage.getItem(LS.follow) !== '0'; // 預設 true
  if (followToggle) followToggle.checked = follow;

  /* ------------------ 綁定：速度控制 ------------------ */
  if (speedRange && speedText && video) {
    const applySpeed = v => {
      speed = clampSpeed(parseFloat(v));
      video.playbackRate = speed;
      speedRange.value   = speed;
      speedText.textContent = `${speed.toFixed(2)}x`;
      localStorage.setItem(LS.speed, String(speed));
    };
    applySpeed(speed);
    speedRange.addEventListener('input', () => applySpeed(speedRange.value));
    video.addEventListener('ratechange', () => {
      speedText.textContent = `${video.playbackRate.toFixed(2)}x`;
      if (speedRange.value !== String(video.playbackRate)) speedRange.value = video.playbackRate;
    });
  }

  /* ------------------ 綁定：跟隨 ------------------ */
  if (followToggle) {
    followToggle.addEventListener('change', () => {
      follow = followToggle.checked;
      localStorage.setItem(LS.follow, follow ? '1' : '0');
      // 跟隨打開時即刻捲到 active 行
      const active = cuesBody?.querySelector('.active');
      if (active && follow) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  /* ------------------ 綁定：偏移 ------------------ */
  const setOffset = (v) => {
    offsetSec = Math.max(-5, Math.min(5, v)); // ±5s 上限
    localStorage.setItem(LS.offset, String(offsetSec));
    renderOffset();
    // 立刻刷新一次跟隨定位
    const t = (video?.currentTime || 0) + offsetSec;
    updateActiveByTime(t);
  };
  if (btnMinus) btnMinus.addEventListener('click', () => setOffset(offsetSec - 0.5));
  if (btnPlus)  btnPlus .addEventListener('click', () => setOffset(offsetSec + 0.5));

  /* ------------------ 字幕：載入+渲染 ------------------ */
  let cues = []; // {start,end,en,zh}
  function renderCues() {
    if (!cuesBody) return;
    cuesBody.innerHTML = '';
    const frag = document.createDocumentFragment();

    cues.forEach((c, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.start = String(c.start);
      tr.dataset.end   = String(c.end);
      tr.innerHTML = `
        <td class="tc">${fmtTime(c.start)}</td>
        <td class="en">${c.en || ''}</td>
        <td class="zh">${c.zh || ''}</td>
      `;
      // 點任何一欄都跳播到該句
      tr.addEventListener('click', () => {
        if (!video) return;
        video.currentTime = c.start;
        video.play();
      });
      frag.appendChild(tr);
    });

    cuesBody.appendChild(frag);
  }

  // 尋找目前時間對應的列（t 已套 offset）
  function findActiveRowByTime(t) {
    if (!cuesBody || !cues.length) return null;
    // 二分搜尋（cues 已排序）
    let L = 0, R = cues.length - 1, ans = -1;
    while (L <= R) {
      const mid = (L + R) >> 1;
      if (t >= cues[mid].start && t < cues[mid].end) { ans = mid; break; }
      if (t < cues[mid].start) R = mid - 1; else L = mid + 1;
    }
    if (ans === -1) return null;
    return cuesBody.children[ans] || null;
  }

  function highlightRow(tr) {
    if (!tr || !cuesBody) return;
    cuesBody.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
    tr.classList.add('active');
    if (follow) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function updateActiveByTime(effectiveTime) {
    const row = findActiveRowByTime(effectiveTime);
    highlightRow(row);
  }

  // timeupdate 事件：以（currentTime + offset）對齊字幕
  if (video) {
    video.addEventListener('timeupdate', () => {
      updateActiveByTime(video.currentTime + offsetSec);
    });
  }

  // 讀 cues-<slug>.json
  async function loadCues() {
    try {
      const url = `./data/cues-${slug}.json`;
      const raw = await fetchJSON(url);

      // 兼容兩種格式
      // 1) [{time:"00:01", en, zh}, ...] 會推斷 end = 下一筆 start
      // 2) [{start: 1.0, end: 3.0, en, zh}, ...]
      const list = [];
      raw.forEach((r, i) => {
        const s = ('start' in r) ? Number(r.start) : hhmmssToSec(r.time);
        const e = ('end'   in r) ? Number(r.end)   : hhmmssToSec(raw[i+1]?.time ?? (s + 5));
        list.push({ start: s, end: Math.max(e, s + 0.01), en: r.en || '', zh: r.zh || '' });
      });

      list.sort((a,b) => a.start - b.start);
      cues = list;
      renderCues();
    } catch (err) {
      if (cuesBody) {
        cuesBody.innerHTML = `
          <tr><td colspan="3" style="color:#f88">查無字幕資料（./data/cues-${slug}.json）。</td></tr>
        `;
      }
      console.warn('[player] 載入字幕失敗：', err);
    }
  }

  /* ------------------ 測驗：載入+渲染 ------------------ */
  async function loadQuiz() {
    if (!quizBody) return;
    try {
      const url = `./data/quiz-${slug}.json`;
      const arr = await fetchJSON(url);
      // 簡易渲染（單選題）
      const frag = document.createDocumentFragment();
      arr.forEach((q, i) => {
        const card = document.createElement('div');
        card.className = 'quiz-item';
        card.innerHTML = `
          <div class="q">${i+1}. ${q.q}</div>
          <div class="opts">
            ${q.a.map((opt, idx) => `
              <label class="opt">
                <input type="radio" name="q${i}" value="${idx}">
                <span>${String.fromCharCode(65+idx)}. ${opt}</span>
              </label>
            `).join('')}
          </div>
          <div class="exp" style="display:none;color:#8dd">✔ 正解：${String.fromCharCode(65+q.answerIndex)}　${q.explain || ''}</div>
          <hr/>
        `;
        // 簡單檢核：選就顯示解答
        card.querySelectorAll('input[type=radio]').forEach(radio=>{
          radio.addEventListener('change', ()=>{
            card.querySelector('.exp').style.display = 'block';
          });
        });
        frag.appendChild(card);
      });
      quizBody.innerHTML = '';
      quizBody.appendChild(frag);
    } catch (e) {
      quizBody.innerHTML = `<div style="color:#888">查無測驗資料（quiz-${slug}.json）。</div>`;
    }
  }

  /* ------------------ 單字：載入+渲染 ------------------ */
  async function loadVocab() {
    if (!vocabBody) return;
    try {
      const url = `./data/vocab-${slug}.json`;
      const arr = await fetchJSON(url);
      // arr 可能是：[{time:'00:05', word:'moon', pos:'n.', zh:'月亮', def:'...' , ex:'...'}]
      const frag = document.createDocumentFragment();
      const table = document.createElement('table');
      table.className = 'vocab-table';
      table.innerHTML = `
        <thead>
          <tr><th>時間</th><th>單字</th><th>詞性</th><th>中文</th><th>英文解釋 / 例句</th></tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');

      arr.forEach(v => {
        const s = hhmmssToSec(v.time ?? 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="tc"><button class="btn-jump" data-sec="${s}">${fmtTime(s)}</button></td>
          <td class="word">${v.word || ''}</td>
          <td class="pos">${v.pos || ''}</td>
          <td class="zh">${v.zh || ''}</td>
          <td class="def">${v.def || ''}${v.ex ? `<div class="ex">${v.ex}</div>` : ''}</td>
        `;
        tbody.appendChild(tr);
      });

      // 點時間跳播
      table.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-jump');
        if (btn && video) {
          video.currentTime = parseFloat(btn.dataset.sec || '0');
          video.play();
        }
      });

      frag.appendChild(table);
      vocabBody.innerHTML = '';
      vocabBody.appendChild(frag);
    } catch (e) {
      vocabBody.innerHTML = `<div style="color:#888">查無單字資料（vocab-${slug}.json）。</div>`;
    }
  }

  /* ------------------ 影片來源（可選） ------------------ */
  // 若你影片在 ./videos/<slug>.mp4，可自動掛上：
  if (video && !video.src) {
    video.src = `./videos/${slug}.mp4`;
  }

  /* ------------------ 啟動 ------------------ */
  loadCues();
  loadQuiz();
  loadVocab();

  // 對外（除錯）
  window.__ev = {
    get slug(){ return slug; },
    get offset(){ return offsetSec; },
    set offset(v){ setOffset(v); },
    refreshCues: loadCues
  };
})();

// /player.js  —— 修正資源路徑，在 GitHub Pages 子路徑也能正確載入

(function () {
  // 取得 slug（例：?slug=mid-autumn）
  const p = new URLSearchParams(location.search);
  const slug = p.get('slug');
  if (!slug) {
    console.error('缺少 slug 參數');
    return;
  }

  // 依目前 player.html 所在路徑，推回專案根路徑（english-videos）
  // e.g.  https://kuan-story.github.io/english-videos/player.html?slug=mid-autumn
  // =>   ROOT = /english-videos
  const ROOT = location.pathname.replace(/\/player\.html.*$/, '');

  // DOM
  const video = document.querySelector('video#playerVideo') || document.querySelector('video');
  const tbody = document.querySelector('#cuesBody'); // 你字幕表格 tbody 的 id
  const zhCol  = 2; // 右邊中文欄位 index（如果你用別的 DOM，下面 render 記得對齊）

  // 設定影片來源（不要用 /videos/ 開頭）
  const videoSrc = `${ROOT}/videos/${slug}.mp4`;
  video.src = videoSrc;

  // ===== 載入字幕（cues-*.json） =====
  const cuesUrl = `${ROOT}/data/cues-${slug}.json`;

  fetch(cuesUrl)
    .then(r => {
      if (!r.ok) throw new Error(`載入字幕失敗：${r.status}`);
      return r.json();
    })
    .then(data => {
      // 期望格式：{ items: [ { time:"00:01", en:"...", zh:"..." }, ... ] }
      if (!data || !Array.isArray(data.items)) {
        throw new Error('cues JSON 結構不正確，缺少 items 陣列');
      }
      renderCues(data.items);
    })
    .catch(err => {
      console.error(err);
      showEmptyRow(`載入字幕失敗：${err.message}`);
    });

  // ===== 也可在這裡依需要載入單字與測驗 =====
  // const vocabUrl = `${ROOT}/data/vocab-${slug}.json`;
  // const quizUrl  = `${ROOT}/data/quiz-${slug}.json`;

  // ====== UI helpers ======
  function renderCues(items) {
    if (!tbody) return;

    tbody.innerHTML = '';
    for (const row of items) {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.textContent = `[${row.time || ''}]`;

      const tdEn = document.createElement('td');
      tdEn.textContent = row.en || '';

      const tdZh = document.createElement('td');
      tdZh.textContent = row.zh || '';

      tr.appendChild(tdTime);
      tr.appendChild(tdEn);
      tr.appendChild(tdZh);

      tbody.appendChild(tr);
    }
  }

  function showEmptyRow(msg) {
    if (!tbody) return;
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.style.color = '#f88';
    td.textContent = msg;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
})();


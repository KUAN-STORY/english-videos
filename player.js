/* player.js — 只修字幕/單字載入；不動你的控制列與版面 */

(() => {
  // ---------- 工具 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => n.toString().padStart(2, '0');
  const secToClock = (sec) => {
    sec = Math.max(0, sec|0);
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    return (h? fmt(h)+':' : '') + fmt(m)+':'+fmt(s);
  };
  const toSec = (hhmmss) => {
    // "00:01:23.456" or "00:01:23,456" or "01:23"
    if (typeof hhmmss === 'number') return hhmmss;
    if (!hhmmss) return 0;
    const t = hhmmss.trim().replace(',', '.');
    const parts = t.split(':').map(parseFloat);
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if (parts.length === 2) return parts[0]*60 + parts[1];
    return parseFloat(t) || 0;
  };

  const video = $('#player');
  const paneSub = $('#pane-sub');
  const paneVocab = $('#pane-vocab');
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || 'mid-autumn';

  // ---------- 啟動 ----------
  init();

  async function init() {
    try {
      await loadVideoSrc(slug);
      await Promise.all([
        loadCaptions(slug).then(renderCaptions).catch(showSubError),
        loadVocab(slug).then(renderVocab).catch(showVocabError),
      ]);
    } catch (err) {
      console.error(err);
      showSubError(err);
      showVocabError(err);
    }
  }

  // ---------- 影片來源 ----------
  async function loadVideoSrc(slug) {
    // 優先讀 index.json 的 video 欄位
    try {
      const res = await fetch('data/index.json', {cache:'no-store'});
      if (res.ok) {
        const meta = await res.json();
        const item = (meta.items||[]).find(x=>x.slug===slug);
        if (item?.video) {
          video.src = item.video;
          return;
        }
      }
    } catch(_) {}
    // 後備：videos/<slug>.mp4
    video.src = `videos/${slug}.mp4`;
  }

  // ---------- 字幕載入（容錯） ----------
  async function loadCaptions(slug) {
    // 嘗試一串可能路徑
    const tries = [
      `data/sub-${slug}.json`,
      `data/${slug}-sub.json`,
      `data/captions-${slug}.json`,
      `data/${slug}.json`,
      `data/sub-${slug}.srt`,
      `data/${slug}.srt`,
      `data/sub-${slug}.vtt`,
      `data/${slug}.vtt`,
    ];

    let lastErr;
    for (const url of tries) {
      try {
        const res = await fetch(url, {cache:'no-store'});
        if (!res.ok) throw new Error(res.status+' '+res.statusText);

        const ct = (res.headers.get('content-type')||'').toLowerCase();
        if (ct.includes('application/json')) {
          const j = await res.json();
          const arr = normalizeCaptionJSON(j);
          if (arr?.length) return arr;
          throw new Error('JSON 格式無可用字幕');
        } else {
          const txt = await res.text();
          const arr = parseSrtVtt(txt);
          if (arr?.length) return arr;
          throw new Error('SRT/VTT 解析失敗');
        }
      } catch (e) {
        lastErr = e;
        // 繼續下一個
      }
    }
    throw lastErr || new Error('找不到字幕檔');
  }

  // 支援多型 JSON → 標準 {time,en,zh}
  function normalizeCaptionJSON(j) {
    // 可能是 {items:[...]} 或直接 array
    const list = Array.isArray(j) ? j : (j?.items || j?.data || []);
    return list.map(raw => {
      // 可能 key：time / t / start / begin / s
      const t = raw.time ?? raw.t ?? raw.start ?? raw.begin ?? raw.s ?? 0;
      const time = typeof t === 'string' ? toSec(t) : (t|0);

      // 英文/中文可能 key：en/zh、text、line、cn…
      let en = raw.en ?? raw.text ?? raw.line ?? raw.eng ?? '';
      let zh = raw.zh ?? raw.cn ?? raw.ch ?? raw.tw ?? '';

      // 若只有一段 text，用簡易偵測中英（或全部塞 en）
      if (!raw.en && !raw.zh && raw.text) {
        // 嘗試用換行分兩段
        const parts = String(raw.text).split(/\r?\n/);
        if (parts.length >= 2) {
          en = parts[0];
          zh = parts.slice(1).join(' ');
        } else {
          en = raw.text;
        }
      }
      return { time, en: String(en||''), zh: String(zh||'') };
    }).filter(x=>!Number.isNaN(x.time));
  }

  // SRT/VTT 解析 → {time,en,zh}
  function parseSrtVtt(txt) {
    // 移除 WEBVTT 首行
    txt = txt.replace(/^WEBVTT[^\n]*\n+/i, '');
    const blocks = txt.split(/\n{2,}/);
    const out = [];
    for (let b of blocks) {
      b = b.trim();
      if (!b) continue;
      // 可能第一行是編號
      if (/^\d+\s*$/.test(b.split('\n')[0])) {
        b = b.split('\n').slice(1).join('\n');
      }
      const m = b.match(/(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}(?::\d{2})?)\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}(?::\d{2})?)/);
      let start = 0;
      let textLines = b;
      if (m) {
        start = toSec(m[1]);
        textLines = b.slice(m.index + m[0].length).trim();
      }
      const lines = textLines.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      // 嘗試兩行：第一行英文、第二行中文
      let en = '', zh = '';
      if (lines.length >= 2) {
        en = lines[0];
        zh = lines.slice(1).join(' ');
      } else if (lines.length === 1) {
        en = lines[0];
      }
      out.push({ time:start, en, zh });
    }
    return out;
  }

  // ---------- 字幕渲染 ----------
  function renderCaptions(list) {
    if (!paneSub) return;
    const wrap = document.createElement('div');
    wrap.style.padding = '10px';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:72px;text-align:left;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">時間</th>
          <th style="width:32px;"></th>
          <th style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">英文</th>
          <th style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">中文</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    list.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 8px;white-space:nowrap;cursor:pointer;color:#a8c5ff">${secToClock(row.time)}</td>
        <td style="padding:6px 2px"><button data-i="${idx}" class="playRow" title="跳到此句">▶</button></td>
        <td style="padding:6px 8px">${escapeHtml(row.en)}</td>
        <td style="padding:6px 8px;color:#cdd5ef">${escapeHtml(row.zh)}</td>`;
      // 點時間跳播
      tr.children[0].addEventListener('click', () => {
        if (video) { video.currentTime = row.time; video.play(); }
      });
      // ▶ 跳播
      tr.querySelector('.playRow').addEventListener('click', () => {
        if (video) { video.currentTime = row.time; video.play(); }
      });
      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    paneSub.innerHTML = '';
    paneSub.appendChild(wrap);
  }

  function showSubError(err) {
    if (!paneSub) return;
    paneSub.innerHTML = `<div style="padding:16px;color:#a9b3cf">（字幕資料讀取失敗：${escapeHtml(err?.message||String(err)||'未知錯誤')}）</div>`;
  }

  // ---------- 單字載入（容錯） ----------
  async function loadVocab(slug) {
    const tries = [
      `data/vocab-${slug}.json`,
      `data/${slug}-vocab.json`,
    ];
    let lastErr;
    for (const url of tries) {
      try {
        const res = await fetch(url, {cache:'no-store'});
        if (!res.ok) throw new Error(res.status+' '+res.statusText);
        const j = await res.json();
        const items = normalizeVocabJSON(j);
        if (items?.length) return items;
        throw new Error('vocab JSON 格式錯誤或為空');
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('找不到單字檔');
  }

  // 支援你之前的 vocab 結構：
  // { title, items:[ {time, word, pos, zh, en, example, grammar} ] }
  function normalizeVocabJSON(j) {
    const arr = (j?.items) ? j.items : (Array.isArray(j)? j : (j?.data||[]));
    return (arr||[]).map(x => {
      const t = x.time ?? x.t ?? 0;
      return {
        time: typeof t === 'string' ? toSec(t) : (t|0),
        word: x.word || '',
        pos:  x.pos  || '',
        zh:   x.zh   || '',
        en:   x.en   || '',
        example: x.example || '',
        grammar: x.grammar || ''
      };
    }).filter(x=>x.word);
  }

  // ---------- 單字渲染（填空 + 朗讀 + 跳播） ----------
  function renderVocab(list) {
    if (!paneVocab) return;

    const wrap = document.createElement('div');
    wrap.style.padding = '10px';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:72px;text-align:left;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">時間</th>
          <th style="width:44px;"></th>
          <th style="width:160px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">單字</th>
          <th style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">例句（空格填空）/ 文法</th>
          <th style="width:260px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)">答案 / 詞性 / 中文</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    list.forEach(item => {
      const gap = makeGapSentence(item.example || item.en || '', item.word);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 8px;white-space:nowrap;cursor:pointer;color:#a8c5ff">${secToClock(item.time)}</td>
        <td style="padding:6px 4px;white-space:nowrap">
          <button class="go" title="跳到例句">▶</button>
          <button class="tts" title="朗讀單字">🔊</button>
        </td>
        <td style="padding:6px 8px;font-weight:700">${escapeHtml(item.word)}</td>
        <td style="padding:6px 8px;line-height:1.5">
          <div>${gap}</div>
          ${item.grammar ? `<div style="margin-top:6px;color:#a9b3cf">文法：${escapeHtml(item.grammar)}</div>`:''}
        </td>
        <td style="padding:6px 8px;color:#cdd5ef">
          <div>答案：<strong>${escapeHtml(item.word)}</strong></div>
          ${item.pos ? `<div>詞性：${escapeHtml(item.pos)}</div>`:''}
          ${item.zh  ? `<div>中文：${escapeHtml(item.zh)}</div>`:''}
        </td>
      `;

      // 跳播
      tr.querySelector('.go').addEventListener('click', () => {
        if (video) { video.currentTime = item.time; video.play(); }
      });

      // 朗讀
      tr.querySelector('.tts').addEventListener('click', () => {
        speak(item.word);
      });

      // 點時間也跳播
      tr.children[0].addEventListener('click', () => {
        if (video) { video.currentTime = item.time; video.play(); }
      });

      tbody.appendChild(tr);
    });

    wrap.appendChild(table);
    paneVocab.innerHTML = '';
    paneVocab.appendChild(wrap);
  }

  function showVocabError(err) {
    if (!paneVocab) return;
    paneVocab.innerHTML = `<div style="padding:16px;color:#a9b3cf">（單字資料讀取失敗：${escapeHtml(err?.message||String(err)||'未知錯誤')}）</div>`;
  }

  // 例句 → 把目標單字替換為 _______
  function makeGapSentence(sentence, word) {
    if (!sentence || !word) return escapeHtml(sentence);
    const rx = new RegExp(`\\b(${escapeReg(word)})\\b`, 'ig');
    return escapeHtml(sentence).replace(rx, '_____');
  }

  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  // ---------- TTS ----------
  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch(_) {}
  }
})();
























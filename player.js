/* ---------------------------
   player.js  (一鍵覆蓋可用)
   --------------------------- */

(() => {
  // 小工具
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const fmt = (n) => (n < 10 ? "0" + n : "" + n);

  // 取得 slug（例如 ?slug=mid-autumn）
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug") || "mid-autumn";

  // 路徑規則
  const PATH = {
    video: `./videos/${slug}.mp4`,
    cues: `./data/cues-${slug}.json`,
    quiz: `./data/quiz-${slug}.json`,
    vocab: `./data/vocab-${slug}.json`,
  };

  // 主要節點
  const video = $("video") || document.createElement("video"); // 容錯
  const cuesBody =
    $("#cues-body") || $(".cues tbody") || ensureBody("#cues-body");
  const quizBody = $("#quiz-body") || ensureDiv("#quiz-body");
  const vocabBody = $("#vocab-body") || ensureDiv("#vocab-body");

  const followToggle = $("#followToggle");
  const offsetMinus = $("#offsetMinus");
  const offsetPlus = $("#offsetPlus");
  const offsetDisplay = $("#offsetDisplay");

  // 分頁（可有可無）
  const tabCues = $("#tabCues");
  const tabQuiz = $("#tabQuiz");
  const tabVocab = $("#tabVocab");

  // 狀態
  let cues = []; // [{t, en, zh}]
  let offset = 0; // 秒
  let activeIdx = -1;

  // 影片來源（若你的 <video> 已在 HTML 設好 src，這段可忽略）
  try {
    if (video && !video.src) {
      video.src = PATH.video;
      video.preload = "metadata";
    }
  } catch (e) {
    console.warn("設定 video.src 失敗，可忽略：", e);
  }

  // 初始化
  (async function init() {
    // 字幕
    await loadCues();

    // 測驗 / 單字（先預留，掛錯誤訊息也 OK）
    loadQuiz();
    loadVocab();

    // 事件繫結
    bindEvents();

    // 分頁（若存在）
    if (tabCues) tabCues.addEventListener("click", () => setPane("cues"));
    if (tabQuiz) tabQuiz.addEventListener("click", () => setPane("quiz"));
    if (tabVocab) tabVocab.addEventListener("click", () => setPane("vocab"));
  })();

  /* ---------------------------
     載入字幕 cues
     --------------------------- */
  async function loadCues() {
    try {
      const data = await fetchJSON(PATH.cues);
      // 支援兩種格式：
      // 1) [{time:"00:01", en:"...", zh:"..."}]
      // 2) [{t:秒數, en:"...", zh:"..."}]
      cues = data.map((d) => ({
        t: d.t != null ? Number(d.t) : timeToSec(d.time),
        en: d.en || "",
        zh: d.zh || "",
        time: d.time || secToTime(d.t || timeToSec(d.time || "00:00")),
      }));
      renderCues();
    } catch (err) {
      console.error(err);
      putCuesMessage(`查無字幕資料（${PATH.cues}）`);
    }
  }

  function renderCues() {
    if (!cuesBody) return;
    cuesBody.innerHTML = cues
      .map(
        (c, i) => `
      <tr data-idx="${i}" data-t="${c.t}">
        <td class="time">[${c.time}]</td>
        <td class="en">${escapeHTML(c.en)}</td>
        <td class="zh">${escapeHTML(c.zh)}</td>
      </tr>
    `
      )
      .join("");

    // 點行跳播
    $$("#cues-body tr, .cues tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const t = Number(tr.dataset.t || 0);
        if (!isNaN(t) && video) {
          video.currentTime = Math.max(0, t + offset + 0.01);
          video.play().catch(() => {});
        }
      });
    });
  }

  function putCuesMessage(msg) {
    if (!cuesBody) return;
    cuesBody.innerHTML = `
      <tr><td colspan="3" style="color:#f88">${escapeHTML(msg)}</td></tr>
    `;
  }

  /* ---------------------------
     測驗（預留）
     --------------------------- */
  async function loadQuiz() {
    if (!quizBody) return;
    try {
      const data = await fetchJSON(PATH.quiz);
      // 預留呈現（這裡僅放成功訊息；你要的題型我之後再補上）
      quizBody.innerHTML = `
        <div class="text-green-400" style="padding:8px 0;">
          ✅ 已載入測驗（${PATH.quiz}），待掛題單呈現…
        </div>
      `;
      // TODO: 在這裡把 data 轉為題目 UI
      console.log("quiz data:", data);
    } catch (err) {
      quizBody.innerHTML = `
        <div style="color:#f88">查無測驗資料（${PATH.quiz}）。</div>
      `;
    }
  }

  /* ---------------------------
     單字（預留）
     --------------------------- */
  async function loadVocab() {
    if (!vocabBody) return;
    try {
      const data = await fetchJSON(PATH.vocab);
      vocabBody.innerHTML = `
        <div class="text-green-400" style="padding:8px 0;">
          ✅ 已載入單字（${PATH.vocab}），待掛呈現樣式…
        </div>
      `;
      // TODO: 在這裡把 data 依 A 填空、例句點播 時間戳等方式呈現
      console.log("vocab data:", data);
    } catch (err) {
      vocabBody.innerHTML = `
        <div style="color:#f88">查無單字資料（${PATH.vocab}）。</div>
      `;
    }
  }

  /* ---------------------------
     事件：跟隨 / 偏移 / 高亮
     --------------------------- */
  function bindEvents() {
    if (followToggle) {
      followToggle.addEventListener("change", () => {
        // 勾跟隨時，立即捲到當前句
        if (followToggle.checked) {
          highlightByTime();
        }
      });
    }

    if (offsetMinus) {
      offsetMinus.addEventListener("click", () => {
        offset -= 0.5;
        updateOffsetDisplay();
      });
    }
    if (offsetPlus) {
      offsetPlus.addEventListener("click", () => {
        offset += 0.5;
        updateOffsetDisplay();
      });
    }
    updateOffsetDisplay();

    if (video) {
      video.addEventListener("timeupdate", highlightByTime);
      // 若要支援「上一句 / 下一句」的按鈕，這邊也能加
    }
  }

  function highlightByTime() {
    if (!video || !cues || cues.length === 0) return;

    const t = video.currentTime - offset; // 用偏移修正
    // 找到 <= t 的最後一句
    let idx = cues.findIndex((c, i) => {
      const next = cues[i + 1];
      if (!next) return t >= c.t;
      return t >= c.t && t < next.t;
    });
    if (idx === -1) {
      // 若一開始就比第一句小，取消高亮
      if (t < cues[0].t) idx = -1;
      else idx = cues.length - 1; // 超過最後一句
    }

    if (idx !== activeIdx) {
      // 清除舊的
      const oldTr =
        $(`#cues-body tr.active`) || $(`.cues tbody tr.active`);
      if (oldTr) oldTr.classList.remove("active");

      activeIdx = idx;
      const newTr =
        $(`#cues-body tr[data-idx="${idx}"]`) ||
        $(`.cues tbody tr[data-idx="${idx}"]`);
      if (newTr) {
        newTr.classList.add("active");
        if (followToggle && followToggle.checked) {
          // 跟隨滾到可視範圍
          newTr.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
  }

  function updateOffsetDisplay() {
    if (offsetDisplay) {
      const s = offset.toFixed(1);
      offsetDisplay.textContent = `偏移 ${s}s`;
    }
  }

  /* ---------------------------
     小工具 & DOM 容器保底
     --------------------------- */
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  }

  function timeToSec(hhmmss) {
    // 支援 mm:ss 或 hh:mm:ss
    const parts = (hhmmss || "0:0").split(":").map(Number);
    let s = 0;
    if (parts.length === 3) s = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else s = parts[0] * 60 + parts[1];
    return s;
  }

  function secToTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${fmt(m)}:${fmt(s)}`;
  }

  function escapeHTML(str = "") {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function ensureBody(id) {
    // 若沒有 tbody，就建一個
    const el = document.createElement("tbody");
    el.id = id.replace("#", "");
    // 優先塞到有 table 的字幕表格
    const table =
      $(".cues table") ||
      $("#cues-table") ||
      $("table[data-kind='cues']") ||
      $("table");
    if (table) {
      if (!table.tBodies.length) table.appendChild(el);
      else table.tBodies[0].replaceWith(el);
    } else {
      // 沒有表格也可暫時放一個
      const host =
        $("[data-pane='cues']") || $("#pane-cues") || document.body;
      const fakeTable = document.createElement("table");
      fakeTable.className = "cues";
      fakeTable.appendChild(el);
      host.appendChild(fakeTable);
    }
    return el;
  }

  function ensureDiv(id) {
    let el = $(id);
    if (el) return el;
    el = document.createElement("div");
    el.id = id.replace("#", "");
    const host =
      $("[data-pane='quiz']") ||
      $("[data-pane='vocab']") ||
      $("#rightPane") ||
      document.body;
    host.appendChild(el);
    return el;
  }

  function setPane(which) {
    // 可選：如果你有分頁顯示/隱藏邏輯，可在此處理
    // 這裡只發事件，HTML 可用 [data-pane] 之類配合
    document.dispatchEvent(
      new CustomEvent("player:switch-pane", { detail: { which } })
    );
  }
})();

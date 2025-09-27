/* /english-videos/player.js
   功能：
   - 依 slug 載入影片 / 字幕 / 測驗 / 單字
   - 字幕表格：點選即跳播；支援上一句、下一句、重複本句、A-B 循環、取消循環、播放速度
   - 測驗分頁：四選一單題檢核（支援一般結構）
   - 單字分頁：顯示詞條；若有 time 可點「▶」跳播
*/

(function () {
  // ------------- 基本 DOM --------------
  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  const video = $("#video");

  const tabButtons = $$(".tabs button");
  const tabSubs = $("#subs");
  const tabQuiz = $("#quiz");
  const tabVocab = $("#vocab");

  // controls
  const btnPrev = $("#prev");
  const btnPlayPause = $("#playPause");
  const btnNext = $("#next");
  const btnRepeat = $("#repeat");
  const btnAB = $("#abLoop");
  const btnCancelLoop = $("#cancelLoop");
  const selSpeed = $("#speed");

  // ------------- 初始化 --------------
  const params = new URLSearchParams(location.search);
  const slug = (params.get("slug") || "").trim();

  // 覆蓋一下影片 src（你也可改成從 index.json 來）
  video.src = `/english-videos/videos/${slug}.mp4`;

  // 讀 JSON 的 helper（帶容錯）
  async function loadJSON(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn("loadJSON error:", path, err);
      return null;
    }
  }

  // ------------- 字幕（cues） --------------
  /** 預期格式：[{time: "00:06", en: "...", zh: "..."}, ...]
   * time 也可支援「00:06.500」或「0:06」
   */
  let cues = [];
  let cueIndex = -1;
  let repeatThis = false; // 重複本句開關
  let loopA = null; // A-B 循環 A 點（秒）
  let loopB = null; // A-B 循環 B 點（秒）
  let abActive = false;

  function toSeconds(t) {
    if (typeof t === "number") return t;
    if (!t || typeof t !== "string") return 0;
    const parts = t.trim().split(":").map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) {
      const [hh, mm, ss] = parts;
      return hh * 3600 + mm * 60 + ss;
    } else if (parts.length === 2) {
      const [mm, ss] = parts;
      return mm * 60 + ss;
    } else if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  }

  function renderSubsTable(list) {
    if (!list || !list.length) {
      tabSubs.innerHTML = `<p style="opacity:.8">查無字幕資料（cues-${slug}.json）。</p>`;
      return;
    }
    const rows = list
      .map((it, i) => {
        const t = it.time ?? it.t ?? "";
        const en = it.en ?? it.eng ?? it.english ?? "";
        const zh = it.zh ?? it.zht ?? it.cn ?? it.ch ?? "";
        return `
          <tr data-idx="${i}">
            <td style="white-space:nowrap;color:#93c5fd;">[${t.padStart(5,"0")}]</td>
            <td>${escapeHTML(en)}</td>
            <td>${escapeHTML(zh)}</td>
          </tr>`;
      })
      .join("");
    tabSubs.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:80px">時間</th>
            <th>英文</th>
            <th>中文</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    // 點列跳播
    $$("#subs tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const idx = Number(tr.dataset.idx || -1);
        if (idx >= 0) {
          cueIndex = idx;
          video.currentTime = toSeconds(cues[idx].time || cues[idx].t || 0);
          video.play();
          highlightRow(idx);
        }
      });
    });
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function highlightRow(idx) {
    const trs = $$("#subs tbody tr");
    trs.forEach((tr) => tr.classList.remove("active-row"));
    const tr = trs[idx];
    if (tr) {
      tr.classList.add("active-row");
      tr.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function findCueIndexByTime(tSec) {
    if (!cues.length) return -1;
    // 找最後一個 time <= tSec 的索引
    let i = cues.length - 1;
    for (; i >= 0; i--) {
      const start = toSeconds(cues[i].time || cues[i].t || 0);
      if (tSec + 0.001 >= start) return i;
    }
    return -1;
  }

  function goPrev() {
    if (!cues.length) return;
    cueIndex = Math.max(0, (cueIndex <= 0 ? 0 : cueIndex - 1));
    const t = toSeconds(cues[cueIndex].time || cues[cueIndex].t || 0);
    video.currentTime = t;
    video.play();
    highlightRow(cueIndex);
  }

  function goNext() {
    if (!cues.length) return;
    cueIndex = Math.min(cues.length - 1, cueIndex + 1);
    const t = toSeconds(cues[cueIndex].time || cues[cueIndex].t || 0);
    video.currentTime = t;
    video.play();
    highlightRow(cueIndex);
  }

  function toggleRepeatThis() {
    repeatThis = !repeatThis;
    btnRepeat.textContent = repeatThis ? "重複本句 ✓" : "重複本句";
  }

  function toggleABLoop() {
    if (!abActive) {
      // 首次按：記錄 A
      loopA = video.currentTime;
      loopB = null;
      abActive = true;
      btnAB.textContent = "A-B 循環（已設 A）";
    } else if (abActive && loopB == null) {
      // 第二次按：記錄 B
      loopB = video.currentTime;
      if (loopB <= loopA + 0.2) {
        // B 必須在 A 後
        loopB = null;
        alert("B 點需在 A 點之後，請重設 A-B。");
        return;
      }
      btnAB.textContent = "A-B 循環 ✓";
    } else {
      // 第三次按：重置
      loopA = null;
      loopB = null;
      abActive = false;
      btnAB.textContent = "A-B 循環";
    }
  }

  function cancelLoop() {
    repeatThis = false;
    btnRepeat.textContent = "重複本句";
    loopA = null;
    loopB = null;
    abActive = false;
    btnAB.textContent = "A-B 循環";
  }

  // 影片播放時，不斷更新目前所在的句子
  video.addEventListener("timeupdate", () => {
    const t = video.currentTime;

    // A-B 循環
    if (abActive && loopA != null && loopB != null) {
      if (t > loopB) {
        video.currentTime = loopA;
      }
    }

    // 句子 index
    const idx = findCueIndexByTime(t);
    if (idx !== -1 && idx !== cueIndex) {
      cueIndex = idx;
      highlightRow(cueIndex);
    }

    // 重複本句：到下一句開頭就拉回
    if (repeatThis && cues[cueIndex]) {
      const start = toSeconds(cues[cueIndex].time || 0);
      const nextStart = cues[cueIndex + 1]
        ? toSeconds(cues[cueIndex + 1].time || 0)
        : start + 4; // 最後一句：大概+4秒
      if (t >= nextStart - 0.05) {
        video.currentTime = start;
      }
    }
  });

  // 控制按鈕
  btnPrev.addEventListener("click", goPrev);
  btnNext.addEventListener("click", goNext);
  btnRepeat.addEventListener("click", toggleRepeatThis);
  btnAB.addEventListener("click", toggleABLoop);
  btnCancelLoop.addEventListener("click", cancelLoop);
  btnPlayPause.addEventListener("click", () => {
    if (video.paused) video.play();
    else video.pause();
  });
  selSpeed.addEventListener("change", () => {
    video.playbackRate = Number(selSpeed.value || 1);
  });

  // ------------- 測驗（quiz） --------------
  /** 預期格式：
   * {
   *   "title":"...",
   *   "items":[
   *     {"q":"...","options":["A","B","C","D"],"answer":1,"explain":"..."}
   *   ]
   * }
   * - answer 可是索引或字母（0/1/2/3 或 "A"/"B"/...）
   */
  function renderQuiz(qdata) {
    if (!qdata || !qdata.items || !qdata.items.length) {
      tabQuiz.innerHTML = `<p style="opacity:.8">查無測驗資料（quiz-${slug}.json）。</p>`;
      return;
    }
    const title = qdata.title ?? "小測驗";
    const html = qdata.items
      .map((it, i) => {
        const opts = (it.options || it.choices || []).map((op, j) => {
          const label = String.fromCharCode(65 + j); // A B C D...
          return `
            <label style="display:block;margin:.3rem 0">
              <input type="radio" name="q_${i}" value="${j}" />
              <span style="margin-left:.3rem">${label}. ${escapeHTML(op)}</span>
            </label>`;
        }).join("");
        return `
          <div class="quiz-card" data-q="${i}" style="background:#111827;border:1px solid #334155;border-radius:12px;padding:12px;margin:10px 0">
            <div style="font-weight:600;margin-bottom:.3rem">Q${i+1}. ${escapeHTML(it.q || it.question || "")}</div>
            <div>${opts || "<em>（此題無選項）</em>"}</div>
            <div style="margin-top:.5rem">
              <button class="quiz-check" data-q="${i}" style="padding:6px 10px;background:#334155;border:none;color:#fff;border-radius:8px;cursor:pointer">檢查</button>
              <span class="quiz-result" style="margin-left:.6rem;opacity:.9"></span>
            </div>
          </div>`;
      }).join("");

    tabQuiz.innerHTML = `<h3 style="margin:0 0 .5rem">${escapeHTML(title)}</h3>${html}`;

    $$(".quiz-check", tabQuiz).forEach(btn => {
      btn.addEventListener("click", () => {
        const qi = Number(btn.dataset.q);
        const item = qdata.items[qi];
        if (!item) return;

        // 取得使用者作答
        const checked = $(`input[name="q_${qi}"]:checked`, tabQuiz);
        const resEl = $(`.quiz-card[data-q="${qi}"] .quiz-result`, tabQuiz);
        if (!checked) {
          resEl.textContent = "請先選擇答案";
          resEl.style.color = "#fca5a5";
          return;
        }

        const ans = normalizeAnswer(item.answer);
        const my = Number(checked.value);
        if (my === ans) {
          resEl.textContent = "✅ 正確！" + (item.explain ? `（${item.explain}）` : "");
          resEl.style.color = "#86efac";
        } else {
          const letter = String.fromCharCode(65 + ans);
          resEl.textContent = `❌ 錯誤，正解是 ${letter}` + (item.explain ? `（${item.explain}）` : "");
          resEl.style.color = "#fca5a5";
        }
      });
    });
  }

  function normalizeAnswer(a) {
    // 支援 "A"/"B"… 或 0/1/2/3
    if (typeof a === "string") {
      const up = a.trim().toUpperCase();
      const n = up.charCodeAt(0) - 65; // A -> 0
      return n >= 0 ? n : 0;
    }
    if (typeof a === "number") return a;
    return 0;
  }

  // ------------- 單字（vocab） --------------
  /** 預期格式：
   * {
   *   "title":"...",
   *   "items":[
   *     {"time":"00:08","word":"lantern","pos":"n.","zh":"燈籠","en":"...","example":"..."}
   *   ]
   * }
   */
  function renderVocab(vdata) {
    if (!vdata || !vdata.items || !vdata.items.length) {
      tabVocab.innerHTML = `<p style="opacity:.8">查無單字資料（vocab-${slug}.json）。</p>`;
      return;
    }
    const rows = vdata.items.map((it, i) => {
      const t = it.time ?? "";
      const w = it.word ?? "";
      const pos = it.pos ?? "";
      const zh = it.zh ?? it.cn ?? "";
      const en = it.en ?? it.eng ?? "";
      const eg = it.example ?? it.eg ?? "";

      const hasTime = !!t;
      const playBtn = hasTime
        ? `<button class="jump-time" data-t="${t}" style="padding:4px 8px;background:#334155;border:none;border-radius:6px;color:#fff;cursor:pointer">▶</button>`
        : "";

      return `
        <tr>
          <td style="white-space:nowrap">${escapeHTML(t)} ${playBtn}</td>
          <td style="white-space:nowrap;font-weight:600">${escapeHTML(w)}</td>
          <td style="white-space:nowrap;opacity:.85">${escapeHTML(pos)}</td>
          <td>${escapeHTML(zh)}</td>
          <td>${escapeHTML(en)}<div style="opacity:.8;margin-top:.25rem">${escapeHTML(eg)}</div></td>
        </tr>`;
    }).join("");

    tabVocab.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:110px">時間</th>
            <th style="width:160px">單字</th>
            <th style="width:80px">詞性</th>
            <th style="width:160px">中文</th>
            <th>英文解釋 / 例句</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    $$(".jump-time", tabVocab).forEach(btn => {
      btn.addEventListener("click", () => {
        const t = toSeconds(btn.dataset.t || 0);
        video.currentTime = t;
        video.play();
        // 使字幕也高亮
        const i = findCueIndexByTime(t);
        if (i !== -1) {
          cueIndex = i;
          highlightRow(i);
        }
      });
    });
  }

  // ------------- 分頁切換 --------------
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      // 顯示對應 tab-content
      $("#subs").style.display  = tab === "subs"  ? "" : "none";
      $("#quiz").style.display  = tab === "quiz"  ? "" : "none";
      $("#vocab").style.display = tab === "vocab" ? "" : "none";
    });
  });

  // ------------- 啟動載入 --------------
  async function boot() {
    if (!slug) {
      tabSubs.innerHTML  = `<p>缺少 slug。</p>`;
      tabQuiz.innerHTML  = `<p>缺少 slug。</p>`;
      tabVocab.innerHTML = `<p>缺少 slug。</p>`;
      return;
    }

    // cues
    const cuesPath = `/english-videos/data/cues-${slug}.json`;
    const quizPath = `/english-videos/data/quiz-${slug}.json`;
    const vocabPath = `/english-videos/data/vocab-${slug}.json`;

    const [cuesData, quizData, vocabData] = await Promise.all([
      loadJSON(cuesPath),
      loadJSON(quizPath),
      loadJSON(vocabPath),
    ]);

    // 1) 字幕
    if (Array.isArray(cuesData)) {
      cues = cuesData.map(c => ({
        time: c.time ?? c.t ?? "",
        en: c.en ?? c.eng ?? "",
        zh: c.zh ?? c.zht ?? c.cn ?? ""
      }));
    } else if (cuesData && Array.isArray(cuesData.items)) {
      cues = cuesData.items;
    } else {
      cues = [];
    }
    renderSubsTable(cues);

    // 2) 測驗
    renderQuiz(quizData);

    // 3) 單字
    renderVocab(vocabData);
  }

  boot();
})();

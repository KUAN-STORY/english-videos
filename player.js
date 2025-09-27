// /english-videos/player.js  —  字幕 + 測驗 + 單字（填空）完整控制

async function loadJSON(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    return await r.json();
  } catch (err) {
    console.error("讀取失敗:", path, err);
    return null;
  }
}

// 解析 00:01 或 [00:01] 成秒數
function parseTimeToSec(t) {
  if (!t) return 0;
  t = (t + "").replace(/[\[\]]/g, "");
  const m = t.match(/(\d+):(\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");
  if (!slug) return;

  // 載入影片
  const video = document.getElementById("video");
  video.src = `videos/${slug}.mp4`;

  // 載入三種資料
  const cues = await loadJSON(`data/cues-${slug}.json`);
  const quiz = await loadJSON(`data/quiz-${slug}.json`);
  const vocab = await loadJSON(`data/vocab-${slug}.json`);

  // render tabs
  bindTabs();

  // render three panes
  renderCues(cues);
  renderQuiz(quiz);
  renderVocab(vocab);

  // 字幕同步：高亮 + 跟隨 + 偏移
  setupCueSync(video, cues);
});

/* ---------- Tabs ---------- */
function bindTabs() {
  const buttons = [...document.querySelectorAll(".tab-btn")];
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const panes = [...document.querySelectorAll(".pane")];
      panes.forEach(p => p.classList.remove("active"));
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

/* ---------- Subtitles ---------- */
function renderCues(cues) {
  const tbody = document.getElementById("cues-body");
  if (!cues || !cues.length) {
    tbody.innerHTML = `<tr><td colspan="3">查無字幕資料。</td></tr>`;
    return;
  }
  tbody.innerHTML = cues.map(c => `
    <tr data-sec="${parseTimeToSec(c.time)}">
      <td class="time">[${c.time}]</td>
      <td>${escapeHTML(c.en || "")}</td>
      <td>${escapeHTML(c.zh || "")}</td>
    </tr>
  `).join("");

  // 點行跳到該時間
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", () => {
      const sec = Number(tr.dataset.sec || 0);
      const v = document.getElementById("video");
      v.currentTime = sec;
      v.play();
    });
  });
}

function setupCueSync(video, cues) {
  const tbody = document.getElementById("cues-body");
  const rows = () => [...tbody.querySelectorAll("tr")];
  const followChk = document.getElementById("followChk");
  const offLabel = document.getElementById("offsetLabel");
  let offset = 0;

  document.getElementById("-05").addEventListener("click", () => {
    offset = +(offset - 0.5).toFixed(1); offLabel.textContent = offset.toFixed(1) + "s";
  });
  document.getElementById("+05").addEventListener("click", () => {
    offset = +(offset + 0.5).toFixed(1); offLabel.textContent = offset.toFixed(1) + "s";
  });

  video.addEventListener("timeupdate", () => {
    if (!cues || !cues.length) return;

    const now = video.currentTime + offset;
    // 找 <= now 的最後一筆
    let idx = -1;
    for (let i = 0; i < cues.length; i++) {
      const sec = parseTimeToSec(cues[i].time);
      if (sec <= now) idx = i; else break;
    }

    rows().forEach(r => r.classList.remove("active"));
    if (idx >= 0) {
      const tr = rows()[idx];
      if (tr) {
        tr.classList.add("active");
        if (followChk.checked) tr.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  });
}

/* ---------- Quiz ---------- */
function renderQuiz(list) {
  const container = document.getElementById("quiz-body");
  if (!list || !list.length) {
    container.innerHTML = `<p>查無測驗資料（quiz-xxx.json）。</p>`;
    return;
  }
  container.innerHTML = list.map((q, i) => `
    <div class="quiz-item" style="border:1px solid #22324a;border-radius:8px;padding:12px;margin:10px 0;background:#0f1525">
      <p style="margin:0 0 6px">${i + 1}. ${escapeHTML(q.question)}</p>
      ${q.options.map(opt => `
        <label style="display:block;margin:4px 0">
          <input type="radio" name="q${i}" value="${escapeHTML(opt)}"> ${escapeHTML(opt)}
        </label>
      `).join("")}
      <p class="answer" style="margin:8px 0 0">正解：${escapeHTML(q.answer)}</p>
    </div>
  `).join("");
}

/* ---------- Vocab (fill-in) ---------- */
function renderVocab(list) {
  const tbody = document.getElementById("vocab-body");
  if (!list || !list.length) {
    tbody.innerHTML = `<tr><td colspan="4">查無單字資料。</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(v => {
    const re = new RegExp("\\b" + escapeReg(v.word) + "\\b", "i");
    const blanked = (v.example || "").replace(re, "____");
    return `
      <tr>
        <td class="time">${escapeHTML(v.time || "")}</td>
        <td>${escapeHTML(blanked)}</td>
        <td>答案：<b>${escapeHTML(v.word)}</b> <span style="color:#93c5fd">(${escapeHTML(v.pos || "")})</span></td>
        <td>${escapeHTML(v.zh || "")}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- helpers ---------- */
function escapeHTML(s) {
  return (s ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function escapeReg(s){ return (s??"").replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

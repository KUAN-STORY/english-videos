// /english-videos/player.js  —  字幕 + 測驗 + 單字（填空）完整控制（同時支援兩種 quiz 格式）

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

  // 影片
  const video = document.getElementById("video");
  video.src = `videos/${slug}.mp4`;

  // 三種資料
  const cues  = await loadJSON(`data/cues-${slug}.json`);
  const quiz  = await loadJSON(`data/quiz-${slug}.json`);
  const vocab = await loadJSON(`data/vocab-${slug}.json`);

  bindTabs();
  renderCues(cues);
  renderQuiz(quiz);
  renderVocab(vocab);
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
    offset = +(offset - 0.5).toFixed(1);
    offLabel.textContent = offset.toFixed(1) + "s";
  });
  document.getElementById("+05").addEventListener("click", () => {
    offset = +(offset + 0.5).toFixed(1);
    offLabel.textContent = offset.toFixed(1) + "s";
  });

  video.addEventListener("timeupdate", () => {
    if (!cues || !cues.length) return;

    const now = video.currentTime + offset;
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

/* ---------- Quiz（支援兩種格式） ---------- */
function normalizeQuizItem(q) {
  // 新式：{question, options, answer, explain}
  if (q.question && q.options) {
    return {
      question: String(q.question),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      answer: q.answer != null ? String(q.answer) : "",
      explain: q.explain ? String(q.explain) : ""
    };
  }
  // 舊式：{q, a, answerIndex, explain}
  if (q.q && q.a) {
    const opts = Array.isArray(q.a) ? q.a.map(String) : [];
    const idx = Number.isInteger(q.answerIndex) ? q.answerIndex : -1;
    const ans = idx >= 0 && idx < opts.length ? opts[idx] : "";
    return {
      question: String(q.q),
      options: opts,
      answer: ans,
      explain: q.explain ? String(q.explain) : ""
    };
  }
  return null;
}

function renderQuiz(list) {
  const container = document.getElementById("quiz-body");
  if (!Array.isArray(list) || !list.length) {
    container.innerHTML = `<p>查無測驗資料（quiz-xxx.json）。</p>`;
    return;
  }

  // 正規化
  const items = list.map(normalizeQuizItem).filter(Boolean);
  if (!items.length) {
    container.innerHTML = `<p>測驗資料格式不符合（已支援 q/a/answerIndex 或 question/options/answer）。</p>`;
    return;
  }

  let score = 0;

  container.innerHTML = `
    <div style="margin:6px 0 12px; color:#9ca3af">
      共 ${items.length} 題，作答後立即判定，並可展開「解釋」。
    </div>
    ${items.map((q, i) => `
      <div class="quiz-item" style="border:1px solid #22324a;border-radius:8px;padding:12px;margin:10px 0;background:#0f1525">
        <p style="margin:0 0 8px"><b>${i + 1}.</b> ${escapeHTML(q.question)}</p>
        <div>
          ${q.options.map(opt => `
            <label style="display:block;margin:6px 0;cursor:pointer">
              <input type="radio" name="q${i}" value="${escapeHTML(opt)}"> ${escapeHTML(opt)}
            </label>
          `).join("")}
        </div>
        <div class="result" data-i="${i}" style="margin-top:8px; display:none"></div>
        ${q.explain ? `<details style="margin-top:6px;color:#cbd5e1"><summary>解釋</summary><div style="margin-top:6px">${escapeHTML(q.explain)}</div></details>` : ""}
      </div>
    `).join("")}
    <div id="scoreBar" style="margin-top:14px;padding:10px;border-top:1px solid #22324a;color:#d1fae5">
      得分：<b id="scoreVal">0</b> / ${items.length}
    </div>
  `;

  // 綁定即時判題
  items.forEach((q, i) => {
    const radios = [...container.querySelectorAll(`input[name="q${i}"]`)];
    const box = container.querySelector(`.result[data-i="${i}"]`);
    radios.forEach(r => {
      r.addEventListener("change", () => {
        const correct = r.value === q.answer;
        // 若第一次答對就加分；重複切換只看當前是否正確
        const previously = box.dataset.correct === "true";
        if (!previously && correct) score++;
        if (previously && !correct) score--;

        box.dataset.correct = String(correct);
        box.style.display = "block";
        box.innerHTML = correct
          ? `<span style="color:#34d399">✔ 正確！</span> 答案：<b>${escapeHTML(q.answer)}</b>`
          : `<span style="color:#f87171">✘ 錯誤</span> 正確答案：<b>${escapeHTML(q.answer)}</b>`;

        document.getElementById("scoreVal").textContent = String(score);
      });
    });
  });
}

/* ---------- Vocab (填空/文法式) ---------- */
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

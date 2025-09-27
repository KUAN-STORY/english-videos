// player.js

// 取得網址參數 slug，例如：?slug=mid-autumn
const urlParams = new URLSearchParams(window.location.search);
const slug = urlParams.get("slug") || "default";

// JSON 檔案的基底路徑
const DATA_BASE = "./data";

// 對應的 JSON 檔案
const cuesFile = `${DATA_BASE}/cues-${slug}.json`;
const quizFile = `${DATA_BASE}/quiz-${slug}.json`;
const vocabFile = `${DATA_BASE}/vocab-${slug}.json`;

// 綁定 DOM 元素
const video = document.getElementById("video");
const subtitlesDiv = document.getElementById("subtitles");
const quizDiv = document.getElementById("quiz");
const vocabDiv = document.getElementById("vocab");
const tabs = document.querySelectorAll(".tabs button");

// --- Tab 切換 ---
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    document.getElementById(tab.dataset.tab).style.display = "block";
  });
});

// --- 載入字幕 ---
async function loadSubtitles() {
  try {
    const res = await fetch(cuesFile);
    if (!res.ok) throw new Error("找不到字幕檔");
    const cues = await res.json();

    let html = `
      <table>
        <tr><th>時間</th><th>英文</th><th>中文</th></tr>
    `;
    cues.forEach((cue) => {
      html += `
        <tr data-start="${cue.start}">
          <td>[${cue.start}]</td>
          <td>${cue.en}</td>
          <td>${cue.zh}</td>
        </tr>`;
    });
    html += `</table>`;
    subtitlesDiv.innerHTML = html;

    // 點字幕 → 跳到影片時間
    subtitlesDiv.querySelectorAll("tr[data-start]").forEach((row) => {
      row.addEventListener("click", () => {
        video.currentTime = parseTime(row.dataset.start);
        video.play();
      });
    });
  } catch (e) {
    subtitlesDiv.innerHTML = `<p style="color:#f87171">查無字幕資料 (${cuesFile})</p>`;
  }
}

// --- 載入測驗 ---
async function loadQuiz() {
  try {
    const res = await fetch(quizFile);
    if (!res.ok) throw new Error("找不到測驗檔");
    const quiz = await res.json();

    let html = "";
    quiz.forEach((q, i) => {
      html += `<div class="quiz-item">
        <p><b>Q${i + 1}. ${q.q}</b></p>
        ${q.a
          .map(
            (opt, idx) => `
          <label>
            <input type="radio" name="q${i}" value="${idx}" />
            ${opt}
          </label><br>`
          )
          .join("")}
        <div class="explain" style="display:none;color:#38bdf8"></div>
      </div><hr/>`;
    });
    html += `<button id="submitQuiz">提交答案</button>`;
    quizDiv.innerHTML = html;

    // 提交答案
    document.getElementById("submitQuiz").addEventListener("click", () => {
      document.querySelectorAll(".quiz-item").forEach((item, i) => {
        const checked = item.querySelector("input:checked");
        const explainDiv = item.querySelector(".explain");
        if (!checked) {
          explainDiv.innerHTML = "未作答";
        } else {
          const val = parseInt(checked.value);
          if (val === quiz[i].answerIndex) {
            explainDiv.innerHTML = "✅ 正確！ " + quiz[i].explain;
          } else {
            explainDiv.innerHTML =
              "❌ 錯誤，正解是「" +
              quiz[i].a[quiz[i].answerIndex] +
              "」：" +
              quiz[i].explain;
          }
        }
        explainDiv.style.display = "block";
      });
    });
  } catch (e) {
    quizDiv.innerHTML = `<p style="color:#f87171">查無測驗資料 (${quizFile})</p>`;
  }
}

// --- 載入單字 ---
async function loadVocab() {
  try {
    const res = await fetch(vocabFile);
    if (!res.ok) throw new Error("找不到單字檔");
    const vocab = await res.json();

    let html = `
      <table>
        <tr><th>時間</th><th>單字</th><th>詞性</th><th>中文</th><th>填空/例句</th></tr>
    `;
    vocab.forEach((v) => {
      html += `
        <tr data-start="${v.time || "0:00"}">
          <td>${v.time || ""}</td>
          <td><b>${v.word}</b></td>
          <td>${v.pos || ""}</td>
          <td>${v.zh || ""}</td>
          <td>${v.example || ""}</td>
        </tr>`;
    });
    html += `</table>`;
    vocabDiv.innerHTML = html;

    // 點單字 → 播放該時間
    vocabDiv.querySelectorAll("tr[data-start]").forEach((row) => {
      row.addEventListener("click", () => {
        const start = row.dataset.start;
        if (start !== "0:00") {
          video.currentTime = parseTime(start);
          video.play();
        }
      });
    });
  } catch (e) {
    vocabDiv.innerHTML = `<p style="color:#f87171">查無單字資料 (${vocabFile})</p>`;
  }
}

// --- 工具：時間字串轉秒數 ---
function parseTime(t) {
  const parts = t.replace("[", "").replace("]", "").split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

// --- 初始載入 ---
loadSubtitles();
loadQuiz();
loadVocab();

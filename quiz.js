/* quiz.js — 專責測驗邏輯（與 player.js 解耦）
 * 功能：
 *  1) 讀 ./data/quiz-<slug>.json
 *  2) 題型 MCQ/SA（單選/簡答）即時判斷；錯才顯示正解
 *  3) 交卷：每題 5 分，滿分 100；顯示評語
 *  4) 列印：A4 直式，含 LOGO 與公司名稱預留位
 */

const VERSION = '2025-10-01';

// 簡易 $/$$ 輔助
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// 題目正規化（容忍不同欄位名稱）
function normalize(q, idx) {
  const type =
    (q.type || '').toLowerCase() ||
    (Array.isArray(q.options || q.choices) ? 'mcq' : 'sa');

  return {
    id: idx + 1,
    type: type === 'mcq' ? 'mcq' : 'sa',
    question: q.question ?? q.q ?? '',
    options: (q.options ?? q.choices ?? []).map(String),
    answer: q.answer ?? q.ans ?? '',
    explanation: q.explanation ?? q.ex ?? '',
  };
}

// 讀題庫
async function loadQuestions(slug) {
  const url = `./data/quiz-${slug}.json?v=${VERSION}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`read ${url} failed`);
  const raw = await r.json();
  return (raw || []).map(normalize);
}

// 產出測驗容器（若不存在就自動補上）
function ensureQuizShell() {
  const pane = $('#pane-quiz') || document.body;

  if (!$('#quizControls', pane)) {
    const bar = document.createElement('div');
    bar.id = 'quizControls';
    bar.style.cssText =
      'margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap';

    bar.innerHTML = `
      <button class="btn" id="btnSubmitQuiz">交卷</button>
      <button class="btn" id="btnPrintQuiz"  style="display:none">列印成績單</button>
      <button class="btn" id="btnToggleAnswer" style="display:none">顯示答案</button>
      <span id="quizMeta" style="color:#9fb3ff"></span>
    `;
    pane.appendChild(bar);
  }

  if (!$('#quizList', pane)) {
    const ol = document.createElement('ol');
    ol.id = 'quizList';
    ol.style.lineHeight = '1.6';
    pane.appendChild(ol);
  }

  // 成績區
  if (!$('#quizScoreBoard', pane)) {
    const box = document.createElement('div');
    box.id = 'quizScoreBoard';
    box.style.cssText = 'margin:6px 0 10px 0; color:#dbe7ff;';
    pane.insertBefore(box, $('#quizList', pane));
  }

  return {
    pane,
    listEl: $('#quizList', pane),
    metaEl: $('#quizMeta', pane),
    sbEl: $('#quizScoreBoard', pane),
    btnSubmit: $('#btnSubmitQuiz', pane),
    btnPrint: $('#btnPrintQuiz', pane),
    btnToggle: $('#btnToggleAnswer', pane),
  };
}

// 測驗主程式入口（由 player.js 呼叫）
export async function initQuiz(slug) {
  const ui = ensureQuizShell();

  ui.metaEl.textContent = '（載入題目中…）';
  ui.listEl.innerHTML = '';
  ui.sbEl.textContent = '';

  let questions = [];
  try {
    questions = await loadQuestions(slug);
  } catch (err) {
    console.error('[quiz] load error:', err);
    ui.metaEl.textContent = '⚠️ 題庫載入失敗';
    return;
  }

  if (!questions.length) {
    ui.metaEl.textContent = '（尚未載入）';
    return;
  }
  ui.metaEl.textContent = `共 ${questions.length} 題（單選/簡答）`;

  const state = {
    answered: new Map(),    // id -> { user, correct }
    revealAll: false,       // 交卷後允許顯示所有正解
    score: 0,
  };

  renderQuestions(ui.listEl, questions, state);
  bindControls(ui, questions, state, slug);
}

// 產生題目
function renderQuestions(listEl, qs, state) {
  listEl.innerHTML = '';

  qs.forEach((q) => {
    const li = document.createElement('li');
    li.style.margin = '14px 0 18px 0';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:6px;';
    title.textContent = q.question;

    const body = document.createElement('div');

    const result = document.createElement('div');
    result.className = 'q-result';
    result.style.cssText = 'margin-top:8px;color:#ff8484;display:none;';
    result.innerHTML = `❌ 錯誤`;

    const correctLine = document.createElement('div');
    correctLine.className = 'q-correct';
    correctLine.style.cssText = 'margin-top:4px;color:#9fb3ff;display:none;';
    correctLine.textContent = `正解：${q.answer}`;

    const exLine = document.createElement('div');
    exLine.style.cssText = 'margin-top:2px;color:#9fb3d9;';
    exLine.textContent = q.explanation ? `解析：${q.explanation}` : '';
    if (!q.explanation) exLine.style.display = 'none';

    // 判斷顯示
    const showCorrectIfNeed = (ok, userVal) => {
      // 正確 → 顯示「正確」
      if (ok) {
        result.style.display = 'block';
        result.style.color = '#5bd3c7';
        result.textContent = '✅ 正確';
        // 只要答對就隱藏正解行
        correctLine.style.display = 'none';
      } else {
        // 答錯 → 顯示錯誤，並出現正解
        result.style.display = 'block';
        result.style.color = '#ff6b6b';
        result.textContent = '❌ 錯誤';
        correctLine.style.display = 'block';
      }
      // 儲存狀態
      state.answered.set(q.id, { user: userVal ?? '', correct: !!ok });
    };

    if (q.type === 'mcq') {
      // 單選題
      q.options.forEach((opt, idx) => {
        const id = `q${q.id}_opt${idx}`;
        const row = document.createElement('div');
        row.style.margin = '2px 0';

        row.innerHTML = `
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="q${q.id}" id="${id}" value="${escapeHtml(
          opt
        )}" />
            <span>${escapeHtml(opt)}</span>
          </label>
        `;

        row.querySelector('input').addEventListener('change', (e) => {
          const user = e.target.value;
          const ok = normalizeAnswer(user) === normalizeAnswer(q.answer);
          showCorrectIfNeed(ok, user);
        });

        body.appendChild(row);
      });
    } else {
      // 簡答題
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:8px;align-items:center;';

      const ipt = document.createElement('input');
      ipt.type = 'text';
      ipt.placeholder = '輸入答案…';
      ipt.style.cssText =
        'padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:220px';

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = '檢查';

      btn.addEventListener('click', () => {
        const user = ipt.value.trim();
        if (!user) {
          // 未作答 → 視為錯誤但不顯正解（與題主要求一致：未答不要顯正解）
          result.style.display = 'block';
          result.style.color = '#ff6b6b';
          result.textContent = '❌ 錯誤（尚未作答）';
          correctLine.style.display = 'none';
          state.answered.set(q.id, { user: '', correct: false });
          return;
        }
        const ok = normalizeAnswer(user) === normalizeAnswer(q.answer);
        showCorrectIfNeed(ok, user);
      });

      wrap.appendChild(ipt);
      wrap.appendChild(btn);
      body.appendChild(wrap);
    }

    li.appendChild(title);
    li.appendChild(body);
    li.appendChild(result);
    li.appendChild(correctLine);
    li.appendChild(exLine);
    listEl.appendChild(li);
  });
}

// 綁定交卷 / 顯示答案 / 列印
function bindControls(ui, qs, state, slug) {
  ui.btnSubmit.onclick = () => {
    // 未作答的題目視為錯
    qs.forEach((q) => {
      if (!state.answered.has(q.id)) state.answered.set(q.id, { user: '', correct: false });
    });

    const correctCount = [...state.answered.values()].filter((x) => x.correct).length;
    const score = correctCount * 5; // 每題 5 分
    state.score = score;
    state.revealAll = true;

    // 讓所有錯題顯示正解
    revealAllAnswers(ui.listEl);

    // 顯示得分 + 評語
    const remark = makeRemark(score);
    ui.sbEl.innerHTML = `
      <div style="margin-bottom:6px">
        <span style="font-weight:700">本次得分：</span> ${score} / 100
      </div>
      <div>${remark}</div>
    `;

    ui.btnPrint.style.display = 'inline-block';
    ui.btnToggle.style.display = 'inline-block';
    ui.btnToggle.textContent = '隱藏答案';
  };

  ui.btnToggle.onclick = () => {
    state.revealAll = !state.revealAll;
    toggleCorrectLines(ui.listEl, state.revealAll);
    ui.btnToggle.textContent = state.revealAll ? '隱藏答案' : '顯示答案';
  };

  ui.btnPrint.onclick = () => {
    printReport(slug, qs, state);
  };
}

// ===== 工具區 =====
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
function normalizeAnswer(s) {
  return String(s || '').trim().toLowerCase();
}
function revealAllAnswers(listEl) {
  $$('.q-result', listEl).forEach((el) => (el.style.display = 'block'));
  $$('.q-correct', listEl).forEach((el) => (el.style.display = 'block'));
}
function toggleCorrectLines(listEl, show) {
  $$('.q-correct', listEl).forEach((el) => (el.style.display = show ? 'block' : 'none'));
}

// 依分數給評語（>=60 正向；否則建設性建議；滿分另有彩蛋）
function makeRemark(score) {
  const good = [
    '表現很穩！繼續保持你的學習節奏。',
    '做得很好！多練幾次就能更熟練。',
    '太棒了！你的理解力很到位。',
    '越做越好，加油！',
    '很有進步，下一次挑戰更高分！',
  ];
  const improve = [
    '別氣餒！先回顧錯的題目，再試一次。',
    '可以先鎖定單字與關鍵句型，多看字幕會有幫助。',
    '每次多對幾題，就會看到明顯進步！',
    '先挑簡單題拿分，建立信心後再攻難題。',
    '想像把題目情境講給朋友聽，會更清楚喔！',
  ];

  if (score === 100) {
    return '滿分！太強了！🎉 集滿五張滿分可兌換一組 LINE 表情貼（請憑成績單向老師登記）';
  }
  if (score >= 60) {
    return good[score % good.length];
  }
  return improve[score % improve.length];
}

// 列印成績單
function printReport(slug, qs, state) {
  const score = state.score || 0;
  const date = new Date().toLocaleString();
  const title = `Stories 測驗成績單（${slug}）`;

  const rows = qs
    .map((q) => {
      const ans = state.answered.get(q.id) || { user: '', correct: false };
      const user = escapeHtml(ans.user || '（未作答）');
      const correct = escapeHtml(q.answer);
      const ex = escapeHtml(q.explanation || '');
      return `
        <tr>
          <td style="vertical-align:top">${escapeHtml(q.question)}</td>
          <td style="vertical-align:top">${user}</td>
          <td style="vertical-align:top">${correct}</td>
          <td style="vertical-align:top">${ex}</td>
        </tr>`;
    })
    .join('');

  const win = window.open('', '_blank');
  win.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif; color:#111; }
    h1 { font-size: 20px; margin:0 0 8px 0; }
    .meta { margin:0 0 12px 0; color:#333; }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .brand .logo {
      width:80px; height:80px; border:1px dashed #bbb; display:flex; align-items:center; justify-content:center;
      color:#999; font-size:12px;
    }
    table { width:100%; border-collapse:collapse; }
    th, td { border:1px solid #ccc; padding:8px; font-size:12px; }
    th { background:#f4f6fb; }
  </style>
</head>
<body>
  <div class="brand">
    <div class="logo">LOGO</div>
    <div>
      <div style="font-weight:700">公司/學校名稱（請置換）</div>
      <div style="color:#666;font-size:13px">English Stories Assessment</div>
    </div>
  </div>

  <h1>${title}</h1>
  <div class="meta">成績：<b>${score} / 100</b>　日期：${date}</div>

  <table>
    <thead>
      <tr>
        <th style="width:40%">題目</th>
        <th style="width:22%">作答</th>
        <th style="width:18%">正解</th>
        <th style="width:20%">解析</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
  `);
  win.document.close();
  win.focus();
  // 讓瀏覽器有時間渲染再列印
  setTimeout(() => win.print(), 150);
}

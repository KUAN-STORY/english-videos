// quiz.js — multi-set (A/B/C) 支援版

function $(s, el=document){return el.querySelector(s);}
function $$(s, el=document){return [...el.querySelectorAll(s)];}

function normalizeQuestion(q, i){
  return {
    id: q.id || i + 1,
    type: (q.type || q.questionType || 'MCQ').toUpperCase(), // 'MCQ' | 'SA'
    question: q.question || q.q || '',
    options: q.options || q.choices || [],
    answer: Array.isArray(q.answer) ? q.answer[0] : (q.answer || q.ans || ''),
    explanation: q.explanation || q.ex || ''
  };
}
function norm(s){return String(s||'').trim().toLowerCase();}
function sameAns(a,b){return norm(a)===norm(b);}

function scoreComment(score, total){
  const pct = (score/total)*100;
  if (pct >= 100) return '滿分！太強了！集滿五張滿分可兌換一組 LINE 表情貼 🎉';
  if (pct >= 90)  return '表現超亮眼，繼續保持！';
  if (pct >= 80)  return '不錯喔，再練一下就更穩了。';
  if (pct >= 70)  return '已達水準，再把粗心錯誤消掉。';
  if (pct >= 60)  return '及格了！多看一次影片加強關鍵觀念。';
  return '這次辛苦了；先看字幕、做單字，再回來挑戰一次吧！';
}

export async function initQuiz(slug, quizType='quizA'){
  const meta = $('#quizMeta');
  const listEl = $('#quizList');
  const resultEl = $('#quizResult');
  const scoreEl = $('#quizScore');
  const commentEl = $('#quizComment');

  // 清空舊狀態
  if (listEl) listEl.innerHTML = '';
  if (resultEl) resultEl.style.display = 'none';
  if (meta) meta.textContent = `（載入中… ${quizType}）`;

  // 讀檔（先 ${quizType}-${slug}.json，失敗則回退 quiz-${slug}.json）
  const files = [
    `./data/${quizType}-${slug}.json`,
    `./data/quiz-${slug}.json`
  ];

  let raw = null;
  for (const f of files){
    try{
      const r = await fetch(f, {cache:'no-store'});
      if (r.ok){ raw = await r.json(); break; }
    }catch{}
  }

  if (!raw || !Array.isArray(raw) || raw.length===0){
    if (meta) meta.textContent = '（查無題庫）';
    return;
  }

  const questions = raw.map(normalizeQuestion);
  if (meta) meta.textContent = `共 ${questions.length} 題（ 單選 / 簡答 ）`;

  renderQuiz(questions);
  wireActions(questions);
}

function renderQuiz(questions){
  const listEl = $('#quizList');
  listEl.innerHTML = '';

  questions.forEach((q, i)=>{
    const li = document.createElement('li');
    li.style.margin = '14px 0';
    li.innerHTML = `
      <div style="font-weight:700">${escapeHTML(q.question)}</div>
      <div class="q-body"></div>
      <div class="q-feedback" style="margin-top:6px"></div>
      <div class="q-solution muted" style="margin-top:4px;display:none">正解：<span class="sol"></span></div>
    `;
    const body = $('.q-body', li);
    const fb   = $('.q-feedback', li);
    const sol  = $('.q-solution', li);

    li.dataset.type = q.type;
    li.dataset.answer = q.answer;

    if (q.type === 'MCQ'){
      q.options.forEach(opt=>{
        const id = `q${q.id}-${norm(opt)}`;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.innerHTML = `
          <input type="radio" name="q-${q.id}" id="${id}" value="${escapeHTML(opt)}">
          <label for="${id}">${escapeHTML(opt)}</label>
        `;
        body.appendChild(row);
      });

      body.addEventListener('change', e=>{
        if (e.target?.name === `q-${q.id}`){
          const val = e.target.value;
          const ok = sameAns(val, q.answer);
          fb.textContent = ok ? '✅ 正確' : '❌ 錯誤';
          fb.style.color = ok ? '#5bd3c7' : '#ff6b6b';
          // 顯示正解
          $('.sol', sol).textContent = q.answer;
          sol.style.display = 'block';
          li.dataset.user = val;
          li.dataset.correct = ok ? '1' : '0';
        }
      });

    }else{ // SA
      body.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input class="ipt" type="text" placeholder="輸入答案…" style="padding:8px 10px;border:1px solid #334155;border-radius:8px;background:#0f223b;color:#dbe7ff;min-width:220px">
          <button class="btn btnCheck">檢查</button>
        </div>
      `;
      const ipt = $('.ipt', body);
      const btn = $('.btnCheck', body);

      btn.addEventListener('click', ()=>{
        const val = ipt.value;
        if (!val.trim()){
          fb.textContent = '請先作答';
          fb.style.color = '#9fb3d9';
          return;
        }
        const ok = sameAns(val, q.answer);
        fb.textContent = ok ? '✅ 正確' : '❌ 錯誤';
        fb.style.color = ok ? '#5bd3c7' : '#ff6b6b';
        // 顯示正解
        $('.sol', sol).textContent = q.answer;
        sol.style.display = 'block';
        li.dataset.user = val;
        li.dataset.correct = ok ? '1' : '0';
      });
    }

    listEl.appendChild(li);
  });
}

function wireActions(questions){
  const btnSubmit = $('#btnSubmitQuiz');
  const btnPrint  = $('#btnPrintQuiz');
  const btnReveal = $('#btnShowAnswer');
  const resultEl  = $('#quizResult');
  const scoreEl   = $('#quizScore');
  const commentEl = $('#quizComment');

  btnSubmit.onclick = ()=>{
    // 統計分數：只有有「作答」的題才算正確/錯誤；未作答不計分
    let correct = 0, attempted = 0;
    $$('#quizList > li').forEach(li=>{
      const u = (li.dataset.user || '').trim();
      if (u){
        attempted++;
        if (li.dataset.correct === '1') correct++;
      }
    });

    // 以「題目總數」計分（每題 5 分= 20題=100 分）
    const total = questions.length;
    const score = Math.round((correct / total) * 100);

    resultEl.style.display = 'block';
    scoreEl.textContent = `${score} / 100`;
    commentEl.textContent = scoreComment(score, 100);

    // 交卷後才能列印 / 顯示答案
    btnPrint.style.display  = 'inline-block';
    btnReveal.style.display = 'inline-block';
  };

  btnReveal.onclick = ()=>{
    $$('#quizList .q-solution').forEach(x=>{
      const sol = $('.sol', x);
      if (sol && !sol.textContent){
        // 補遺：若未作答過也顯示正解
        const li = x.closest('li');
        sol.textContent = li?.dataset?.answer || '';
      }
      x.style.display = 'block';
    });
  };

  btnPrint.onclick = ()=>{
    // 簡易列印：用現頁列印；若你已有自訂 A4 模板，可在 CSS @media print 補強
    window.print();
  };
}

// utils
function escapeHTML(s){return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}



<!-- 請把下面整段存成 player.js（覆蓋原檔） -->
<script>
/* =========================
   Config：Supabase 公桶
   ========================= */
const SUPA_URL   = 'https://YOUR-PROJECT-REF.supabase.co';   // ←換成你的
const SUPA_BUCKET= 'english-videos';                          // ←換成你的 bucket 名
// 公開物件網址前綴：{SUPA_URL}/storage/v1/object/public/{bucket}/path/to/file
const supaPublic = (path) => `${SUPA_URL}/storage/v1/object/public/${SUPA_BUCKET}/${path}`;

/* =========================
   讀取網址參數 slug
   ========================= */
const params = new URLSearchParams(location.search);
const slug   = params.get('slug') || 'mid-autumn'; // 預設可改

/* =========================
   DOM 參考（完全對齊你給的 HTML）
   ========================= */
const $ = (sel, root=document) => root.querySelector(sel);

const video           = $('#player');
const videoWrap       = $('#videoWrap');

const tabBtns         = [...document.querySelectorAll('.tab')];
const paneSub         = $('#pane-sub');
const paneQuiz        = $('#pane-quiz');
const paneVocab       = $('#pane-vocab');

const subToolbar      = $('#subToolbar');
const chkFollow       = $('#chkFollow');
const offsetValEl     = $('#offsetVal');
const btnOffsetMinus  = $('#btnOffsetMinus');
const btnOffsetPlus   = $('#btnOffsetPlus');
const cuesBody        = $('#cuesBody');
const cuesStatus      = $('#cuesStatus');

const quizStatus      = $('#quizStatus');
const quizBox         = $('#quizBox');

const vocabStatus     = $('#vocabStatus');
const vocabBox        = $('#vocabBox');

const btnPrev         = $('#btnPrev');
const btnPlay         = $('#btnPlay');
const btnNext         = $('#btnNext');
const btnReplay       = $('#btnReplay');
const btnAutoPause    = $('#btnAutoPause');
const btnLoopSentence = $('#btnLoopSentence');

const btnAB           = $('#btnAB');
const btnPointLoop    = $('#btnPointLoop');
const btnClearLoop    = $('#btnClearLoop');
const btnFill         = $('#btnFill');

const speedRange      = $('#speedRange');
const speedVal        = $('#speedVal');

/* =========================
   狀態
   ========================= */
let cues = [];                    // {time,en,zh}
let offsetSec = 0;                // 字幕偏移
let follow = true;                // 跟隨高亮
let autoPause = false;            // 逐句自動暫停
let highlightIndex = -1;          // 目前高亮索引
let abA = null, abB = null;       // A-B 循環
let pointLoopIndex = null;        // 點句即循環的句 index
let quizLoaded = false;
let vocabLoaded = false;

/* =========================
   公用：先試 Supabase，失敗退本地
   ========================= */
async function fetchWithFallback(publicPath, localPath, isJson=true) {
  // 先試 Supabase public
  try {
    const r = await fetch(supaPublic(publicPath), {cache:'no-store'});
    if (r.ok) return isJson ? r.json() : r.blob();
  } catch(e) {}
  // 再試本地
  const r2 = await fetch(localPath, {cache:'no-store'});
  if (!r2.ok) throw new Error(`讀取失敗：${localPath}`);
  return isJson ? r2.json() : r2.blob();
}

/* =========================
   載入影片
   ========================= */
async function loadVideo() {
  try {
    const blob = await fetchWithFallback(
      `videos/${slug}.mp4`,    // Supabase public path
      `./videos/${slug}.mp4`,  // fallback
      false                    // 影片拿 blob
    );
    const url = URL.createObjectURL(blob);
    video.src = url;
  } catch (err) {
    console.error(err);
    alert('影片載入失敗');
  }
}

/* =========================
   字幕：載入 / 渲染 / 同步
   ========================= */
async function loadCues() {
  cuesStatus.textContent = '載入字幕中…';
  try {
    const data = await fetchWithFallback(
      `data/cues-${slug}.json`,
      `./data/cues-${slug}.json`,
      true
    );
    cues = data || [];
    renderCues();
    cuesStatus.textContent = '';
  } catch(err) {
    cuesStatus.textContent = '讀取字幕失敗';
    console.error(err);
  }
}

function renderCues() {
  cuesBody.innerHTML = '';
  cues.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    tr.innerHTML = `
      <td class="muted">${c.time}</td>
      <td>${c.en || ''}</td>
      <td>${c.zh || ''}</td>
    `;
    tr.addEventListener('click', () => {
      seekToTimeStr(c.time);
      pointLoopIndex = idx; // 點句即循環：點一次就用該句
    });
    cuesBody.appendChild(tr);
  });
}

function timeStrToSec(ts) {
  // "mm:ss" or "hh:mm:ss"
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0]*60+parts[1];
  if (parts.length === 3) return parts[0]*3600+parts[1]*60+parts[2];
  return Number(ts) || 0;
}

function seekToTimeStr(ts) {
  const t = timeStrToSec(ts) + offsetSec;
  video.currentTime = Math.max(0, t);
  video.play();
}

// 高亮 + 跟隨
function updateHighlightByCurrentTime() {
  if (!cues.length) return;

  const t = video.currentTime - offsetSec;
  let idx = cues.findIndex((c, i) => {
    const cur  = timeStrToSec(c.time);
    const next = i + 1 < cues.length ? timeStrToSec(cues[i+1].time) : 1e9;
    return t >= cur && t < next;
  });

  if (idx !== -1 && idx !== highlightIndex) {
    highlightIndex = idx;
    // 清除
    [...cuesBody.children].forEach(tr => tr.classList.remove('active'));
    const tr = cuesBody.children[idx];
    if (tr) {
      tr.classList.add('active');
      if (follow) tr.scrollIntoView({block:'center', behavior:'smooth'});
    }
  }

  // 逐句自動暫停
  if (autoPause && highlightIndex !== -1) {
    const lineStart = timeStrToSec(cues[highlightIndex].time) + offsetSec;
    const nextStart = (highlightIndex+1 < cues.length)
      ? timeStrToSec(cues[highlightIndex+1].time) + offsetSec
      : Number.MAX_SAFE_INTEGER;
    if (video.currentTime >= nextStart) {
      video.pause();
    } else if (video.currentTime < lineStart) {
      // 若倒回前一句起點前，取消暫停
      //（保持原行為：不特別處理）
    }
  }

  // A-B 循環
  if (abA != null && abB != null) {
    if (video.currentTime >= abB) {
      video.currentTime = abA;
    }
  }

  // 點句即循環
  if (pointLoopIndex != null) {
    const s = timeStrToSec(cues[pointLoopIndex].time) + offsetSec;
    const e = (pointLoopIndex+1<cues.length)
      ? timeStrToSec(cues[pointLoopIndex+1].time)+offsetSec
      : s + 3;
    if (video.currentTime >= e) video.currentTime = s;
  }
}

/* =========================
   偏移/跟隨/變速
   ========================= */
function setOffset(v) {
  offsetSec += v;
  offsetValEl.textContent = `${offsetSec.toFixed(1)}s`;
}
btnOffsetMinus.addEventListener('click', () => setOffset(-0.5));
btnOffsetPlus.addEventListener('click', () => setOffset(+0.5));
chkFollow.addEventListener('change', () => follow = chkFollow.checked);

speedRange.addEventListener('input', () => {
  const s = Number(speedRange.value);
  video.playbackRate = s;
  speedVal.textContent = `${s.toFixed(2)}x`;
});

/* =========================
   左側控制列
   ========================= */
btnPlay.addEventListener('click', () => {
  if (video.paused) video.play(); else video.pause();
});

btnPrev.addEventListener('click', () => {
  if (!cues.length) return;
  const t = video.currentTime - offsetSec;
  let idx = highlightIndex > 0 ? highlightIndex - 1 : 0;
  const s = timeStrToSec(cues[idx].time) + offsetSec;
  video.currentTime = Math.max(0, s);
  video.play();
});
btnNext.addEventListener('click', () => {
  if (!cues.length) return;
  let idx = Math.min(highlightIndex + 1, cues.length - 1);
  const s = timeStrToSec(cues[idx].time) + offsetSec;
  video.currentTime = Math.max(0, s);
  video.play();
});
btnReplay.addEventListener('click', () => {
  if (!cues.length || highlightIndex < 0) return;
  const s = timeStrToSec(cues[highlightIndex].time) + offsetSec;
  video.currentTime = Math.max(0, s);
  video.play();
});
btnAutoPause.addEventListener('click', () => {
  autoPause = !autoPause;
  btnAutoPause.classList.toggle('green', autoPause);
});

btnLoopSentence.addEventListener('click', () => {
  if (!cues.length || highlightIndex < 0) return;
  const s = timeStrToSec(cues[highlightIndex].time) + offsetSec;
  const e = (highlightIndex+1<cues.length)
    ? timeStrToSec(cues[highlightIndex+1].time) + offsetSec
    : s + 3;
  abA = s; abB = e; pointLoopIndex = null;
  btnLoopSentence.classList.add('blue');
});
btnAB.addEventListener('click', () => {
  // 兩段按：第一次設 A，第二次設 B
  if (abA == null) {
    abA = video.currentTime;
    btnAB.textContent = '🅰 設 B';
  } else if (abB == null) {
    abB = video.currentTime;
    if (abB < abA) [abA,abB] = [abB,abA];
    btnAB.textContent = '🅰🅱 A-B 循環';
    pointLoopIndex = null;
  } else {
    // 已有 A-B -> 清除
    abA = abB = null;
    btnAB.textContent = '🅰🅱 A-B 循環';
  }
});
btnPointLoop.addEventListener('click', () => {
  // 以當前高亮那句進行循環
  if (!cues.length || highlightIndex < 0) return;
  pointLoopIndex = highlightIndex;
  abA = abB = null;
});
btnClearLoop.addEventListener('click', () => {
  abA = abB = null; pointLoopIndex = null;
  btnLoopSentence.classList.remove('blue');
});
btnFill.addEventListener('click', () => {
  videoWrap.classList.toggle('fill');
});

/* =========================
   影片事件：同步字幕
   ========================= */
video.addEventListener('timeupdate', updateHighlightByCurrentTime);

/* =========================
   頁籤切換
   ========================= */
tabBtns.forEach(b=>{
  b.addEventListener('click', ()=>{
    const t = b.dataset.tab;
    tabBtns.forEach(x=>x.classList.toggle('active',x===b));
    paneSub.style.display   = (t==='sub')  ? '' : 'none';
    paneQuiz.style.display  = (t==='quiz') ? '' : 'none';
    paneVocab.style.display = (t==='vocab')? '' : 'none';
    subToolbar.style.display= (t==='sub')  ? 'flex' : 'none';

    if (t==='quiz'  && !quizLoaded)  loadQuizOnce();
    if (t==='vocab' && !vocabLoaded) loadVocabOnce();
  });
});

/* =========================
   測驗（點選才顯示答案與說明、可交卷）
   ========================= */
let quizData = [];
let quizUserAns = []; // -1 未作答, 0..n 選項
function renderQuiz() {
  quizBox.innerHTML = '';
  quizUserAns = Array(quizData.length).fill(-1);

  quizData.forEach((q, qi)=>{
    const box = document.createElement('div');
    box.className = 'quizItem';
    box.style.padding='14px';
    box.style.borderBottom='1px solid #14243b';

    const title = document.createElement('div');
    title.innerHTML = `<b>Q${qi+1}.</b> ${q.q}`;
    title.style.marginBottom='8px';
    box.appendChild(title);

    // options
    q.a.forEach((opt, ai)=>{
      const id = `q${qi}_a${ai}`;
      const lab = document.createElement('label');
      lab.style.display='block';
      lab.style.cursor='pointer';
      lab.style.margin='6px 0';

      lab.innerHTML = `
        <input type="radio" name="q${qi}" id="${id}" style="transform:translateY(1px)" />
        <span style="margin-left:6px">${opt}</span>
      `;
      lab.addEventListener('change', ()=>{
        quizUserAns[qi] = ai;
        // 顯示答案與說明
        ansLine.style.display='block';
        if (ai === q.answerIndex) {
          ansLine.innerHTML = `✅ 正確！Ans: ${q.answerIndex+1}．${q.a[q.answerIndex]} <span class="muted">（${q.explain||'Good!'}）</span>`;
          ansLine.style.color = '#5bd3c7';
        } else {
          ansLine.innerHTML = `❌ 再試試。正解：${q.answerIndex+1}．${q.a[q.answerIndex]} <span class="muted">（${q.explain||''}）</span>`;
          ansLine.style.color = '#ff6b6b';
        }
      });

      box.appendChild(lab);
    });

    const ansLine = document.createElement('div');
    ansLine.className='muted';
    ansLine.style.marginTop='6px';
    ansLine.style.display='none';
    box.appendChild(ansLine);

    quizBox.appendChild(box);
  });

  // 交卷按鈕
  const submitRow = document.createElement('div');
  submitRow.style.padding='14px';
  submitRow.style.textAlign='right';

  const btnSubmit = document.createElement('button');
  btnSubmit.className='btn green';
  btnSubmit.textContent='交卷';
  btnSubmit.addEventListener('click', ()=>{
    let got = 0;
    quizData.forEach((q,i)=>{
      if (quizUserAns[i] === q.answerIndex) got++;
    });
    const total = quizData.length;
    const pct = Math.round(got/total*100);

    const sum = document.createElement('div');
    sum.style.marginTop='10px';
    sum.innerHTML = `
      <div><b>成績</b>：${got}/${total}（${pct}%）</div>
      <div class="muted" style="margin-top:4px">分享學習成果：<br>
        <code>我在 ${slug} 測驗拿到 ${got}/${total}（${pct}%）！</code>
      </div>
      <div style="margin-top:6px" class="muted">老師建議：${pct>=80?'很棒！可挑戰更快播放或加深詞彙':'先確保理解每題說明，再回影片複習重點句。'}</div>
    `;
    submitRow.appendChild(sum);
  });

  submitRow.appendChild(btnSubmit);
  quizBox.appendChild(submitRow);
}
async function loadQuizOnce() {
  quizStatus.textContent = '載入測驗中…';
  try {
    const data = await fetchWithFallback(
      `data/quiz-${slug}.json`,
      `./data/quiz-${slug}.json`,
      true
    );
    quizData = data || [];
    quizLoaded = true;
    renderQuiz();
    quizStatus.textContent = '';
  } catch(err) {
    quizStatus.textContent = '讀取測驗失敗';
    console.error(err);
  }
}

/* =========================
   單字（播放例句 / 朗讀）
   ========================= */
let vocabData = [];
function renderVocab() {
  vocabBox.innerHTML = '';
  if (!vocabData.length) return;

  const tbl = document.createElement('table');
  tbl.innerHTML = `
    <thead>
      <tr><th style="width:70px">時間</th><th>單字</th><th style="width:70px">詞性</th><th style="width:30%">中文</th><th>英文解釋/例句</th></tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = $('tbody', tbl);

  vocabData.forEach(v=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="muted">${v.time||''}</td>
      <td>
        <button class="btn" data-say="${(v.word||'').replace(/"/g,'&quot;')}">🔊</button>
        <b style="margin-left:6px">${v.word||''}</b>
      </td>
      <td>${v.pos||''}</td>
      <td>${v.zh||''}</td>
      <td>
        ${(v.en||'').replace(/\n/g,'<br>')}
        ${v.time?`<div style="margin-top:6px"><button class="btn" data-jump="${v.time}">▶ 播放例句</button></div>`:''}
      </td>
    `;
    tb.appendChild(tr);
  });

  // 綁定：朗讀 / 播放例句
  tbl.addEventListener('click', (e)=>{
    const say = e.target.closest('button[data-say]')?.dataset.say;
    if (say) {
      const u = new SpeechSynthesisUtterance(say);
      u.rate = 0.95; u.pitch = 1.0;
      speechSynthesis.speak(u);
      return;
    }
    const jt = e.target.closest('button[data-jump]')?.dataset.jump;
    if (jt) {
      seekToTimeStr(jt);
    }
  });

  vocabBox.appendChild(tbl);
}
async function loadVocabOnce() {
  vocabStatus.textContent = '載入單字中…';
  try {
    const data = await fetchWithFallback(
      `data/vocab-${slug}.json`,
      `./data/vocab-${slug}.json`,
      true
    );
    vocabData = data || [];
    vocabLoaded = true;
    renderVocab();
    vocabStatus.textContent = '';
  } catch(err) {
    vocabStatus.textContent = '讀取單字失敗';
    console.error(err);
  }
}

/* =========================
   啟動
   ========================= */
(async function init(){
  // 初始 UI
  speedRange.value = '1';
  video.playbackRate = 1;
  speedVal.textContent = '1.00x';

  // 載入影片 + 字幕
  await loadVideo();
  await loadCues();

  // 預設顯示「字幕」頁，工具列顯示
  subToolbar.style.display = 'flex';
})();
</script>











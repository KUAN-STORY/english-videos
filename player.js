/* =========================================================
 *  player.js  —  (Stories Player)
 *  功能：字幕 + 測驗 + 單字 + TTS朗讀 + 點時間/例句跳播
 *  資料結構：
 *   - data/cues-<slug>.json
 *   - data/quiz-<slug>.json
 *   - data/vocab-<slug>.json
 * ======================================================= */

/* -------------------- 基本工具 -------------------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getSlug() {
  const u = new URL(location.href);
  return u.searchParams.get('slug') || 'mid-autumn';
}
function secToClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${m}:${s}`;
}
function parseClockToSec(t='') {
  // "mm:ss" 或 純秒數
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return Number(t) || 0;
  return (+m[1])*60 + (+m[2]);
}
async function fetchJSON(url) {
  const r = await fetch(url, {cache:'no-store'});
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

/* -------------------- 永續儲存（每個 slug） -------------------- */
const store = {
  _key(ns){ return `stories::${getSlug()}::${ns}`; },
  get(ns, def){ try{ return JSON.parse(localStorage.getItem(this._key(ns))) ?? def }catch{ return def } },
  set(ns, val){ localStorage.setItem(this._key(ns), JSON.stringify(val)); }
};

/* -------------------- TTS 朗讀 -------------------- */
const TTS = {
  voices: [], inited:false,
  async init(){
    if (this.inited) return;
    const grab = () => new Promise(rs=>{
      let v = speechSynthesis.getVoices();
      if (v && v.length) return rs(v);
      speechSynthesis.onvoiceschanged = ()=> rs(speechSynthesis.getVoices());
      setTimeout(()=>rs(speechSynthesis.getVoices()), 400);
    });
    try { this.voices = await grab(); } catch { this.voices = []; }
    this.inited = true;
  },
  speak(text,{lang='en-US', rate=.95, pitch=1, hint=/Google|English/i}={}){
    try{
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voices.find(v=>hint.test(v.name)&&v.lang.startsWith('en')) ||
                this.voices.find(v=>v.lang.startsWith('en')) || null;
      if (v) u.voice = v;
      u.lang = v?.lang || lang;
      u.rate = rate; u.pitch=pitch;
      speechSynthesis.speak(u);
    }catch(e){ console.warn('TTS failed:',e); }
  },
  stop(){ try{ speechSynthesis.cancel(); }catch{} }
};

/* -------------------- 元件 DOM  -------------------- */
const video       = $('#video');
const cueBody     = $('#cueBody')    || document.createElement('tbody');
const cueSearch   = $('#cueSearch');
const offsetLabel = $('#offsetLabel');
const followBtn   = $('#btnFollow');

const tabSub      = $('#tabSub');
const tabQuiz     = $('#tabQuiz');
const tabVocab    = $('#tabVocab');

const quizPanel   = $('#quizPanel')  || ( ()=>{ const d=document.createElement('div'); d.id='quizPanel'; return d;} )();
const vocabTable  = $('#vocabTable') || ( ()=>{ const d=document.createElement('tbody'); d.id='vocabTable'; return d;} )();

/* -------------------- 全域狀態 -------------------- */
let CUES = [];            // [{t:秒, en, zh}]
let FOLLOW = store.get('follow', true);
let OFFSET = store.get('offset', 0); // 秒
let HILIGHT_INDEX = -1;

/* =========================================================
 *                         字幕
 * ======================================================= */
function setOffset(delta){
  OFFSET = +(OFFSET + delta).toFixed(2);
  store.set('offset', OFFSET);
  if (offsetLabel) offsetLabel.textContent = `偏移 ${OFFSET.toFixed(1)}s`;
}

function setFollow(val){
  FOLLOW = !!val;
  store.set('follow', FOLLOW);
  if (followBtn){
    followBtn.classList.toggle('active', FOLLOW);
    followBtn.textContent = FOLLOW ? '跟隨中' : '跟隨';
  }
}

function renderCues(list){
  if (!cueBody) return;
  cueBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach((c, i)=>{
    const tr = document.createElement('tr');
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td class="tcell"><button class="btn-time" data-seek="${c.t}">▶ ${secToClock(c.t)}</button></td>
      <td class="eng">${c.en || ''}</td>
      <td class="zh">${c.zh || ''}</td>
    `;
    frag.appendChild(tr);
  });
  cueBody.appendChild(frag);
}

function filterCuesByKeyword(){
  const kw = (cueSearch?.value || '').trim().toLowerCase();
  if (!kw) { renderCues(CUES); return; }
  const pick = CUES.filter(c =>
    (c.en||'').toLowerCase().includes(kw) || (c.zh||'').toLowerCase().includes(kw)
  );
  renderCues(pick);
}

/* 追蹤目前台詞 */
function tickFollow(){
  if (!FOLLOW || !video || !CUES.length) return;
  const ct = video.currentTime + OFFSET; // 套偏移
  let idx = CUES.findIndex((c, i)=> {
    const next = CUES[i+1]?.t ?? 1e9;
    return ct >= c.t && ct < next;
  });
  if (idx < 0) idx = CUES.length - 1;
  if (idx === HILIGHT_INDEX) return;
  HILIGHT_INDEX = idx;

  // 清除舊 highlight
  $$('#cueBody tr.highlight').forEach(tr=>tr.classList.remove('highlight'));

  // 高亮 + 捲動
  const row = $(`#cueBody tr[data-idx="${idx}"]`);
  if (row){
    row.classList.add('highlight');
    if (FOLLOW) row.scrollIntoView({block:'center'});
  }
}

/* =========================================================
 *                         測驗
 * ======================================================= */
function renderQuiz(questions){
  if (!quizPanel) return;
  quizPanel.innerHTML = '';

  if (!questions?.length){
    quizPanel.innerHTML = `<div class="muted">查無測驗資料（ quiz-${getSlug()}.json ）。</div>`;
    return;
  }

  const form = document.createElement('form');
  form.className = 'quiz-form';

  questions.forEach((q, qi)=>{
    const box = document.createElement('div');
    box.className = 'quiz-item';
    const name = `q_${qi}`;
    const opts = q.a.map((opt, oi)=>`
      <label class="opt">
        <input type="radio" name="${name}" value="${oi}">
        <span>${String.fromCharCode(65+oi)}. ${opt}</span>
      </label>
    `).join('');
    box.innerHTML = `
      <div class="q">${qi+1}. ${q.q}</div>
      <div class="opts">${opts}</div>
      <div class="explain" hidden></div>
    `;
    form.appendChild(box);
  });

  const ctrl = document.createElement('div');
  ctrl.className = 'quiz-ctrl';
  ctrl.innerHTML = `<button class="btn-check" type="submit">交卷</button>
                    <span class="quiz-score"></span>`;
  form.appendChild(ctrl);

  form.addEventListener('submit', e=>{
    e.preventDefault();
    let correct = 0;
    const items = $$('.quiz-item', form);
    items.forEach((box, qi)=>{
      const sel = box.querySelector(`input[name="q_${qi}"]:checked`);
      const ans = questions[qi].answerIndex;
      const ex  = questions[qi].explain || '';
      const expEl = $('.explain', box);

      if (!sel){
        box.classList.remove('right','wrong');
        expEl.hidden = false;
        expEl.textContent = `※ 未作答。答案：${String.fromCharCode(65+ans)}；${ex}`;
        return;
      }
      if (+sel.value === ans){
        correct++;
        box.classList.add('right'); box.classList.remove('wrong');
        expEl.hidden = false; expEl.textContent = `✔ 正確！${ex}`;
      }else{
        box.classList.add('wrong'); box.classList.remove('right');
        expEl.hidden = false; expEl.textContent = `✘ 錯誤。答案：${String.fromCharCode(65+ans)}；${ex}`;
      }
    });

    $('.quiz-score', form).textContent = `得分：${correct} / ${questions.length}`;
    // 紀錄
    store.set('quizScore', {ts:Date.now(), score:correct, total:questions.length});
  });

  quizPanel.appendChild(form);
}

/* =========================================================
 *                         單字
 * ======================================================= */
async function renderVocab(vocabItems = []){
  await TTS.init();

  if (!vocabTable){
    console.warn('vocabTable missing');
    return;
  }
  // 建表頭（若你的 HTML 已有固定表頭，可移除下面這段）
  if (vocabTable.tagName === 'TBODY'){
    const thead = vocabTable.parentElement?.querySelector('thead');
    if (!thead){
      const t = document.createElement('thead');
      t.innerHTML = `
        <tr>
          <th style="width:90px">時間</th>
          <th>單字</th>
          <th style="width:80px">詞性</th>
          <th style="width:120px">中文</th>
          <th>英文解釋 / 例句（點我跳播）</th>
        </tr>`;
      vocabTable.parentElement?.insertBefore(t, vocabTable);
    }
  }

  vocabTable.innerHTML = '';
  const frag = document.createDocumentFragment();

  vocabItems.forEach((v,i)=>{
    const sec = Number.isFinite(v.time) ? v.time : parseClockToSec(v.time);
    const clock = Number.isFinite(sec) ? secToClock(sec) : '';
    const safeExample = (v.example || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const exHtml = safeExample.replace(/_{2,}/g, '<span class="blank">_______</span>');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${clock ? `<button class="btn-time" data-seek="${sec}">▶ ${clock}</button>` : ''}</td>
      <td><button class="btn-say" data-say="${v.word || ''}" title="朗讀">🔊</button>
          <span class="word">${v.word || ''}</span></td>
      <td>${v.pos || ''}</td>
      <td>${v.zh || ''}</td>
      <td><button class="btn-ex" ${Number.isFinite(sec)?`data-seek="${sec}"`:''} title="播放例句">▶</button>
          <span class="example" ${Number.isFinite(sec)?`data-seek="${sec}"`:''}>${exHtml}</span></td>
    `;
    frag.appendChild(tr);
  });

  vocabTable.appendChild(frag);

  vocabTable.addEventListener('click', e=>{
    const sayBtn = e.target.closest('.btn-say');
    if (sayBtn){
      TTS.speak(sayBtn.dataset.say || '');
      return;
    }
    const seekEl = e.target.closest('[data-seek]');
    if (seekEl && video){
      const s = Number(seekEl.dataset.seek);
      if (Number.isFinite(s)){
        video.currentTime = Math.max(0, s - .2);
        video.play?.();
      }
    }
  });
}

/* =========================================================
 *                         載入流程
 * ======================================================= */
async function boot(){
  const slug = getSlug();

  // 初始化偏移/跟隨 標示
  if (offsetLabel) offsetLabel.textContent = `偏移 ${OFFSET.toFixed(1)}s`;
  setFollow(FOLLOW);

  // 綁定 偏移/跟隨/搜尋
  $$('[data-shift]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const delta = parseFloat(btn.dataset.shift);
      if (!Number.isFinite(delta)) return;
      setOffset(delta);
    });
  });
  followBtn?.addEventListener('click', ()=> setFollow(!FOLLOW));
  cueSearch?.addEventListener('input', filterCuesByKeyword);

  // 點時間跳播
  cueBody?.addEventListener('click', e=>{
    const target = e.target.closest('[data-seek]');
    if (!target || !video) return;
    const s = Number(target.dataset.seek);
    if (!Number.isFinite(s)) return;
    video.currentTime = Math.max(0, s - .2);
    video.play?.();
  });

  // 切分頁（若你的 HTML 沒有這些 id，也不影響運作）
  tabSub?.addEventListener('click', ()=> document.body.setAttribute('data-tab', 'sub'));
  tabQuiz?.addEventListener('click', ()=> document.body.setAttribute('data-tab', 'quiz'));
  tabVocab?.addEventListener('click',()=> document.body.setAttribute('data-tab', 'vocab'));

  // 讀資料
  try{
    // 1) 字幕
    const cues = await fetchJSON(`data/cues-${slug}.json`);
    // 正規化（允許 key: time/en/zh 或 t/en/zh）
    CUES = cues.map(c=>{
      const t = Number.isFinite(c.t) ? c.t :
                Number.isFinite(c.time) ? c.time :
                parseClockToSec(c.time || c.t || 0);
      return { t, en:c.en || c.english || '', zh:c.zh || c.ch || c.cn || c.chinese || '' };
    }).sort((a,b)=> a.t - b.t);

    if (CUES.length) renderCues(CUES);
    else cueBody.innerHTML = `<tr><td colspan="3" class="muted">查無字幕資料。</td></tr>`;
  }catch(e){
    console.warn('cues load fail:', e);
    cueBody.innerHTML = `<tr><td colspan="3" class="muted">載入字幕失敗（data/cues-${getSlug()}.json）。</td></tr>`;
  }

  try{
    // 2) 測驗
    const quiz = await fetchJSON(`data/quiz-${slug}.json`);
    renderQuiz(quiz);
  }catch(e){
    renderQuiz([]);
  }

  try{
    // 3) 單字
    const vocab = await fetchJSON(`data/vocab-${slug}.json`);
    renderVocab(vocab);
  }catch(e){
    renderVocab([]);
  }

  // 跟隨高亮：timeupdate
  video?.addEventListener('timeupdate', tickFollow);
}

/* =========================================================
 *                         啟動
 * ======================================================= */
document.addEventListener('DOMContentLoaded', boot);

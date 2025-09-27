/* ---------------------------------------------
   english-videos / player.js  v5  (2025-09-27)
   - 讀 ./data/cues-<slug>.json / quiz-<slug>.json / vocab-<slug>.json
   - 字幕表（三欄：時間/英文/中文），點列跳播、播放時高亮+跟隨
   - 偏移校準：-0.5s / +0.5s；點「偏移 / 0.0s」歸零；支援全形負號/空白
   - 左側工具列：上一句/下一句/重複本句/逐句自動暫停/A-B/取消循環/速度/填滿畫面
   - 速度滑桿即時生效；設定與偏移/跟隨皆存 localStorage
------------------------------------------------ */

/* ===== 小工具 ===== */
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const urlOf = rel => new URL(rel, location.href).href;
const qs = new URLSearchParams(location.search);
const slug = qs.get('slug') || 'mid-autumn';
const fmtTime = s => {
  s = Math.max(0, s|0);
  const m = (s/60|0).toString().padStart(2,'0');
  const ss = (s%60|0).toString().padStart(2,'0');
  return `${m}:${ss}`;
};
const mmssToSec = t => {
  if (typeof t === 'number') return t;
  if (!t) return 0;
  const a = t.split(':').map(Number);
  return (a.length===2)? a[0]*60+a[1] : (a.length===3? a[0]*3600+a[1]*60+a[2] : 0);
};
const fetchJSON = async (u) => {
  const r = await fetch(u, {cache:'no-store'}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json();
};
const byText = (texts, root=document, selector='*')=>{
  if(!Array.isArray(texts)) texts=[texts];
  return $$(selector, root).find(n=> {
    const t=(n.textContent||n.value||'').trim();
    return texts.some(x=> t===x || t.includes(x));
  }) || null;
};
/* 文字正規化（給偏移按鈕用） */
const norm = s=>(s||'')
  .replace(/\u2212|\uFF0D/g,'-') /* −,－ -> - */
  .replace(/\s+/g,'')            /* 去空白 */
  .replace(/S/g,'s')             /* S -> s */
  .trim();

/* ===== 狀態 ===== */
const LS = { speed:'ev_speed', offset:'ev_offset', follow:'ev_follow' };
let video = $('#player') || $('video');
if (video && !video.src) video.src = urlOf(`./videos/${slug}.mp4`);

let speed  = parseFloat(localStorage.getItem(LS.speed)  || '1');
let offset = parseFloat(localStorage.getItem(LS.offset) || '0'); // + => 字幕晚一點
let follow = localStorage.getItem(LS.follow) !== '0';

if (video) video.playbackRate = Math.min(2, Math.max(0.5, speed));

let cues = [];       // [{start,end,en,zh,time}]
let active = -1;
let perPause = false;
let loopThis = false;
let A=null,B=null;
let fillMode=false;

/* ===== 動態樣式（高亮/影片填滿） ===== */
(function injectCSS(){
  const css = `
    #cues-table{width:100%;border-collapse:collapse;table-layout:fixed}
    #cues-table th,#cues-table td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06)}
    #cues-table tbody tr.on td{background:rgba(86,167,255,.18)}
    #cues-table tbody tr:hover td{background:rgba(255,255,255,.06)}
    .video-box{position:relative;width:100%;height:100%}
    .video-box video{width:100%;height:100%;object-fit:contain}
    .video-box.fill video{object-fit:cover}
  `;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
})();

/* 取得/建立右側字幕容器 */
function ensureCuesPane(){
  let pane = $('#cues-pane');
  if (!pane){
    pane = document.createElement('div');
    pane.id='cues-pane'; pane.style.padding='12px 0';
    const right = $('.pane-right') || $('.side') || $('#subPanel') || $('main') || document.body;
    right.appendChild(pane);
  }
  return pane;
}
const pane = ensureCuesPane();

/* 建立字幕表 */
let table = $('#cues-table');
if(!table){
  table = document.createElement('table'); table.id='cues-table';
  table.innerHTML = `
    <thead><tr>
      <th style="width:80px">時間</th><th>英文</th><th>中文</th>
    </tr></thead><tbody id="cues-tbody"></tbody>`;
  pane.appendChild(table);
}
const tbody = $('#cues-tbody', table);

/* ===== 載入字幕 ===== */
async function loadCues(){
  try{
    const raw = await fetchJSON(urlOf(`./data/cues-${slug}.json`));
    cues = raw.map((r,i)=>{
      const start = ('start' in r)? Number(r.start) : mmssToSec(r.time);
      const end   = ('end'   in r)? Number(r.end)   : mmssToSec(raw[i+1]?.time ?? (start+4.9));
      return { start, end: Math.max(end, start+0.01), en:r.en||'', zh:r.zh||'', time:r.time||fmtTime(start) };
    });
    cues.sort((a,b)=>a.start-b.start);
    renderCues();
  }catch(err){
    console.error('[player] 載入字幕失敗', err);
    tbody.innerHTML = `<tr><td colspan="3" style="color:#f88;padding:12px">查無字幕（./data/cues-${slug}.json）</td></tr>`;
  }
}
function renderCues(){
  tbody.innerHTML = cues.map((c,i)=>`
    <tr data-idx="${i}">
      <td class="tc" style="color:#9aa">${fmtTime(c.start)}</td>
      <td class="en">${c.en||''}</td>
      <td class="zh" style="color:#bcd">${c.zh||''}</td>
    </tr>
  `).join('');
}

/* 點列跳播 */
tbody.addEventListener('click', e=>{
  const tr = e.target.closest('tr[data-idx]'); if(!tr||!video) return;
  const i = +tr.dataset.idx;
  video.currentTime = Math.max(0, cues[i].start + offset);
  video.play();
});

/* 高亮 + 跟隨 */
function setActive(i, scroll=true){
  if(i===active) return; active=i;
  $$('#cues-tbody tr.on', table).forEach(tr=> tr.classList.remove('on'));
  const tr = $(`#cues-tbody tr[data-idx="${i}"]`, table);
  if(tr){
    tr.classList.add('on');
    if (follow && scroll) tr.scrollIntoView({block:'center', behavior:'smooth'});
  }
}

/* 依時間更新高亮 */
function updateByTime(nowVideo){
  const t = nowVideo - offset; // 正偏移＝字幕晚 -> 比對時要減掉
  // 二分
  let L=0,R=cues.length-1,ans=-1;
  while(L<=R){
    const m=(L+R)>>1, c=cues[m];
    if (t>=c.start && t<c.end){ ans=m; break; }
    if (t<c.start) R=m-1; else L=m+1;
  }
  if(ans!==-1) setActive(ans);
}

/* ===== 速度滑桿 ===== */
(function bindSpeed(){
  if(!video) return;
  // 優先找「速度」區塊內的 range；找不到就抓第一個 range
  let speedRange = byText('速度', document, '*')?.parentElement?.querySelector('input[type=range]') || $('input[type=range]');
  let speedText  = $('#speedText') || $('#speedVal') || null;

  const apply = v=>{
    const sp = Math.min(2, Math.max(0.5, parseFloat(v)||1));
    video.playbackRate = sp; localStorage.setItem(LS.speed, String(sp));
    if (speedRange) speedRange.value = sp;
    if (speedText) speedText.textContent = `${sp.toFixed(2)}x`;
  };
  if (speedRange){
    if(!speedRange.min)  speedRange.min='0.5';
    if(!speedRange.max)  speedRange.max='2';
    if(!speedRange.step) speedRange.step='0.05';
    apply(speedRange.value || video.playbackRate || 1);
    speedRange.addEventListener('input', e=> apply(e.target.value));
  }else{
    apply(video.playbackRate||1);
  }
})();

/* ===== 跟隨 / 偏移（事件委派＋正規化） ===== */
(function bindFollowOffset(){
  // 跟隨按鈕（顯示狀態）
  const followBtn = byText(['跟隨','跟著'], document, 'button,a,[role=button],.btn,.chip,*');
  if (followBtn) {
    if (follow) followBtn.classList.add('on'); else followBtn.classList.remove('on');
    followBtn.addEventListener('click', ()=>{
      follow = !follow; localStorage.setItem(LS.follow, follow?'1':'0');
      followBtn.classList.toggle('on', follow);
      const act = $('#cues-tbody tr.on'); if (follow && act) act.scrollIntoView({block:'center',behavior:'smooth'});
    });
  }

  // 偏移數字顯示 chip（例如 0.0s / 0s）
  let offsetChip = byText('0.0s', document, '*') || byText('0s', document, '*') || null;
  const refreshChip = ()=> { if (offsetChip) offsetChip.textContent = `${offset.toFixed(1)}s`; };
  refreshChip();

  // 全頁事件委派（任何按鈕/Chip/Span 皆可）
  document.addEventListener('click', e=>{
    const el = e.target.closest('button,a,[role=button],.btn,.chip,span,div'); if(!el) return;
    const t = norm(el.textContent || el.value || '');
    // 偏移 -0.5 / +0.5
    if (t==='-0.5s' || t==='-0.5') { offset-=0.5; localStorage.setItem(LS.offset,offset); refreshChip(); e.preventDefault(); return; }
    if (t==='+0.5s' || t==='+0.5') { offset+=0.5; localStorage.setItem(LS.offset,offset); refreshChip(); e.preventDefault(); return; }
    // 點「偏移 / 0.0s / 0s」歸零
    if (t==='偏移' || /^0(\.0)?s?$/.test(t)) { offset=0; localStorage.setItem(LS.offset,offset); refreshChip(); e.preventDefault(); return; }
  });

  // 鍵盤快鍵： [ 減 0.1s、 ] 加 0.1s
  document.addEventListener('keydown', e=>{
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key==='['){ offset-=0.1; localStorage.setItem(LS.offset,offset); refreshChip(); }
    if (e.key===']'){ offset+=0.1; localStorage.setItem(LS.offset,offset); refreshChip(); }
  });
})();

/* ===== 左側工具列（文字匹配） ===== */
(function bindLeftToolbar(){
  document.addEventListener('click', e=>{
    const btn = e.target.closest('button,a,[role=button],.btn,.chip'); if(!btn||!video) return;
    const t = (btn.textContent || btn.value || btn.title || '').trim();

    // 播放/暫停
    if (/播放|暫停/.test(t)) { video.paused?video.play():video.pause(); return; }

    // 上一句
    if (/^上一句$|^上句$/.test(t)){
      const t0 = video.currentTime - offset;
      let i = cues.findIndex(r=> t0 > r.start) - 1;
      if (i<0) i=0;
      video.currentTime = Math.max(0, cues[i].start + offset);
      video.play(); return;
    }
    // 下一句
    if (/^下一句$|^下句$/.test(t)){
      const t0 = video.currentTime - offset;
      let i = cues.findIndex(r=> t0 < r.end);
      if (i===-1) i=cues.length-1;
      video.currentTime = Math.max(0, cues[i].start + offset);
      video.play(); return;
    }
    // 重複本句 -> 以當前句建 A-B
    if (/重複本句/.test(t)){
      const t0 = video.currentTime - offset;
      const i = cues.findIndex(r=> t0>=r.start && t0<r.end);
      if (i!==-1){
        A = cues[i].start; B = cues[i].end;
        video.currentTime = A + offset; video.play();
      }
      return;
    }
    // 逐句自動暫停
    if (/逐句自動暫停/.test(t)){ perPause=!perPause; btn.classList.toggle('on', perPause); return; }
    // A-B 循環（按 1 次設 A、再按設 B、第三次清除）
    if (/A-?B/.test(t)){
      const t0 = video.currentTime - offset;
      if (A==null){ A=t0; btn.classList.add('on'); }
      else if (B==null){ B=Math.max(t0, A+0.2); }
      else { A=B=null; btn.classList.remove('on'); }
      return;
    }
    // 取消循環
    if (/取消循環/.test(t)){ A=B=null; return; }
    // 填滿畫面
    if (/填滿畫面|填滿|滿版|全滿/.test(t)){ toggleFill(); return; }
  });
})();

/* ===== 影片填滿切換 ===== */
(function ensureVideoBox(){
  let box = $('.video-box');
  if (!box && video && video.parentElement){
    video.parentElement.classList.add('video-box');
  }
})();
function toggleFill(){
  const box = $('.video-box'); if(!box) return;
  fillMode = !fillMode; box.classList.toggle('fill', fillMode);
}

/* ===== 影片時間驅動 ===== */
if (video){
  video.addEventListener('timeupdate', ()=>{
    const t = video.currentTime; // 真實影片時間
    // A-B 循環
    if (A!=null && B!=null){
      const base = t - offset;
      if (base < A || base >= B) { video.currentTime = A + offset; return; }
    }
    // 高亮
    updateByTime(t);
    // 逐句自動暫停
    if (perPause && active!==-1){
      const c = cues[active];
      if (t - offset >= c.end - 0.02) video.pause();
    }
  });
}

/* ===== 測驗 / 單字（載入到預留容器，若無則顯示提示） ===== */
async function loadQuiz(){
  const box = $('#quizBody') || $('#quiz-content'); if(!box) return;
  try{
    const arr = await fetchJSON(urlOf(`./data/quiz-${slug}.json`));
    const frag = document.createDocumentFragment();
    arr.forEach((q,i)=>{
      const el=document.createElement('div'); el.className='quiz-item';
      el.innerHTML = `
        <div class="q">${i+1}. ${q.q}</div>
        <div class="opts">
          ${q.a.map((t,idx)=>`
            <label class="opt"><input type="radio" name="q${i}" value="${idx}">
            <span>${String.fromCharCode(65+idx)}. ${t}</span></label>`).join('')}
        </div>
        <div class="exp" style="display:none;color:#8dd">
          ✔ 正解：${String.fromCharCode(65+q.answerIndex)}　${q.explain||''}
        </div><hr/>`;
      el.querySelectorAll('input[type=radio]').forEach(r=>{
        r.addEventListener('change',()=> el.querySelector('.exp').style.display='block');
      });
      frag.appendChild(el);
    });
    box.innerHTML=''; box.appendChild(frag);
  }catch{
    box.innerHTML = `<div style="color:#888">查無測驗資料（quiz-${slug}.json）。</div>`;
  }
}
async function loadVocab(){
  const box = $('#vocabBody') || $('#vocab-content'); if(!box) return;
  try{
    const arr = await fetchJSON(urlOf(`./data/vocab-${slug}.json`));
    const table=document.createElement('table');
    table.className='vocab-table';
    table.innerHTML=`<thead><tr><th>時間</th><th>單字</th><th>詞性</th><th>中文</th><th>英文解釋 / 例句</th></tr></thead><tbody></tbody>`;
    const tb=table.tBodies[0];
    arr.forEach(v=>{
      const s = mmssToSec(v.time||0);
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td class="tc"><button class="btn-jump" data-sec="${s}">${fmtTime(s)}</button></td>
        <td>${v.word||''}</td><td>${v.pos||''}</td><td>${v.zh||''}</td>
        <td>${v.def||''}${v.ex?`<div class="ex">${v.ex}</div>`:''}</td>`;
      tb.appendChild(tr);
    });
    table.addEventListener('click',e=>{
      const b=e.target.closest('.btn-jump'); if(b&&video){ video.currentTime=parseFloat(b.dataset.sec||'0')+offset; video.play(); }
    });
    box.innerHTML=''; box.appendChild(table);
  }catch{
    box.innerHTML = `<div style="color:#888">查無單字資料（vocab-${slug}.json）。</div>`;
  }
}

/* ===== 啟動 ===== */
(async function boot(){
  await loadCues();
  loadQuiz();
  loadVocab();
})();



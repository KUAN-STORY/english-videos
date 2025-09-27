/* ---------- english-videos / player.js  (hotfix 2025-09-27) ---------- */
(() => {
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const byText = (tag, keywords=[]) =>
    Array.from(document.getElementsByTagName(tag))
      .find(el => keywords.some(k => el.textContent.trim().includes(k)));

  const slug = (() => {
    const p = new URLSearchParams(location.search);
    return (p.get('slug') || 'mid-autumn').trim();
  })();

  const urlOf = rel => new URL(rel, location.href).href;

  /* ---------- DOM (容錯選取) ---------- */
  const video        = $('#player') || $('video');
  const cuesBody     = $('#cuesBody')
                    || $('#cues tbody')
                    || document.querySelector('[data-role="cues"] tbody')
                    || document.querySelector('tbody#subtitles')
                    || null;

  const followToggle = $('#followToggle') || $('#follow') || null;

  const offsetText   = $('#offsetText') || $('#offset') || null;
  const btnMinus     = $('#offsetMinus') || byText('button', ['-0.5s','-0.5','偏移 -0.5']);
  const btnPlus      = $('#offsetPlus')  || byText('button', ['+0.5s','+0.5','偏移 +0.5']);

  const speedRange   = $('#speedRange')  || byText('input', ['速度']) || null;
  const speedText    = $('#speedText')   || $('#speedVal') || null;

  const quizBody     = $('#quizBody')  || $('#quiz-content')  || null;
  const vocabBody    = $('#vocabBody') || $('#vocab-content') || null;

  /* 左下功能列（沒有 id 就用文字匹配） */
  const btnPrev      = $('#btnPrev')      || byText('button', ['上一句']);
  const btnNext      = $('#btnNext')      || byText('button', ['下一句']);
  const btnReplay    = $('#btnReplay')    || byText('button', ['重複本句']);
  const btnInstLoop  = $('#btnInstLoop')  || byText('button', ['點句即循環']);
  const btnCancelLp  = $('#btnCancelLoop')|| byText('button', ['取消循環']);
  const btnAB        = $('#btnAB')        || byText('button', ['A-B 循環','A-B 循環']);

  /* ---------- 小工具 ---------- */
  const fmtTime = s => {
    s = Math.max(0, s|0);
    const m = (s/60|0).toString().padStart(2,'0');
    const ss = (s%60|0).toString().padStart(2,'0');
    return `${m}:${ss}`;
  };
  const hhmmssToSec = t => {
    if (typeof t === 'number') return t;
    if (!t) return 0;
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    const a = t.split(':').map(Number);
    if (a.length === 2) return a[0]*60 + a[1];
    if (a.length === 3) return a[0]*3600 + a[1]*60 + a[2];
    return 0;
  };
  const fetchJSON = async (u) => {
    const r = await fetch(u, {cache:'no-store'});
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  };

  /* ---------- 儲存設定 ---------- */
  const LS = { speed:'ev_speed', offset:'ev_offset', follow:'ev_follow' };

  let speed = parseFloat(localStorage.getItem(LS.speed) || '1');
  let offsetSec = parseFloat(localStorage.getItem(LS.offset) || '0');
  let follow = localStorage.getItem(LS.follow) !== '0'; // 預設 true

  if (video) {
    video.playbackRate = Math.min(2, Math.max(0.5, speed));
    if (!video.src) video.src = urlOf(`./videos/${slug}.mp4`);
  }
  if (speedRange) {
    speedRange.value = video ? video.playbackRate : speed;
  }
  if (speedText) speedText.textContent = `${(video ? video.playbackRate : speed).toFixed(2)}x`;
  const renderOffset = () => offsetText && (offsetText.textContent = `${offsetSec.toFixed(1)}s`);
  renderOffset();
  if (followToggle) followToggle.checked = follow;

  /* ---------- 字幕資料 ---------- */
  let cues = [];          // [{start,end,en,zh}]
  let activeIdx = -1;     // 目前高亮 index
  let loopThisLine = false;
  let abA = null, abB = null;

  const setActive = (idx) => {
    if (!cuesBody) return;
    if (activeIdx === idx) return;
    activeIdx = idx;
    cuesBody.querySelectorAll('.active').forEach(el=>el.classList.remove('active'));
    const tr = cuesBody.children[idx];
    if (tr) {
      tr.classList.add('active');
      if (follow && followToggle?.checked !== false) {
        tr.scrollIntoView({block:'center', behavior:'smooth'});
      }
    }
  };

  const jumpToIdx = (idx, play=true) => {
    if (!video || idx < 0 || idx >= cues.length) return;
    video.currentTime = cues[idx].start;
    if (play) video.play();
  };

  const updateActiveByTime = (t) => {
    if (!cues.length || !cuesBody) return;
    // 二分
    let L=0,R=cues.length-1,ans=-1;
    while(L<=R){
      const m=(L+R)>>1;
      if (t>=cues[m].start && t<cues[m].end){ ans=m; break; }
      if (t<cues[m].start) R=m-1; else L=m+1;
    }
    if (ans !== -1) setActive(ans);
  };

  const renderCues = () => {
    if (!cuesBody) return;
    cuesBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    cues.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.dataset.start = c.start;
      tr.dataset.end   = c.end;
      tr.innerHTML = `
        <td class="tc">${fmtTime(c.start)}</td>
        <td class="en">${c.en||''}</td>
        <td class="zh">${c.zh||''}</td>`;
      tr.addEventListener('click', ()=> jumpToIdx(i, true));
      frag.appendChild(tr);
    });
    cuesBody.appendChild(frag);
  };

  async function loadCues() {
    try {
      const url = urlOf(`./data/cues-${slug}.json`);
      const raw = await fetchJSON(url);
      const list = [];
      raw.forEach((r, i) => {
        const s = ('start' in r) ? Number(r.start) : hhmmssToSec(r.time);
        const e = ('end'   in r) ? Number(r.end)   :
                  hhmmssToSec(raw[i+1]?.time ?? (s + 4.9));
        list.push({start:s, end:Math.max(e, s+0.01), en:r.en||'', zh:r.zh||''});
      });
      list.sort((a,b)=>a.start-b.start);
      cues = list;
      renderCues();
    } catch (err) {
      console.error('[player] 載入字幕失敗', err);
      if (cuesBody) {
        cuesBody.innerHTML =
          `<tr><td colspan="3" style="color:#f88">查無字幕資料（./data/cues-${slug}.json）</td></tr>`;
      }
    }
  }

  async function loadQuiz() {
    if (!quizBody) return;
    try {
      const arr = await fetchJSON(urlOf(`./data/quiz-${slug}.json`));
      const frag = document.createDocumentFragment();
      arr.forEach((q,i)=>{
        const el = document.createElement('div');
        el.className='quiz-item';
        el.innerHTML = `
          <div class="q">${i+1}. ${q.q}</div>
          <div class="opts">
            ${q.a.map((t,idx)=>`
              <label class="opt">
                <input type="radio" name="q${i}" value="${idx}">
                <span>${String.fromCharCode(65+idx)}. ${t}</span>
              </label>`).join('')}
          </div>
          <div class="exp" style="display:none;color:#8dd">
            ✔ 正解：${String.fromCharCode(65+q.answerIndex)}　${q.explain||''}
          </div><hr/>`;
        el.querySelectorAll('input[type=radio]').forEach(r=>{
          r.addEventListener('change',()=> el.querySelector('.exp').style.display='block');
        });
        frag.appendChild(el);
      });
      quizBody.innerHTML='';
      quizBody.appendChild(frag);
    } catch {
      quizBody.innerHTML = `<div style="color:#888">查無測驗資料（quiz-${slug}.json）。</div>`;
    }
  }

  async function loadVocab() {
    if (!vocabBody) return;
    try {
      const arr = await fetchJSON(urlOf(`./data/vocab-${slug}.json`));
      const table=document.createElement('table');
      table.className='vocab-table';
      table.innerHTML = `
        <thead><tr><th>時間</th><th>單字</th><th>詞性</th><th>中文</th><th>英文解釋 / 例句</th></tr></thead>
        <tbody></tbody>`;
      const tbody = table.querySelector('tbody');
      arr.forEach(v=>{
        const s = hhmmssToSec(v.time||0);
        const tr=document.createElement('tr');
        tr.innerHTML = `
          <td class="tc"><button class="btn-jump" data-sec="${s}">${fmtTime(s)}</button></td>
          <td>${v.word||''}</td><td>${v.pos||''}</td><td>${v.zh||''}</td>
          <td>${v.def||''}${v.ex?`<div class="ex">${v.ex}</div>`:''}</td>`;
        tbody.appendChild(tr);
      });
      table.addEventListener('click',e=>{
        const btn=e.target.closest('.btn-jump'); if(btn&&video){
          video.currentTime=parseFloat(btn.dataset.sec||'0'); video.play();
        }
      });
      vocabBody.innerHTML=''; vocabBody.appendChild(table);
    } catch {
      vocabBody.innerHTML = `<div style="color:#888">查無單字資料（vocab-${slug}.json）。</div>`;
    }
  }

  /* ---------- 速度 / 偏移 / 跟隨 綁定 ---------- */
  if (speedRange && speedText && video) {
    const apply = v => {
      const sp = Math.min(2, Math.max(0.5, parseFloat(v)));
      video.playbackRate = sp;
      speedRange.value = sp;
      speedText.textContent = `${sp.toFixed(2)}x`;
      localStorage.setItem(LS.speed, String(sp));
    };
    apply(video.playbackRate);
    speedRange.addEventListener('input', ()=> apply(speedRange.value));
    video.addEventListener('ratechange', ()=>{
      speedText.textContent = `${video.playbackRate.toFixed(2)}x`;
      if (speedRange.value !== String(video.playbackRate))
        speedRange.value = video.playbackRate;
    });
  }

  const setOffset = v => {
    offsetSec = Math.max(-5, Math.min(5, v));
    localStorage.setItem(LS.offset, String(offsetSec));
    renderOffset();
    if (video) updateActiveByTime(video.currentTime + offsetSec);
  };
  btnMinus && btnMinus.addEventListener('click', ()=> setOffset(offsetSec-0.5));
  btnPlus  && btnPlus .addEventListener('click', ()=> setOffset(offsetSec+0.5));
  followToggle && followToggle.addEventListener('change', ()=>{
    follow = !!followToggle.checked;
    localStorage.setItem(LS.follow, follow ? '1':'0');
    const act = cuesBody?.querySelector('.active');
    if (act && follow) act.scrollIntoView({block:'center',behavior:'smooth'});
  });

  /* ---------- 左下控制列：上一句 / 下一句 / 重複本句 / 點句即循環 / 取消循環 / A-B ---------- */
  btnPrev && btnPrev.addEventListener('click', ()=>{
    if (activeIdx === -1) return jumpToIdx(0, true);
    jumpToIdx(Math.max(0, activeIdx-1), true);
  });
  btnNext && btnNext.addEventListener('click', ()=>{
    if (activeIdx === -1) return jumpToIdx(0, true);
    jumpToIdx(Math.min(cues.length-1, activeIdx+1), true);
  });
  btnReplay && btnReplay.addEventListener('click', ()=>{
    if (activeIdx === -1) return;
    jumpToIdx(activeIdx, true);
  });
  btnInstLoop && btnInstLoop.addEventListener('click', ()=>{
    loopThisLine = !loopThisLine;
    if (!loopThisLine) return;
    // 播放當前列
    if (activeIdx !== -1) jumpToIdx(activeIdx, true);
  });
  btnCancelLp && btnCancelLp.addEventListener('click', ()=>{
    loopThisLine = false;
    abA = abB = null;
  });
  btnAB && btnAB.addEventListener('click', ()=>{
    if (!video) return;
    if (abA == null) { abA = video.currentTime; return; }
    if (abB == null) { abB = video.currentTime; if (abB < abA) [abA,abB]=[abB,abA]; return; }
    // 第三次按清除
    abA = abB = null;
  });

  /* ---------- 時間驅動：高亮 / 循環 ---------- */
  if (video) {
    video.addEventListener('timeupdate', ()=>{
      const t = video.currentTime + offsetSec;
      updateActiveByTime(t);
      // 單句循環
      if (loopThisLine && activeIdx !== -1) {
        const c = cues[activeIdx];
        if (video.currentTime >= c.end) video.currentTime = c.start;
      }
      // A-B 循環
      if (abA != null && abB != null && video.currentTime >= abB) {
        video.currentTime = abA;
      }
    });
  }

  /* ---------- 啟動 ---------- */
  loadCues();
  loadQuiz();
  loadVocab();

  // for debug
  window.__ev = { slug, get cues(){return cues;}, get activeIdx(){return activeIdx;} };
})();


// player.js  V6.1
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // --- DOM refs ---
  const video = $('#player');
  const videoWrap = $('#videoWrap');

  const cuesBody = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');

  const speedRange = $('#speedRange');
  const speedVal = $('#speedVal');

  const btnPrev = $('#btnPrev');
  const btnPlay = $('#btnPlay');
  const btnNext = $('#btnNext');
  const btnReplay = $('#btnReplay');
  const btnAutoPause = $('#btnAutoPause');
  const btnLoopSentence = $('#btnLoopSentence');

  const btnAB = $('#btnAB');
  const btnPointLoop = $('#btnPointLoop');
  const btnClearLoop = $('#btnClearLoop');
  const btnFill = $('#btnFill');

  const chkFollow = $('#chkFollow');
  const btnOffsetMinus = $('#btnOffsetMinus');
  const btnOffsetPlus = $('#btnOffsetPlus');
  const offsetVal = $('#offsetVal');

  // tabs
  const tabs = $$('.tab');
  const paneSub = $('#pane-sub');
  const paneQuiz = $('#pane-quiz');
  const paneVocab = $('#pane-vocab');
  const quizStatus = $('#quizStatus');
  const vocabStatus = $('#vocabStatus');

  // --- State ---
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || 'mid-autumn';

  let cues = [];          // {t: seconds, en, zh}
  let offset = 0;         // seconds
  let follow = true;
  let autoPause = false;

  // loops
  let loopSentence = false; // 單句循環
  let abA = null, abB = null; // A-B 循環

  // helpers
  const toSec = (hhmmss) => {
    const p = hhmmss.split(':').map(Number);
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return Number(hhmmss) || 0;
  };
  const fmt = (sec) => {
    sec = Math.max(0, sec|0);
    const m = (sec / 60) | 0, s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  // 取得當前位於哪一行字幕
  const currentIndex = () => {
    const t = video.currentTime + offset;
    let i = 0;
    while (i + 1 < cues.length && cues[i + 1].t <= t + 0.0001) i++;
    return i;
  };

  // 讓某列高亮＋捲到可視
  const highlightRow = (idx) => {
    const trs = $$('#cuesBody tr');
    trs.forEach(tr => tr.classList.remove('active'));
    const tr = trs[idx];
    if (tr) {
      tr.classList.add('active');
      if (follow) tr.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }
  };

  // 播到某句開頭
  const seekTo = (idx, play = true) => {
    if (!cues[idx]) return;
    video.currentTime = Math.max(0, cues[idx].t - offset + 0.0001);
    highlightRow(idx);
    if (play) video.play();
  };

  // 單句區間
  const sentenceRange = (idx) => {
    if (!cues[idx]) return [0,0];
    const start = cues[idx].t;
    const end = (idx + 1 < cues.length ? cues[idx + 1].t : start + 3);
    return [start, end];
  };

  // --- 載入影片 ---
  const setVideo = async () => {
    const src = `./videos/${slug}.mp4`;
    video.src = src;
    // 讓瀏覽器處理 404，這裡顯示狀態即可
    video.addEventListener('error', () => {
      cuesStatus.textContent = `⚠️ 找不到影片 ${src}`;
    }, { once: true });
  };

  // --- 載入字幕/測驗/單字 ---
  const fetchJSON = async (url) => {
    const rsp = await fetch(url, { cache: 'no-store' });
    if (!rsp.ok) throw new Error(`${rsp.status} ${url}`);
    return rsp.json();
  };

  const loadCues = async () => {
    const url = `./data/cues-${slug}.json`;
    try{
      const raw = await fetchJSON(url);
      cues = raw.map(r => ({
        t: toSec(r.time),
        en: r.en || '',
        zh: r.zh || ''
      })).sort((a,b)=>a.t-b.t);

      // render
      cuesBody.innerHTML = cues.map((c, i) =>
        `<tr data-i="${i}"><td class="muted">${c.t?fmt(c.t):''}</td><td>${c.en}</td><td>${c.zh}</td></tr>`
      ).join('');
      cuesStatus.textContent = '';

      // row click
      $$('#cuesBody tr').forEach(tr=>{
        tr.addEventListener('click', ()=>{
          const i = Number(tr.dataset.i);
          loopSentence = false; // 點句不自動設 loop，改由「點句即循環」按鈕
          seekTo(i, true);
        });
      });

    }catch(e){
      cues = [];
      cuesBody.innerHTML = '';
      cuesStatus.textContent = `⚠️ 查無字幕資料（${url}）`;
    }
  };

  const loadQuiz = async () => {
    const url = `./data/quiz-${slug}.json`;
    try{
      const list = await fetchJSON(url);
      quizStatus.textContent = '';
      // very compact render
      $('#quizBox').innerHTML = list.map((q, i)=>`
        <div style="padding:10px 14px;border-bottom:1px solid #14243b">
          <div style="margin-bottom:6px">Q${i+1}. ${q.q}</div>
          ${q.a.map((opt,j)=>`<label style="display:block;margin:4px 0">
            <input type="radio" name="q${i}" value="${j}" /> ${opt}
          </label>`).join('')}
          <div class="muted" style="margin-top:6px">Ans: ${q.answerIndex+1}．${q.a[q.answerIndex]}　${q.explain?`（${q.explain}）`:''}</div>
        </div>
      `).join('');
    }catch(e){
      $('#quizBox').innerHTML = '';
      quizStatus.textContent = `⚠️ 查無測驗資料（${url}）`;
    }
  };

  const loadVocab = async () => {
    const url = `./data/vocab-${slug}.json`;
    try{
      const list = await fetchJSON(url);
      vocabStatus.textContent = '';
      $('#vocabBox').innerHTML = `
        <table>
          <thead><tr><th style="width:80px">時間</th><th>單字</th><th style="width:60px">詞性</th><th style="width:40%">中文</th><th>英文解釋 / 例句</th></tr></thead>
          <tbody>
            ${list.map(v=>`
              <tr>
                <td class="muted">${v.time||''}</td>
                <td>${v.word||''}</td>
                <td>${v.pos||''}</td>
                <td>${v.zh||''}</td>
                <td>${v.en||''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }catch(e){
      $('#vocabBox').innerHTML = '';
      vocabStatus.textContent = `⚠️ 查無單字資料（${url}）`;
    }
  };

  // --- 事件綁定 ---
  // 速度
  speedRange.addEventListener('input', ()=>{
    video.playbackRate = Number(speedRange.value);
    speedVal.textContent = `${video.playbackRate.toFixed(2)}x`;
  });

  // 播放/暫停
  btnPlay.addEventListener('click', ()=>{
    if (video.paused) video.play(); else video.pause();
  });

  // 上一句 / 下一句
  btnPrev.addEventListener('click', ()=>{
    const i = Math.max(0, currentIndex() - 1);
    seekTo(i, true);
  });
  btnNext.addEventListener('click', ()=>{
    const i = Math.min(cues.length-1, currentIndex() + 1);
    seekTo(i, true);
  });

  // 重複本句（單句循環）
  btnReplay.addEventListener('click', ()=>{
    const i = currentIndex();
    loopSentence = true;
    const [start] = sentenceRange(i);
    video.currentTime = Math.max(0, start - offset + 0.0001);
    video.play();
  });

  // 逐句自動暫停
  btnAutoPause.addEventListener('click', ()=>{
    autoPause = !autoPause;
    btnAutoPause.classList.toggle('green', autoPause);
  });

  // 整段循環（以目前句 start ~ 下一句 start）
  btnLoopSentence.addEventListener('click', ()=>{
    loopSentence = !loopSentence;
    btnLoopSentence.classList.toggle('green', loopSentence);
  });

  // A-B 循環
  btnAB.addEventListener('click', ()=>{
    if (abA === null) {
      abA = video.currentTime + offset;
      btnAB.textContent = '🅱 設定 B（再次按取消）';
      btnAB.classList.add('green');
    } else if (abB === null) {
      abB = video.currentTime + offset;
      if (abB < abA) [abA, abB] = [abB, abA];
      btnAB.textContent = '🅰🅱 A-B 循環中（再次按取消）';
    } else {
      abA = abB = null;
      btnAB.textContent = '🅰🅱 A-B 循環';
      btnAB.classList.remove('green');
    }
  });

  // 點句即循環：點字幕列就設成單句循環
  btnPointLoop.addEventListener('click', ()=>{
    btnPointLoop.classList.toggle('green');
    // 只改行為：當使用者點列表時，如果此鍵亮起 → 會把 loopSentence 設為 true
    cuesBody.dataset.pointloop = btnPointLoop.classList.contains('green') ? '1' : '';
  });

  // 清除循環
  btnClearLoop.addEventListener('click', ()=>{
    loopSentence = false;
    abA = abB = null;
    btnLoopSentence.classList.remove('green');
    btnAB.classList.remove('green');
    btnAB.textContent = '🅰🅱 A-B 循環';
  });

  // 填滿畫面
  btnFill.addEventListener('click', ()=>{
    videoWrap.classList.toggle('fill');
  });

  // 偏移 / 跟隨
  btnOffsetMinus.addEventListener('click', ()=>{ offset -= 0.5; offsetVal.textContent = `${offset.toFixed(1)}s`; });
  btnOffsetPlus.addEventListener('click',  ()=>{ offset += 0.5; offsetVal.textContent = `${offset.toFixed(1)}s`; });
  chkFollow.addEventListener('change', ()=>{ follow = chkFollow.checked; });

  // tabs
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const name = t.dataset.tab;
      paneSub.style.display  = (name==='sub')  ? '' : 'none';
      paneQuiz.style.display = (name==='quiz') ? '' : 'none';
      paneVocab.style.display= (name==='vocab')? '' : 'none';
    });
  });

  // 監聽播放更新，處理高亮/自停/各循環
  video.addEventListener('timeupdate', ()=>{
    if (!cues.length) return;

    // 高亮
    const i = currentIndex();
    highlightRow(i);

    const t = video.currentTime + offset;

    // 逐句自停
    if (autoPause) {
      const [, end] = sentenceRange(i);
      if (t >= end - 0.02 && t < end + 0.2) {
        video.pause();
      }
    }

    // 單句循環
    if (loopSentence) {
      const [s, e] = sentenceRange(i);
      if (t >= e - 0.02) {
        video.currentTime = Math.max(0, s - offset + 0.0001);
        video.play();
      }
    }

    // A-B 循環
    if (abA !== null && abB !== null) {
      if (t < abA || t >= abB - 0.02) {
        video.currentTime = Math.max(0, abA - offset + 0.0001);
        video.play();
      }
    }
  });

  // 點字幕列 → 依「點句即循環」狀態決定是否單句循環
  cuesBody.addEventListener('click', (ev)=>{
    const tr = ev.target.closest('tr[data-i]');
    if (!tr) return;
    const i = Number(tr.dataset.i);
    loopSentence = !!cuesBody.dataset.pointloop;
    seekTo(i, true);
    btnLoopSentence.classList.toggle('green', loopSentence);
  });

  // --- 啟動 ---
  (async function init(){
    await setVideo();
    await loadCues();
    await loadQuiz();
    await loadVocab();
    // 初始數值
    video.playbackRate = Number(speedRange.value);
    speedVal.textContent = `${video.playbackRate.toFixed(2)}x`;
    offsetVal.textContent = `${offset.toFixed(1)}s`;
    chkFollow.checked = follow;
  })();

})();








// ===== A 版：不做登入檢查，只負責載入影片＋字幕/測驗/單字 =====

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const slug = qs.get('slug') || 'mid-autumn';

  const video = $('#player');
  const paneSub  = $('#pane-sub');
  const paneQuiz = $('#pane-quiz');
  const paneV    = $('#pane-vocab');

  // 設定影片來源
  video.src = `videos/${slug}.mp4`;

  // 事件：控制列
  $('#btnPlay').onclick = () => { video.paused ? video.play() : video.pause(); };
  $('#btnPrev').onclick = () => jumpByCue(-1);
  $('#btnNext').onclick = () => jumpByCue(+1);
  $('#btnRepeat').onclick = toggleRepeat;
  $('#rate').oninput = e => {
    video.playbackRate = +e.target.value;
    $('#rateLabel').textContent = video.playbackRate.toFixed(2) + '×';
  };
  $('#zoom').oninput = e => {
    const z = +e.target.value;
    video.style.transform = `scale(${z})`;
    video.style.transformOrigin = 'center center';
  };

  // 讀取字幕 / 測驗 / 單字
  loadCues();
  loadQuiz();
  loadVocab();

  // ===== 字幕處理 =====
  let cueList = [];           // [{t, en, zh, el}]
  let repeatOn = false;
  let repeatA = null, repeatB = null;

  function toSec(t) {
    const [mm, ss] = String(t || '0:0').split(':').map(n => parseInt(n, 10) || 0);
    return mm * 60 + ss;
  }
  function fmt(tsec){
    const m = Math.floor(tsec/60), s = Math.floor(tsec%60);
    return `[${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}]`;
  }

  async function loadCues(){
    try{
      const res = await fetch(`data/cues-${slug}.json`);
      const raw = await res.json();

      // 兼容兩種格式：
      // 1) {time, text}
      // 2) {time, en, zh}
      cueList = (Array.isArray(raw)?raw:(raw.items||[])).map(row=>{
        const time = row.time || row.t || row.start;
        const en   = row.en || row.text || '';
        const zh   = row.zh || row.cn || row.zh_tw || '';
        return { t: toSec(time), en, zh };
      }).sort((a,b)=>a.t-b.t);

      // 渲染三欄表
      const table = document.createElement('table');
      table.innerHTML = `
        <thead><tr><th style="width:80px">時間</th><th>英文</th><th>中文</th></tr></thead>
        <tbody></tbody>`;
      const tb = table.querySelector('tbody');

      cueList.forEach((c,idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="time">${fmt(c.t)}</td>
          <td>${escapeHtml(c.en)}</td>
          <td class="muted">${escapeHtml(c.zh)}</td>`;
        tr.onclick = ()=>{ video.currentTime = c.t; video.play(); };
        c.el = tr;
        tb.appendChild(tr);
      });

      paneSub.innerHTML = '';
      paneSub.appendChild(table);

      // 播放時高亮 & 自動跟隨
      video.addEventListener('timeupdate', ()=>{
        const t = video.currentTime;
        // 高亮
        let i = cueList.findIndex((c,idx)=> c.t<=t && (idx+1===cueList.length || cueList[idx+1].t>t));
        if(i<0) i = 0;
        cueList.forEach(x=>x.el.classList.remove('active'));
        cueList[i]?.el.classList.add('active');

        // 重複播放控制
        if(repeatOn && repeatB!=null && t >= repeatB){
          video.currentTime = repeatA ?? cueList[i].t;
        }

        // 自動滾動
        cueList[i]?.el?.scrollIntoView({block:'center', behavior:'smooth'});
      });

    }catch(err){
      paneSub.textContent = '字幕載入失敗：' + err.message;
    }
  }

  function jumpByCue(dir){
    const t = video.currentTime + (dir<0?-0.05:+0.05);
    let idx = 0;
    for(let i=0;i<cueList.length;i++){
      if(cueList[i].t <= t) idx = i;
    }
    const target = cueList[idx + (dir>0?1:-1)];
    if(target){ video.currentTime = target.t; video.play(); }
  }

  function toggleRepeat(){
    if(!cueList.length) return;
    repeatOn = !repeatOn;
    if(repeatOn){
      // 以目前行為 A~下一行為 B
      const t = video.currentTime;
      let i = cueList.findIndex((c,idx)=> c.t<=t && (idx+1===cueList.length || cueList[idx+1].t>t));
      if(i<0) i=0;
      repeatA = cueList[i].t;
      repeatB = (i+1<cueList.length)? cueList[i+1].t : null;
      alert('已啟用「重複本句」。');
    }else{
      repeatA = repeatB = null;
      alert('已關閉「重複本句」。');
    }
  }

  function escapeHtml(s=''){
    return String(s).replace(/[&<>"']/g, m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // ===== 測驗 =====
  async function loadQuiz(){
    try{
      const res = await fetch(`data/quiz-${slug}.json`);
      const quiz = await res.json();
      paneQuiz.innerHTML = renderQuiz(quiz);
    }catch(err){
      paneQuiz.textContent = '測驗載入失敗：' + err.message;
    }
  }
  function renderQuiz(list){
    const items = (Array.isArray(list)?list:(list.items||[]));
    if(!items.length) return '<div class="muted">尚無測驗</div>';
    return items.map((q,i)=>`
      <div style="margin:10px 0;padding:10px;border:1px solid #233;border-radius:8px">
        <div style="margin-bottom:6px">${i+1}. ${escapeHtml(q.q||q.question||'')}</div>
        ${(q.a||q.options||[]).map(opt=>`
          <label style="display:block;margin:4px 0">
            <input type="radio" name="q${i}"> ${escapeHtml(opt)}
          </label>
        `).join('')}
      </div>
    `).join('');
  }

  // ===== 單字 =====
  async function loadVocab(){
    try{
      const res = await fetch(`data/vocab-${slug}.json`);
      const voc = await res.json();
      const arr = (Array.isArray(voc)?voc:(voc.items||[]));
      if(!arr.length){ paneV.textContent = '尚無單字'; return; }
      const table = document.createElement('table');
      table.innerHTML = `<thead><tr><th style="width:40%">單字</th><th>解釋</th></tr></thead><tbody></tbody>`;
      const tb = table.querySelector('tbody');
      arr.forEach(v=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(v.word||v.w||'')}</td><td class="muted">${escapeHtml(v.mean||v.zh||v.def||'')}</td>`;
        tb.appendChild(tr);
      });
      paneV.innerHTML = '';
      paneV.appendChild(table);
    }catch(err){
      paneV.textContent = '單字載入失敗：' + err.message;
    }
  }

  // ===== 分頁切換 =====
  $$('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const id = 'pane-' + t.dataset.tab;
      $$('.pane').forEach(p=>p.classList.remove('active'));
      $('#'+id).classList.add('active');
    });
  });

})();
































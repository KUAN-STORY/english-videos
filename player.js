/* ---------- english-videos / player.js (hotfix v2) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const urlOf = rel => new URL(rel, location.href).href;

  const slug = new URLSearchParams(location.search).get('slug') || 'mid-autumn';
  const video = $('#player') || $('video');

  /* ---------- 儲存與預設 ---------- */
  const LS = { speed:'ev_speed', offset:'ev_offset', follow:'ev_follow' };
  let speed     = parseFloat(localStorage.getItem(LS.speed)  || '1');
  let offsetSec = parseFloat(localStorage.getItem(LS.offset) || '0');
  let follow    = localStorage.getItem(LS.follow) !== '0';

  if (video) {
    if (!video.src) video.src = urlOf(`./videos/${slug}.mp4`);
    video.playbackRate = Math.min(2, Math.max(0.5, speed));
  }

  /* ---------- 找字幕表格（不靠固定 id） ---------- */
  const findCuesBody = () => {
    const tables = $$('table');
    for (const t of tables) {
      const th = Array.from(t.querySelectorAll('thead th')).map(x => x.textContent.trim());
      if (th.includes('時間') && th.includes('英文') && th.includes('中文')) {
        return t.tBodies[0] || t.querySelector('tbody');
      }
    }
    // 備援
    return $('#cuesBody') || $('#cues tbody') || document.querySelector('[data-role="cues"] tbody');
  };

  let cuesBody = findCuesBody();

  /* ---------- 工具 ---------- */
  const fmt = s => {
    s = Math.max(0, s|0);
    const m = (s/60|0).toString().padStart(2,'0');
    const ss = (s%60|0).toString().padStart(2,'0');
    return `${m}:${ss}`;
  };
  const hms = t => {
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

  /* ---------- 字幕資料 ---------- */
  let cues = [];          // [{start,end,en,zh}]
  let active = -1;
  let loopThis = false;
  let abA = null, abB = null;

  const setActive = i => {
    if (!cuesBody) return;
    if (active === i) return;
    active = i;
    cuesBody.querySelectorAll('.active').forEach(x=>x.classList.remove('active'));
    const tr = cuesBody.children[i];
    if (tr) {
      tr.classList.add('active');
      if (follow) tr.scrollIntoView({block:'center', behavior:'smooth'});
    }
  };

  const jump = (i, play=true) => {
    if (!video || i<0 || i>=cues.length) return;
    video.currentTime = cues[i].start;
    if (play) video.play();
  };

  const updateByTime = t => {
    if (!cues.length || !cuesBody) return;
    // 二分
    let L=0,R=cues.length-1,ans=-1;
    while(L<=R){
      const m=(L+R)>>1, c=cues[m];
      if (t>=c.start && t<c.end){ ans=m; break; }
      if (t<c.start) R=m-1; else L=m+1;
    }
    if (ans!==-1) setActive(ans);
  };

  const renderCues = () => {
    if (!cuesBody) return;
    cuesBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    cues.forEach((c,i)=>{
      const tr = document.createElement('tr');
      tr.dataset.start=c.start; tr.dataset.end=c.end;
      tr.innerHTML = `<td class="tc">${fmt(c.start)}</td><td class="en">${c.en||''}</td><td class="zh">${c.zh||''}</td>`;
      tr.addEventListener('click', ()=> jump(i,true));
      frag.appendChild(tr);
    });
    cuesBody.appendChild(frag);
  };

  async function loadCues() {
    try {
      const raw = await fetchJSON(urlOf(`./data/cues-${slug}.json`));
      const list=[];
      raw.forEach((r,i)=>{
        const s = ('start' in r) ? Number(r.start) : hms(r.time);
        const e = ('end'   in r) ? Number(r.end)   : hms(raw[i+1]?.time ?? (s+4.9));
        list.push({start:s, end:Math.max(e, s+0.01), en:r.en||'', zh:r.zh||''});
      });
      list.sort((a,b)=>a.start-b.start);
      cues = list;

      // 再偵測一次 tbody（避免切分頁時才渲染）
      cuesBody = findCuesBody();
      renderCues();
    } catch (e) {
      console.error('載入字幕失敗', e);
      cuesBody = findCuesBody();
      if (cuesBody) cuesBody.innerHTML =
        `<tr><td colspan="3" style="color:#f88">查無字幕資料（./data/cues-${slug}.json）</td></tr>`;
    }
  }

  /* ---------- 測驗 / 單字（保留） ---------- */
  const quizBody  = $('#quizBody')  || $('#quiz-content');
  const vocabBody = $('#vocabBody') || $('#vocab-content');

  async function loadQuiz(){
    if (!quizBody) return;
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
      quizBody.innerHTML=''; quizBody.appendChild(frag);
    }catch{
      quizBody.innerHTML = `<div style="color:#888">查無測驗資料（quiz-${slug}.json）。</div>`;
    }
  }

  async function loadVocab(){
    if (!vocabBody) return;
    try{
      const arr = await fetchJSON(urlOf(`./data/vocab-${slug}.json`));
      const table=document.createElement('table');
      table.className='vocab-table';
      table.innerHTML = `<thead><tr><th>時間</th><th>單字</th><th>詞性</th><th>中文</th><th>英文解釋 / 例句</th></tr></thead><tbody></tbody>`;
      const tbody=table.tBodies[0];
      arr.forEach(v=>{
        const s=hms(v.time||0);
        const tr=document.createElement('tr');
        tr.innerHTML=`<td class="tc"><button class="btn-jump" data-sec="${s}">${fmt(s)}</button></td>
          <td>${v.word||''}</td><td>${v.pos||''}</td><td>${v.zh||''}</td>
          <td>${v.def||''}${v.ex?`<div class="ex">${v.ex}</div>`:''}</td>`;
        tbody.appendChild(tr);
      });
      table.addEventListener('click',e=>{
        const b=e.target.closest('.btn-jump'); if(b&&video){ video.currentTime=parseFloat(b.dataset.sec); video.play(); }
      });
      vocabBody.innerHTML=''; vocabBody.appendChild(table);
    }catch{
      vocabBody.innerHTML = `<div style="color:#888">查無單字資料（vocab-${slug}.json）。</div>`;
    }
  }

  /* ---------- 事件委派：速度 / 偏移 / 跟隨 / 左下控制列 ---------- */

  // 速度：任何 range 都接手
  document.addEventListener('input', e=>{
    const t=e.target;
    if (t.matches('input[type=range]')) {
      if (!video) return;
      const v=parseFloat(t.value);
      if (!isNaN(v)) {
        video.playbackRate=Math.min(2,Math.max(0.5,v));
        localStorage.setItem(LS.speed, String(video.playbackRate));
        const txt = $('#speedText') || $('#speedVal');
        if (txt) txt.textContent = `${video.playbackRate.toFixed(2)}x`;
      }
    }
  });

  // 跟隨（checkbox 或按鈕）
  document.addEventListener('change', e=>{
    const t=e.target;
    if (t.matches('input[type=checkbox]') && /跟隨/.test(t.closest('label')?.textContent||t.id||'')) {
      follow = !!t.checked;
      localStorage.setItem(LS.follow, follow?'1':'0');
      const act=cuesBody?.querySelector('.active'); if (act && follow) act.scrollIntoView({block:'center',behavior:'smooth'});
    }
  });

  // 偏移按鈕
  const applyOffset = v=>{
    offsetSec=Math.max(-5,Math.min(5, v));
    localStorage.setItem(LS.offset,String(offsetSec));
    const ot = $('#offsetText') || $('#offset') || $('[data-role=offset]');
    if (ot) ot.textContent = `${offsetSec.toFixed(1)}s`;
    if (video) updateByTime(video.currentTime + offsetSec);
  };
  applyOffset(offsetSec);

  document.addEventListener('click', e=>{
    const btn = e.target.closest('button,a');

    if (btn) {
      const txt = (btn.textContent||'').trim();

      // 偏移
      if (/^-?0\.5s?$/.test(txt) || txt.includes('-0.5s')) { applyOffset(offsetSec-0.5); return; }
      if (/^\+?0\.5s?$/.test(txt) || txt.includes('+0.5s')) { applyOffset(offsetSec+0.5); return; }

      // 左下控制列
      if (/上一句/.test(txt)) { if (active===-1) jump(0,true); else jump(Math.max(0, active-1), true); return; }
      if (/下一句/.test(txt)) { if (active===-1) jump(0,true); else jump(Math.min(cues.length-1, active+1), true); return; }
      if (/重複本句/.test(txt)) { if (active!==-1) jump(active,true); return; }
      if (/點句即循環/.test(txt)) { loopThis = !loopThis; if (loopThis && active!==-1) jump(active,true); return; }
      if (/取消循環/.test(txt)) { loopThis=false; abA=abB=null; return; }
      if (/A-?B/.test(txt)) { // A-B 循環
        if (!video) return;
        if (abA==null) { abA=video.currentTime; return; }
        if (abB==null) { abB=video.currentTime; if (abB<abA) [abA,abB]=[abB,abA]; return; }
        abA=abB=null; return;
      }
    }
  });

  /* ---------- 影片時間驅動 ---------- */
  if (video) {
    video.addEventListener('timeupdate', ()=>{
      const t = video.currentTime + offsetSec;
      updateByTime(t);

      if (loopThis && active!==-1) {
        const c=cues[active];
        if (video.currentTime >= c.end) video.currentTime = c.start;
      }
      if (abA!=null && abB!=null && video.currentTime >= abB) {
        video.currentTime = abA;
      }
    });

    // 顯示當前速度文字（若有）
    const txt = $('#speedText') || $('#speedVal');
    if (txt) txt.textContent = `${video.playbackRate.toFixed(2)}x`;
  }

  /* ---------- 啟動載入 ---------- */
  loadCues();
  loadQuiz();
  loadVocab();

  // 如果切換分頁/延後渲染導致找不到 tbody，再嘗試幾次
  let tries = 0;
  const retry = setInterval(()=>{
    if (!cuesBody || !cuesBody.children.length) {
      const tb = findCuesBody();
      if (tb && tb !== cuesBody) { cuesBody = tb; renderCues(); }
    }
    if (++tries > 10) clearInterval(retry);
  }, 600);
});



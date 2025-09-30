/* ===== Player：維持你的資料規格，A 模式（不用登入） ===== */

const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> [...r.querySelectorAll(s)];
const qs = new URLSearchParams(location.search);
const slug = qs.get('slug') || '';

/* ---- 資料 ---- */
async function loadMeta(){
  const res = await fetch('data/index.json?v=' + Date.now());
  const meta = await res.json();
  const item = (meta.items||[]).find(x=>x.slug===slug) || meta.items?.[0];
  return item;
}

/* ---- 左：影片控制 ---- */
const v = $('#player');
let cueList = []; // [{t, en, zh, tSec, elTR}]
let follow = false;
let offsetSec = 0; // 校準偏移
const offsetKey = `offset_${slug}`;

/* A-B loop & repeat-one */
let A=null, B=null, abTimer=null;
function setRepeatOne(){
  const t = v.currentTime;
  let i = cueList.findIndex(c => c.tSec <= t && t < (cueList[cueList.length-1]?.tSec ?? 1e9));
  if(i<0) i=0;
  A = cueList[i].tSec; B = (i+1<cueList.length ? cueList[i+1].tSec : null);
  clearInterval(abTimer);
  abTimer = setInterval(()=>{ if(B!=null && v.currentTime>=B) v.currentTime = A; },120);
}
function setAB(){
  if(A==null){ A = v.currentTime; alert('已設定 A 點'); }
  else if(B==null){ B = v.currentTime; alert('已設定 B 點；開始循環'); startAB(); }
  else { A=v.currentTime; B=null; alert('已重設 A 點，請再按一次設定 B 點'); }
}
function startAB(){
  clearInterval(abTimer);
  abTimer = setInterval(()=>{ if(B!=null && v.currentTime>=B) v.currentTime = A; },120);
}
function clearLoop(){ A=null; B=null; clearInterval(abTimer); }

/* 上一句 / 下一句 */
function jumpPrev(){
  const t = v.currentTime;
  const prev = [...cueList].reverse().find(c=>c.tSec+offsetSec < t - 0.05);
  if(prev){ v.currentTime = prev.tSec + offsetSec; v.play(); }
}
function jumpNext(){
  const t = v.currentTime;
  const next = cueList.find(c=>c.tSec+offsetSec > t + 0.05);
  if(next){ v.currentTime = next.tSec + offsetSec; v.play(); }
}

/* 變速 / 變焦（只縮放 videoInner，不吃掉工具列） */
$('#rate').oninput = e=>{
  v.playbackRate = +e.target.value;
  $('#rateLabel').textContent = v.playbackRate.toFixed(2)+'×';
};
$('#zoom').oninput = e=>{
  const z = +e.target.value;
  $('.videoInner').style.transform = `scale(${z})`;
};

/* 左欄工具列按鈕 */
$('#btnPrev').onclick = jumpPrev;
$('#btnNext').onclick = jumpNext;
$('#btnPlay').onclick = ()=> v.paused ? v.play() : v.pause();
$('#btnRepeatOne').onclick = setRepeatOne;
$('#btnAB').onclick = setAB;
$('#btnABClear').onclick = clearLoop;

/* ---- 右：字幕表 ---- */
function toSec(t){
  // 支援 "mm:ss" or "m:ss"
  const [m,s] = String(t||'0:0').split(':').map(n=>parseInt(n,10)||0);
  return m*60 + s;
}
function normalizeRow(row){
  // 兼容不同欄位名稱
  const t = row.time || row.t || row.start || row.timestamp || '0:00';
  const en = row.en || row.eng || row.en_text || row.text || '';
  const zh = row.zh || row.cn || row.zh_text || row.tc || row.tw || row.ch || '';
  return { t, en, zh, tSec: toSec(t) };
}
function renderCues(list){
  const ctn = $('#cueContainer');
  ctn.innerHTML = `
    <table class="cues" id="cueTable">
      <thead><tr><th style="width:96px">時間</th><th>英文</th><th>中文</th></tr></thead>
      <tbody></tbody>
    </table>
  `;
  const tb = $('#cueTable tbody');
  cueList = list.map(normalizeRow).sort((a,b)=>a.tSec-b.tSec);
  cueList.forEach(c=>{
    const tr = document.createElement('tr');
    tr.className = 'cueRow';
    tr.innerHTML = `
      <td class="time">[${c.t}]</td>
      <td class="en">${c.en||''}</td>
      <td class="zh">${c.zh||''}</td>
    `;
    tr.querySelector('.time').onclick = ()=>{
      v.currentTime = c.tSec + offsetSec;
      v.play();
    };
    tr.onclick = ()=>{
      v.currentTime = c.tSec + offsetSec;
      v.play();
    };
    c.elTR = tr;
    tb.appendChild(tr);
  });
}

/* 高亮 + 跟隨 */
function highlight(current){
  let idx = -1;
  for(let i=0;i<cueList.length;i++){
    if(cueList[i].tSec + offsetSec <= current) idx=i; else break;
  }
  $$('.cueRow').forEach(r=>r.classList.remove('active'));
  if(idx>=0){
    const el = cueList[idx].elTR;
    el.classList.add('active');
    if(follow) el.scrollIntoView({block:'center', behavior:'smooth'});
  }
}

/* 搜尋（英/中） */
$('#q').addEventListener('input', ()=>{
  const q = $('#q').value.trim().toLowerCase();
  cueList.forEach(c=>{
    const hit = !q || (c.en||'').toLowerCase().includes(q) || (c.zh||'').toLowerCase().includes(q);
    c.elTR.style.display = hit ? '' : 'none';
  });
});

/* 字級 */
function setFontSize(s){
  const map={S:'13px',M:'15px',L:'17px'};
  $('#cueContainer').style.fontSize = map[s]||'15px';
  ['fS','fM','fL'].forEach(id=>$('#'+id).classList.remove('active'));
  ({S:'#fS',M:'#fM',L:'#fL'}[s] && $(({S:'#fS',M:'#fM',L:'#fL'}[s])).classList.add('active'));
}
$('#fS').onclick=()=>setFontSize('S');
$('#fM').onclick=()=>setFontSize('M');
$('#fL').onclick=()=>setFontSize('L');

/* 跟隨 */
$('#btnFollow').onclick = ()=>{
  follow = !follow;
  $('#btnFollow').textContent = follow ? '跟隨中' : '跟隨';
};

/* 校準 */
function updateOffsetTip(){
  $('#offsetTip').textContent = (offsetSec>=0?'+':'') + offsetSec.toFixed(1)+'s';
  localStorage.setItem(offsetKey, String(offsetSec));
}
$('#btnEarly').onclick = ()=>{ offsetSec -= 0.5; updateOffsetTip(); };
$('#btnLate').onclick  = ()=>{ offsetSec += 0.5; updateOffsetTip(); };

/* ---- 測驗：支援 20 題（單選/填空） ---- */
function renderQuiz(list){
  const box = $('#quizContainer');
  if(!list?.length){ box.textContent='（尚無測驗資料）'; return; }
  box.innerHTML = '';
  list.forEach((q,i)=>{
    const wrap = document.createElement('div');
    wrap.className='qBox';
    wrap.innerHTML = `<div style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q||q.question||''}</div>`;
    // 填空：k = 'gap' or 'blank'
    if(q.type==='fill' || q.fill || q.gap || q.blank){
      const inp = document.createElement('input');
      inp.type='text'; inp.placeholder='輸入答案…';
      inp.style.cssText='width:100%;padding:8px;border:1px solid #2a3f77;border-radius:8px;background:#0d1730;color:#fff';
      const btn = document.createElement('button');
      btn.className='btn'; btn.style.marginTop='8px'; btn.textContent='提交';
      const ans = (q.ans||q.answer||'').trim().toLowerCase();
      btn.onclick = ()=>{
        const user = inp.value.trim().toLowerCase();
        if(!ans) return;
        if(user===ans) { btn.textContent='✅ 正確'; btn.style.background='#1d6d63'; }
        else { btn.textContent=`❌ 正確：${q.ans||q.answer}`; btn.style.background='#6d1d1d'; }
      };
      wrap.append(inp,btn);
    }else{
      // 單選
      const opts = q.a || q.options || [];
      opts.forEach(opt=>{
        const o = document.createElement('label');
        o.className='opt';
        o.textContent = opt;
        o.onclick = ()=>{
          $$('.opt', wrap).forEach(x=>x.classList.remove('correct','wrong'));
          if(String(opt) === String(q.ans||q.answer)) o.classList.add('correct');
          else o.classList.add('wrong');
        };
        wrap.appendChild(o);
      });
    }
    box.appendChild(wrap);
  });
}

/* ---- 單字 ---- */
function renderVocab(list){
  const box = $('#vocabContainer');
  if(!list?.length){ box.textContent='（尚無單字資料）'; return; }
  box.innerHTML = `<div class="vocab"></div>`;
  const grid = $('.vocab', box);
  list.forEach(w=>{
    const en = w.en || w.word || w.v || '';
    const zh = w.zh || w.cn || w.tw || w.mean || w.def || '';
    const row = document.createElement('div');
    row.className='word';
    row.innerHTML = `<div style="font-weight:700">${en}</div><div style="opacity:.85;margin-top:4px">${zh}</div>`;
    grid.appendChild(row);
  });
}

/* ---- Tab 切換 ---- */
function bindTabs(){
  const tabs = [{id:'Transcript',panel:'panelTranscript'},{id:'Quiz',panel:'panelQuiz'},{id:'Vocab',panel:'panelVocab'}];
  tabs.forEach(t=>{
    $('#tab'+t.id).onclick = ()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      $('#tab'+t.id).classList.add('active');
      ['panelTranscript','panelQuiz','panelVocab'].forEach(pid=>{
        $('#'+pid).style.display = (pid===t.panel)?'block':'none';
      });
      // 字幕工具列只在字幕頁
      $('#cueToolbar').style.display = (t.id==='Transcript')?'flex':'none';
    };
  });
}

/* ---- 初始化 ---- */
(async ()=>{
  try{
    // 讀偏移
    const saved = parseFloat(localStorage.getItem(offsetKey));
    if(!Number.isNaN(saved)) offsetSec = saved;
    updateOffsetTip();

    bindTabs();
    setFontSize('M');

    const meta = await loadMeta();
    if(!meta){ $('#cueContainer').textContent='找不到影片資料'; return; }

    // 設定影片
    v.src = meta.video;

    // 載入字幕
    const cuesRes = await fetch(meta.cues + '?v=' + Date.now());
    let cues = await cuesRes.json(); // 陣列
    renderCues(cues);

    // 撥放時間驅動高亮（加上 offsetSec）
    v.addEventListener('timeupdate', ()=> highlight(v.currentTime));

    // 測驗
    if(meta.quiz){
      const qRes = await fetch(meta.quiz + '?v=' + Date.now());
      const qJson = await qRes.json();
      renderQuiz(qJson);
    }else{
      $('#quizContainer').textContent='（尚無測驗資料）';
    }

    // 單字（可有可無）
    const vocabPath = `data/vocab-${slug}.json`;
    try{
      const vRes = await fetch(vocabPath + '?v=' + Date.now());
      if(vRes.ok){
        const vJson = await vRes.json();
        renderVocab(vJson);
      }else{
        $('#vocabContainer').textContent='（尚無單字資料）';
      }
    }catch{
      $('#vocabContainer').textContent='（尚無單字資料）';
    }

  }catch(err){
    console.error(err);
    $('#cueContainer').textContent = '載入失敗：' + err.message;
  }
})();


































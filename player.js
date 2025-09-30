// player.js － A 階段：不做任何登入判斷

const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> [...r.querySelectorAll(s)];
const qs = new URLSearchParams(location.search);
const slug = qs.get('slug') || 'mid-autumn';

let cues = [];     // {tSec, time, en, zh, elRow}
let follow = false;
let A=null, B=null, loopTimer=null;

// 工具
function toSec(t){
  const [m,s] = String(t||'0:0').split(':').map(n=>parseInt(n,10)||0);
  return m*60+s;
}
function fmt(t){ const m=String(Math.floor(t/60)).padStart(2,'0'); const s=String(Math.floor(t%60)).padStart(2,'0'); return `${m}:${s}`; }

async function loadMeta(){
  const res = await fetch('data/index.json'); const json = await res.json();
  const item = (json.items||[]).find(x=>x.slug===slug) || (json.items||[])[0];
  return item;
}

async function init(){
  const meta = await loadMeta();
  if(!meta){ $('#panelSub').textContent='載入失敗：找不到影片'; return; }
  $('#player').src = meta.video;

  const cuesRes = await fetch(meta.cues); const list = await cuesRes.json();
  renderSub(list);

  // 右邊 tabs
  const tabs = {tabSub:'panelSub', tabQuiz:'panelQuiz', tabVcb:'panelVcb'};
  Object.keys(tabs).forEach(id=>{
    $('#'+id).onclick = ()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      $('#'+id).classList.add('active');
      Object.values(tabs).forEach(pid=> $('#'+pid).style.display='none');
      $('#'+tabs[id]).style.display='block';
    };
  });

  // 播放事件：高亮＆跟隨
  $('#player').addEventListener('timeupdate', ()=>{
    const t = $('#player').currentTime;
    let idx = -1;
    for(let i=0;i<cues.length;i++){ if(cues[i].tSec <= t+0.01) idx=i; else break; }
    $$('#subBody tr').forEach(tr=>tr.classList.remove('active'));
    if(idx>=0){
      cues[idx].elRow.classList.add('active');
      if(follow) cues[idx].elRow.scrollIntoView({block:'center'});
    }
  });

  // 搜尋
  $('#q').addEventListener('input', ()=>{
    const q = $('#q').value.trim().toLowerCase();
    $$('#subBody tr').forEach((tr,i)=>{
      const {en='', zh=''} = cues[i];
      const hit = en.toLowerCase().includes(q) || (zh||'').toLowerCase().includes(q);
      tr.style.display = hit? '' : 'none';
    });
  });

  // 字級
  const setFont = s=>{
    const map={S:'13px',M:'15px',L:'17px'};
    $('#panelSub').style.fontSize = map[s]||'15px';
    ['fS','fM','fL'].forEach(id=> $('#'+id).classList.remove('active'));
    $('#f'+s).classList.add('active');
  };
  $('#fS').onclick=()=>setFont('S'); $('#fM').onclick=()=>setFont('M'); $('#fL').onclick=()=>setFont('L'); setFont('M');

  // 跟隨
  $('#btnFollow').onclick = ()=>{
    follow = !follow;
    $('#btnFollow').textContent = follow? '跟隨中' : '跟隨';
  };

  // 左邊工具列
  bindTools();
}

function renderSub(list){
  const box = $('#panelSub'); box.innerHTML='';
  const tbl = document.createElement('table');
  tbl.innerHTML = `
    <thead><tr><th style="width:86px">時間</th><th>英文</th><th style="width:40%">中文</th></tr></thead>
    <tbody id="subBody"></tbody>`;
  box.appendChild(tbl);
  const body = $('#subBody');

  cues = list.map(row=>{
    const time = row.time||row.t||row.start||'00:00';
    const en   = row.en||row.text||row.caption||'';
    const zh   = row.zh||row.cn||row.tw||'';
    const tr   = document.createElement('tr');
    tr.innerHTML = `<td class="time">[${time}]</td><td>${en}</td><td>${zh}</td>`;
    tr.onclick = ()=>{
      const sec = toSec(time);
      const v = $('#player'); v.currentTime = sec; v.play();
    };
    body.appendChild(tr);
    return { tSec: toSec(time), time, en, zh, elRow: tr };
  });
}

function bindTools(){
  $('#btnPlay').onclick = ()=>{ const v=$('#player'); v.paused?v.play():v.pause(); };
  $('#btnPrev').onclick = ()=>{
    const t = $('#player').currentTime;
    const prev = [...cues].reverse().find(c=>c.tSec < t-0.05);
    if(prev){ $('#player').currentTime = prev.tSec; $('#player').play(); }
  };
  $('#btnNext').onclick = ()=>{
    const t = $('#player').currentTime;
    const next = cues.find(c=>c.tSec > t+0.05);
    if(next){ $('#player').currentTime = next.tSec; $('#player').play(); }
  };

  let repeatOne=false;
  $('#btnRepeatOne').onclick = ()=>{
    repeatOne = true;
    const t = $('#player').currentTime;
    let i = cues.findIndex(c=> c.tSec <= t && t < (cues[cues.length-1].tSec+3600));
    if(i<0) i=0;
    A = cues[i].tSec; B = cues[i+1]? cues[i+1].tSec : null;
    clearInterval(loopTimer);
    loopTimer = setInterval(()=>{ const v=$('#player'); if(B!=null && v.currentTime>=B) v.currentTime=A; },120);
  };

  $('#btnAB').onclick = ()=>{
    const v = $('#player');
    if(A==null){ A=v.currentTime; alert('已設定 A 點'); }
    else if(B==null){ B=v.currentTime; alert('已設定 B 點；開始循環'); startAB(); }
    else { A=v.currentTime; B=null; alert('已重設 A 點，請再按一次設定 B 點'); }
  };
  $('#btnABClear').onclick = ()=>{ clearInterval(loopTimer); A=B=null; };

  function startAB(){ clearInterval(loopTimer);
    loopTimer=setInterval(()=>{ const v=$('#player'); if(B!=null && v.currentTime>=B) v.currentTime=A; },120);
  }

  $('#rate').oninput = e=>{
    const v=$('#player'); v.playbackRate = +e.target.value;
    $('#rateLabel').textContent = v.playbackRate.toFixed(2)+'×';
  };
  $('#zoom').oninput = e=>{
    const z=+e.target.value; const v=$('#player'); v.style.transform=`scale(${z})`; v.style.transformOrigin='center center';
  };
}

// 啟動
init().catch(err=>{
  console.error(err);
  $('#panelSub').textContent = '載入失敗：'+err.message;
});
































(()=>{
  const $ = (s, ctx=document)=>ctx.querySelector(s);
  const $$ = (s, ctx=document)=>[...ctx.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get('slug')||'mid-autumn').trim();
  const AI_SRC = `./data/ai-${slug}.json`;

  // ?交?????.tabs ??#tabBar嚗????乩??I鈭??ab嚗??銝憿筑????  function mountTab(){
    const tabBar = document.querySelector('#tabBar') || document.querySelector('.tabs');
    const aiPanel = document.getElementById('panel-ai-interactive');
    if(tabBar && aiPanel){
      const btn = document.createElement('button');
      btn.className = (tabBar.classList.contains('tabs') ? 'tab' : 'btn') + ' aii-tab';
      btn.dataset.target = 'panel-ai-interactive';
      btn.textContent = 'AI鈭?';
      // 璅???澆捆嚗?嗡? tab ??data-target ??嚗窒?剁??血?雿輻蝪∪憿舐內?梯?
      tabBar.appendChild(btn);
      btn.addEventListener('click', ()=>{
        // ?岫???惜?Ｘ
        document.querySelectorAll('[id^="panel-"]').forEach(p=>p.classList.remove('show'));
        aiPanel.classList.add('show');
        // 瞈瘣餅見撘?        tabBar.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        btn.classList.add('active');
      });
    }else{
      // fallback: ?喃?閫筑??
      const fab = document.createElement('button');
      fab.textContent='AI'; fab.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;border-radius:999px;padding:10px 14px;background:#133a83;border:1px solid #2a63c9;color:#fff';
      document.body.appendChild(fab);
      const sheet = document.getElementById('panel-ai-interactive');
      fab.onclick=()=>{ sheet.style.display = (sheet.style.display==='block'?'none':'block'); };
    }
  }

  async function fetchJSON(u){
    try{ const r = await fetch(u, {cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }
    catch{ return null; }
  }

  function tts(text){
    if(!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang='en-US'; u.rate=1; u.pitch=1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  function jaccard(a,b){ const A=new Set(a),B=new Set(b); const i=[...A].filter(x=>B.has(x)).length; const u=new Set([...A,...B]).size||1; return i/u; }
  function score(user, target){
    const norm = s => s.toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
    return Math.round(jaccard(norm(user), norm(target))*100);
  }

  function mountMicTip(startFn){
    const tip = document.getElementById('aii-mic-tip');
    if(!tip) return startFn();
    if(!localStorage.getItem('aii_tip')){
      tip.classList.add('show');
      tip.querySelector('button')?.addEventListener('click', ()=>{
        tip.classList.remove('show');
        localStorage.setItem('aii_tip','1');
        startFn();
      }, {once:true});
    }else startFn();
  }

  function startRec(onText){
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ alert('甇斤汗?其??舀隤颲刻?'); return; }
    const rec = new SR(); rec.lang='en-US'; rec.interimResults=false; rec.maxAlternatives=1;
    rec.onresult = ev => onText(ev.results[0][0].transcript||'');
    rec.onerror = ()=> onText('');
    rec.start();
  }

  async function bootAI(){
    const panel = $('#panel-ai-interactive');
    if(!panel) return;
    const srcEl = $('#aii-src'), infoEl = $('#aii-info');
    srcEl.textContent = AI_SRC;
    const data = await fetchJSON(AI_SRC);
    if(!data || !Array.isArray(data.scenes) || !data.scenes.length){
      infoEl.textContent = 'AI ?單嚗?曉?蝛?;
      return;
    }
    infoEl.textContent = (data.title? data.title+' 繚 ' : '') + '撌脰???;

    // flatten turns
    const turns = [];
    data.scenes.forEach(sc => (sc.turns||[]).forEach(t => turns.push(t)));
    let i = 0;

    const roleEl = $('#aii-role'), enEl = $('#aii-en'), zhEl = $('#aii-zh'), goalEl = $('#aii-goal');
    const turnInfo = $('#aii-turn');
    const userEl = $('#aii-user'), fbEl = $('#aii-fb');

    function show(){
      if(i<0) i=0; if(i>=turns.length) i=turns.length-1;
      const t = turns[i];
      turnInfo.textContent = (i+1)+' / '+turns.length;
      roleEl.textContent = t.role || '??;
      enEl.textContent = t.en || '??;
      zhEl.textContent = t.zh || '';
      goalEl.textContent = t.goal || '';
      userEl.textContent = '雿???嚗?;
      fbEl.textContent = '??嚗?;
    }
    show();

    $('#aii-prev').addEventListener('click', ()=>{ i--; show(); });
    $('#aii-next').addEventListener('click', ()=>{ i++; show(); });
    $('#aii-play').addEventListener('click', ()=>{ const txt = enEl.textContent.trim(); if(txt) tts(txt); });
    $('#aii-say').addEventListener('click', ()=>{
      mountMicTip(()=> startRec(txt=>{
        if(!txt){ userEl.textContent='雿???嚗?颲刻?憭望?嚗?; return; }
        userEl.textContent = '雿???嚗?+txt;
        const sc = score(txt, enEl.textContent||'');
        fbEl.innerHTML = sc>=70
          ? `<span style="color:#9cf59c;font-weight:700">敺?嚗隡澆漲 ${sc}%</span>`
          : `<span style="color:#ffaeae;font-weight:700">?岫銝甈∴??訾撮摨?${sc}%</span>`;
      }));
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    mountTab();
    bootAI();
  });
})();

/* player.js - A 版（不做登入限制）
 * 依 slug 載入 videos/<slug>.mp4、data/cues-*.json、quiz-*.json、vocab-*.json
 * 支援字幕跟隨、自動捲動、偏移、字級、A-B 循環等
 */

(function () {
  // ==== 工具 ====
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get("slug") || "mid-autumn").trim();
  const storeKey = (k) => `pv_${slug}_${k}`;

  const player = $("#player");
  const cueTBody = $("#cueTable tbody");
  const cueWrap = $("#cueWrap");
  const cueEmpty = $("#cueEmpty");

  const rate = $("#rate");
  const rateLabel = $("#rateLabel");
  const zoom = $("#zoom");
  const followChk = $("#follow");
  const offsetText = $("#offsetText");
  const offMinus = $("#offMinus");
  const offPlus = $("#offPlus");

  let cues = [];            // [{t,en,zh}]
  let offset = +(localStorage.getItem(storeKey("offset")) || 0);
  let follow = localStorage.getItem(storeKey("follow"));
  follow = follow == null ? true : (follow === "true");
  followChk.checked = follow;
  offsetText.textContent = offset.toFixed(1);

  // A-B 循環
  let aMark = null, bMark = null, repeatOneIdx = null;

  // ==== 影片 ====
  player.src = `videos/${slug}.mp4`;

  // 變速
  rate.addEventListener("input", () => {
    player.playbackRate = +rate.value;
    rateLabel.textContent = player.playbackRate.toFixed(2) + "×";
  });

  // 變焦（不蓋工具列，靠 video 物件縮放）
  zoom.addEventListener("input", () => {
    player.style.transform = `scale(${+zoom.value})`;
    player.style.transformOrigin = "center center";
  });

  // 基本控制
  $("#playBtn").onclick = () => player[player.paused ? "play" : "pause"]();
  $("#prevBtn").onclick = () => seekToPrev();
  $("#nextBtn").onclick = () => seekToNext();
  $("#repeatBtn").onclick = () => {
    if (repeatOneIdx == null) repeatOneIdx = currentCueIndex();
    else repeatOneIdx = null;
    toast(repeatOneIdx == null ? "取消重複" : "重複本句中…");
  };
  $("#abBtn").onclick = () => {
    if (aMark == null) { aMark = player.currentTime; toast("A 點已記錄"); }
    else if (bMark == null) { bMark = player.currentTime; toast("B 點已記錄"); }
    else { aMark = bMark = null; toast("已清除 A/B 點"); }
  };
  $("#abClearBtn").onclick = () => { aMark = bMark = null; toast("已清除 A/B 點"); };

  // ==== 右側 tabs ====
  $$(".tab").forEach(t => t.addEventListener("click", () => {
    const name = t.dataset.tab;
    $$(".tab").forEach(x => x.classList.toggle("active", x === t));
    $$(".pane").forEach(p => p.classList.toggle("active", p.id === `pane-${name}`));
  }));

  // 字級
  $$(".fsBtn").forEach(b => b.addEventListener("click", () => {
    $$(".fsBtn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    const fs = b.dataset.fs;
    cueWrap.classList.remove("fs-s","fs-m","fs-l");
    cueWrap.classList.add(`fs-${fs}`);
    localStorage.setItem(storeKey("fs"), fs);
  }));
  const fsSaved = localStorage.getItem(storeKey("fs")) || "m";
  cueWrap.classList.add(`fs-${fsSaved}`);
  $(`.fsBtn[data-fs="${fsSaved}"]`).classList.add("active");

  // 跟隨 & 偏移
  followChk.addEventListener("change", () => {
    follow = followChk.checked;
    localStorage.setItem(storeKey("follow"), String(follow));
  });
  offMinus.addEventListener("click", () => changeOffset(-0.5));
  offPlus.addEventListener("click", () => changeOffset(+0.5));
  function changeOffset(delta){
    offset = +(offset + delta).toFixed(1);
    offsetText.textContent = offset.toFixed(1);
    localStorage.setItem(storeKey("offset"), String(offset));
  }

  // ==== 字幕載入 ====
  init();
  async function init(){
    await loadCues();
    await loadQuiz();
    await loadVocab();
    attachTimeUpdate();
  }

  async function loadCues(){
    try{
      const url = `data/cues-${slug}.json?v=${Date.now()}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();

      // 接受兩種格式：
      // 1) [{time:"00:01", en:"...", zh:"..."}]
      // 2) [{time:"00:01", text:"..."}]（英）
      cues = (raw || []).map((x)=>({
        t: toSec(x.time || x.t || "0:00"),
        en: x.en ?? x.text ?? "",
        zh: x.zh ?? x.cn ?? ""
      })).sort((a,b)=>a.t-b.t);

      renderCueTable();
      cueEmpty.style.display = cues.length? "none":"";
    }catch(err){
      console.error("載入字幕失敗：", err);
      cueEmpty.style.display = "";
    }
  }

  function renderCueTable(){
    cueTBody.innerHTML = "";
    cues.forEach((c,idx)=>{
      const tr = document.createElement("tr");
      tr.dataset.idx = idx;
      tr.innerHTML = `
        <td class="time">${fmt(c.t)}</td>
        <td class="en">${escapeHTML(c.en)}</td>
        <td class="zh">${escapeHTML(c.zh)}</td>
      `;
      tr.addEventListener("click", ()=> {
        player.currentTime = Math.max(0, c.t + offset);
        player.play();
      });
      cueTBody.appendChild(tr);
    });
  }

  // 跟隨 & 自動捲動
  function attachTimeUpdate(){
    player.addEventListener("timeupdate", ()=>{
      // A-B / Repeat One
      if (aMark!=null && bMark!=null && player.currentTime>bMark) {
        player.currentTime = aMark;
      }
      if (repeatOneIdx!=null){
        const c = cues[repeatOneIdx];
        if (c){
          const next = cues[repeatOneIdx+1];
          const endT = next? next.t : c.t + 5;
          if (player.currentTime >= endT) player.currentTime = c.t + 0.01;
        }
      }

      const idx = currentCueIndex();
      highlightRow(idx);
      if (follow && idx != null) {
        const row = cueTBody.querySelector(`tr[data-idx="${idx}"]`);
        if (row) row.scrollIntoView({block:"nearest"});
      }
    });
  }

  function highlightRow(idx){
    $$("#cueTable tbody tr").forEach(tr=>{
      tr.classList.toggle("active", +tr.dataset.idx===idx);
    });
  }
  function currentCueIndex(){
    const t = player.currentTime - offset;
    for (let i=0;i<cues.length;i++){
      const here = cues[i].t;
      const next = (cues[i+1]?.t ?? 1e9);
      if (t >= here && t < next) return i;
    }
    return null;
  }
  function seekToPrev(){
    const idx = currentCueIndex();
    const target = (idx==null? cues.length-1 : Math.max(0, idx-1));
    if (cues[target]) player.currentTime = Math.max(0, cues[target].t + offset);
  }
  function seekToNext(){
    const idx = currentCueIndex();
    const target = (idx==null? 0 : Math.min(cues.length-1, idx+1));
    if (cues[target]) player.currentTime = Math.max(0, cues[target].t + offset);
  }

  // ==== 測驗 ====
  async function loadQuiz(){
    const el = $("#quizList");
    el.innerHTML = "";
    try{
      const res = await fetch(`data/quiz-${slug}.json?v=${Date.now()}`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if(!Array.isArray(arr) || !arr.length){
        el.innerHTML = `<div class="warn">查無測驗資料</div>`;
        return;
      }
      arr.forEach((q,i)=>{
        // 支援兩種：{q:"?", a:[...], ans:1}  或 {q:"?", a:[...]}（沒有正解）
        const card = document.createElement("div");
        card.className = "qcard";
        card.innerHTML = `<h4>${i+1}. ${escapeHTML(q.q||"")}</h4>`;
        (q.a||[]).forEach((opt,j)=>{
          const btn = document.createElement("div");
          btn.className = "opt";
          btn.textContent = opt;
          btn.onclick = ()=>{
            if (q.ans==null) return; // 無標準答案
            const ok = (+q.ans===j);
            btn.classList.add(ok? "correct":"wrong");
          };
          card.appendChild(btn);
        });
        el.appendChild(card);
      });
    }catch(err){
      console.error("載入測驗失敗：", err);
      el.innerHTML = `<div class="warn">載入測驗失敗</div>`;
    }
  }

  // ==== 單字 ====
  async function loadVocab(){
    const ul = $("#vocabList");
    ul.innerHTML = "";
    try{
      const res = await fetch(`data/vocab-${slug}.json?v=${Date.now()}`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if(!Array.isArray(arr) || !arr.length){
        ul.innerHTML = `<li class="warn">查無單字資料</li>`;
        return;
      }
      arr.forEach(v=>{
        // 支援 {en:"word", zh:"解釋"} 或字串
        const li = document.createElement("li");
        if (typeof v === "string") li.textContent = v;
        else li.textContent = `${v.en || ""} — ${v.zh || ""}`.trim();
        ul.appendChild(li);
      });
    }catch(err){
      console.error("載入單字失敗：", err);
      ul.innerHTML = `<li class="warn">載入單字失敗</li>`;
    }
  }

  // ==== 小工具 ====
  function toSec(s){
    // 支援 "00:01" 或 "0:01" 或 "0:01.5"
    if (typeof s !== "string") return +s||0;
    const m = s.trim().split(":").map(Number);
    if (m.length===3) return m[0]*3600+m[1]*60+m[2];
    if (m.length===2) return m[0]*60+m[1];
    return +s||0;
  }
  function fmt(sec){
    sec=Math.max(0,sec|0);
    const m=(sec/60|0).toString().padStart(2,"0");
    const s=(sec%60|0).toString().padStart(2,"0");
    return `[${m}:${s}]`;
  }
  function toast(msg){ console.log(msg); }
  function escapeHTML(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

})();



































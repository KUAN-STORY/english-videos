// ==============================
// player.js — 只修你要的兩件事：字幕載入 & 測驗列印條件
// ==============================

// 小工具
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const slug = (()=> new URL(location.href).searchParams.get("slug") || "mid-autumn")();

// -------------------------------------
// 視訊控制（加防呆，不存在的元素不綁事件）
// -------------------------------------
(function videoControls(){
  const v = $("#player");
  if(!v) return;

  const btnPlay = $("#btnPlay");
  if(btnPlay){
    btnPlay.onclick = ()=> v.paused ? v.play() : v.pause();
  }

  const rate = $("#rate");
  const rateLabel = $("#rateLabel");
  if(rate && rateLabel){
    rate.oninput = ()=>{
      v.playbackRate = parseFloat(rate.value || "1");
      rateLabel.textContent = v.playbackRate.toFixed(2) + "×";
    };
  }

  const zoom = $("#zoom");
  if(zoom){
    zoom.oninput = ()=> {
      const z = parseFloat(zoom.value || "1");
      v.style.transformOrigin = "center center";
      v.style.transform = `scale(${z})`;
    };
  }
})();

// -------------------------------------
// 字幕：載入 / 顯示 / 點列跳播
// -------------------------------------
async function initSubTab(){
  const host = $("#pane-sub");
  if(!host){ return; }

  try{
    const url = `data/cues-${slug}.json?v=${Date.now()}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("載入失敗");
    const json = await res.json();

    // cues 資料容錯：可能是 {items:[...]} 或直接是陣列
    const cues = Array.isArray(json) ? json : (json.items || []);
    if(!Array.isArray(cues) || cues.length===0){
      host.innerHTML = `<div style="color:#ffb86b;padding:8px 0">查無字幕資料</div>`;
      return;
    }

    // 渲染
    const rows = cues.map((c, i)=>{
      // 兼容欄位名稱：t / time / start
      const t = Number(c.t ?? c.time ?? c.start ?? 0);
      const en = (c.en ?? c.text ?? "").toString();
      const zh = (c.zh ?? c.cn ?? "").toString();

      return `<tr data-t="${t}">
        <td style="width:80px;white-space:nowrap">[${fmtTime(t)}]</td>
        <td>${escapeHTML(en)}</td>
        <td>${escapeHTML(zh)}</td>
      </tr>`;
    }).join("");

    host.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 0;border-bottom:1px solid #223">時間</th>
            <th style="text-align:left;padding:6px 0;border-bottom:1px solid #223">英文</th>
            <th style="text-align:left;padding:6px 0;border-bottom:1px solid #223">中文</th>
          </tr>
        </thead>
        <tbody id="subBody">${rows}</tbody>
      </table>
    `;

    // 點列跳播
    const v = $("#player");
    $("#subBody")?.addEventListener("click", (e)=>{
      const tr = e.target.closest("tr[data-t]");
      if(!tr || !v) return;
      const t = Number(tr.dataset.t || 0);
      v.currentTime = t;
      v.play?.();
    });

  }catch(err){
    $("#pane-sub").innerHTML = `<div style="color:#ff6b6b">字幕載入失敗：${err.message}</div>`;
  }
}

// 輔助：時間格式
function fmtTime(sec){
  const s = Math.max(0, Math.floor(Number(sec)||0));
  const m = Math.floor(s/60);
  const r = s%60;
  return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
}
function escapeHTML(s){
  return String(s).replace(/[&<>"'`]/g, m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'
  })[m]);
}

// -------------------------------------
// Tabs：切換時載入字幕/測驗（不動你原來的版型）
// -------------------------------------
(function wireTabs(){
  const tabs = $$(".tab");
  tabs.forEach(tab=>{
    tab.addEventListener("click", ()=>{
      tabs.forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      $$(".pane").forEach(p=>p.classList.remove("active"));
      const pane = $(`#pane-${tab.dataset.tab}`);
      pane?.classList.add("active");

      if(tab.dataset.tab === "sub")  initSubTab();
      if(tab.dataset.tab === "quiz") initQuizTab();
    });
  });

  // 預設進頁就把字幕載入一次（右欄顯示空白時用）
  initSubTab();
})();

// -------------------------------------
// 測驗：逐題提交、全部提交後才顯示分數/評語/列印
// -------------------------------------
(function Quiz(){
  const QUIZ_HOST = "#pane-quiz";
  let quiz = [];
  let answers = [];
  let done = [];
  let score = 0;

  function norm(s){ return String(s||"").trim().replace(/\s+/g," ").toLowerCase(); }
  function teacherComment(p){
    if(p>=90) return "表現非常好！繼續保持 👏";
    if(p>=75) return "不錯喔，再多練習就更棒了 💪";
    if(p>=60) return "有進步空間，建議回看影片再作答 🙂";
    return "建議重看影片並複習單字，下次一定更好！📚";
  }

  async function loadQuiz(){
    const res = await fetch(`data/quiz-${slug}.json?v=${Date.now()}`);
    if(!res.ok) throw new Error("載入測驗失敗");
    const json = await res.json();
    return Array.isArray(json) ? json : (json.questions || []);
  }

  function render(){
    const host = $(QUIZ_HOST);
    if(!host) return;

    host.innerHTML = `
      <div id="quizWrap" style="display:flex;flex-direction:column;gap:16px">
        <div id="quizList"></div>
        <div id="quizSummary" style="display:none;border-top:1px dashed #334;padding-top:12px">
          <div id="quizScore" style="font-weight:700;margin-bottom:6px"></div>
          <div id="quizTeacher" style="margin-bottom:8px;color:#9ec1ff"></div>
          <button id="btnPrintQuiz" class="btn" style="display:none">列印題目</button>
        </div>
      </div>
    `;

    const list = $("#quizList");
    list.innerHTML = quiz.map((q,i)=>{
      let body="";
      if(q.type==="mcq"){
        body = `
          <div style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q}</div>
          ${(q.options||[]).map((opt,k)=>`
            <label style="display:block;margin:6px 0">
              <input type="radio" name="q_${i}" value="${k}" style="margin-right:6px">${opt}
            </label>`).join("")}`;
      }else if(q.type==="tf"){
        body = `
          <div style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q}</div>
          <label><input type="radio" name="q_${i}" value="true"> True</label>
          <label style="margin-left:10px"><input type="radio" name="q_${i}" value="false"> False</label>`;
      }else if(q.type==="fill"){
        body = `
          <div style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q}</div>
          <input id="fill_${i}" type="text" style="width:100%;padding:8px;border-radius:8px;border:1px solid #2a3a5c;background:#0c1734;color:#e7eaf3">`;
      }

      return `
        <div class="q-card" style="border:1px solid #233150;border-radius:10px;padding:12px">
          ${body}
          <div style="margin-top:10px">
            <button class="btn" data-act="submit" data-i="${i}">提交本題</button>
            <span id="fb_${i}" style="display:none;margin-left:6px"></span>
          </div>
        </div>`;
    }).join("");

    list.addEventListener("click",(e)=>{
      const btn = e.target.closest("button[data-act='submit']");
      if(!btn) return;
      const i = +btn.dataset.i;
      if(done[i]) return;

      const ok = gradeOne(i);
      const fb = $(`#fb_${i}`);
      fb.style.display = "inline-block";
      fb.textContent   = ok ? "✔ 正確" : "✘ 錯誤";
      fb.style.color   = ok ? "#2ee2a6" : "#ff6b6b";

      lock(i);
      if(done.every(Boolean)) showSummary();
    });

    $("#btnPrintQuiz").onclick = printQuiz;
  }

  function lock(i){
    done[i] = true;
    $$(`[name="q_${i}"]`).forEach(el=>el.disabled = true);
    const t = $(`#fill_${i}`); if(t) t.disabled = true;
    const b = $(`button[data-i="${i}"]`); if(b){ b.disabled = true; b.textContent = "已提交"; }
  }

  function gradeOne(i){
    const q = quiz[i];
    let ans=null, ok=false;
    if(q.type==="mcq"){
      const p = $(`[name="q_${i}"]:checked`);
      if(!p){ alert("請選擇答案"); return false; }
      ans = +p.value; ok = (ans === q.a);
    }else if(q.type==="tf"){
      const p = $(`[name="q_${i}"]:checked`);
      if(!p){ alert("請選擇答案"); return false; }
      ans = (p.value === "true"); ok = (ans === !!q.a);
    }else if(q.type==="fill"){
      const t = $(`#fill_${i}`);
      if(!t.value.trim()){ alert("請輸入答案"); return false; }
      ans = t.value; ok = (norm(ans) === norm(q.a));
    }
    answers[i] = ans;
    if(ok) score += 1;
    return ok;
  }

  function showSummary(){
    const total = quiz.length;
    const pct   = Math.round(score/total*100);
    $("#quizScore").textContent   = `你的分數：${score}/${total}（${pct}%）`;
    $("#quizTeacher").textContent = `老師評語：${teacherComment(pct)}`;
    $("#quizSummary").style.display = "block";
    $("#btnPrintQuiz").style.display = "inline-block"; // **全部完成後才出現**
  }

  function printQuiz(){
    const total = quiz.length;
    const pct   = Math.round(score/total*100);
    const cm    = teacherComment(pct);
    const html  = `<!doctype html><html><head><meta charset="utf-8"><title>Quiz Print</title>
      <style>
        @page{size:A4;margin:16mm}
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans",sans-serif}
        h1{margin:0 0 8px}
        .q{margin:10px 0;padding:8px;border:1px solid #ccc;border-radius:8px}
        .meta{margin:8px 0 12px}
      </style>
      </head><body>
      <h1>測驗列印</h1>
      <div class="meta">分數：${score}/${total}（${pct}%）<br>老師評語：${cm}</div>
      ${quiz.map((q,i)=>{
        let ua = answers[i];
        let right = "";
        if(q.type==="mcq") right = (q.options||[])[q.a];
        if(q.type==="tf")  right = q.a ? "True" : "False";
        if(q.type==="fill") right = q.a;
        return `<div class="q">
          <b>${i+1}. ${q.q}</b>
          <div>你的答案：${escapeHTML(String(ua))}</div>
          <div>正確答案：${escapeHTML(String(right))}</div>
        </div>`;
      }).join("")}
      <script>window.print()</script>
      </body></html>`;
    const w = window.open("","_blank");
    w.document.write(html); w.document.close();
  }

  // 對外啟動（給 tabs 用）
  window.initQuizTab = async function(){
    try{
      quiz = await loadQuiz();
      answers = new Array(quiz.length).fill(null);
      done    = new Array(quiz.length).fill(false);
      score   = 0;
      render();
    }catch(err){
      $(QUIZ_HOST).innerHTML = `<div style="color:#ff6b6b">載入測驗失敗：${err.message}</div>`;
    }
  };
})();
















































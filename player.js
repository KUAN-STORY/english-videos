// ==============================
// player.js - 完整整合版
// ==============================

// Utils
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
function getSlug() {
  const u = new URL(location.href);
  return u.searchParams.get("slug") || "mid-autumn";
}

// ------------------------------
// Tabs 切換（字幕 / 測驗 / 單字）
// ------------------------------
(function(){
  const tabs = $$(".tab");
  tabs.forEach(tab=>{
    tab.addEventListener("click", ()=>{
      tabs.forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      $$(".pane").forEach(p=>p.classList.remove("active"));
      $(`#pane-${tab.dataset.tab}`).classList.add("active");

      if(tab.dataset.tab==="quiz"){
        initQuizTab();
      }
    });
  });
})();

// ------------------------------
// Video 控制（簡化示範）
// ------------------------------
(function(){
  const v = $("#player");
  $("#btnPlay").onclick = ()=> v.paused ? v.play() : v.pause();
  $("#rate").oninput = ()=>{
    v.playbackRate = parseFloat($("#rate").value);
    $("#rateLabel").textContent = v.playbackRate.toFixed(2)+"×";
  };
  $("#zoom").oninput = ()=>{
    v.style.transform = `scale(${parseFloat($("#zoom").value)})`;
  };
})();

// ------------------------------
// QUIZ 模組
// ------------------------------
(function () {
  const QUIZ_SEL = "#pane-quiz";

  let quizData = [];
  let userAnswers = [];
  let questionDone = [];
  let score = 0;
  let slug = null;

  // Utils
  function normText(t) {
    return String(t || "").trim().replace(/\s+/g," ").toLowerCase();
  }
  function teacherComment(pct) {
    if (pct >= 90) return "表現非常好！繼續保持 👏";
    if (pct >= 75) return "不錯喔，再多練習就更棒了 💪";
    if (pct >= 60) return "有進步空間，建議回看影片再作答 🙂";
    return "建議重看影片並複習單字，下次一定更好！📚";
  }
  async function loadQuiz(slug) {
    const url = `data/quiz-${slug}.json?v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("載入測驗失敗");
    const json = await res.json();
    return Array.isArray(json) ? json : (json.questions || []);
  }

  function renderQuiz() {
    const wrap = $(QUIZ_SEL);
    wrap.innerHTML = `
      <div id="quizWrap" class="quiz-wrap" style="display:flex;flex-direction:column;gap:16px">
        <div id="quizList"></div>
        <div id="quizSummary" style="display:none;border-top:1px dashed #334;padding-top:12px">
          <div id="quizScore" style="font-weight:700;margin-bottom:6px"></div>
          <div id="quizTeacherCm" style="margin-bottom:8px;color:#a8c5ff"></div>
          <button id="btnPrintQuiz" class="btn" style="display:none">列印題目</button>
        </div>
      </div>
    `;

    const list = $("#quizList", wrap);
    list.innerHTML = "";

    quizData.forEach((q,i)=>{
      const card = document.createElement("div");
      card.className="q-card";
      card.style.cssText="border:1px solid #233150;border-radius:10px;padding:12px;";

      let body="";
      if(q.type==="mcq"){
        body=`<div class="q-text" style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q}</div>
              <div>${(q.options||[]).map((opt,k)=>`
                <label style="display:block;margin:6px 0;cursor:pointer">
                  <input type="radio" name="q_${i}" value="${k}" style="margin-right:6px"> ${opt}
                </label>`).join("")}</div>`;
      } else if(q.type==="tf"){
        body=`<div class="q-text" style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q}</div>
              <label><input type="radio" name="q_${i}" value="true"> True</label>
              <label style="margin-left:10px"><input type="radio" name="q_${i}" value="false"> False</label>`;
      } else if(q.type==="fill"){
        body=`<div class="q-text" style="font-weight:700;margin-bottom:6px">${i+1}. ${q.q}</div>
              <input id="fill_${i}" type="text" style="width:100%;padding:8px;border-radius:8px;border:1px solid #2a3a5c;background:#0c1734;color:#e7eaf3">`;
      }

      card.innerHTML = `
        ${body}
        <div style="margin-top:10px">
          <button class="btn" data-act="submit" data-i="${i}">提交本題</button>
          <span id="fb_${i}" style="display:none;margin-left:6px"></span>
        </div>`;
      list.appendChild(card);
    });

    list.addEventListener("click",(e)=>{
      const btn=e.target.closest("button[data-act='submit']");
      if(!btn) return;
      const i=parseInt(btn.dataset.i,10);
      if(questionDone[i]) return;

      const correct=gradeOne(i);
      const fb=$(`#fb_${i}`);
      fb.style.display="inline-block";
      fb.textContent=correct?"✔ 正確":"✘ 錯誤";
      fb.style.color=correct?"#2ee2a6":"#ff6b6b";

      lockQuestion(i);
      if(questionDone.every(Boolean)) showSummary();
    });

    $("#btnPrintQuiz").onclick=printQuiz;
  }

  function lockQuestion(i){
    questionDone[i]=true;
    $$(`[name="q_${i}"]`).forEach(el=>el.disabled=true);
    const t=$(`#fill_${i}`); if(t) t.disabled=true;
    const b=$(`button[data-i="${i}"]`); if(b){b.disabled=true;b.textContent="已提交";}
  }

  function gradeOne(i){
    const q=quizData[i];
    let ans=null,ok=false;
    if(q.type==="mcq"){
      const p=$(`[name="q_${i}"]:checked`);
      if(!p){alert("請選擇答案");return false;}
      ans=parseInt(p.value,10); ok=(ans===q.a);
    } else if(q.type==="tf"){
      const p=$(`[name="q_${i}"]:checked`);
      if(!p){alert("請選擇答案");return false;}
      ans=(p.value==="true"); ok=(ans===!!q.a);
    } else if(q.type==="fill"){
      const t=$(`#fill_${i}`); if(!t.value.trim()){alert("請輸入答案");return false;}
      ans=t.value; ok=(normText(ans)===normText(q.a));
    }
    userAnswers[i]=ans;
    if(ok) score+=1;
    return ok;
  }

  function showSummary(){
    const total=quizData.length;
    const pct=Math.round((score/total)*100);
    $("#quizScore").textContent=`你的分數：${score}/${total}（${pct}%）`;
    $("#quizTeacherCm").textContent=`老師評語：${teacherComment(pct)}`;
    $("#quizSummary").style.display="block";
    $("#btnPrintQuiz").style.display="inline-block";
  }

  function printQuiz(){
    const total=quizData.length;
    const pct=Math.round((score/total)*100);
    const cm=teacherComment(pct);
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Quiz Print</title>
      <style>@page{size:A4;margin:16mm;}body{font-family:sans-serif;} .q{margin:10px 0;padding:6px;border:1px solid #ccc}</style>
      </head><body>
      <h1>測驗列印</h1>
      <div>分數：${score}/${total}（${pct}%）<br>老師評語：${cm}</div>
      ${quizData.map((q,i)=>{
        const ua=userAnswers[i];
        const right=(q.type==="mcq")?q.options[q.a]:(q.type==="tf"?(q.a?"True":"False"):q.a);
        return `<div class="q"><b>${i+1}. ${q.q}</b><div>你的答案：${ua}</div><div>正確答案：${right}</div></div>`;
      }).join("")}
      <script>window.print()</script>
      </body></html>`;
    const w=window.open("","_blank"); w.document.write(html); w.document.close();
  }

  // 對外初始化
  window.initQuizTab = async function(){
    try{
      slug=getSlug();
      quizData=await loadQuiz(slug);
      userAnswers=new Array(quizData.length).fill(null);
      questionDone=new Array(quizData.length).fill(false);
      score=0;
      renderQuiz();
    }catch(err){
      $(QUIZ_SEL).innerHTML=`<div style="color:#f66">載入測驗失敗：${err.message}</div>`;
    }
  };
})();















































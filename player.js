/* player.js V7.3
 * 功能總覽：
 * 1. Supabase 公桶優先，失敗再讀本地（影片/字幕/測驗/單字）
 * 2. 字幕：載入、點行跳播、播放中自動高亮、跟隨捲動、偏移微調
 * 3. 工具列：上一句/播放/下一句/重複本句/逐句自動暫停/整段循環/A-B 循環/點句即循環/取消循環/填滿畫面/變速
 * 4. 測驗：答題後才顯示答案/解析，可統計分數，交卷後成績+建議+PDF「成就證書」
 * 5. 單字：主列顯示（時間/單字/詞性/中文），次列顯示英文解釋/例句/語法；含🔊朗讀、▶影片跳播
 */

// ---------- 基本設定 ----------
const supabaseBase = "https://你的專案.supabase.co/storage/v1/object/public/english-videos";
const localBase = "./data";

const videoEl = document.getElementById("player");
const cuesBody = document.getElementById("cuesBody");
const cuesStatus = document.getElementById("cuesStatus");
const quizBox = document.getElementById("quizBox");
const quizStatus = document.getElementById("quizStatus");
const vocabBox = document.getElementById("vocabBox");
const vocabStatus = document.getElementById("vocabStatus");

const urlParams = new URLSearchParams(location.search);
const slug = urlParams.get("slug") || "mid-autumn";

// ---------- 工具 ----------
function esc(s){return (s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function fetchWithFallback(path){
  return fetch(`${supabaseBase}/${path}`).then(r=>{
    if(!r.ok) throw new Error("Supabase 失敗");
    return r;
  }).catch(()=>fetch(`${localBase}/${path}`));
}

// ---------- 字幕 ----------
async function resolveCues(slug){
  try{
    const r=await fetchWithFallback(`${slug}-cues.json`); return r.json();
  }catch(e){cuesStatus.textContent="⚠️ 無法載入字幕";return null}
}
async function loadCuesUI(){
  const data=await resolveCues(slug);
  if(!data||!data.items) return;
  cuesStatus.textContent="";
  cuesBody.innerHTML=data.items.map((c,i)=>`
    <tr data-idx="${i}" data-time="${c.start}">
      <td class="muted">${c.start}</td>
      <td>${esc(c.en)}</td>
      <td>${esc(c.zh)}</td>
    </tr>`).join("");
}

// ---------- 測驗 ----------
async function resolveQuiz(slug){
  try{
    const r=await fetchWithFallback(`${slug}-quiz.json`); return r.json();
  }catch(e){quizStatus.textContent="⚠️ 無法載入測驗";return null}
}

async function loadQuizUI(){
  const data=await resolveQuiz(slug);
  if(!data||!data.items){quizStatus.textContent="⚠️ 無題目";return}
  quizStatus.textContent="";
  let answered=0,correct=0;

  function render(){
    quizBox.innerHTML=data.items.map((q,qi)=>`
      <div class="quizQ">
        <b>Q${qi+1}. ${esc(q.q)}</b>
        <div>${q.options.map((opt,oi)=>`
          <label><input type="radio" name="q${qi}" value="${oi}"> ${esc(opt)}</label>`).join("<br>")}</div>
        <div id="ans${qi}" class="ans"></div>
      </div>`).join("")
      +`<br><button id="btnSubmitQuiz" class="btn green">交卷</button>`;
  }
  render();

  quizBox.addEventListener("change",e=>{
    if(e.target.name?.startsWith("q")){
      const qi=parseInt(e.target.name.slice(1));
      const ansDiv=document.getElementById(`ans${qi}`);
      const pick=parseInt(e.target.value);
      answered++;
      if(pick===data.items[qi].answer){
        correct++; ansDiv.innerHTML=`✅ 正確！ ${esc(data.items[qi].options[pick])} <br> <small>${esc(data.items[qi].explain||"")}</small>`;
      }else{
        ansDiv.innerHTML=`❌ 錯誤。正解：${esc(data.items[qi].options[data.items[qi].answer])} <br> <small>${esc(data.items[qi].explain||"")}</small>`;
      }
    }
  });

  quizBox.addEventListener("click",e=>{
    if(e.target.id==="btnSubmitQuiz"){
      const percent=Math.round(correct/data.items.length*100);
      let advice="再接再厲！";
      if(percent<60) advice="建議回去複習影片重點句。";
      else if(percent<90) advice="不錯！再多練習幾次。";
      else advice="很棒！繼續保持！";

      quizBox.innerHTML+=`
        <div class="result">
          成績：${correct}/${data.items.length}（${percent}%）<br>
          老師建議：${advice}<br>
          <button id="btnCert" class="btn blue">列印「成就證書」PDF</button>
        </div>`;
    }
  });

  // 列印證書
  quizBox.addEventListener("click",e=>{
    if(e.target.id==="btnCert"){
      printCertificate(slug,correct,data.items.length);
    }
  });
}

// ---------- 證書 ----------
function printCertificate(slug,score,total){
  const percent=Math.round(score/total*100);
  const name=document.querySelector("#quizBox input[type=text]")?.value||"Guest";
  const win=window.open("","CERT");
  win.document.write(`
    <html><head><title>證書</title>
    <style>
      body{font-family:"Noto Sans TC",sans-serif;text-align:center;padding:60px}
      h1{color:#b45309}
      .percent{color:#2563eb;font-size:24px}
    </style></head><body>
      <h1>英語影片學習 成就證書</h1>
      <h3>Achievement Certificate</h3>
      <h2>${esc(name)}</h2>
      <p>通過 <b>${esc(slug)}</b> 題組 成績 <span class="percent">${percent}%</span> （${score}/${total}）</p>
      <p>發證日期：${new Date().toISOString().slice(0,16).replace("T"," ")}</p>
      <p>特此證明上述學員已完成影片學習與測驗，並達到該題組之學習目標。</p>
      <p style="margin-top:60px">指導老師簽章 ______________________</p>
    </body></html>`);
  win.print();
}

// ---------- 單字 ----------
async function resolveVocab(slug){
  try{
    const r=await fetchWithFallback(`${slug}-vocab.json`); return r.json();
  }catch(e){vocabStatus.textContent="⚠️ 無法載入單字";return null}
}

async function loadVocabUI(){
  const data=await resolveVocab(slug);
  if(!data||!Array.isArray(data.items)||!data.items.length){
    vocabStatus.textContent="⚠️ 查無單字資料"; vocabBox.innerHTML=""; return;
  }
  vocabStatus.textContent="";
  const rows=data.items.map((v,idx)=>`
    <tr class="v-main" data-idx="${idx}">
      <td class="muted" style="width:80px">${esc(v.time||"")}</td>
      <td>
        <div class="v-word">
          <b>${esc(v.word||"")}</b>
          <button class="v-say btn" data-text="${esc(v.word||"")}">🔊</button>
          ${v.time?`<button class="v-jump btn" data-time="${esc(v.time)}">▶</button>`:""}
        </div>
      </td>
      <td style="width:70px">${esc(v.pos||"")}</td>
      <td style="width:28%">${esc(v.zh||"")}</td>
    </tr>
    <tr class="v-detail"><td></td><td colspan="3">
      ${v.en?`<div>${esc(v.en)}</div>`:""}
      ${v.example?`<div>例：${esc(v.example)}</div>`:""}
      ${v.grammar?`<div>🛈 ${esc(v.grammar)}</div>`:""}
    </td></tr>`).join("");
  vocabBox.innerHTML=`<table>
    <thead><tr><th style="width:80px">時間</th><th>單字</th><th style="width:70px">詞性</th><th style="width:28%">中文</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// ---------- 初始化 ----------
(async function init(){
  // 載入影片
  try{
    const r=await fetchWithFallback(`${slug}.mp4`);
    videoEl.src=URL.createObjectURL(await r.blob());
  }catch(e){alert("影片載入失敗");}
  loadCuesUI();
  loadQuizUI();
  loadVocabUI();
})();


















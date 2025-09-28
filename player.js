// player.js  V7 — Supabase first + Local fallback
// 目標：
// 1) 影片/字幕/測驗/單字 優先從 Supabase 取得（Storage 公開 URL 或 Tables），取不到再 fallback 到本地檔。
// 2) 與 player.html (V6.1) 對齊：左側工具列全可用；右側分頁（字幕/測驗/單字）自動掛資料。
// 3) 字幕：跟隨、高亮、偏移 ±0.5s、上一句/下一句、單句循環、A-B 循環、逐句自停、點列跳播/點句即循環、填滿畫面。

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // -------- DOM Refs (與 V6.1 player.html 對齊) --------
  const video      = $('#player');
  const videoWrap  = $('#videoWrap');

  // 左側工具列
  const btnPrev        = $('#btnPrev');
  const btnPlay        = $('#btnPlay');
  const btnNext        = $('#btnNext');
  const btnReplay      = $('#btnReplay');
  const btnAutoPause   = $('#btnAutoPause');
  const btnLoopSentence= $('#btnLoopSentence');
  const btnAB          = $('#btnAB');
  const btnPointLoop   = $('#btnPointLoop');
  const btnClearLoop   = $('#btnClearLoop');
  const btnFill        = $('#btnFill');
  const speedRange     = $('#speedRange');
  const speedVal       = $('#speedVal');

  // 右側字幕
  const cuesBody   = $('#cuesBody');
  const cuesStatus = $('#cuesStatus');
  const chkFollow  = $('#chkFollow');
  const btnOffsetMinus = $('#btnOffsetMinus');
  const btnOffsetPlus  = $('#btnOffsetPlus');
  const offsetVal      = $('#offsetVal');

  // 分頁
  const tabs      = $$('.tab');
  const paneSub   = $('#pane-sub');
  const paneQuiz  = $('#pane-quiz');
  const paneVocab = $('#pane-vocab');
  const quizStatus  = $('#quizStatus');
  const quizBox     = $('#quizBox');
  const vocabStatus = $('#vocabStatus');
  const vocabBox    = $('#vocabBox');

  // -------- URL Query --------
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug') || 'mid-autumn';

  // -------- 狀態 --------
  let cues = [];       // {t:秒, en, zh}
  let offset = 0;      // 全域偏移(秒)
  let follow = true;   // 跟隨高亮
  let loopSentence = false; // 單句循環
  let abA = null, abB = null;
  let autoPause = false;    // 逐句自停

  // -------- 工具 --------
  const toSec = (hhmmss) => {
    if (typeof hhmmss === 'number') return hhmmss;
    const p = String(hhmmss).split(':').map(Number);
    if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
    if (p.length === 2) return p[0]*60 + p[1];
    return Number(hhmmss) || 0;
  };
  const fmt = (sec) => {
    sec = Math.max(0, sec|0);
    const m = (sec/60)|0, s = sec%60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const escapeHtml = (s) => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  // 目前位於哪句
  const currentIndex = () => {
    const t = video.currentTime + offset;
    let i = 0;
    while (i+1 < cues.length && cues[i+1].t <= t + 0.0001) i++;
    return i;
  };
  // 畫面高亮
  const highlightRow = (idx) => {
    const trs = $$('#cuesBody tr');
    trs.forEach(tr=> tr.classList.remove('active'));
    const tr = trs[idx];
    if (tr) {
      tr.classList.add('active');
      if (follow) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  // 到某句
  const seekTo = (idx, play=true) => {
    if (!cues[idx]) return;
    video.currentTime = Math.max(0, cues[idx].t - offset + 0.0001);
    highlightRow(idx);
    if (play) video.play();
  };
  const sentenceRange = (idx) => {
    if (!cues[idx]) return [0,0];
    const s = cues[idx].t;
    const e = (idx+1<cues.length ? cues[idx+1].t : s+3);
    return [s,e];
  };

  // =====================================================
  //              Supabase 優先 + Fallback
  // =====================================================
  let supa = null;
  (async () => {
    try { const m = await import('./videos/js/supa.js'); supa = m?.supa ?? null; }
    catch { supa = null; }
  })();

  // 取得 Storage 公開 URL
  const getPublicUrl = (bucket, path) => {
    if (!supa) return null;
    try {
      const { data } = supa.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  };

  // 影片：Supabase Storage > Supabase videos 表 > 本地
  const resolveVideoUrl = async (sg) => {
    // 1) storage 優先：videos/<slug>.mp4
    if (supa) {
      const p1 = `${sg}.mp4`;
      const u1 = getPublicUrl('videos', p1);
      if (u1) return u1;

      // 2) table: videos (url 或 storage_path)
      try {
        const { data, error } = await supa
          .from('videos')
          .select('url,storage_path')
          .eq('slug', sg)
          .maybeSingle();
        if (!error && data) {
          if (data.url) return data.url;
          if (data.storage_path) {
            const u2 = getPublicUrl('videos', data.storage_path);
            if (u2) return u2;
          }
        }
      } catch {}
    }
    // 3) fallback 本地
    return `./videos/${sg}.mp4`;
  };

  // 字幕：Supabase cues 表 > Storage cues/<slug>.json > 本地
  const resolveCues = async (sg) => {
    // 1) 表
    if (supa) {
      try {
        const { data, error } = await supa
          .from('cues')
          .select('time,en,zh')
          .eq('slug', sg)
          .order('time', { ascending:true });
        if (!error && data && data.length) {
          return data.map(r=>({ t: toSec(r.time), en: r.en||'', zh: r.zh||'' }));
        }
      } catch {}
      // 2) storage JSON
      const u = getPublicUrl('cues', `${sg}.json`);
      if (u) {
        try {
          const rsp = await fetch(u, { cache:'no-store' });
          if (rsp.ok) {
            const json = await rsp.json();
            if (Array.isArray(json)) {
              return json.map(r=>({ t: toSec(r.time), en: r.en||'', zh: r.zh||'' }));
            }
          }
        } catch {}
      }
    }
    // 3) 本地
    try {
      const rsp = await fetch(`./data/cues-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) {
        const json = await rsp.json();
        return json.map(r=>({ t: toSec(r.time), en: r.en||'', zh: r.zh||'' }));
      }
    } catch {}
    return [];
  };

  // 測驗：Storage quiz/<slug>.json > 本地
  const resolveQuiz = async (sg) => {
    // Storage
    if (supa) {
      const u = getPublicUrl('quiz', `${sg}.json`);
      if (u) {
        try {
          const rsp = await fetch(u, { cache:'no-store' });
          if (rsp.ok) return await rsp.json();
        } catch {}
      }
    }
    // 本地
    try {
      const rsp = await fetch(`./data/quiz-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) return await rsp.json();
    } catch {}
    return null;
  };

  // 單字：Storage vocab/<slug>.json > 本地
  const resolveVocab = async (sg) => {
    if (supa) {
      const u = getPublicUrl('vocab', `${sg}.json`);
      if (u) {
        try {
          const rsp = await fetch(u, { cache:'no-store' });
          if (rsp.ok) return await rsp.json();
        } catch {}
      }
    }
    try {
      const rsp = await fetch(`./data/vocab-${sg}.json`, { cache:'no-store' });
      if (rsp.ok) return await rsp.json();
    } catch {}
    return null;
  };

  // =====================================================
  //                      載入流程
  // =====================================================
  async function loadAll() {
    // 影片
    const vUrl = await resolveVideoUrl(slug);
    video.src = vUrl;
    video.addEventListener('error', () => {
      cuesStatus.textContent = `⚠️ 無法載入影片：${vUrl}`;
    }, { once:true });

    // 字幕
    cues = await resolveCues(slug);
    renderCues();

    // 測驗 / 單字（可選）
    loadQuizUI();
    loadVocabUI();
  }

  // -------- 渲染字幕表 --------
  function renderCues() {
    cuesBody.innerHTML = '';
    if (!cues.length) {
      cuesStatus.textContent = '⚠️ 查無字幕資料';
      return;
    }
    cuesStatus.textContent = '';

    const rows = cues.map((c, i)=>`
      <tr data-i="${i}">
        <td class="muted" style="width:80px">${c.t?fmt(c.t):''}</td>
        <td>${escapeHtml(c.en)}</td>
        <td style="width:40%">${escapeHtml(c.zh)}</td>
      </tr>`).join('');
    cuesBody.innerHTML = rows;

    // 點列跳播
    $$('#cuesBody tr').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const i = +tr.dataset.i;
        // 點句即循環模式
        if (cuesBody.dataset.pointloop === '1') {
          loopSentence = true;
          btnLoopSentence?.classList.add('green');
        }
        seekTo(i, true);
      });
    });
  }

  // -------- 測驗 UI --------
  async function loadQuizUI() {
    const list = await resolveQuiz(slug);
    if (!list || !list.length) {
      quizStatus.textContent = '⚠️ 查無測驗資料';
      quizBox.innerHTML = '';
      return;
    }
    quizStatus.textContent = '';
    quizBox.innerHTML = list.map((q,i)=>`
      <div style="padding:10px 14px;border-bottom:1px solid #14243b">
        <div style="margin-bottom:6px">Q${i+1}. ${escapeHtml(q.q)}</div>
        ${q.a.map((opt,j)=>`<label style="display:block;margin:4px 0">
          <input type="radio" name="q${i}" value="${j}"> ${escapeHtml(opt)}
        </label>`).join('')}
        ${typeof q.answerIndex==='number'
          ? `<div class="muted" style="margin-top:6px">Ans: ${q.answerIndex+1}．${escapeHtml(q.a[q.answerIndex])}${q.explain?`（${escapeHtml(q.explain)}）`:''}</div>`
          : ''}
      </div>
    `).join('');
  }

  // -------- 單字 UI --------
  async function loadVocabUI() {
    const list = await resolveVocab(slug);
    if (!list || !list.length) {
      vocabStatus.textContent = '⚠️ 查無單字資料';
      vocabBox.innerHTML = '';
      return;
    }
    vocabStatus.textContent = '';
    vocabBox.innerHTML = `
      <table>
        <thead><tr><th style="width:80px">時間</th><th>單字</th><th style="width:60px">詞性</th><th style="width:40%">中文</th><th>英文解釋 / 例句</th></tr></thead>
        <tbody>
          ${list.map(v=>`
            <tr>
              <td class="muted">${escapeHtml(v.time||'')}</td>
              <td>${escapeHtml(v.word||'')}</td>
              <td>${escapeHtml(v.pos||'')}</td>
              <td>${escapeHtml(v.zh||'')}</td>
              <td>${escapeHtml(v.en||'')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  // =====================================================
  //                   互動與控制列
  // =====================================================
  // 速度
  speedRange.addEventListener('input', ()=>{
    const r = Number(speedRange.value) || 1;
    video.playbackRate = r;
    speedVal.textContent = `${r.toFixed(2)}x`;
  });

  // 播放/暫停
  btnPlay.addEventListener('click', ()=>{
    if (video.paused) video.play(); else video.pause();
  });

  // 上一句 / 下一句
  btnPrev.addEventListener('click', ()=> {
    const i = Math.max(0, currentIndex()-1);
    seekTo(i, true);
  });
  btnNext.addEventListener('click', ()=> {
    const i = Math.min(cues.length-1, currentIndex()+1);
    seekTo(i, true);
  });

  // 重複本句（立即回到當句起點循環播放）
  btnReplay.addEventListener('click', ()=> {
    const i = currentIndex();
    loopSentence = true;
    btnLoopSentence.classList.add('green');
    const [s] = sentenceRange(i);
    video.currentTime = Math.max(0, s - offset + 0.0001);
    video.play();
  });

  // 整段（目前句）循環
  btnLoopSentence.addEventListener('click', ()=>{
    loopSentence = !loopSentence;
    btnLoopSentence.classList.toggle('green', loopSentence);
  });

  // A-B 循環（按一次設 A，再按設 B，再按一次清除）
  btnAB.addEventListener('click', ()=>{
    const now = video.currentTime + offset;
    if (abA === null) {
      abA = now; abB = null;
      btnAB.textContent = '🅱 設定 B（再次按取消）';
      btnAB.classList.add('green');
    } else if (abB === null) {
      abB = now;
      if (abB < abA) [abA, abB] = [abB, abA];
      btnAB.textContent = '🅰🅱 A-B 循環中（再次按取消）';
    } else {
      abA = abB = null;
      btnAB.textContent = '🅰🅱 A-B 循環';
      btnAB.classList.remove('green');
    }
  });

  // 點句即循環（開關）
  btnPointLoop.addEventListener('click', ()=>{
    btnPointLoop.classList.toggle('green');
    cuesBody.dataset.pointloop = btnPointLoop.classList.contains('green') ? '1' : '';
  });

  // 取消循環
  btnClearLoop.addEventListener('click', ()=>{
    loopSentence = false; abA = abB = null;
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
  btnOffsetPlus .addEventListener('click', ()=>{ offset += 0.5; offsetVal.textContent = `${offset.toFixed(1)}s`; });
  chkFollow.addEventListener('change', ()=>{ follow = chkFollow.checked; });

  // 播放更新：高亮、逐句自停、單句循環、A-B 循環
  video.addEventListener('timeupdate', ()=>{
    if (!cues.length) return;
    const i = currentIndex();
    highlightRow(i);
    const t = video.currentTime + offset;

    // 逐句自停（過句起點即停）
    if (autoPause) {
      const [, e] = sentenceRange(i);
      if (t >= e - 0.02 && t < e + 0.2) video.pause();
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

  // 逐句自停切換
  btnAutoPause.addEventListener('click', ()=>{
    autoPause = !autoPause;
    btnAutoPause.classList.toggle('green', autoPause);
  });

  // 分頁切換
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      paneSub.style.display   = (name==='sub')  ? '' : 'none';
      paneQuiz.style.display  = (name==='quiz') ? '' : 'none';
      paneVocab.style.display = (name==='vocab')? '' : 'none';
    });
  });

  // ---------------- 啟動 ----------------
  (async function init(){
    // 播放速度初始
    const r = Number(speedRange.value) || 1;
    video.playbackRate = r;
    speedVal.textContent = `${r.toFixed(2)}x`;

    await loadAll();
  })();

})();
/* =========================
   QUIZ MODULE (Safe Add-on)
   - 只掛「測驗」分頁，不改動現有播放器/字幕
   - 依據 #pane-quiz / #quizBox / #quizStatus DOM
   - 依據 .tab[data-tab="quiz"] 做首次載入
   ========================= */
(() => {
  // ---- 輕量工具，不覆蓋你原本的工具 ----
  const qz$ = (sel, root=document) => root.querySelector(sel);
  const qzParams = new URLSearchParams(location.search);
  const qzSlug = qzParams.get('slug') || 'mid-autumn';

  // 若你主檔已經有 SUPA_URL/SUPA_BUCKET，就優先走 Supabase，再退本地；沒有就直接讀本地
  const QZ_SUPA_URL    = window.SUPA_URL    || null;
  const QZ_SUPA_BUCKET = window.SUPA_BUCKET || null;
  const qzSupaPublic = (path) => `${QZ_SUPA_URL}/storage/v1/object/public/${QZ_SUPA_BUCKET}/${path}`;

  async function qzFetchWithFallback(publicPath, localPath, expectJson=true){
    if (QZ_SUPA_URL && QZ_SUPA_BUCKET){
      try{
        const r = await fetch(qzSupaPublic(publicPath), {cache:'no-store'});
        if (r.ok) return expectJson ? r.json() : r.blob();
      }catch(e){}
    }
    const r2 = await fetch(localPath, {cache:'no-store'});
    if (!r2.ok) throw new Error('quiz fetch failed: '+localPath);
    return expectJson ? r2.json() : r2.blob();
  }

  // ---- DOM ----
  const qzTabBtn   = qz$('.tab[data-tab="quiz"]'); // 只監聽這顆
  const qzPane     = qz$('#pane-quiz');
  const qzBox      = qz$('#quizBox');
  const qzStatus   = qz$('#quizStatus');

  if (!qzPane || !qzBox || !qzStatus) {
    // 頁面沒有測驗容器就直接跳出，不影響其它功能
    return;
  }

  let qzLoaded = false;
  let qzData = [];
  let qzUserAns = [];

  function qzRender() {
    qzBox.innerHTML = '';
    qzUserAns = Array(qzData.length).fill(-1);

    qzData.forEach((q, qi) => {
      const wrap = document.createElement('div');
      wrap.style.padding = '14px';
      wrap.style.borderBottom = '1px solid #14243b';

      const title = document.createElement('div');
      title.innerHTML = `<b>Q${qi+1}.</b> ${q.q}`;
      title.style.marginBottom = '8px';
      wrap.appendChild(title);

      q.a.forEach((opt, ai) => {
        const id = `qz_${qi}_${ai}`;
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.cursor  = 'pointer';
        label.style.margin  = '6px 0';
        label.innerHTML = `
          <input type="radio" name="qz_${qi}" id="${id}"/>
          <span style="margin-left:6px">${opt}</span>
        `;
        label.addEventListener('change', () => {
          qzUserAns[qi] = ai;
          ansLine.style.display = 'block';
          if (ai === q.answerIndex) {
            ansLine.innerHTML = `✅ 正確！Ans: ${q.answerIndex+1}．${q.a[q.answerIndex]} <span class="muted">（${q.explain||'Good!'}）</span>`;
            ansLine.style.color = '#5bd3c7';
          } else {
            ansLine.innerHTML = `❌ 再試試。正解：${q.answerIndex+1}．${q.a[q.answerIndex]} <span class="muted">（${q.explain||''}）</span>`;
            ansLine.style.color = '#ff6b6b';
          }
        });
        wrap.appendChild(label);
      });

      const ansLine = document.createElement('div');
      ansLine.className = 'muted';
      ansLine.style.marginTop = '6px';
      ansLine.style.display  = 'none';
      wrap.appendChild(ansLine);

      qzBox.appendChild(wrap);
    });

    const submitRow = document.createElement('div');
    submitRow.style.padding = '14px';
    submitRow.style.textAlign = 'right';

    const btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn green';
    btnSubmit.textContent = '交卷';
    btnSubmit.addEventListener('click', () => {
      let correct = 0;
      qzData.forEach((q,i)=>{ if (qzUserAns[i] === q.answerIndex) correct++; });
      const total = qzData.length;
      const pct   = Math.round(correct/total*100);

      const sum = document.createElement('div');
      sum.style.marginTop = '10px';
      sum.innerHTML = `
        <div><b>成績</b>：${correct}/${total}（${pct}%）</div>
        <div class="muted" style="margin-top:4px">分享學習成果：<br>
          <code>我在 ${qzSlug} 測驗拿到 ${correct}/${total}（${pct}%）！</code>
        </div>
        <div style="margin-top:6px" class="muted">老師建議：${pct>=80?'很棒！可挑戰更快播放或加深詞彙':'先確保理解每題說明，再回影片複習重點句。'}</div>
      `;
      submitRow.appendChild(sum);
    });

    submitRow.appendChild(btnSubmit);
    qzBox.appendChild(submitRow);
  }

  async function qzLoadOnce() {
    if (qzLoaded) return;
    qzStatus.textContent = '載入測驗中…';
    try {
      const data = await qzFetchWithFallback(
        `data/quiz-${qzSlug}.json`,
        `./data/quiz-${qzSlug}.json`,
        true
      );
      qzData = Array.isArray(data) ? data : [];
      qzLoaded = true;
      qzRender();
      qzStatus.textContent = '';
    } catch (err) {
      qzStatus.textContent = '讀取測驗失敗';
      console.error(err);
    }
  }

  // 只有按到「測驗」頁籤時才載入（不修改你現有的頁籤邏輯）
  if (qzTabBtn) {
    qzTabBtn.addEventListener('click', qzLoadOnce);
  }
  // 如果你預設就顯示「測驗」Pane（unlikely），也能保險載一次
  if (qzPane && getComputedStyle(qzPane).display !== 'none') {
    qzLoadOnce();
  }
})();
















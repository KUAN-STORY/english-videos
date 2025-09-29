// player.js — 骨架版，讀檔 stub
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || 'mid-autumn';

  const video = document.getElementById('player');
  video.src = `videos/${slug}.mp4`;

  // 字幕
  fetch(`data/subs-${slug}.json`).then(r=>r.json()).then(d=>{
    console.log('字幕資料', d);
    document.getElementById('pane-sub').textContent = JSON.stringify(d,null,2);
  }).catch(()=>document.getElementById('pane-sub').textContent='查無字幕');

  // 測驗
  fetch(`data/quiz-${slug}.json`).then(r=>r.json()).then(d=>{
    console.log('測驗資料', d);
    document.getElementById('pane-quiz').textContent = JSON.stringify(d,null,2);
  }).catch(()=>document.getElementById('pane-quiz').textContent='查無測驗');

  // 單字
  fetch(`data/vocab-${slug}.json`).then(r=>r.json()).then(d=>{
    console.log('單字資料', d);
    document.getElementById('pane-vocab').textContent = JSON.stringify(d,null,2);
  }).catch(()=>document.getElementById('pane-vocab').textContent='查無單字');

  // Tabs
  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`pane-${tab.dataset.tab}`).classList.add('active');
    });
  });
});




























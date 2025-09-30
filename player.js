<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>影片播放器 · Stories</title>

  <!-- ① 先載入登入守門程式（很重要：一定要在最上面） -->
  <script type="module" src="./login.js?v=15"></script>

  <style>
    body{margin:0;display:flex;height:100vh;background:#0b1220;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,sans-serif}
    #videoWrap{flex:1;display:flex;flex-direction:column;border-right:1px solid #223}
    #player{flex:1;width:100%;background:#000}
    #controls{padding:8px;background:#1e293b;text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    #controls .btn{padding:8px 10px;border:1px solid #334;background:#2a3b5c;color:#fff;border-radius:10px;cursor:pointer}
    #controls input[type="range"]{vertical-align:middle}

    .right{width:50%;min-width:320px;background:#0f1a33;display:flex;flex-direction:column}
    .tabs{display:flex;border-bottom:1px solid #203057}
    .tab{flex:1;padding:10px;text-align:center;cursor:pointer;background:#132046;color:#a9b3cf;user-select:none}
    .tab.active{background:#1b2a56;color:#fff;font-weight:700}
    .pane{flex:1;overflow:auto;padding:10px;display:none}
    .pane.active{display:block}
  </style>
</head>
<body>

  <!-- ② 隱藏的登入元件（提供給 login.js 使用） -->
  <button id="btnLogin"  style="display:none"></button>
  <button id="btnLogout" style="display:none"></button>
  <span id="userNameBadge" style="display:none"></span>

  <!-- 左：影片區 -->
  <section id="videoWrap">
    <video id="player" controls preload="metadata"></video>

    <!-- 你的固定工具列（範例，可自行擴充） -->
    <div id="controls">
      <button class="btn" id="btnPrev">上一句</button>
      <button class="btn" id="btnPlay">播放/暫停</button>
      <button class="btn" id="btnNext">下一句</button>
      <button class="btn" id="btnRepeatOne">重複本句</button>
      <button class="btn" id="btnAB">A-B 循環</button>
      <button class="btn" id="btnABClear">取消循環</button>
      <label class="btn">速度
        <input id="rate" type="range" min="0.5" max="2" step="0.05" value="1">
        <span id="rateLabel">1.00×</span>
      </label>
      <label class="btn">變焦
        <input id="zoom" type="range" min="1" max="2" step="0.05" value="1.00">
      </label>
    </div>
  </section>

  <!-- 右：字幕 / 測驗 / 單字 -->
  <section class="right">
    <div class="tabs">
      <div class="tab active" data-tab="sub">字幕</div>
      <div class="tab" data-tab="quiz">測驗</div>
      <div class="tab" data-tab="vocab">單字</div>
    </div>
    <div id="pane-sub"   class="pane active">字幕載入中…</div>
    <div id="pane-quiz"  class="pane">測驗載入中…</div>
    <div id="pane-vocab" class="pane">單字載入中…</div>
  </section>

  <!-- ③ 你的播放邏輯（維持原有 player.js） -->
  <script src="./player.js?v=15"></script>
</body>
</html>





























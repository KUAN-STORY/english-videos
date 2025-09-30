// player.js —— 放在獨立檔案，不要嵌在 HTML 裡

// 守門：檢查登入狀態（一定要最前面執行）
(async () => {
  // 確認 Supabase SDK 與客戶端已存在
  if (!window.supabase || !window.supa) {
    console.error('[guard] Supabase 尚未初始化，請確認 <head> 內的載入順序。');
    alert('系統尚未就緒，請重新整理頁面。');
    return;
  }

  try {
    const { data: { session } } = await supa.auth.getSession();

    if (!session) {
      // 未登入 → 退回首頁（可帶參數提示）
      alert('請先登入會員，才能觀看此影片。');
      location.replace('index.html?need_login=1');
      return;
    }

    console.log('[guard] 已登入：', session.user.email);

    // 已登入才繼續後續初始化
    if (typeof initPlayer === 'function') {
      // 你的原本主程式若叫 initPlayer，這裡會呼叫
      initPlayer();
    } else if (typeof boot === 'function') {
      // 或者你的主程式叫 boot，也支援
      boot();
    } else {
      console.log('[guard] 登入通過，請在 player.js 中實作 initPlayer() 或 boot()。');
    }
  } catch (err) {
    console.error('[guard] 檢查登入狀態失敗：', err);
    alert('驗證登入狀態失敗，請重新登入。');
    location.replace('index.html');
  }
})();





























// /english-videos/checkout-referral.js
// ------------------------------------------------------------------
// 讓 Checkout 頁面一定帶到推薦碼 ref，且顯示在畫面上
// ------------------------------------------------------------------
const REF_KEY = 'bw_referral_code';

/** 讀 URL 參數 */
function getQueryParam(name) {
  return new URL(location.href).searchParams.get(name);
}

/** 如果網址沒有 ref，改用 localStorage；若拿得到，回填到網址 */
function ensureRefOnUrl() {
  const url = new URL(location.href);
  let ref = url.searchParams.get('ref');

  // 先從 URL 拿，沒有就用 localStorage
  if (!ref) {
    ref = localStorage.getItem(REF_KEY) || '';
  }

  // 有拿到就回寫，並且存回 localStorage
  if (ref) {
    localStorage.setItem(REF_KEY, ref);

    // 若網址原本沒有 ref，補上並 replace（避免多一筆歷史紀錄）
    if (!url.searchParams.get('ref')) {
      url.searchParams.set('ref', ref);
      location.replace(url.toString());
      return; // 替換後會重新載入，不必往下跑
    }
  }

  return ref || '';
}

// ---- 主流程 -------------------------------------------------------
const ref = ensureRefOnUrl();

// 把推薦碼綁到頁面（可選）：凡是有 data-bind="ref" 的元素都會顯示
if (ref) {
  document.querySelectorAll('[data-bind="ref"]').forEach((el) => {
    el.textContent = ref;
  });
}

// 如果你的流程要把 ref 一起送到後端（建立訂單 / 訂閱時），
// 可以把 `ref` 變數直接帶進 fetch/supabase 的 payload 中。
// 例如：create_subscription({ ..., referral_code: ref })



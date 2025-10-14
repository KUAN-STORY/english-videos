// english-videos/checkout-referral.js
import { supabase } from '../supa.js'; // 往上一層到根目錄的 supa.js

const REF_KEY = 'bw_referral_code';
const REF_PARAM = 'ref';

// 讀 URL 上的 ?ref= 並存到 localStorage
function pickupReferralFromURL() {
  const code = new URL(location.href).searchParams.get(REF_PARAM);
  if (code) {
    localStorage.setItem(REF_KEY, code);
  }
  return localStorage.getItem(REF_KEY) || null;
}

// 幫你在頁面上顯示已套用的推薦碼（可選）
function showAppliedRef(code) {
  if (!code) return;
  // 你可在頁面加一個小位置顯示，例如：<div id="refBadge"></div>
  const el = document.querySelector('#refBadge');
  if (el) {
    el.textContent = `已套用推薦碼：${code}`;
    el.style.opacity = 1;
  }
}

// 取得目前使用者
async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

// === 你可以把這個當作「付款已完成」後呼叫的 API ===
export async function recordSubscription() {
  // 1) 取得登入者
  const user = await getUser();
  if (!user) {
    // 未登入，導去登入（帶回來）
    location.href = '../../login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const refCode = pickupReferralFromURL();

  // 2) 從 window.CHECKOUT 取得本次要寫入的訂閱資訊
  const c = window.CHECKOUT || {};
  const payload = {
    user_id: user.id,
    plan_id: c.plan || 'story',
    period:  c.period || 'month',
    price:   Number(c.price || 0),
    currency: c.currency || 'TWD',
    status: 'active',
    started_at: new Date().toISOString(),
    referrer_code: refCode || null
  };

  // 3) 寫入 subscriptions 表
  const { error } = await supabase.from('subscriptions').insert(payload);
  if (error) {
    console.error('[recordSubscription] insert error:', error);
    alert('寫入訂閱失敗：' + (error.message || 'unknown'));
    throw error;
  }

  // 推薦碼用完可以清掉（自由）
  // localStorage.removeItem(REF_KEY);
}

// === 綁定「確認付款」按鈕 ===
// 會嘗試找：#confirmPay 或者文字為「確認付款」的按鈕
export function wireConfirmButton() {
  pickupReferralFromURL(); // 先取得推薦碼（URL 或 localStorage）
  showAppliedRef(localStorage.getItem(REF_KEY));

  // 你若有固定 id，改成：const btn = document.querySelector('#confirmPay');
  let btn = document.querySelector('#confirmPay');

  if (!btn) {
    // 沒 id 就找文案
    const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
    btn = allBtns.find(b => (b.textContent || '').trim().includes('確認付款'));
  }

  if (!btn) {
    console.warn('找不到「確認付款」按鈕，請加上 id="confirmPay" 或保持文字包含「確認付款」。');
    return;
  }

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    btn.disabled = true;

    try {
      // === 這裡接你原本的金流 ===
      // 假裝金流成功（開發期用），正式時改成你的金流 callback success
      await new Promise(r => setTimeout(r, 800));

      // 金流成功 → 寫入訂閱
      await recordSubscription();

      alert('付款成功，訂閱已生效！');
      // 付款成功後導回首頁或會員中心
      location.href = './index.html';
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alert('付款或寫入失敗，請稍後再試');
    }
  });
}


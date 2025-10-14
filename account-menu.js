/* ============================================================
 * BookWide – Account Menu + Referral (A 方案)
 * 完整覆蓋版：可直接取代你現有的 account-menu.js
 * 功能：
 *  1) 在頁面右上角產生帳號選單（個人資料 / 學習控制台 / 我的訂閱 / 推廣分潤 / 登出）
 *  2) 推薦碼 A 方案：讀 ref -> 存 localStorage/cookie -> 自動帶到 pricing.html / checkout.html
 *  3) 支援自訂連結加 data-keep-ref 屬性，會自動補上 ref
 *  4) 不更動任何既有 HTML、CSS
 * ============================================================ */

/* ====== 你現有的 Supabase 初始化（請保持路徑不變）====== */
import { supabase } from './supa.js';  // 根目錄：/english-videos/supa.js

/* ====== 版本號（顯示在圓角小角標）====== */
const VERSION = '1.2.0';

/* ====== 路徑統一管理（相對於 /english-videos/）====== */
const PATH = {
  profile: './account/profile.html',
  learning: './account/favorites.html',      // 你目前使用 favorites 作為學習控制台
  subscription: './pricing.html',            // 「我的訂閱」導到方案與定價
  referral: './account/referral.html',       // 推廣分潤
  login: './login.html'
};

/* ========= 工具函式：推薦碼讀寫 ========= */
const REF_KEY = 'bw_ref';
const REF_COOKIE = 'bw_ref';

function getParam(search, key) {
  const usp = new URLSearchParams(search || location.search);
  return usp.get(key);
}

function setCookie(name, value, days = 30) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + encodeURIComponent(name) + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function getReferralCode() {
  return localStorage.getItem(REF_KEY) || getCookie(REF_COOKIE) || '';
}

export function saveReferralCode(ref) {
  if (!ref) return;
  localStorage.setItem(REF_KEY, ref);
  setCookie(REF_COOKIE, ref, 90);
}

export function buildUrlWithRef(url, ref) {
  if (!ref) return url;
  try {
    const u = new URL(url, location.href);
    // 已有 ref 就不覆寫
    if (!u.searchParams.get('ref')) {
      u.searchParams.set('ref', ref);
    }
    return u.toString();
  } catch {
    // 相對路徑
    const hasQ = url.includes('?');
    const sep = hasQ ? '&' : '?';
    // 已有 ref 直接回傳
    if (/[?&]ref=/.test(url)) return url;
    return `${url}${sep}ref=${encodeURIComponent(ref)}`;
  }
}

/* ========= 啟動時：讀網址上的 ref，若有就存起來 ========= */
(function bootstrapReferral() {
  const urlRef = getParam(location.search, 'ref');
  if (urlRef) saveReferralCode(urlRef);
})();

/* ========= 自動把 ref 附加到前往 pricing / checkout 的連結 ========= */
function autoAttachRefToLinks(root = document) {
  const ref = getReferralCode();
  if (!ref) return;

  const anchors = root.querySelectorAll('a[href]');
  anchors.forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;

    const toPricing = /(^|\/)pricing\.html(\?|$)/.test(href);
    const toCheckout = /(^|\/)checkout\.html(\?|$)/.test(href);
    const keepRef = a.hasAttribute('data-keep-ref');

    if (toPricing || toCheckout || keepRef) {
      const newHref = buildUrlWithRef(href, ref);
      a.setAttribute('href', newHref);
    }
  });
}

/* ========= 攔截點擊（保底）：臨時補 ref 後再前往 ========= */
function interceptClickToAttachRef() {
  document.addEventListener(
    'click',
    e => {
      const ref = getReferralCode();
      if (!ref) return;

      const a = e.target.closest('a[href]');
      if (!a) return;

      const href = a.getAttribute('href');
      if (!href) return;

      const toPricing = /(^|\/)pricing\.html(\?|$)/.test(href);
      const toCheckout = /(^|\/)checkout\.html(\?|$)/.test(href);
      const keepRef = a.hasAttribute('data-keep-ref');

      if (toPricing || toCheckout || keepRef) {
        const newHref = buildUrlWithRef(href, ref);
        if (newHref !== href) {
          a.setAttribute('href', newHref);
        }
      }
    },
    true
  );
}

/* ========= 帳號下拉選單 ========= */
async function mountMenu() {
  // 取得使用者
  const { data: { user } } = await supabase.auth.getUser();

  // 建 root
  let root = document.querySelector('#accMenuRoot');
  if (root) root.remove();
  root = document.createElement('div');
  root.id = 'accMenuRoot';
  root.style.position = 'relative';
  document.body.appendChild(root);

  // UI
  root.innerHTML = `
    <style>
      .acc-badge{position:absolute;top:-8px;right:-8px;background:#1f6feb;color:#fff;border-radius:8px;padding:2px 6px;font-size:11px}
      #accAvatarBtn{position:fixed;top:12px;right:12px;z-index:1000;background:#0f172a;color:#fff;border:1px solid #23324d;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;cursor:pointer}
      #accDropdown{position:fixed;top:60px;right:12px;width:300px;background:#0b1220;color:#fff;border:1px solid #23324d;border-radius:12px;padding:16px;display:none;z-index:1001}
      .acc-item{padding:12px 10px;border-radius:8px;cursor:pointer}
      .acc-item:hover{background:rgba(255,255,255,.06)}
      .acc-split{height:1px;background:rgba(255,255,255,.1);margin:8px 0}
      .acc-email{font-size:12px;color:#8ea0bf}
    </style>

    <button id="accAvatarBtn" aria-label="account">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.9 0-12 2-12 6v2h24v-2c0-4-8.1-6-12-6z"/></svg>
      <span id="accAvatarText" class="acc-email">未登入</span>
      <span class="acc-badge">v${VERSION}</span>
    </button>

    <div id="accDropdown">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <div style="width:38px;height:38px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center">38</div>
        <div>
          <div id="accUserEmail" class="acc-email">—</div>
        </div>
      </div>

      <div class="acc-item" data-link="${PATH.profile}">個人資料</div>
      <div class="acc-item" data-link="${PATH.learning}" data-keep-ref>學習控制台</div>
      <div class="acc-item" data-link="${PATH.subscription}" data-keep-ref>我的訂閱</div>
      <div class="acc-item" data-link="${PATH.referral}" data-keep-ref>推廣分潤</div>
      <div class="acc-split"></div>
      <div class="acc-item" id="accLogout" style="display:none">登出</div>
    </div>
  `;

  const btn = document.querySelector('#accAvatarBtn');
  const drop = document.querySelector('#accDropdown');
  const emailEl = document.querySelector('#accUserEmail');
  const textEl = document.querySelector('#accAvatarText');
  const logoutEl = document.querySelector('#accLogout');

  // 填入使用者資訊
  if (user) {
    emailEl.textContent = user.email || '—';
    textEl.textContent = user.email || '已登入';
    logoutEl.style.display = '';
  } else {
    emailEl.textContent = '未登入';
    textEl.textContent = '未登入';
    logoutEl.style.display = 'none';
  }

  // 展開/收起
  btn.addEventListener('click', () => {
    drop.style.display = drop.style.display === 'none' || !drop.style.display ? 'block' : 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#accDropdown') && !e.target.closest('#accAvatarBtn')) {
      drop.style.display = 'none';
    }
  });

  // 點選選單項目
  drop.querySelectorAll('.acc-item[data-link]').forEach(item => {
    item.addEventListener('click', () => {
      const to = item.getAttribute('data-link') || '#';
      const ref = getReferralCode();
      const needRef = item.hasAttribute('data-keep-ref');
      const url = needRef ? buildUrlWithRef(to, ref) : to;

      // 未登入，導去登入頁
      if (!user && !/login\.html$/.test(to)) {
        location.href = `${PATH.login}?next=${encodeURIComponent(url)}`;
        return;
      }
      location.href = url;
    });
  });

  // 登出
  logoutEl.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

/* ========= 啟動 ========= */
document.addEventListener('DOMContentLoaded', () => {
  // 1) 帳號選單
  mountMenu();

  // 2) 全站自動把 ref 帶到 pricing / checkout
  autoAttachRefToLinks(document);

  // 3) 保底攔截
  interceptClickToAttachRef();
});


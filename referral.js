/*! BookWide Referral helper (vanilla JS)
 *  - Stores ?ref=... in localStorage (key: bw_ref)
 *  - Appends the ref to internal links (index/pricing/checkout)
 *  - Exposes window.BookWideRef.getRef()
 */
(function () {
  const STORAGE_KEY = "bw_ref";
  const REF_PARAM = "ref";
  const KEEP_PAGES = ["index.html", "pricing.html", "checkout.html"];

  function getParamRef(url) {
    try {
      const u = new URL(url || location.href);
      const v = u.searchParams.get(REF_PARAM);
      return (v && v.trim()) ? v.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function saveRef(code) {
    try {
      if (!code) return;
      localStorage.setItem(STORAGE_KEY, code);
    } catch (e) {}
  }

  function getSavedRef() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return (v && v.trim()) ? v.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function getRef() {
    return getParamRef() || getSavedRef();
  }

  function appendRefToUrl(href, ref) {
    if (!href || !ref) return href;
    try {
      if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return href;
      const u = new URL(href, location.href);
      if (u.origin !== location.origin) return href;
      const isKeep = KEEP_PAGES.some(p => u.pathname.endsWith("/" + p) || u.pathname.endsWith(p));
      if (!isKeep) return href;
      if (!u.searchParams.has(REF_PARAM)) u.searchParams.set(REF_PARAM, ref);
      return u.toString();
    } catch (e) {
      return href;
    }
  }

  function patchAllLinks(ref) {
    if (!ref) return;
    document.querySelectorAll('a[href]').forEach(a => {
      a.href = appendRefToUrl(a.getAttribute('href'), ref);
    });
  }

  function ensureButtons(ref) {
    if (!ref) return;
    document.querySelectorAll('[data-ref-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-ref-target');
        if (!target) return;
        const href = appendRefToUrl(target, ref);
        location.href = href;
      });
    });
  }

  function injectRefBadge(ref) {
    if (!ref) return;
    const host = document.querySelector('[data-ref-place="code"]');
    if (host) {
      host.textContent = ref;
      const wrap = host.closest('.ref-row');
      if (wrap) wrap.classList.remove('hidden');
    }
  }

  function init() {
    const refFromUrl = getParamRef();
    if (refFromUrl) saveRef(refFromUrl);
    const ref = getSavedRef();
    patchAllLinks(ref);
    ensureButtons(ref);
    injectRefBadge(ref);
    window.BookWideRef = { getRef, appendRefToUrl };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
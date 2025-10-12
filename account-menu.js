// /english-videos/account-menu.js
(function(global){
  const AM = {};
  const Q = (sel, root=document)=>root.querySelector(sel);

  function ensureClient(){
    if (!global.SB) { console.warn('[AccountMenu] Missing _sb-config.js'); return null; }
    if (global.sb) return global.sb;
    if (!global.supabase){ console.warn('[AccountMenu] Missing supabase-js'); return null; }
    global.sb = supabase.createClient(SB.url, SB.anon, { auth:{ persistSession:true, autoRefreshToken:true } });
    return global.sb;
  }

  function initialsFromEmail(email){
    const n = (email||'').split('@')[0] || 'U';
    return n.slice(0,2).toUpperCase();
  }

  function avatarHTML(url, fallbackText){
    if (url) return `<img class="am-avatar" src="${url}" alt="avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` +
                    `<div class="am-avatar am-fallback" style="display:none">${fallbackText}</div>`;
    return `<div class="am-avatar am-fallback">${fallbackText}</div>`;
  }

  function mountUI(container){
    container.innerHTML = `
      <div class="am-root">
        <button class="am-btn am-login" data-am="login" style="display:none">登入</button>
        <div class="am-user" style="display:none">
          <div class="am-trigger" data-am="trigger" aria-haspopup="menu" aria-expanded="false">
            <span class="am-email"></span>
            <div class="am-avatar-wrap"></div>
          </div>
          <div class="am-menu" role="menu">
            <a class="am-item" href="./account/profile.html" role="menuitem">個人資料</a>
            <button class="am-item am-logout" role="menuitem">登出</button>
          </div>
        </div>
      </div>
    `;
  }

  async function render(container){
    const sb = ensureClient();
    if (!sb) return;

    const { data:{ user } } = await sb.auth.getUser();
    const loginBtn = Q('[data-am="login"]', container);
    const userBox  = Q('.am-user', container);
    const trig     = Q('[data-am="trigger"]', container);
    const emailEl  = Q('.am-email', container);
    const avWrap   = Q('.am-avatar-wrap', container);

    if (!user){
      userBox.style.display = 'none';
      loginBtn.style.display = 'inline-flex';
      loginBtn.onclick = ()=>{
        const here = location.pathname + location.search;
        location.href = `./account/login.html?next=${encodeURIComponent(here)}`;
      };
      return;
    }

    loginBtn.style.display = 'none';
    userBox.style.display = 'inline-block';
    emailEl.textContent = user.email;

    let avatar = user.user_metadata?.avatar_url || '';
    try{
      const { data } = await sb.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle();
      if (data?.avatar_url) avatar = data.avatar_url;
    }catch(_){}

    avWrap.innerHTML = avatarHTML(avatar, initialsFromEmail(user.email));

    function close(){ Q('.am-menu', container).classList.remove('open'); trig.setAttribute('aria-expanded','false'); }
    function open(){ Q('.am-menu', container).classList.add('open'); trig.setAttribute('aria-expanded','true'); }
    trig.onclick = (e)=>{
      e.stopPropagation();
      const opened = Q('.am-menu', container).classList.contains('open');
      opened ? close() : open();
    };
    document.addEventListener('click', close);

    Q('.am-logout', container).onclick = async ()=>{
      await sb.auth.signOut();
      location.reload();
    };
  }

  AM.mount = function(selector){
    const el = Q(selector);
    if (!el) return console.warn('[AccountMenu] mount target not found:', selector);
    mountUI(el);
    render(el);
    const sb = ensureClient();
    if (sb){
      sb.auth.onAuthStateChange(()=>render(el));
    }
  };

  global.AccountMenu = AM;
})(window);

<!-- 建議在所有頁面（index.html / player.html）都用同一份 supa.js -->

<!-- 1) 先載入 UMD 版 Supabase（這一行放在 supa.js 前面） -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>

<!-- 2) 你的 supa.js：把下面這段存成 /english-videos/supa.js -->
<script>
(function () {
  // TODO: 換成你的 Supabase 專案參數
  const SUPABASE_URL = 'https://https://qtgwedankftrqjmzuset.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g';

  // 全域掛上 supa 物件，給 login.js / index.html / player.html 共用
  window.supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
</script>






// supa.js －－ 不要包 <script> 標籤
(function () {
  // ✅ 正確：不要重複 https://
  const SUPABASE_URL = 'https://qtgwedankftrqjmzuset.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3dlZGFua2Z0cnFqbXp1c2V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NDYxMDMsImV4cCI6MjA3NDQyMjEwM30.jyETpt09pgm66aCZheMgsjtbKlVmYo-lt-hrrt6BF8g';

  // 建立全域 supabase client 供其它檔使用
  window.supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();







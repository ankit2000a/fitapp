const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const sql = `
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'sync_user_challenges';
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql: sql });
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Definition:\n', data[0]?.def || 'Not found');
  }
}
run();

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const query = `
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'calculate_metric_progress';
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql: query });
  if (error) {
    console.error('Error executing sql:', error.message);
  } else {
    console.log('Function Definition:', data);
  }
}
run();

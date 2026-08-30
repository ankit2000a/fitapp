const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_function_definition', { func_name: 'calculate_metric_progress' });
  // Wait, if get_function_definition doesn't exist, we can use a direct SQL injection/query if we have access, or look up in pg_proc
  // Let's run a query to get function source from pg_proc
  const { data: source, error: err } = await supabase.from('pg_proc').select('*').limit(1); // wait, pg_proc is not exposed on REST api
  console.log('Result:', data, error);
}
run();

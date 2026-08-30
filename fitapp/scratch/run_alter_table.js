const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sql = `
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS steps integer DEFAULT 0;
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS active_calories integer DEFAULT 0;
`;

async function run() {
  console.log('Sending ALTER TABLE sql queries...');
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error('SQL Execution Error:', error.message);
  } else {
    console.log('SQL Execution Success! Columns steps and active_calories have been added.', data);
  }
}

run();

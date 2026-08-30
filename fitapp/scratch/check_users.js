const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sql = `
  SELECT id, email, name, username, level, xp FROM public.users;
`;

async function run() {
  console.log('Sending exec_sql RPC to fetch users...');
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error('SQL Execution Error:', error.message);
  } else {
    console.log('Users in DB (via SQL):', JSON.stringify(data, null, 2));
  }
}

run();

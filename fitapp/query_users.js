const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying first 5 users...');
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, level, xp')
    .limit(5);

  if (error) {
    console.error('Error fetching users:', error.message);
  } else {
    console.log('Users in DB:', JSON.stringify(data, null, 2));
  }
}

run();

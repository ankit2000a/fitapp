const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Finding all users...');
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, name, username')
    .limit(10);

  if (userErr) {
    console.error('Error finding users:', userErr.message);
    return;
  }
  
  console.log('All users:', users);
}

run();

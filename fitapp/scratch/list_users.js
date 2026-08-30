const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: users, error } = await supabase.from('users').select('id, username');
  if (error) {
    console.error('Error fetching users:', error.message);
  } else {
    console.log('Users in Database:', users);
  }
}
run();

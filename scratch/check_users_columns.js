const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Querying first user to check columns...');
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error);
  } else if (data && data.length > 0) {
    console.log('User columns:', Object.keys(data[0]));
    console.log('User data sample:', data[0]);
  } else {
    console.log('No users found in database.');
  }
}

test();

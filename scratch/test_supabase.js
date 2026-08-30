const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Querying non-existent user...');
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000000')
    .single();
  
  console.log('Result data:', data);
  console.log('Result error:', error);
}

test();

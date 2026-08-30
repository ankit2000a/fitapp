const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing health_scores...');
  const { data, error } = await supabase.from('health_scores').select('*').limit(1);
  console.log('health_scores columns:', data ? Object.keys(data[0] || {}) : 'No data', error?.message);
}

test();

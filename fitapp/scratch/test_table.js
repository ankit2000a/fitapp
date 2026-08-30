const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing future_projections...');
  const { data, error } = await supabase.from('future_projections').select('*').limit(1);
  console.log('future_projections columns:', data ? Object.keys(data[0] || {}) : 'No data', error?.message);
}

test();

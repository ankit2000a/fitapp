const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing food_logs...');
  const { data: d1, error: e1 } = await supabase.from('food_logs').select('*').limit(1);
  console.log('food_logs columns:', d1 ? Object.keys(d1[0] || {}) : 'No data', e1?.message);

  console.log('Testing users...');
  const { data: d2, error: e2 } = await supabase.from('users').select('*').limit(1);
  console.log('users columns:', d2 ? Object.keys(d2[0] || {}) : 'No data', e2?.message);

  console.log('Testing reward_locks...');
  const { data: d3, error: e3 } = await supabase.from('reward_locks').select('*').limit(1);
  console.log('reward_locks:', d3, e3?.message);
  
  console.log('Testing daily_activities...');
  const { data: d4, error: e4 } = await supabase.from('daily_activities').select('*').limit(1);
  console.log('daily_activities:', d4, e4?.message);
}

test();

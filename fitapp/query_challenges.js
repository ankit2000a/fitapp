const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function query() {
  console.log('Querying all challenges from challenges_v2...');
  const { data, error } = await supabase
    .from('challenges_v2')
    .select('id, type, title, xp_reward, start_date, end_date, status');

  if (error) {
    console.error('Error fetching challenges:', error.message);
  } else {
    console.log('All Challenges:', JSON.stringify(data, null, 2));
  }
}

query();

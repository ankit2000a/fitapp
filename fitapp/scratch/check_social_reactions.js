const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('social_reactions').select('*').limit(1);
  if (error) {
    console.log('social_reactions check error:', error.message);
  } else {
    console.log('social_reactions exists! Rows:', data);
  }
}
check();

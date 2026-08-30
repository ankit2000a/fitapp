const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { count: cCount, error: cErr } = await supabase
    .from('challenges_v2')
    .select('*', { count: 'exact', head: true });
  console.log('challenges_v2 count:', cCount, cErr?.message || '');

  const { count: pCount, error: pErr } = await supabase
    .from('challenge_participations_v2')
    .select('*', { count: 'exact', head: true });
  console.log('challenge_participations_v2 count:', pCount, pErr?.message || '');

  if (cCount > 0) {
    const { data } = await supabase
      .from('challenges_v2')
      .select('*');
    console.log('Challenges in database:', JSON.stringify(data, null, 2));
  }
}

check();

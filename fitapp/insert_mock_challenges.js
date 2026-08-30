const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Inserting mock challenges...');

  // Create an active weekly challenge
  const monday = new Date();
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(monday.setDate(diff));
  startOfWeek.setHours(0,0,0,0);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);

  const { data: wChall, error: wErr } = await supabase
    .from('challenges_v2')
    .insert({
      type: 'weekly',
      template_key: 'protein_week',
      title: 'Protein Week (Test)',
      description: 'Hit your daily protein target on 5 different days.',
      metric: 'protein',
      target_value: 5,
      xp_reward: 100,
      start_date: startOfWeek.toISOString(),
      end_date: endOfWeek.toISOString(),
      status: 'ACTIVE'
    })
    .select()
    .single();

  if (wErr) {
    console.error('Error inserting weekly challenge:', wErr.message);
  } else {
    console.log('Weekly challenge inserted:', wChall.id);
  }

  // Create an active monthly challenge
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0,0,0,0);
  const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);

  const { data: mChall, error: mErr } = await supabase
    .from('challenges_v2')
    .insert({
      type: 'monthly',
      template_key: 'protein_master',
      title: 'July Protein Master (Test)',
      description: 'Hit protein goal 25 days.',
      metric: 'protein',
      target_value: 25,
      xp_reward: 500,
      start_date: startOfMonth.toISOString(),
      end_date: endOfMonth.toISOString(),
      status: 'ACTIVE'
    })
    .select()
    .single();

  if (mErr) {
    console.error('Error inserting monthly challenge:', mErr.message);
  } else {
    console.log('Monthly challenge inserted:', mChall.id);
  }
}

run();

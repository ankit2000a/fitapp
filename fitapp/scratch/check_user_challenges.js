const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  // Fetch all challenges
  const { data: challenges, error: cErr } = await supabase
    .from('challenges_v2')
    .select('*')
    .order('start_date', { ascending: false });
    
  console.log('\n--- Challenges in Database ---');
  challenges?.forEach(c => {
    console.log(`ID: ${c.id} | Type: ${c.type} | Title: ${c.title} | Status: ${c.status} | Start: ${c.start_date} | End: ${c.end_date}`);
  });
  
  // Fetch all participations
  const { data: participations, error: pErr } = await supabase
    .from('challenge_participations_v2')
    .select('*, challenge:challenges_v2(*), user:users(username)')
    .order('created_at', { ascending: false });
    
  console.log('\n--- All Participations ---');
  participations?.forEach(p => {
    console.log(`PartID: ${p.id} | User: ${p.user?.username} | Challenge: ${p.challenge?.title} (${p.challenge_id}) | Status: ${p.status} | Progress: ${p.progress_value} | Created: ${p.created_at}`);
  });
}
run();

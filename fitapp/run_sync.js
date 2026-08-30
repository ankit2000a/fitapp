const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching a user to run sync...');
  const { data: users, error: uErr } = await supabase.from('users').select('id, username').limit(5);
  if (uErr) {
    console.error('Error fetching users:', uErr.message);
    return;
  }
  console.log('Users found:', users);
  if (users && users.length > 0) {
    const targetUser = users[0];
    console.log(`Running sync_user_challenges for user: ${targetUser.username} (${targetUser.id})`);
    const { error: syncErr } = await supabase.rpc('sync_user_challenges', { 
      p_user_id: targetUser.id,
      p_timezone: 'UTC'
    });
    if (syncErr) {
      console.error('Error running RPC:', syncErr.message);
    } else {
      console.log('RPC sync completed successfully!');
      
      const { data: challenges } = await supabase.from('challenges_v2').select('*');
      console.log('Challenges now in database:', challenges);
    }
  } else {
    console.log('No users found in database to sync.');
  }
}

run();

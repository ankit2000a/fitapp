const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testRpc() {
  console.log('Calling sync_user_challenges RPC...');
  // Use a random/dummy UUID
  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  const { data, error } = await supabase.rpc('sync_user_challenges', { p_user_id: dummyUuid });
  if (error) {
    console.log('❌ RPC error:', error.message);
  } else {
    console.log('✅ RPC call succeeded! Return value:', data);
  }
}

testRpc();

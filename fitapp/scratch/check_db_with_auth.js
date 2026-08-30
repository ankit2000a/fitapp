const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tokenFilePath = "/Users/akshay/Library/Developer/CoreSimulator/Devices/4A05F8AA-75BD-4B0C-96D8-5BA29D90DB4E/data/Containers/Data/Application/70382C70-315E-4489-9503-17F362C6B3BE/Library/Application Support/com.fitapp.app/RCTAsyncLocalStorage_V1/bf68d624f7bbd3f052905bd154224f4d";

async function run() {
  console.log('Reading token file...');
  let tokenDataStr;
  try {
    tokenDataStr = fs.readFileSync(tokenFilePath, 'utf8');
  } catch (err) {
    console.error('Error reading token file:', err.message);
    return;
  }

  const session = JSON.parse(tokenDataStr);
  console.log('Setting session...');
  const { data: { user }, error: authErr } = await supabase.auth.setSession(session);
  if (authErr) {
    console.error('Auth error setting session:', authErr.message);
    return;
  }
  console.log('Authenticated user:', user.email, 'ID:', user.id);

  console.log('Querying users...');
  const { data: users, error: dbErr } = await supabase
    .from('users')
    .select('*');

  if (dbErr) {
    console.error('Database query error:', dbErr.message);
  } else {
    console.log('Total users fetched:', users.length);
    console.log('User records:');
    users.forEach(u => {
      console.log(`- ID: ${u.id}, name: "${u.name}", username: "${u.username}", first_name: "${u.first_name}", last_name: "${u.last_name}", level: ${u.level}, xp: ${u.xp}`);
    });
  }
}

run();

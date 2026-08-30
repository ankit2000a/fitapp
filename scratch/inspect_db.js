const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read and parse .env manually
const envText = fs.readFileSync('/Users/akshay/Documents/Build/FitApp/fitapp/.env', 'utf8');
const envConfig = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envConfig[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const SUPABASE_URL = envConfig.EXPO_PUBLIC_SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = envConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
  console.log('Fetching users...');
  const { data: users, error: uErr } = await supabase.from('users').select('*');
  if (uErr) console.error('Error fetching users:', uErr);
  else {
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`- ID: ${u.id}, Name: ${u.name}, Username: ${u.username}, Created: ${u.created_at}`);
    });
  }

  console.log('\nFetching health scores...');
  const { data: scores, error: sErr } = await supabase.from('health_scores').select('*');
  if (sErr) console.error('Error fetching scores:', sErr);
  else {
    console.log(`Found ${scores.length} scores:`);
    scores.forEach(s => {
      console.log(`- User: ${s.user_id}, Date: ${s.date}, Score: ${s.score}`);
    });
  }
}

inspect();

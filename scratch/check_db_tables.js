const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tables = ['users', 'friendships', 'food_logs', 'health_scores', 'social_reactions'];

async function testAll() {
  for (const table of tables) {
    console.log(`Checking table: ${table}...`);
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);
    if (error) {
      console.log(`❌ Table ${table} error:`, error.message);
    } else {
      console.log(`✅ Table ${table} exists! Rows found:`, data.length);
    }
  }
}

testAll();

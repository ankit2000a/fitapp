const { createClient } = require('@supabase/supabase-js');

// Replace this with your SUPABASE_SERVICE_ROLE_KEY (found in Supabase Dashboard -> Settings -> API)
const SERVICE_ROLE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';

if (SERVICE_ROLE_KEY === 'YOUR_SUPABASE_SERVICE_ROLE_KEY') {
  console.error('Error: Please replace SERVICE_ROLE_KEY with your actual Supabase Service Role Key first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

async function createTable() {
  console.log('Attempting to create future_projection table...');
  
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: `
      create table if not exists public.future_projection (
        user_id uuid references public.users(id) on delete cascade primary key,
        future_direction text not null,
        future_confidence integer not null,
        future_projection_data jsonb not null,
        future_message text not null,
        future_biggest_lever text not null,
        generated_at timestamptz default timezone('utc'::text, now()) not null
      );

      alter table public.future_projection enable row level security;

      drop policy if exists "Users can manage their own future projections" on public.future_projection;
      create policy "Users can manage their own future projections" 
        on public.future_projection 
        for all 
        using (auth.uid() = user_id);
    `
  });

  if (error) {
    console.error('SQL Execution Error:', error.message);
    console.log('\nIf "exec_sql" function is missing, please run the SQL directly in the Supabase Dashboard SQL Editor instead.');
  } else {
    console.log('Success! Table "future_projection" created with Row-Level Security policies.');
  }
}

createTable();

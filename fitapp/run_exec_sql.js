const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sql = `
-- 1. Delete all existing challenges to trigger re-seeding with new timezone-aware dates
DELETE FROM public.challenge_participations_v2;
DELETE FROM public.challenges_v2;

-- 2. Update ensure_active_challenges function to support timezone-aware seeding
create or replace function public.ensure_active_challenges(
  p_timezone text default 'UTC'
)
returns void as $$
declare
  v_tz text := coalesce(p_timezone, 'UTC');
  v_now_local timestamp;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_has_weekly boolean;
  v_has_monthly boolean;
  v_template_idx integer;
  v_title text;
  v_desc text;
  v_metric text;
  v_target integer;
  v_xp integer;
  v_month_name text;
begin
  -- Get current local timestamp in the user's timezone
  v_now_local := now() at time zone v_tz;
  
  -- Calculate start and end bounds in local time, then convert to timestamptz (UTC)
  v_week_start := date_trunc('week', v_now_local) at time zone v_tz;
  v_week_end := (date_trunc('week', v_now_local) + interval '7 days' - interval '1 second') at time zone v_tz;
  
  v_month_start := date_trunc('month', v_now_local) at time zone v_tz;
  v_month_end := (date_trunc('month', v_now_local) + interval '1 month' - interval '1 second') at time zone v_tz;

  -- Check if weekly exists for this local week
  select exists (
    select 1 from public.challenges_v2 
    where type = 'weekly' 
      and status = 'ACTIVE'
      and start_date = v_week_start
  ) into v_has_weekly;

  -- Check if monthly exists for this local month
  select exists (
    select 1 from public.challenges_v2 
    where type = 'monthly' 
      and status = 'ACTIVE'
      and start_date = v_month_start
  ) into v_has_monthly;

  -- Seed weekly if missing
  if not v_has_weekly then
    v_template_idx := extract(week from v_now_local)::integer % 9;
    
    if v_template_idx = 0 then
      v_title := 'Protein Week';
      v_desc := 'Hit your daily protein target on 5 different days.';
      v_metric := 'protein';
      v_target := 5;
      v_xp := 100;
    elsif v_template_idx = 1 then
      v_title := 'Perfect Nutrition Week';
      v_desc := 'Hit both protein and calorie targets on 4 different days.';
      v_metric := 'perfect_nutrition';
      v_target := 4;
      v_xp := 100;
    elsif v_template_idx = 2 then
      v_title := 'Mission Master Week';
      v_desc := 'Complete all daily missions 3 times this week.';
      v_metric := 'missions';
      v_target := 3;
      v_xp := 100;
    elsif v_template_idx = 3 then
      v_title := 'Score Sprint';
      v_desc := 'Achieve a Health Score above 70 on 4 different days.';
      v_metric := 'health_score';
      v_target := 4;
      v_xp := 100;
    elsif v_template_idx = 4 then
      v_title := 'Consistency Champion';
      v_desc := 'Maintain a 7-day active logging streak.';
      v_metric := 'streak';
      v_target := 7;
      v_xp := 100;
    elsif v_template_idx = 5 then
      v_title := 'Fat Loss Focus';
      v_desc := 'Stay within your daily calorie goal on 5 different days.';
      v_metric := 'calories';
      v_target := 5;
      v_xp := 100;
    elsif v_template_idx = 6 then
      v_title := 'Step Champion Week';
      v_desc := 'Walk 70,000 steps this week.';
      v_metric := 'steps';
      v_target := 70000;
      v_xp := 100;
    elsif v_template_idx = 7 then
      v_title := 'Calorie Burn Week';
      v_desc := 'Burn 3,500 active calories this week.';
      v_metric := 'active_calories';
      v_target := 3500;
      v_xp := 100;
    else
      v_title := 'Perfect Day Quest';
      v_desc := 'Achieve 4 Perfect Days this week.';
      v_metric := 'perfect_day';
      v_target := 4;
      v_xp := 100;
    end if;

    insert into public.challenges_v2 (type, template_key, title, description, metric, target_value, xp_reward, start_date, end_date, status)
    values ('weekly', 'weekly_' || v_template_idx, v_title, v_desc, v_metric, v_target, v_xp, v_week_start, v_week_end, 'ACTIVE');
  end if;

  -- Seed monthly if missing
  if not v_has_monthly then
    v_template_idx := extract(month from v_now_local)::integer;
    v_month_name := to_char(v_now_local, 'Month');
    v_month_name := trim(v_month_name);
    
    if v_template_idx in (1, 8) then
      v_title := v_month_name || ' Walk Master';
      v_desc := 'Walk 300,000 steps during this month.';
      v_metric := 'steps';
      v_target := 300000;
    elsif v_template_idx in (2, 9) then
      v_title := v_month_name || ' Protein Master';
      v_desc := 'Hit your daily protein target on 25 days.';
      v_metric := 'protein';
      v_target := 25;
    elsif v_template_idx in (3, 10) then
      v_title := v_month_name || ' Consistency Champion';
      v_desc := 'Maintain a 30-day active logging streak.';
      v_metric := 'streak';
      v_target := 30;
    elsif v_template_idx in (4, 11) then
      v_title := v_month_name || ' Health Score Cup';
      v_desc := 'Maintain an average Health Score above 70.';
      v_metric := 'health_score';
      v_target := 70;
    elsif v_template_idx in (5, 12) then
      v_title := v_month_name || ' Calorie Burn Master';
      v_desc := 'Burn 15,000 active calories during this month.';
      v_metric := 'active_calories';
      v_target := 15000;
    elsif v_template_idx = 6 then
      v_title := v_month_name || ' Fat Loss Challenge';
      v_desc := 'Stay within your calorie target on 25 days.';
      v_metric := 'calories';
      v_target := 25;
    else
      v_title := v_month_name || ' Transformation Cup';
      v_desc := 'Achieve 20 Perfect Days during this month.';
      v_metric := 'perfect_day';
      v_target := 20;
    end if;

    insert into public.challenges_v2 (type, template_key, title, description, metric, target_value, xp_reward, start_date, end_date, status)
    values ('monthly', 'monthly_' || v_template_idx, v_title, v_desc, v_metric, v_target, 500, v_month_start, v_month_end, 'ACTIVE');
  end if;
end;
$$ language plpgsql;

-- 3. Redefine sync_user_challenges to use timezone-aware seeding, calendar-day cutoff, and dynamic demotion
create or replace function public.sync_user_challenges(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns void as $$
declare
  r_duel record;
  r_part record;
  v_challenger_prog numeric;
  v_opponent_prog numeric;
  v_prog integer;
  v_target integer;
  v_xp integer;
  v_completed boolean;
  v_now timestamptz := now();
  v_tz text;
  v_local_start timestamptz;
  v_local_end timestamptz;
begin
  v_tz := coalesce(p_timezone, 'UTC');

  -- Step A: Ensure active challenges are scheduled in the user's local timezone context
  perform public.ensure_active_challenges(v_tz);

  -- Step B: Auto-enroll all new users (Weekly/Monthly: using physical completion capability cutoff)
  insert into public.challenge_participations_v2 (challenge_id, user_id, status)
  select 
    c.id, 
    p_user_id, 
    case 
      when c.type = 'weekly' then
        case 
          when c.metric in ('steps', 'active_calories') then 'ACTIVE'
          when c.metric = 'health_score' and c.target_value >= 70 then 'ACTIVE'
          when ((c.end_date at time zone v_tz)::date - (v_now at time zone v_tz)::date) + 1 >= c.target_value then 'ACTIVE'
          else 'INELIGIBLE'
        end
      when c.type = 'monthly' then
        case 
          when c.metric in ('steps', 'active_calories') then 'ACTIVE'
          when c.metric = 'health_score' and c.target_value >= 70 then 'ACTIVE'
          when ((c.end_date at time zone v_tz)::date - (v_now at time zone v_tz)::date) + 1 >= c.target_value then 'ACTIVE'
          else 'INELIGIBLE'
        end
      else 'INELIGIBLE'
    end as status
  from public.challenges_v2 c
  where c.status = 'ACTIVE'
    and v_now >= c.start_date
    and v_now <= c.end_date
    and not exists (
      select 1 from public.challenge_participations_v2 cp
      where cp.challenge_id = c.id
        and cp.user_id = p_user_id
    )
  on conflict do nothing;

  -- Step C: Calculate & Sync active duels
  for r_duel in 
    select * from public.duels 
    where (challenger_id = p_user_id or opponent_id = p_user_id)
      and status in ('ACTIVE', 'PENDING')
  loop
    v_challenger_prog := public.calculate_metric_progress(r_duel.challenger_id, r_duel.type, r_duel.start_date, r_duel.end_date, v_tz);
    v_opponent_prog := public.calculate_metric_progress(r_duel.opponent_id, r_duel.type, r_duel.start_date, r_duel.end_date, v_tz);
    
    if v_now >= r_duel.end_date then
      if v_challenger_prog > v_opponent_prog then
        update public.duels 
        set challenger_progress = v_challenger_prog,
            opponent_progress = v_opponent_prog,
            status = 'COMPLETED',
            winner_id = r_duel.challenger_id
        where id = r_duel.id;
      elsif v_opponent_prog > v_challenger_prog then
        update public.duels 
        set challenger_progress = v_challenger_prog,
            opponent_progress = v_opponent_prog,
            status = 'COMPLETED',
            winner_id = r_duel.opponent_id
        where id = r_duel.id;
      else
        update public.duels 
        set challenger_progress = v_challenger_prog,
            opponent_progress = v_opponent_prog,
            status = 'COMPLETED',
            winner_id = null
        where id = r_duel.id;
      end if;
    else
      update public.duels 
      set challenger_progress = v_challenger_prog,
          opponent_progress = v_opponent_prog,
          status = 'ACTIVE'
      where id = r_duel.id;
    end if;
  end loop;

  -- Step D: Calculate & Sync active weekly/monthly enrollments
  for r_part in 
    select cp.*, c.metric, c.target_value, c.xp_reward, c.end_date as c_end_date, c.start_date as c_start_date
    from public.challenge_participations_v2 cp
    join public.challenges_v2 c on c.id = cp.challenge_id
    where cp.user_id = p_user_id
      and cp.status in ('ACTIVE', 'INELIGIBLE')
  loop
    v_local_start := (r_part.c_start_date at time zone 'UTC') at time zone v_tz;
    v_local_end := (r_part.c_end_date at time zone 'UTC') at time zone v_tz;
    
    v_prog := public.calculate_metric_progress(p_user_id, r_part.metric, r_part.c_start_date, r_part.c_end_date, v_tz)::integer;
    v_target := r_part.target_value;
    v_xp := r_part.xp_reward;
    v_completed := false;
    
    -- Check if active user can still physically complete the challenge. 
    -- If they have missed too many days and cannot hit the target, demote to INELIGIBLE (Practice Mode).
    if r_part.status = 'ACTIVE' 
       and r_part.metric not in ('steps', 'active_calories') 
       and not (r_part.metric = 'health_score' and v_target >= 70) 
    then
      if v_prog + ((r_part.c_end_date at time zone v_tz)::date - (v_now at time zone v_tz)::date) + 1 < v_target then
        update public.challenge_participations_v2
        set status = 'INELIGIBLE'
        where id = r_part.id;
        r_part.status := 'INELIGIBLE';
      end if;
    end if;
    
    if v_prog >= v_target then
      v_completed := true;
    end if;

    if v_completed then
      if r_part.status = 'ACTIVE' then
        -- Reward eligible user completed
        update public.challenge_participations_v2
        set status = 'COMPLETED',
            progress_value = v_prog,
            completed_at = v_now
        where id = r_part.id;
        
        update public.users
        set xp = coalesce(xp, 0) + v_xp
        where id = p_user_id;
      else
        -- Practice mode user completed challenge visually (No XP / No Leaderboard)
        update public.challenge_participations_v2
        set status = 'INELIGIBLE_COMPLETED',
            progress_value = v_prog,
            completed_at = v_now
        where id = r_part.id;
      end if;
    elsif v_now >= v_local_end then
      if r_part.status = 'ACTIVE' then
        update public.challenge_participations_v2
        set progress_value = v_prog,
            status = 'EXPIRED'
        where id = r_part.id;
      else
        update public.challenge_participations_v2
        set progress_value = v_prog,
            status = 'INELIGIBLE_EXPIRED'
        where id = r_part.id;
      end if;
    else
      update public.challenge_participations_v2
      set progress_value = v_prog
      where id = r_part.id;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

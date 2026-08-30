create or replace function public.ensure_active_challenges()
returns void as $$
declare
  v_now timestamptz := now();
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
  v_week_start := date_trunc('week', v_now);
  v_week_end := v_week_start + interval '7 days' - interval '1 second';
  v_month_start := date_trunc('month', v_now);
  v_month_end := v_month_start + interval '1 month' - interval '1 second';

  -- Check active weekly
  select exists (
    select 1 from public.challenges_v2 
    where type = 'weekly' 
      and status = 'ACTIVE'
      and start_date <= v_now 
      and end_date >= v_now
  ) into v_has_weekly;

  -- Check active monthly
  select exists (
    select 1 from public.challenges_v2 
    where type = 'monthly' 
      and status = 'ACTIVE'
      and start_date <= v_now 
      and end_date >= v_now
  ) into v_has_monthly;

  -- Seed weekly if missing
  if not v_has_weekly then
    v_template_idx := extract(week from v_now)::integer % 8;
    
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
      v_title := 'Muscle Builder Week';
      v_desc := 'Hit both calorie and protein targets on 5 different days.';
      v_metric := 'muscle_gain';
      v_target := 5;
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
    v_template_idx := extract(month from v_now)::integer;
    v_month_name := to_char(v_now, 'Month');
    v_month_name := trim(v_month_name);
    
    if v_template_idx in (1, 8) then
      v_title := v_month_name || ' Transformation Cup';
      v_desc := 'Achieve 20 Perfect Days during this month.';
      v_metric := 'perfect_day';
      v_target := 20;
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
      v_title := v_month_name || ' Mission Legend';
      v_desc := 'Complete all daily missions 20 times during this month.';
      v_metric := 'missions';
      v_target := 20;
    elsif v_template_idx = 6 then
      v_title := v_month_name || ' Fat Loss Challenge';
      v_desc := 'Stay within your calorie target on 25 days.';
      v_metric := 'calories';
      v_target := 25;
    else
      v_title := v_month_name || ' Muscle Gain Challenge';
      v_desc := 'Hit both calorie and protein targets on 25 days.';
      v_metric := 'muscle_gain';
      v_target := 25;
    end if;

    insert into public.challenges_v2 (type, template_key, title, description, metric, target_value, xp_reward, start_date, end_date, status)
    values ('monthly', 'monthly_' || v_template_idx, v_title, v_desc, v_metric, v_target, 500, v_month_start, v_month_end, 'ACTIVE');
  end if;
end;
$$ language plpgsql;
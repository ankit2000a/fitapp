create or replace function public.calculate_metric_progress(
  p_user_id uuid,
  p_metric text,
  p_start timestamptz,
  p_end timestamptz,
  p_timezone text default 'UTC'
)
returns numeric as $$
declare
  v_result numeric := 0;
  v_local_start timestamptz;
  v_local_end timestamptz;
  v_tz text;
begin
  v_tz := coalesce(p_timezone, 'UTC');
  v_local_start := (p_start at time zone 'UTC') at time zone v_tz;
  v_local_end := (p_end at time zone 'UTC') at time zone v_tz;

  if p_metric = 'health_score' then
    select coalesce(avg(score), 0) into v_result
    from public.health_scores
    where user_id = p_user_id
      and date >= p_start::date::text
      and date <= p_end::date::text;
      
  elsif p_metric = 'perfect_day' or p_metric = 'missions' then
    select count(*) into v_result
    from public.health_scores
    where user_id = p_user_id
      and date >= p_start::date::text
      and date <= p_end::date::text
      and score >= 90;
      
  elsif p_metric = 'protein' or p_metric = 'protein_battle' then
    select coalesce(count(*), 0) into v_result
    from (
      select (logged_at at time zone v_tz)::date as log_date, sum(protein_g) as daily_protein
      from public.food_logs
      where user_id = p_user_id
        and logged_at >= v_local_start
        and logged_at <= v_local_end
      group by (logged_at at time zone v_tz)::date
    ) t
    join public.users u on u.id = p_user_id
    where daily_protein >= coalesce(u.protein_goal_g, 150);
    
  elsif p_metric = 'perfect_nutrition' or p_metric = 'muscle_gain' then
    select coalesce(count(*), 0) into v_result
    from (
      select (logged_at at time zone v_tz)::date as log_date, sum(protein_g) as daily_protein, sum(calories) as daily_calories
      from public.food_logs
      where user_id = p_user_id
        and logged_at >= v_local_start
        and logged_at <= v_local_end
      group by (logged_at at time zone v_tz)::date
    ) t
    join public.users u on u.id = p_user_id
    where daily_protein >= coalesce(u.protein_goal_g, 150)
      and daily_calories >= coalesce(u.calorie_goal, 2000) * 0.9
      and daily_calories <= coalesce(u.calorie_goal, 2000) * 1.1;

  elsif p_metric = 'calories' or p_metric = 'fat_loss' then
    select coalesce(count(*), 0) into v_result
    from (
      select (logged_at at time zone v_tz)::date as log_date, sum(calories) as daily_calories
      from public.food_logs
      where user_id = p_user_id
        and logged_at >= v_local_start
        and logged_at <= v_local_end
      group by (logged_at at time zone v_tz)::date
    ) t
    join public.users u on u.id = p_user_id
    where daily_calories <= coalesce(u.calorie_goal, 2000)
      and daily_calories > 0;

  elsif p_metric = 'streak' or p_metric = 'consistency' then
    with dates as (
      select distinct (logged_at at time zone v_tz)::date as d
      from public.food_logs
      where user_id = p_user_id
        and logged_at >= v_local_start
        and logged_at <= v_local_end
      union
      select date::date as d
      from public.health_scores
      where user_id = p_user_id
        and date >= p_start::date::text
        and date <= p_end::date::text
    ),
    grp as (
      select d, d - (row_number() over (order by d))::int as g
      from dates
    ),
    streak_lengths as (
      select count(*) as len
      from grp
      group by g
    )
    select coalesce(max(len), 0) into v_result
    from streak_lengths;

  elsif p_metric = 'steps' then
    select coalesce(sum(steps), 0) into v_result
    from public.health_scores
    where user_id = p_user_id
      and date >= p_start::date::text
      and date <= p_end::date::text;

  elsif p_metric = 'active_calories' then
    select coalesce(sum(active_calories), 0) into v_result
    from public.health_scores
    where user_id = p_user_id
      and date >= p_start::date::text
      and date <= p_end::date::text;

  end if;

  return v_result;
end;
$$ language plpgsql;
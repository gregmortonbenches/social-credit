-- Creates three denouncement cases. Run AFTER 02_mixed_week.sql.
--
--   1. You denounce Natasha for her overdue task. Created 25 hours ago and
--      unanswered, so it is due to be settled as AUTO-GUILTY (05_settle_now.sql,
--      or the hourly cron, whichever comes first).
--   2. Natasha denounces YOU. Fresh, unanswered: open the Collective page and
--      respond. If you leave it for 24 hours you are auto-guilty and lose the
--      task's credits.
--   3. Boris denounces Mao-Mao, who has already responded. You are a juror: vote
--      on it in the app. Then run 04_fake_votes.sql and 05_settle_now.sql.
--
-- Safe to run twice (fixed ids).

do $$
declare
  v_me         uuid;
  v_collective uuid;
  v_natasha    constant uuid := 'feed0000-0000-0000-0000-000000000002';
  v_boris      constant uuid := 'feed0000-0000-0000-0000-000000000001';
  v_mao        constant uuid := 'feed0000-0000-0000-0000-000000000003';
  v_a          uuid;
begin
  select p.id, cm.collective_id into v_me, v_collective
  from profiles p join collective_members cm on cm.user_id = p.id and cm.status = 'active'
  where p.email = 'greg_morton@hotmail.co.uk'
  order by cm.joined_at desc limit 1;

  -- 1. You v Natasha, 25 hours old.
  select id into v_a from weekly_assignments
  where user_id = v_natasha order by due_date limit 1;
  if v_a is null then raise exception 'Natasha has no assignments: press Force Assign Tasks first'; end if;
  insert into denouncements (id, collective_id, accuser_id, accused_id, assignment_id, status, created_at)
  values ('feed0000-0000-0000-0000-00000000ca01', v_collective, v_me, v_natasha, v_a,
          'open', now() - interval '25 hours')
  on conflict (id) do nothing;

  -- 2. Natasha v you, fresh.
  select id into v_a from weekly_assignments
  where user_id = v_me order by due_date limit 1;
  if v_a is null then raise exception 'You have no assignments: press Force Assign Tasks first'; end if;
  insert into denouncements (id, collective_id, accuser_id, accused_id, assignment_id, status)
  values ('feed0000-0000-0000-0000-00000000ca02', v_collective, v_natasha, v_me, v_a, 'open')
  on conflict (id) do nothing;

  -- 3. Boris v Mao-Mao, already answered.
  select id into v_a from weekly_assignments
  where user_id = v_mao order by due_date limit 1;
  if v_a is null then raise exception 'Mao-Mao has no assignments: press Force Assign Tasks first'; end if;
  insert into denouncements (id, collective_id, accuser_id, accused_id, assignment_id,
                             status, explanation, created_at, responded_at)
  values ('feed0000-0000-0000-0000-00000000ca03', v_collective, v_boris, v_mao, v_a,
          'responded', 'The washing up was done on Tuesday. The photograph was taken by a counter-revolutionary.',
          now() - interval '1 hour', now() - interval '30 minutes')
  on conflict (id) do nothing;
end $$;

select d.id, d.status, d.outcome, a.username as accuser, b.username as accused, d.created_at
from denouncements d
join profiles a on a.id = d.accuser_id
join profiles b on b.id = d.accused_id
where d.id::text like 'feed0000-%'
order by d.id;

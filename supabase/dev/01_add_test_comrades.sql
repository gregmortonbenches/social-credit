-- Adds three test comrades (Boris, Natasha, Mao-Mao) to YOUR collective.
--
-- They are real auth + profile + membership rows that cannot sign in, so they
-- show up in the Scoreboard, the task list and the denounce picker. Run
-- 99_remove_test_comrades.sql to take them all out again.
--
-- Run in the Supabase dashboard SQL editor (project mtoypwkkabwwrxtiybnp).
-- Safe to run twice.

do $$
declare
  v_email      constant text := 'greg_morton@hotmail.co.uk';  -- your account
  v_collective uuid;
  v_names      constant text[] := array['Boris', 'Natasha', 'Mao-Mao'];
  v_id         uuid;
  i            int;
begin
  select cm.collective_id into v_collective
  from collective_members cm
  join profiles p on p.id = cm.user_id
  where p.email = v_email and cm.status = 'active'
  order by cm.joined_at desc
  limit 1;

  if v_collective is null then
    raise exception 'No active collective found for %', v_email;
  end if;

  for i in 1..3 loop
    v_id := ('feed0000-0000-0000-0000-00000000000' || i)::uuid;

    -- The empty-string token columns matter: GoTrue fails to read a user row
    -- where they are NULL, which breaks the dashboard's Users page.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'seed-' || lower(v_names[i]) || '@seed.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', v_names[i], 'seed', true),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    -- The profile row is created by the handle_new_user trigger.
    insert into collective_members (collective_id, user_id, status)
    values (v_collective, v_id, 'active')
    on conflict (collective_id, user_id) do update set status = 'active';
  end loop;
end $$;

select p.username, p.email, cm.status
from collective_members cm
join profiles p on p.id = cm.user_id
where cm.collective_id = (
  select collective_id from collective_members
  where user_id = (select id from profiles where email = 'greg_morton@hotmail.co.uk')
  order by joined_at desc limit 1
)
order by p.username;

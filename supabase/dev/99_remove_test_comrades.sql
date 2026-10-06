-- Removes everything the other scripts added, and puts YOUR credits back to
-- what they were: any credit a test case paid you or took from you is reversed
-- and its ledger row deleted.
--
-- Afterwards the tasks the test comrades held are unassigned for the week, so
-- press Force Assign Tasks again if you want them redistributed.
-- Safe to run twice.

do $$
declare
  v_fakes uuid[] := array(select id from auth.users where email like 'seed-%@seed.invalid');
  v_cases uuid[];
  r record;
begin
  if coalesce(array_length(v_fakes, 1), 0) = 0 then
    return;
  end if;

  select array_agg(id) into v_cases from denouncements
  where accuser_id = any(v_fakes) or accused_id = any(v_fakes);

  -- Reverse the effect on real members of settled test cases.
  for r in
    select user_id, sum(delta) as total
    from credit_ledger
    where reference_id = any(coalesce(v_cases, '{}'))
      and user_id is not null and user_id <> all(v_fakes)
    group by user_id
  loop
    update profiles set total_credits = total_credits - r.total where id = r.user_id;
  end loop;

  delete from credit_ledger where reference_id = any(coalesce(v_cases, '{}'));
  delete from credit_ledger where user_id = any(v_fakes);

  delete from denouncements where id = any(coalesce(v_cases, '{}'));  -- votes cascade
  delete from weekly_assignments where user_id = any(v_fakes);
  delete from auth.users where id = any(v_fakes);  -- profiles, memberships cascade
end $$;

select p.username, p.email, cm.status
from collective_members cm join profiles p on p.id = cm.user_id
where cm.collective_id = (
  select collective_id from collective_members
  where user_id = (select id from profiles where email = 'greg_morton@hotmail.co.uk')
  order by joined_at desc limit 1
);

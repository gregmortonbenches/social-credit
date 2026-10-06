-- Gives the test comrades a believable week. Run AFTER pressing "Force Assign
-- Tasks" in Settings, so that everyone, test comrades included, has assignments.
--
--   Boris     first task done, and paid
--   Natasha   first task OVERDUE (due yesterday, still pending)
--   Mao-Mao   untouched
--
-- Only the test comrades' rows are changed. Safe to run twice.

do $$
declare
  r record;
begin
  -- Boris: complete and pay his earliest-due task (once).
  select id, user_id, collective_id, credits_value into r
  from weekly_assignments
  where user_id = 'feed0000-0000-0000-0000-000000000001' and status = 'pending'
    and not exists (select 1 from weekly_assignments
                    where user_id = 'feed0000-0000-0000-0000-000000000001' and status = 'complete')
  order by due_date limit 1;
  if found then
    update weekly_assignments set status = 'complete', completed_at = now() where id = r.id;
    if coalesce(r.credits_value, 0) > 0 then
      perform credits_transaction(r.user_id, r.collective_id, r.credits_value, 'task_complete', r.id);
    end if;
  end if;

  -- Natasha: make her earliest-due task overdue (once).
  select id into r
  from weekly_assignments
  where user_id = 'feed0000-0000-0000-0000-000000000002' and status = 'pending'
    and not exists (select 1 from weekly_assignments
                    where user_id = 'feed0000-0000-0000-0000-000000000002'
                      and status = 'pending' and due_date < now())
  order by due_date limit 1;
  if found then
    update weekly_assignments set due_date = now() - interval '1 day' where id = r.id;
  end if;
end $$;

select p.username, t.name as task, wa.status, wa.due_date, wa.credits_value
from weekly_assignments wa
join profiles p on p.id = wa.user_id
join task_library t on t.id = wa.task_id
where wa.user_id in (select id from auth.users where email like 'seed-%@seed.invalid')
order by p.username, wa.due_date;

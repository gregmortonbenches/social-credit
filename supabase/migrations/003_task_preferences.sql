-- ============================================================
-- Social Credit — Migration 003: Task Preferences
-- Replaces interactive snake draft with preference-based auto-assignment.
-- ============================================================

-- ============================================================
-- TASK PREFERENCES
-- Each user ranks tasks per collective (rank 1 = most preferred).
-- Ranks need not be contiguous; unranked tasks are assigned last.
-- ============================================================
create table task_preferences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  collective_id uuid not null references collectives(id) on delete cascade,
  task_id       uuid not null references task_library(id) on delete cascade,
  rank          int not null check (rank >= 1),
  updated_at    timestamptz not null default now(),
  unique (user_id, collective_id, task_id)
);

alter table task_preferences enable row level security;

create policy "Members can read preferences in their collective"
  on task_preferences for select
  using (
    collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status in ('active','pending')
    )
  );

create policy "Users can manage their own preferences"
  on task_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update their own preferences"
  on task_preferences for update
  using (user_id = auth.uid());

create policy "Users can delete their own preferences"
  on task_preferences for delete
  using (user_id = auth.uid());

-- ============================================================
-- DRAFT STATE: drop interactive columns, keep assignment tracker
-- draft_order / current_turn_index / turn_deadline are no longer used.
-- status: pending = not yet assigned this week, complete = assigned.
-- ============================================================
alter table draft_state drop column if exists draft_order;
alter table draft_state drop column if exists current_turn_index;
alter table draft_state drop column if exists turn_deadline;

-- Fix any 'active' rows BEFORE tightening the constraint
update draft_state set status = 'pending' where status = 'active';

-- Drop whichever check constraint Postgres auto-named for the status column
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'draft_state'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';
  if cname is not null then
    execute 'alter table draft_state drop constraint ' || quote_ident(cname);
  end if;
end $$;

alter table draft_state add constraint draft_state_status_check
  check (status in ('pending','complete'));

-- Enable realtime on task_preferences
alter publication supabase_realtime add table task_preferences;

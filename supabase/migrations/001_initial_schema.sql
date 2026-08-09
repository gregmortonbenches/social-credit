-- ============================================================
-- Social Credit — Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES
-- ============================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text not null,
  email           text not null,
  total_credits   int not null default 500,
  device_push_token text,
  anonymous_token uuid unique default gen_random_uuid(),
  is_admin        boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- ============================================================
-- COLLECTIVES
-- ============================================================
create table collectives (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  display_name text not null,
  code         char(5) not null unique,
  timezone     text not null,
  created_by   uuid not null references profiles(id),
  rooms        jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

alter table collectives enable row level security;

create policy "Members can read their collective"
  on collectives for select
  using (
    id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Members can update their collective"
  on collectives for update
  using (
    id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Authenticated users can insert a collective"
  on collectives for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- COLLECTIVE MEMBERS
-- ============================================================
create table collective_members (
  id               uuid primary key default gen_random_uuid(),
  collective_id    uuid not null references collectives(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  status           text not null check (status in ('active','paused','pending','left')),
  joined_at        timestamptz not null default now(),
  pause_started_at timestamptz,
  pause_ended_at   timestamptz,
  unique (collective_id, user_id)
);

alter table collective_members enable row level security;

create policy "Members can read their collective_members rows"
  on collective_members for select
  using (
    collective_id in (
      select collective_id from collective_members cm2
      where cm2.user_id = auth.uid() and cm2.status = 'active'
    )
  );

create policy "Users can insert themselves as member"
  on collective_members for insert
  with check (user_id = auth.uid());

create policy "Users can update own membership"
  on collective_members for update
  using (user_id = auth.uid());

-- ============================================================
-- TASK LIBRARY
-- ============================================================
create table task_library (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  room_type                text not null,
  description              text,
  is_custom                boolean not null default false,
  created_by_collective_id uuid references collectives(id)
);

alter table task_library enable row level security;

create policy "Authenticated users can read task library"
  on task_library for select
  using (
    is_custom = false
    or created_by_collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Members can insert custom tasks"
  on task_library for insert
  with check (
    auth.role() = 'authenticated'
    and (
      is_custom = false
      or created_by_collective_id in (
        select collective_id from collective_members
        where user_id = auth.uid() and status = 'active'
      )
    )
  );

-- Seed default tasks
insert into task_library (name, room_type, is_custom) values
  ('Take out the bins',  'hallway',     false),
  ('Clean the bathroom', 'bathroom',    false),
  ('Washing up',         'kitchen',     false),
  ('Hoover and mop',     'living_room', false),
  ('General clean',      'living_room', false),
  ('Clean the kitchen',  'kitchen',     false),
  ('Clean the bedroom',  'bedroom',     false),
  ('Clean living room',  'living_room', false),
  ('Clean the hallway',  'hallway',     false),
  ('Clean dining room',  'dining_room', false);

-- ============================================================
-- WEEKLY ASSIGNMENTS
-- ============================================================
create table weekly_assignments (
  id            uuid primary key default gen_random_uuid(),
  collective_id uuid not null references collectives(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  task_id       uuid not null references task_library(id),
  week_start    date not null,
  due_date      timestamptz not null,
  completed_at  timestamptz,
  credits_value int,
  status        text not null default 'pending'
                check (status in ('pending','complete','failed','reassigned'))
);

alter table weekly_assignments enable row level security;

create policy "Members can read collective assignments"
  on weekly_assignments for select
  using (
    collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Members can update own assignments"
  on weekly_assignments for update
  using (
    user_id = auth.uid()
    and collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Service role can insert assignments"
  on weekly_assignments for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- DENOUNCEMENTS
-- ============================================================
create table denouncements (
  id             uuid primary key default gen_random_uuid(),
  collective_id  uuid not null references collectives(id) on delete cascade,
  accuser_id     uuid not null references profiles(id),
  accused_id     uuid not null references profiles(id),
  assignment_id  uuid not null references weekly_assignments(id),
  status         text not null default 'open'
                 check (status in ('open','responded','auto_guilty','voted','resolved')),
  explanation    text,
  outcome        text check (outcome in ('upheld','dismissed')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  resolved_at    timestamptz,
  check (accuser_id <> accused_id)
);

alter table denouncements enable row level security;

create policy "Members can read collective denouncements"
  on denouncements for select
  using (
    collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Members can insert denouncements"
  on denouncements for insert
  with check (
    accuser_id = auth.uid()
    and collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Accused can update own denouncement (submit explanation)"
  on denouncements for update
  using (accused_id = auth.uid());

-- ============================================================
-- DENOUNCEMENT VOTES
-- ============================================================
create table denouncement_votes (
  id              uuid primary key default gen_random_uuid(),
  denouncement_id uuid not null references denouncements(id) on delete cascade,
  voter_id        uuid not null references profiles(id),
  vote            text not null check (vote in ('uphold','dismiss')),
  created_at      timestamptz not null default now(),
  unique (denouncement_id, voter_id)
);

alter table denouncement_votes enable row level security;

create policy "Members can read votes for their collective"
  on denouncement_votes for select
  using (
    denouncement_id in (
      select id from denouncements
      where collective_id in (
        select collective_id from collective_members
        where user_id = auth.uid() and status = 'active'
      )
    )
  );

create policy "Members can cast votes"
  on denouncement_votes for insert
  with check (
    voter_id = auth.uid()
    and denouncement_id in (
      select id from denouncements
      where collective_id in (
        select collective_id from collective_members
        where user_id = auth.uid() and status = 'active'
      )
    )
  );

-- ============================================================
-- DRAFT STATE
-- ============================================================
create table draft_state (
  id                  uuid primary key default gen_random_uuid(),
  collective_id       uuid not null references collectives(id) on delete cascade,
  week_start          date not null,
  draft_order         jsonb not null default '[]',
  current_turn_index  int not null default 0,
  turn_deadline       timestamptz,
  status              text not null default 'pending'
                      check (status in ('pending','active','complete')),
  unique (collective_id, week_start)
);

alter table draft_state enable row level security;

create policy "Members can read draft state"
  on draft_state for select
  using (
    collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "Members can update draft state (pick tasks)"
  on draft_state for update
  using (
    collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- ============================================================
-- ACHIEVEMENTS
-- ============================================================
create table achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  achievement_key text not null,
  collective_id   uuid references collectives(id) on delete set null,
  unlocked_at     timestamptz not null default now(),
  unique (user_id, achievement_key)
);

alter table achievements enable row level security;

create policy "Users can read own achievements"
  on achievements for select
  using (user_id = auth.uid());

create policy "Members can read collective achievements"
  on achievements for select
  using (
    collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- ============================================================
-- CREDIT LEDGER (append-only, no client inserts)
-- ============================================================
create table credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  collective_id uuid references collectives(id) on delete set null,
  delta         int not null,
  reason        text not null,
  reference_id  uuid,
  created_at    timestamptz not null default now()
);

alter table credit_ledger enable row level security;

create policy "Members can read own credit ledger"
  on credit_ledger for select
  using (
    user_id = auth.uid()
    or collective_id in (
      select collective_id from collective_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- No INSERT policy for clients — only service role (Edge Functions) can write
create policy "Service role only insert"
  on credit_ledger for insert
  with check (false);

-- ============================================================
-- APP CONFIG
-- ============================================================
create table app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table app_config enable row level security;

create policy "Authenticated users can read app_config"
  on app_config for select
  using (auth.role() = 'authenticated');

create policy "Admins can update app_config"
  on app_config for update
  using (
    (select is_admin from profiles where id = auth.uid()) = true
  );

-- ============================================================
-- SUPABASE REALTIME
-- ============================================================
alter publication supabase_realtime add table weekly_assignments;
alter publication supabase_realtime add table denouncements;
alter publication supabase_realtime add table collective_members;
alter publication supabase_realtime add table credit_ledger;
alter publication supabase_realtime add table draft_state;

-- ============================================================
-- CREDITS TRANSACTION RPC
-- Atomic: inserts ledger row + updates profiles.total_credits
-- Called by Edge Functions only (service role key required)
-- ============================================================
create or replace function credits_transaction(
  p_user_id       uuid,
  p_collective_id uuid,
  p_delta         int,
  p_reason        text,
  p_reference_id  uuid default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into credit_ledger (user_id, collective_id, delta, reason, reference_id)
  values (p_user_id, p_collective_id, p_delta, p_reason, p_reference_id);

  update profiles
  set total_credits = total_credits + p_delta
  where id = p_user_id;
end;
$$;

-- Only service role can call this function via RPC
revoke execute on function credits_transaction from anon, authenticated;
grant execute on function credits_transaction to service_role;

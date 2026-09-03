-- Pathways — initial Supabase schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
--
-- Design decisions baked in here:
--   1. Every table has user_id. No exceptions. It is not nullable.
--   2. Row-level security is ON for every table, with policies that compare
--      user_id to auth.uid(). A query cannot see another user's rows even if
--      the application code forgets to filter. This is the safety net.
--   3. profiles.plan exists from day one so a paywall has somewhere to check
--      later, without a migration at the moment you need it most.
--   4. updated_at on every row, so last-write-wins sync works between devices.

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created automatically on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  plan        text not null default 'free',   -- 'free' | 'pro'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- entries: one per day. The measurement stream everything else is judged against.
-- ---------------------------------------------------------------------------
create table public.entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  date          date not null,
  energy        smallint check (energy between 1 and 10),
  inflammation  smallint check (inflammation between 1 and 10),
  flare         boolean not null default false,
  severity      smallint check (severity between 1 and 5),
  activity      text,                          -- rest | light | moderate | hard
  activity_note text,
  notes         text,
  taken         jsonb not null default '[]',   -- intervention ids checked off
  meals_done    jsonb not null default '[]',   -- planKeys of planned meals eaten
  wo_status     jsonb not null default '{}',   -- planKey -> done|modified|skipped
  extras        jsonb not null default '[]',   -- unplanned meals/snacks/drinks
  extra_workouts jsonb not null default '[]',  -- unplanned activity
  updated_at    timestamptz not null default now(),
  unique (user_id, date)                       -- one entry per person per day
);

-- ---------------------------------------------------------------------------
-- foods: reference table, not a diary
-- ---------------------------------------------------------------------------
create table public.foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  category    text,
  status      text not null default 'unknown', -- tolerated|not tolerated|unknown|testing
  confidence  text not null default 'low',     -- low|medium|high
  last_tested date,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- interventions: supplements and treatments, western and otherwise
-- ---------------------------------------------------------------------------
create table public.interventions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  type        text not null default 'supplement', -- supplement|western|naturopathic|lifestyle
  dose        text,
  start_date  date,
  end_date    date,                                -- null means currently on
  source      text,                                -- who recommended it
  status      text not null default 'baseline',    -- baseline|testing|established|discontinued
  outcome     text,
  updated_at  timestamptz not null default now()
);

-- Enforces the one-open-test rule at the database level, not just in the UI.
-- Without this, two devices could each open a test window while offline.
create unique index one_open_test_per_user
  on public.interventions (user_id)
  where status = 'testing';

-- ---------------------------------------------------------------------------
-- meal_plan / workout_plan: imported schedules, read-only in the app
-- ---------------------------------------------------------------------------
create table public.meal_plan (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null,
  meal       text not null,
  items      text,
  plan_key   text not null,        -- "meal|items", how entries reference this row
  updated_at timestamptz not null default now()
);

create table public.workout_plan (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null,
  workout    text not null,
  details    text,
  plan_key   text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for the queries the app actually runs
-- ---------------------------------------------------------------------------
create index on public.entries (user_id, date desc);
create index on public.foods (user_id, status);
create index on public.interventions (user_id, status);
create index on public.meal_plan (user_id, date);
create index on public.workout_plan (user_id, date);

-- ---------------------------------------------------------------------------
-- Row-level security. This is the part that matters most.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.entries       enable row level security;
alter table public.foods         enable row level security;
alter table public.interventions enable row level security;
alter table public.meal_plan     enable row level security;
alter table public.workout_plan  enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own rows" on public.entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.interventions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.meal_plan
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.workout_plan
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest without trusting the client
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger t_entries       before update on public.entries       for each row execute function public.touch_updated_at();
create trigger t_foods         before update on public.foods         for each row execute function public.touch_updated_at();
create trigger t_interventions before update on public.interventions for each row execute function public.touch_updated_at();
create trigger t_meal_plan     before update on public.meal_plan     for each row execute function public.touch_updated_at();
create trigger t_workout_plan  before update on public.workout_plan  for each row execute function public.touch_updated_at();
create trigger t_profiles      before update on public.profiles      for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Create a profile row automatically when someone signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

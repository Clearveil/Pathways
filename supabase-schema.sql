-- Pathways schema. Regenerated 2026-09-03 from the app's actual data shape.
-- Already applied to the live project as migrations `pathways_initial_schema`
-- and `lock_down_handle_new_user`. Kept here as the reference copy.
--
-- Design decisions:
--   1. Every table has user_id, not nullable. Primary keys are (user_id, id).
--      The app generates ids client-side (short random strings for old rows,
--      UUIDs for new ones), so id is text and can never collide across users.
--   2. Row-level security is ON everywhere. A query cannot see another user's
--      rows even if application code forgets to filter. Safety net, not plan.
--   3. One open test window at a time is enforced by a trigger that looks at
--      BOTH interventions and foods, plus a partial unique index on each table.
--   4. updated_at is set by the database on every update, so it can't drift.
--   5. profiles.plan exists from day one so a paywall has somewhere to check.

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created automatically on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  plan        text not null default 'free',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- entries: one per day. The measurement stream everything else is judged against.
-- ---------------------------------------------------------------------------
create table public.entries (
  user_id        uuid not null references auth.users on delete cascade,
  id             text not null,
  date           date not null,
  energy         smallint check (energy between 1 and 10),
  inflammation   smallint check (inflammation between 1 and 10),
  flare          boolean not null default false,
  severity       smallint check (severity between 1 and 5),
  activity       text check (activity in ('rest','light','moderate','hard')),
  activity_note  text,
  notes          text,
  taken          jsonb not null default '[]',   -- intervention ids checked off
  meals_done     jsonb not null default '[]',   -- plan keys of planned meals eaten
  wo_status      jsonb not null default '{}',   -- plan key -> done | modified | skipped
  extras         jsonb not null default '[]',   -- unplanned meals: [{id, meal, items}]
  extra_workouts jsonb not null default '[]',   -- unplanned activity: [{id, workout, details}]
  updated_at     timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- foods: reference list, not a diary
-- ---------------------------------------------------------------------------
create table public.foods (
  user_id      uuid not null references auth.users on delete cascade,
  id           text not null,
  name         text not null,
  category     text,
  status       text not null default 'unknown'
               check (status in ('tolerated','not tolerated','unknown','testing')),
  confidence   text not null default 'low' check (confidence in ('low','medium','high')),
  last_tested  date,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- interventions: supplements and treatments, conventional and otherwise
-- ---------------------------------------------------------------------------
create table public.interventions (
  user_id     uuid not null references auth.users on delete cascade,
  id          text not null,
  name        text not null,
  type        text not null default 'supplement'
              check (type in ('supplement','western','naturopathic','lifestyle')),
  dose        text,
  source      text,                          -- who recommended it
  start_date  date,
  end_date    date,                          -- null means currently on
  status      text not null default 'baseline'
              check (status in ('baseline','testing','established','discontinued')),
  outcome     text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- meal_plan / workout_plan: imported schedules. Entries reference rows by plan_key.
-- ---------------------------------------------------------------------------
create table public.meal_plan (
  user_id    uuid not null references auth.users on delete cascade,
  id         text not null,
  date       date not null,
  meal       text not null,
  items      text,
  plan_key   text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.workout_plan (
  user_id    uuid not null references auth.users on delete cascade,
  id         text not null,
  date       date not null,
  workout    text not null,
  details    text,
  plan_key   text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- The rule that matters most: one open test window at a time, across BOTH
-- supplements and foods. The partial indexes catch two open tests in the same
-- table even if two devices race; the trigger catches one in each table.
-- ---------------------------------------------------------------------------
create unique index one_open_intervention_test_per_user
  on public.interventions (user_id) where status = 'testing';

create unique index one_open_food_test_per_user
  on public.foods (user_id) where status = 'testing';

create or replace function public.enforce_one_open_test()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.status = 'testing' then
    if exists (
         select 1 from public.interventions i
         where i.user_id = new.user_id and i.status = 'testing'
           and not (tg_table_name = 'interventions' and i.id = new.id))
       or exists (
         select 1 from public.foods f
         where f.user_id = new.user_id and f.status = 'testing'
           and not (tg_table_name = 'foods' and f.id = new.id))
    then
      raise exception 'One open test at a time. Close the current test before starting another.'
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $$;

create trigger t_one_open_test_interventions
  before insert or update on public.interventions
  for each row execute function public.enforce_one_open_test();

create trigger t_one_open_test_foods
  before insert or update on public.foods
  for each row execute function public.enforce_one_open_test();

-- ---------------------------------------------------------------------------
-- Indexes for the queries the app actually runs
-- ---------------------------------------------------------------------------
create index on public.entries (user_id, date desc);
create index on public.foods (user_id, status);
create index on public.interventions (user_id, status);
create index on public.meal_plan (user_id, date);
create index on public.workout_plan (user_id, date);

-- ---------------------------------------------------------------------------
-- Row-level security. (select auth.uid()) is evaluated once per query, not per row.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.entries       enable row level security;
alter table public.foods         enable row level security;
alter table public.interventions enable row level security;
alter table public.meal_plan     enable row level security;
alter table public.workout_plan  enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own rows" on public.entries
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own rows" on public.foods
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own rows" on public.interventions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own rows" on public.meal_plan
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own rows" on public.workout_plan
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest without trusting the client
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
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
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- It only ever runs as a trigger; nobody should call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

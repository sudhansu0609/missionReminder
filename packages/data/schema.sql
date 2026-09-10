-- Mission Reminder -- Supabase schema.
-- Paste into the Supabase SQL editor and run once.
-- Every table is locked to the owning user by row level security, so the anon
-- key shipped inside the apps can only ever reach your own rows.

create table if not exists public.missions (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade unique,
  statement   text not null default '',
  whys        jsonb not null default '[]'::jsonb,
  media       jsonb not null default '[]'::jsonb,
  -- The mission row doubles as the person's root record, so cross-device
  -- preferences (theme, vision-on-start) ride along here rather than in a
  -- second one-row table.
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.goals (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  rationale       text,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  start_date      date,
  target_date     date,
  estimated_hours numeric,
  species         integer not null default 0,
  milestones      jsonb not null default '[]'::jsonb,
  media           jsonb not null default '[]'::jsonb,
  -- Deletes are soft. A hard delete is indistinguishable, from the other
  -- device's point of view, from a row it has simply not uploaded yet -- which
  -- is how a goal deleted on the phone used to come back from the laptop.
  deleted_at      timestamptz,
  updated_at      timestamptz not null default now()
);

create table if not exists public.blocks (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  goal_id          text references public.goals(id) on delete set null,
  start_minute     integer not null,
  duration_minutes integer not null,
  days             integer[] not null default '{}',
  active           boolean not null default true,
  grace_minutes    integer not null default 10,
  deleted_at       timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.sessions (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  block_id        text references public.blocks(id) on delete set null,
  goal_id         text references public.goals(id) on delete set null,
  title           text not null,
  planned_minutes integer not null,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  status          text not null default 'running',
  growth          numeric not null default 0,
  health          numeric not null default 1,
  drifts          jsonb not null default '[]'::jsonb,
  species         integer not null default 0,
  seed            integer not null default 0,
  note            text,
  -- Wall-clock seconds inside the block that the app was not there to witness.
  lost_seconds    integer not null default 0,
  updated_at      timestamptz not null default now()
);

create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);
create index if not exists sessions_goal_idx on public.sessions (goal_id);
create index if not exists goals_user_idx on public.goals (user_id, status);
create index if not exists blocks_user_idx on public.blocks (user_id, active);

alter table public.missions enable row level security;
alter table public.goals    enable row level security;
alter table public.blocks   enable row level security;
alter table public.sessions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['missions','goals','blocks','sessions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Re-running on an existing database: add what the first version did not have.
alter table public.missions add column if not exists media    jsonb not null default '[]'::jsonb;
alter table public.missions add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.goals    add column if not exists media    jsonb not null default '[]'::jsonb;
alter table public.goals    add column if not exists deleted_at   timestamptz;
alter table public.blocks   add column if not exists deleted_at   timestamptz;
alter table public.sessions add column if not exists lost_seconds integer not null default 0;

-- Photo storage for the vision board. Public read with random per-user paths so
-- images can be drawn straight from a URL; writes are owner-only.
insert into storage.buckets (id, name, public)
values ('mission-media', 'mission-media', true)
on conflict (id) do update set public = true;

do $$
begin
  drop policy if exists "mission media read"   on storage.objects;
  drop policy if exists "mission media insert" on storage.objects;
  drop policy if exists "mission media delete" on storage.objects;

  create policy "mission media read" on storage.objects
    for select using (bucket_id = 'mission-media');

  -- The first path segment is the owner's uuid, which is what ties a file to
  -- an account: .../<user id>/<random>.jpg
  create policy "mission media insert" on storage.objects
    for insert with check (
      bucket_id = 'mission-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "mission media delete" on storage.objects
    for delete using (
      bucket_id = 'mission-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end $$;

-- Realtime, so a session started on the phone appears on the desktop.
do $$
begin
  alter publication supabase_realtime add table public.missions, public.goals, public.blocks, public.sessions;
exception when duplicate_object then null;
end $$;

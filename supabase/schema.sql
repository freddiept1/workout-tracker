-- Freddie Butler Training: cloud database (Supabase / Postgres).
-- Run this once in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
--
-- Every app record (exercise, session, template, program, metric, settings) is stored as one row:
-- the record itself in `data` (JSON), plus who it belongs to and when it last changed.
-- The phone stays the source of truth; this is the synced copy.

-- ---------- Profiles: one per account ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  role text not null default 'athlete' check (role in ('coach', 'athlete')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- People can change their name but not their role.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

-- A profile is created automatically when someone signs in for the first time.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Records: everything the app syncs ----------
create table if not exists public.records (
  athlete_id uuid not null references auth.users on delete cascade, -- whose training this is
  kind text not null check (kind in ('exercises', 'sessions', 'templates', 'programs', 'metrics', 'settings')),
  id text not null,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade, -- who created it
  data jsonb not null,
  updated_at timestamptz not null, -- when it was last edited (on the device)
  deleted_at timestamptz, -- soft delete: deletions sync like any other change
  synced_at timestamptz not null default clock_timestamp(), -- when the server last accepted a change
  primary key (athlete_id, kind, id)
);

create index if not exists records_pull on public.records (athlete_id, synced_at);

-- Last write wins: an older edit never overwrites a newer one, whichever device syncs last.
create or replace function public.records_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return null; -- keep the newer copy already here
    end if;
    new.owner_id := old.owner_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();

alter table public.records enable row level security;

-- Stage 2: you can only see and change your own training. (Stage 3 adds coach access to clients.)
drop policy if exists "read own records" on public.records;
create policy "read own records" on public.records for select using (athlete_id = auth.uid());
drop policy if exists "add own records" on public.records;
create policy "add own records" on public.records for insert with check (athlete_id = auth.uid() and owner_id = auth.uid());
drop policy if exists "change own records" on public.records;
create policy "change own records" on public.records for update using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
drop policy if exists "delete own records" on public.records;
create policy "delete own records" on public.records for delete using (athlete_id = auth.uid() and owner_id = auth.uid());

revoke all on public.records from anon, authenticated;
grant select, insert, update, delete on public.records to authenticated;

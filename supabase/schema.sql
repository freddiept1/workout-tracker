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

-- You can see and change your own training. A coach can also read (not change) the training of
-- clients who have accepted their invite (see is_my_client below).
drop policy if exists "read own records" on public.records;
drop policy if exists "add own records" on public.records;
create policy "add own records" on public.records for insert with check (athlete_id = auth.uid() and owner_id = auth.uid());
drop policy if exists "change own records" on public.records;
create policy "change own records" on public.records for update using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
drop policy if exists "delete own records" on public.records;
create policy "delete own records" on public.records for delete using (athlete_id = auth.uid() and owner_id = auth.uid());

revoke all on public.records from anon, authenticated;
grant select, insert, update, delete on public.records to authenticated;

-- =====================================================================================
-- Stage 3: clients, invites, consent
-- =====================================================================================

alter table public.profiles add column if not exists consented_at timestamptz; -- accepted the privacy notice

-- A coach's link to one client. Created as an invite; becomes active when the client accepts.
create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 80),
  invited_email text,
  invite_code text not null unique,
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  bodyweight_reminder text not null default 'weekly' check (bodyweight_reminder in ('off', 'daily', 'weekly')),
  weekly_target int check (weekly_target between 1 and 14),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  ended_at timestamptz
);
create unique index if not exists one_coach_per_client on public.coach_clients (client_id) where status = 'active';
create index if not exists coach_clients_coach on public.coach_clients (coach_id);

-- Short invite codes people can type: 8 characters, no look-alikes (0/O, 1/I/L).
create or replace function public.new_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.coach_clients where invite_code = code);
  end loop;
  return code;
end $$;
alter table public.coach_clients alter column invite_code set default public.new_invite_code();

-- Helpers used by the security rules. "security definer" lets them read coach_clients without
-- tripping over its own rules.
create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach')
$$;

create or replace function public.is_my_client(athlete uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_clients where coach_id = auth.uid() and client_id = athlete and status = 'active')
$$;

create or replace function public.my_coach() returns uuid
language sql stable security definer set search_path = public as $$
  select coach_id from coach_clients where client_id = auth.uid() and status = 'active' limit 1
$$;

-- Records: your own, plus (read-only) your active clients'.
drop policy if exists "read own records" on public.records;
create policy "read own records" on public.records for select using (athlete_id = auth.uid() or public.is_my_client(athlete_id));

-- Profiles: your own, your coach's, and your clients'.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select
  using (id = auth.uid() or id = public.my_coach() or public.is_my_client(id));

-- coach_clients rules: the coach sees their links, a client sees their own link.
alter table public.coach_clients enable row level security;
drop policy if exists "see my links" on public.coach_clients;
create policy "see my links" on public.coach_clients for select using (coach_id = auth.uid() or client_id = auth.uid());
drop policy if exists "coach invites" on public.coach_clients;
create policy "coach invites" on public.coach_clients for insert
  with check (coach_id = auth.uid() and public.is_coach() and client_id is null and status = 'invited');
drop policy if exists "coach edits" on public.coach_clients;
create policy "coach edits" on public.coach_clients for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists "coach cancels invite" on public.coach_clients;
create policy "coach cancels invite" on public.coach_clients for delete using (coach_id = auth.uid() and status = 'invited');

revoke all on public.coach_clients from anon, authenticated;
grant select, delete on public.coach_clients to authenticated;
grant insert (name, invited_email, bodyweight_reminder, weekly_target) on public.coach_clients to authenticated;
-- The coach can change these; joining and ending a link go through the functions below.
grant update (name, invited_email, bodyweight_reminder, weekly_target) on public.coach_clients to authenticated;

-- What an invite shows before signing in: just the names.
create or replace function public.invite_info(code text)
returns table (coach_name text, client_name text, status text)
language sql stable security definer set search_path = public as $$
  select coalesce(p.name, 'Your coach'), cc.name, cc.status
  from coach_clients cc join profiles p on p.id = cc.coach_id
  where cc.invite_code = upper(replace(trim(code), '-', ''))
$$;

-- The client accepts an invite (after agreeing to the privacy notice).
create or replace function public.accept_invite(code text, consent boolean)
returns table (coach_name text)
language plpgsql security definer set search_path = public as $$
declare
  link coach_clients;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not consent then raise exception 'Please agree to the privacy notice to join.'; end if;
  select * into link from coach_clients where invite_code = upper(replace(trim(code), '-', '')) for update;
  if link.id is null then raise exception 'That invite code wasn''t found. Check it with your coach.'; end if;
  if link.coach_id = auth.uid() then raise exception 'That''s your own invite. Send it to your client.'; end if;
  if link.status = 'active' and link.client_id = auth.uid() then
    return query select coalesce(p.name, 'Your coach') from profiles p where p.id = link.coach_id;
    return;
  end if;
  if link.status <> 'invited' then raise exception 'That invite has already been used or cancelled. Ask your coach for a new one.'; end if;
  if exists (select 1 from coach_clients c where c.client_id = auth.uid() and c.status = 'active') then
    raise exception 'You''re already training with a coach. Leave them first (Settings → Account).';
  end if;
  update coach_clients set client_id = auth.uid(), status = 'active', joined_at = now() where id = link.id;
  update profiles set consented_at = now(), name = coalesce(profiles.name, link.name) where id = auth.uid();
  return query select coalesce(p.name, 'Your coach') from profiles p where p.id = link.coach_id;
end $$;

-- Either side can end the link. The client's data stays theirs; the coach just can't see it any more.
create or replace function public.end_coaching(link_id uuid)
returns void
language sql security definer set search_path = public as $$
  update coach_clients set status = 'removed', ended_at = now()
  where id = link_id and status = 'active' and (coach_id = auth.uid() or client_id = auth.uid())
$$;

-- Deletes your account and everything in the cloud that belongs to it.
create or replace function public.delete_my_account()
returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid()
$$;

revoke execute on function public.new_invite_code, public.is_coach, public.is_my_client, public.my_coach,
  public.invite_info, public.accept_invite, public.end_coaching, public.delete_my_account from public, anon;
grant execute on function public.new_invite_code, public.is_coach, public.is_my_client, public.my_coach,
  public.invite_info, public.accept_invite, public.end_coaching, public.delete_my_account to authenticated;
grant execute on function public.invite_info to anon;

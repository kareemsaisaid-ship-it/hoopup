-- HoopUp initial schema. Apply only to a NEW database after inspecting existing objects.
-- Requires Supabase auth.users and auth.uid(). Local tests supply a separate auth stub.
begin;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in
      ('profiles','courts','sessions','session_members','messages','user_blocks','reports')
  ) or exists (select 1 from pg_catalog.pg_namespace where nspname = 'hoopup_private') then
    raise exception 'HoopUp objects already exist. Inspect and write an upgrade migration; do not overwrite.';
  end if;
end $$;

create schema hoopup_private;
revoke all on schema hoopup_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_path text,
  skill_level text not null default 'casual' check (skill_level in ('casual','regular','competitive')),
  primary_position text check (primary_position in ('PG','SG','SF','PF','C')),
  secondary_position text check (secondary_position in ('PG','SG','SF','PF','C')),
  plays_any_position boolean not null default true,
  height_cm smallint check (height_cm > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (secondary_position is null or secondary_position is distinct from primary_position)
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  address text,
  -- WGS84 coordinates. Optional PostGIS migration derives a spatial column from these.
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  surface_type text,
  is_indoor boolean,
  has_lighting boolean,
  hoop_count smallint check (hoop_count >= 0),
  opening_hours_note text,
  photo_path text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id),
  client_request_id uuid not null,
  court_id uuid not null references public.courts(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  team_size smallint not null check (team_size in (3,5)),
  guest_count smallint not null default 0 check (guest_count >= 0 and guest_count < team_size),
  skill_level text not null check (skill_level in ('casual','regular','competitive')),
  welcomes_beginners boolean not null default true,
  wanted_positions text[] not null default '{}',
  join_policy text not null default 'instant' check (join_policy in ('instant','approval')),
  lifecycle text not null default 'active' check (lifecycle in ('active','completed','cancelled')),
  recruitment_open boolean not null default true,
  meeting_point text not null default '' check (char_length(meeting_point) <= 500),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (host_id, client_request_id),
  check (wanted_positions <@ array['PG','SG','SF','PF','C']::text[]
         and array_position(wanted_positions, null) is null),
  check ((lifecycle = 'active' and ended_at is null)
      or (lifecycle <> 'active' and ended_at is not null and not recruitment_open))
);

create table public.session_members (
  session_id uuid not null references public.sessions(id),
  user_id uuid not null references public.profiles(id),
  status text not null check (status in ('pending','confirmed','declined','withdrawn')),
  position text check (position in ('PG','SG','SF','PF','C')),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  decided_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id),
  check (status <> 'confirmed' or confirmed_at is not null)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  sender_id uuid not null references public.profiles(id),
  client_message_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (session_id, sender_id, client_message_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  target_session_id uuid references public.sessions(id),
  target_message_id uuid references public.messages(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(target_user_id, target_session_id, target_message_id) = 1)
);

create index sessions_court_start_idx on public.sessions(court_id, starts_at);
create index sessions_host_start_idx on public.sessions(host_id, starts_at);
create index sessions_open_start_idx on public.sessions(starts_at, id)
  where lifecycle = 'active' and recruitment_open;
create index members_user_status_idx on public.session_members(user_id, status, session_id);
create index messages_session_cursor_idx on public.messages(session_id, created_at, id);
create index reports_reporter_idx on public.reports(reporter_id, created_at);
create index blocks_reverse_idx on public.user_blocks(blocked_id, blocker_id);

create function hoopup_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles
for each row execute function hoopup_private.touch_updated_at();
create trigger courts_updated before update on public.courts
for each row execute function hoopup_private.touch_updated_at();
create trigger sessions_updated before update on public.sessions
for each row execute function hoopup_private.touch_updated_at();
create trigger members_updated before update on public.session_members
for each row execute function hoopup_private.touch_updated_at();

-- Deferred cross-table invariant: every session has its confirmed host and fits capacity.
-- Application commands lock the session BEFORE touching membership rows.
create function hoopup_private.check_session_invariant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_s public.sessions%rowtype;
  v_confirmed bigint;
begin
  if tg_table_name = 'sessions' then
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_id := old.session_id;
  else
    v_id := new.session_id;
  end if;
  select * into v_s from public.sessions where id = v_id for update;
  if not found then return null; end if;
  if not exists (select 1 from public.session_members
                 where session_id = v_id and user_id = v_s.host_id and status = 'confirmed') then
    raise exception using errcode = '23514', message = 'session_requires_confirmed_host';
  end if;
  select count(*) into v_confirmed from public.session_members
    where session_id = v_id and status = 'confirmed';
  if v_confirmed + v_s.guest_count > v_s.team_size then
    raise exception using errcode = '23514', message = 'session_capacity_exceeded';
  end if;
  return null;
end $$;

create constraint trigger sessions_invariant after insert or update on public.sessions
deferrable initially deferred for each row execute function hoopup_private.check_session_invariant();
create constraint trigger members_invariant after insert or update or delete on public.session_members
deferrable initially deferred for each row execute function hoopup_private.check_session_invariant();

alter table public.profiles enable row level security;
alter table public.courts enable row level security;
alter table public.sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

revoke all on public.profiles, public.courts, public.sessions, public.session_members,
  public.messages, public.user_blocks, public.reports from public, anon, authenticated;
revoke all on all functions in schema hoopup_private from public, anon, authenticated;

commit;

-- 004_own_auth.sql
-- HoopUp own auth schema, user management, and login role for standalone Node backend.
-- Applied after 001-003 and auth stub.
begin;

create extension if not exists citext;

create schema if not exists app_auth;

create table if not exists app_auth.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Ensure user is synced to auth.users so foreign keys (such as profiles.id) succeed
create or replace function app_auth.sync_user_to_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into auth.users (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists sync_user_to_auth_trigger on app_auth.users;
create trigger sync_user_to_auth_trigger
after insert on app_auth.users
for each row execute function app_auth.sync_user_to_auth();

-- Dedicated server login role
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'hoopup_api') then
    create role hoopup_api login password 'hoopup_api_dev_password';
  end if;
end $$;

-- hoopup_api connects as login user, then switches role per transaction
grant authenticated to hoopup_api;
grant anon to hoopup_api;

-- hoopup_api can read/write app_auth.users
grant usage on schema app_auth to hoopup_api;
grant select, insert, update, delete on app_auth.users to hoopup_api;

-- authenticated and anon cannot access auth credentials
revoke all on schema app_auth from public, anon, authenticated;
revoke all on app_auth.users from public, anon, authenticated;

-- Allow hoopup_api usage on auth schema for sync/checks
grant usage on schema auth to hoopup_api;
grant select, insert on auth.users to hoopup_api;

commit;

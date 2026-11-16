-- 007_user_status.sql
-- HoopUp BAN1: Block banned/deleted users on every request + moderation log
-- Idempotent upgrade migration.
begin;

-- 1. Add status columns to app_auth.users if they do not exist
alter table app_auth.users
  add column if not exists banned_at timestamptz,
  add column if not exists ban_reason text,
  add column if not exists deleted_at timestamptz;

-- 2. Create moderation log table
create table if not exists app_auth.moderation_log (
  id bigserial primary key,
  user_id uuid,
  action text check (action in ('ban', 'unban', 'delete')),
  reason text,
  actor text,
  created_at timestamptz default now()
);

-- 3. Ensure API role (hoopup_api) and public/authenticated roles have NO grants to moderation_log
revoke all on app_auth.moderation_log from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'hoopup_api') then
    revoke all on app_auth.moderation_log from hoopup_api;
  end if;
end $$;

-- 4. Ensure hoopup_api can SELECT the three columns (table-level grant in 004 exists, but explicit column grant guarantees SELECT)
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'hoopup_api') then
    grant select (banned_at, ban_reason, deleted_at) on app_auth.users to hoopup_api;
  end if;
end $$;

commit;

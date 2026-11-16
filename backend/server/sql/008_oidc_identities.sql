-- 008_oidc_identities.sql
-- HoopUp OIDC1: OIDC identities and email_verified flag
-- Idempotent upgrade migration.
begin;

-- 1. Modify app_auth.users: password_hash DROP NOT NULL, add email_verified boolean not null default false
alter table app_auth.users
  alter column password_hash drop not null;

alter table app_auth.users
  add column if not exists email_verified boolean not null default false;

-- 2. Create app_auth.identities table
create table if not exists app_auth.identities (
  id bigserial primary key,
  user_id uuid not null references app_auth.users(id) on delete cascade,
  provider text not null,
  subject text not null,
  email citext,
  created_at timestamptz default now(),
  last_login_at timestamptz,
  unique (provider, subject)
);

create index if not exists idx_identities_user_id on app_auth.identities (user_id);

-- 3. Grants & Revokes
-- Explicitly revoke all privileges from public, anon, authenticated
revoke all on app_auth.identities from public, anon, authenticated;
revoke all on sequence app_auth.identities_id_seq from public, anon, authenticated;

-- hoopup_api grants: select, insert, update on identities; usage, select on sequence
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'hoopup_api') then
    grant select, insert, update on app_auth.identities to hoopup_api;
    grant usage, select on sequence app_auth.identities_id_seq to hoopup_api;
  end if;
end $$;

commit;

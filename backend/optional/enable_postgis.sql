-- OPTIONAL: run after core migrations on a database with PostGIS available.
-- Local core tests do not require this extension. Do not relocate an existing extension.
begin;
create schema if not exists extensions;
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'postgis' and n.nspname <> 'extensions') then
    raise exception 'PostGIS exists in another schema. Adapt this optional migration to it; do not move it blindly.';
  end if;
end $$;
create extension if not exists postgis with schema extensions;
alter table public.courts add column location extensions.geography(Point,4326)
  generated always as (
    case when latitude is null then null
      else extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography
    end
  ) stored;
create index courts_location_gist_idx on public.courts using gist(location);
commit;

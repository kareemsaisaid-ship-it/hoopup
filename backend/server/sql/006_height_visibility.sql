-- 006_height_visibility.sql
-- HoopUp HT1: User-controlled height visibility (height_cm opt-in).
-- Migration is idempotent and safe for existing rows.
begin;

-- 1. Add height_visible column with default false (hidden by default)
alter table public.profiles
  add column if not exists height_visible boolean default false;

update public.profiles
  set height_visible = false
  where height_visible is null;

alter table public.profiles
  alter column height_visible set default false;

alter table public.profiles
  alter column height_visible set not null;

-- 2. Update hoopup_private.save_profile to handle heightVisible
create or replace function hoopup_private.save_profile(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := hoopup_private.require_user(); v_p public.profiles%rowtype;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or
    p_input - array['displayName','avatarPath','skillLevel','primaryPosition',
      'secondaryPosition','playsAnyPosition','heightCm','heightVisible']::text[] <> '{}'::jsonb or
    (p_input ? 'heightVisible' and jsonb_typeof(p_input->'heightVisible') is distinct from 'boolean') then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  insert into public.profiles(id, display_name, avatar_path, skill_level,
    primary_position,secondary_position,plays_any_position,height_cm,height_visible)
  values (v_uid,p_input->>'displayName',p_input->>'avatarPath',
    coalesce(p_input->>'skillLevel','casual'),p_input->>'primaryPosition',
    p_input->>'secondaryPosition',coalesce((p_input->>'playsAnyPosition')::boolean,true),
    (p_input->>'heightCm')::smallint,
    coalesce((p_input->>'heightVisible')::boolean,false))
  on conflict (id) do update set display_name = excluded.display_name,
    avatar_path = excluded.avatar_path, skill_level = excluded.skill_level,
    primary_position = excluded.primary_position,secondary_position = excluded.secondary_position,
    plays_any_position = excluded.plays_any_position,height_cm = excluded.height_cm,
    height_visible = case
      when p_input ? 'heightVisible' then (p_input->>'heightVisible')::boolean
      else public.profiles.height_visible
    end
  returning * into v_p;
  return jsonb_build_object('ok',true,'code','profile_saved','profile',to_jsonb(v_p));
end $$;

-- 3. Public API wrapper function
create or replace function public.hoopup_save_profile(p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.save_profile(p_input);
$$;

-- 4. Permissions: authenticated can execute; public and anon cannot
revoke all on function hoopup_private.save_profile(jsonb) from public, anon, authenticated;
grant execute on function hoopup_private.save_profile(jsonb) to authenticated;

revoke all on function public.hoopup_save_profile(jsonb) from public, anon, authenticated;
grant execute on function public.hoopup_save_profile(jsonb) to authenticated;

commit;

-- Trusted helpers live outside exposed Data API schemas. Public wrappers are invokers.
begin;

create function hoopup_private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  return v_uid;
end $$;

create function hoopup_private.is_member(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.session_members
    where session_id = p_session_id and user_id = auth.uid() and status = 'confirmed');
$$;

create function hoopup_private.is_host(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions where id = p_session_id and host_id = auth.uid());
$$;

-- Always scoped to caller; cannot be used to inspect two unrelated users' blocks.
create function hoopup_private.host_blocked(p_host_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = p_host_id)
       or (blocker_id = p_host_id and blocked_id = auth.uid()));
$$;

create function hoopup_private.can_view_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.sessions s where s.id = p_session_id
    and (s.host_id = auth.uid() or hoopup_private.is_member(s.id)
         or not hoopup_private.host_blocked(s.host_id)));
$$;

create function hoopup_private.session_summary(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := hoopup_private.require_user();
  v_s public.sessions%rowtype;
  v_c public.courts%rowtype;
  v_confirmed integer;
  v_my_status text;
  v_display text;
begin
  if not hoopup_private.can_view_session(p_session_id) then return null; end if;
  select * into v_s from public.sessions where id = p_session_id;
  if not found then return null; end if;
  select * into v_c from public.courts where id = v_s.court_id;
  select count(*)::integer into v_confirmed from public.session_members
    where session_id = p_session_id and status = 'confirmed';
  select status into v_my_status from public.session_members
    where session_id = p_session_id and user_id = v_uid;
  v_display := case
    when v_s.lifecycle <> 'active' then v_s.lifecycle
    when not v_s.recruitment_open then 'closed'
    when v_confirmed + v_s.guest_count = v_s.team_size then 'full'
    else 'open' end;
  return jsonb_build_object(
    'id',v_s.id, 'title',v_s.title, 'hostId',v_s.host_id,
    'hostName',(select display_name from public.profiles where id = v_s.host_id),
    'court',jsonb_build_object('id',v_c.id,'name',v_c.name,
      'latitude',v_c.latitude,'longitude',v_c.longitude),
    'startsAt',v_s.starts_at, 'teamSize',v_s.team_size,
    'confirmedCount',v_confirmed, 'guestCount',v_s.guest_count,
    'occupiedCount',v_confirmed + v_s.guest_count,
    'seatsRemaining',v_s.team_size - v_confirmed - v_s.guest_count,
    'skillLevel',v_s.skill_level, 'welcomesBeginners',v_s.welcomes_beginners,
    'wantedPositions',v_s.wanted_positions, 'joinPolicy',v_s.join_policy,
    'lifecycle',v_s.lifecycle, 'recruitmentOpen',v_s.recruitment_open,
    'displayStatus',v_display, 'myMembershipStatus',v_my_status,
    'meetingPoint',v_s.meeting_point, 'notes',v_s.notes,
    'updatedAt',v_s.updated_at, 'endedAt',v_s.ended_at,
    'actions',jsonb_build_object(
      'canManage',v_uid = v_s.host_id and v_s.lifecycle = 'active',
      'canJoin',v_display = 'open' and coalesce(v_my_status not in ('pending','confirmed'),true)
         and not hoopup_private.host_blocked(v_s.host_id),
      'canReadChat',coalesce(v_my_status = 'confirmed',false),
      'canSendMessage',coalesce(v_my_status = 'confirmed' and v_s.lifecycle = 'active',false),
      'canWithdraw',coalesce(v_uid <> v_s.host_id and v_my_status in ('pending','confirmed')
        and v_s.lifecycle = 'active',false)));
end $$;

create function hoopup_private.save_profile(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := hoopup_private.require_user(); v_p public.profiles%rowtype;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or
    p_input - array['displayName','avatarPath','skillLevel','primaryPosition',
      'secondaryPosition','playsAnyPosition','heightCm']::text[] <> '{}'::jsonb then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  insert into public.profiles(id, display_name, avatar_path, skill_level,
    primary_position,secondary_position,plays_any_position,height_cm)
  values (v_uid,p_input->>'displayName',p_input->>'avatarPath',
    coalesce(p_input->>'skillLevel','casual'),p_input->>'primaryPosition',
    p_input->>'secondaryPosition',coalesce((p_input->>'playsAnyPosition')::boolean,true),
    (p_input->>'heightCm')::smallint)
  on conflict (id) do update set display_name = excluded.display_name,
    avatar_path = excluded.avatar_path, skill_level = excluded.skill_level,
    primary_position = excluded.primary_position,secondary_position = excluded.secondary_position,
    plays_any_position = excluded.plays_any_position,height_cm = excluded.height_cm
  returning * into v_p;
  return jsonb_build_object('ok',true,'code','profile_saved','profile',to_jsonb(v_p));
end $$;

create function hoopup_private.create_session(p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := hoopup_private.require_user();
  v_id uuid;
  v_start timestamptz;
begin
  if not exists(select 1 from public.profiles where id = v_uid) then
    return jsonb_build_object('ok',false,'code','profile_required');
  end if;
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object' or
    p_input - array['title','courtId','startsAt','teamSize','guestCount','skillLevel',
      'welcomesBeginners','wantedPositions','joinPolicy','meetingPoint','notes']::text[] <> '{}'::jsonb then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  select id into v_id from public.sessions
    where host_id = v_uid and client_request_id = p_request_id;
  if found then
    return jsonb_build_object('ok',true,'code','already_created','session',hoopup_private.session_summary(v_id));
  end if;
  v_start := (p_input->>'startsAt')::timestamptz;
  if v_start is null then v_start := clock_timestamp();
  elsif v_start < clock_timestamp() then
    return jsonb_build_object('ok',false,'code','start_in_past');
  end if;
  insert into public.sessions(host_id,client_request_id,court_id,title,starts_at,team_size,
    guest_count,skill_level,welcomes_beginners,wanted_positions,join_policy,meeting_point,notes)
  values(v_uid,p_request_id,(p_input->>'courtId')::uuid,p_input->>'title',v_start,
    (p_input->>'teamSize')::smallint,coalesce((p_input->>'guestCount')::smallint,0),
    coalesce(p_input->>'skillLevel','casual'),coalesce((p_input->>'welcomesBeginners')::boolean,true),
    array(select jsonb_array_elements_text(coalesce(p_input->'wantedPositions','[]'::jsonb))),
    coalesce(p_input->>'joinPolicy','instant'),coalesce(p_input->>'meetingPoint',''),
    coalesce(p_input->>'notes',''))
  on conflict(host_id,client_request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.sessions where host_id = v_uid and client_request_id = p_request_id;
    return jsonb_build_object('ok',true,'code','already_created','session',hoopup_private.session_summary(v_id));
  end if;
  insert into public.session_members(session_id,user_id,status,confirmed_at,decided_by)
    values(v_id,v_uid,'confirmed',clock_timestamp(),v_uid);
  return jsonb_build_object('ok',true,'code','created','session',hoopup_private.session_summary(v_id));
end $$;

-- One lock order for every membership/capacity/lifecycle/message write: session first.
create function hoopup_private.session_command(p_session_id uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := hoopup_private.require_user();
  v_s public.sessions%rowtype;
  v_member public.session_members%rowtype;
  v_message public.messages%rowtype;
  v_confirmed integer;
  v_target uuid;
  v_status text;
  v_code text;
  v_message_id uuid;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  select * into v_s from public.sessions where id = p_session_id for update;
  if not found or not hoopup_private.can_view_session(p_session_id) then
    return jsonb_build_object('ok',false,'code','not_found');
  end if;
  select * into v_member from public.session_members
    where session_id = p_session_id and user_id = v_uid;
  select count(*)::integer into v_confirmed from public.session_members
    where session_id = p_session_id and status = 'confirmed';

  if p_action = 'join' then
    if v_member.status = 'confirmed' then v_code := 'already_joined';
    elsif v_member.status = 'pending' then v_code := 'pending';
    else
      if not exists(select 1 from public.profiles where id = v_uid) then
        return jsonb_build_object('ok',false,'code','profile_required');
      end if;
      if v_s.lifecycle <> 'active' then return jsonb_build_object('ok',false,'code','session_inactive'); end if;
      if not v_s.recruitment_open then return jsonb_build_object('ok',false,'code','recruitment_closed'); end if;
      if hoopup_private.host_blocked(v_s.host_id) then return jsonb_build_object('ok',false,'code','forbidden'); end if;
      if v_confirmed + v_s.guest_count >= v_s.team_size then return jsonb_build_object('ok',false,'code','session_full'); end if;
      v_status := case when v_s.join_policy = 'instant' then 'confirmed' else 'pending' end;
      insert into public.session_members(session_id,user_id,status,position,confirmed_at,decided_by)
      values(p_session_id,v_uid,v_status,p_input->>'position',
        case when v_status = 'confirmed' then clock_timestamp() end,
        case when v_status = 'confirmed' then v_uid end)
      on conflict(session_id,user_id) do update set status = excluded.status,
        position = excluded.position,requested_at = clock_timestamp(),
        confirmed_at = excluded.confirmed_at,decided_by = excluded.decided_by;
      v_code := case when v_status = 'confirmed' then 'joined' else 'pending' end;
    end if;

  elsif p_action = 'decide' then
    if v_s.host_id <> v_uid then return jsonb_build_object('ok',false,'code','forbidden'); end if;
    if v_s.lifecycle <> 'active' then return jsonb_build_object('ok',false,'code','session_inactive'); end if;
    v_target := (p_input->>'userId')::uuid;
    v_status := p_input->>'decision';
    if v_status is null or v_status not in ('confirmed','declined') then
      return jsonb_build_object('ok',false,'code','invalid_input');
    end if;
    select * into v_member from public.session_members
      where session_id = p_session_id and user_id = v_target;
    if not found then return jsonb_build_object('ok',false,'code','request_not_found'); end if;
    if v_member.status = v_status then
      return jsonb_build_object('ok',true,'code','already_decided','session',hoopup_private.session_summary(p_session_id));
    end if;
    if v_member.status <> 'pending' then return jsonb_build_object('ok',false,'code','request_not_pending'); end if;
    if v_status = 'confirmed' then
      if not v_s.recruitment_open then return jsonb_build_object('ok',false,'code','recruitment_closed'); end if;
      if exists(select 1 from public.user_blocks where
        (blocker_id = v_uid and blocked_id = v_target) or (blocker_id = v_target and blocked_id = v_uid)) then
        return jsonb_build_object('ok',false,'code','forbidden');
      end if;
      if v_confirmed + v_s.guest_count >= v_s.team_size then return jsonb_build_object('ok',false,'code','session_full'); end if;
    end if;
    update public.session_members set status = v_status,decided_by = v_uid,
      confirmed_at = case when v_status = 'confirmed' then clock_timestamp() end
      where session_id = p_session_id and user_id = v_target;
    v_code := case when v_status = 'confirmed' then 'approved' else 'declined' end;

  elsif p_action = 'withdraw' then
    if v_s.host_id = v_uid then return jsonb_build_object('ok',false,'code','host_cannot_withdraw'); end if;
    if v_member.status = 'withdrawn' then v_code := 'already_withdrawn';
    else
      if v_s.lifecycle <> 'active' then return jsonb_build_object('ok',false,'code','session_inactive'); end if;
      if v_member.status is null or v_member.status not in ('confirmed','pending') then
        return jsonb_build_object('ok',false,'code','not_participating');
      end if;
      update public.session_members set status = 'withdrawn',confirmed_at = null
        where session_id = p_session_id and user_id = v_uid;
      v_code := 'withdrawn';
    end if;

  elsif p_action = 'update' then
    if v_s.host_id <> v_uid then return jsonb_build_object('ok',false,'code','forbidden'); end if;
    if v_s.lifecycle <> 'active' then return jsonb_build_object('ok',false,'code','session_inactive'); end if;
    if p_input - array['title','courtId','startsAt','teamSize','guestCount','skillLevel',
      'welcomesBeginners','wantedPositions','joinPolicy','meetingPoint','notes']::text[] <> '{}'::jsonb then
      return jsonb_build_object('ok',false,'code','invalid_input');
    end if;
    v_s.title := coalesce(p_input->>'title',v_s.title);
    v_s.court_id := coalesce((p_input->>'courtId')::uuid,v_s.court_id);
    v_s.team_size := coalesce((p_input->>'teamSize')::smallint,v_s.team_size);
    v_s.guest_count := coalesce((p_input->>'guestCount')::smallint,v_s.guest_count);
    v_s.skill_level := coalesce(p_input->>'skillLevel',v_s.skill_level);
    v_s.welcomes_beginners := coalesce((p_input->>'welcomesBeginners')::boolean,v_s.welcomes_beginners);
    v_s.join_policy := coalesce(p_input->>'joinPolicy',v_s.join_policy);
    if p_input ? 'wantedPositions' then
      v_s.wanted_positions := array(select jsonb_array_elements_text(p_input->'wantedPositions'));
    end if;
    if p_input ? 'meetingPoint' then v_s.meeting_point := coalesce(p_input->>'meetingPoint',''); end if;
    if p_input ? 'notes' then v_s.notes := coalesce(p_input->>'notes',''); end if;
    if p_input ? 'startsAt' then
      v_s.starts_at := coalesce((p_input->>'startsAt')::timestamptz,clock_timestamp());
      if p_input->>'startsAt' is not null and v_s.starts_at < clock_timestamp() then
        return jsonb_build_object('ok',false,'code','start_in_past');
      end if;
    end if;
    if v_confirmed + v_s.guest_count > v_s.team_size then
      return jsonb_build_object('ok',false,'code','capacity_conflict');
    end if;
    update public.sessions set title = v_s.title,court_id = v_s.court_id,starts_at = v_s.starts_at,
      team_size = v_s.team_size,guest_count = v_s.guest_count,skill_level = v_s.skill_level,
      welcomes_beginners = v_s.welcomes_beginners,wanted_positions = v_s.wanted_positions,
      join_policy = v_s.join_policy,meeting_point = v_s.meeting_point,notes = v_s.notes
      where id = p_session_id;
    v_code := 'updated';

  elsif p_action in ('recruitment','end') then
    if v_s.host_id <> v_uid then return jsonb_build_object('ok',false,'code','forbidden'); end if;
    if p_action = 'end' and v_s.lifecycle = p_input->>'lifecycle' then
      return jsonb_build_object('ok',true,'code','already_ended','session',hoopup_private.session_summary(p_session_id));
    end if;
    if v_s.lifecycle <> 'active' then return jsonb_build_object('ok',false,'code','session_inactive'); end if;
    if p_action = 'recruitment' then
      update public.sessions set recruitment_open = (p_input->>'open')::boolean where id = p_session_id;
      v_code := 'recruitment_updated';
    else
      v_status := p_input->>'lifecycle';
      if v_status is null or v_status not in ('completed','cancelled') then
        return jsonb_build_object('ok',false,'code','invalid_input');
      end if;
      update public.sessions set lifecycle = v_status,recruitment_open = false,ended_at = clock_timestamp()
        where id = p_session_id;
      v_code := v_status;
    end if;

  elsif p_action = 'send' then
    if v_member.status is distinct from 'confirmed' then return jsonb_build_object('ok',false,'code','forbidden'); end if;
    v_message_id := (p_input->>'clientMessageId')::uuid;
    select * into v_message from public.messages
      where session_id = p_session_id and sender_id = v_uid and client_message_id = v_message_id;
    if found then return jsonb_build_object('ok',true,'code','already_sent','message',to_jsonb(v_message)); end if;
    if v_s.lifecycle <> 'active' then return jsonb_build_object('ok',false,'code','session_inactive'); end if;
    insert into public.messages(session_id,sender_id,client_message_id,body)
      values(p_session_id,v_uid,v_message_id,p_input->>'body') returning * into v_message;
    return jsonb_build_object('ok',true,'code','sent','message',to_jsonb(v_message));

  else return jsonb_build_object('ok',false,'code','invalid_action');
  end if;

  return jsonb_build_object('ok',true,'code',v_code,'session',hoopup_private.session_summary(p_session_id));
end $$;

create function hoopup_private.list_sessions(p_filter jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := hoopup_private.require_user();
  v_result jsonb;
  v_limit integer := least(greatest(coalesce((p_filter->>'limit')::integer,20),1),100);
  v_offset integer := greatest(coalesce((p_filter->>'offset')::integer,0),0);
begin
  select coalesce(jsonb_agg(x.summary order by x.starts_at,x.id),'[]'::jsonb) into v_result
  from (
    select s.id,s.starts_at,hoopup_private.session_summary(s.id) as summary
    from public.sessions s
    where s.lifecycle = 'active' and s.recruitment_open
      and hoopup_private.can_view_session(s.id)
      and (not (p_filter ? 'courtId') or s.court_id = (p_filter->>'courtId')::uuid)
      and (not (p_filter ? 'teamSize') or s.team_size = (p_filter->>'teamSize')::smallint)
      and (not (p_filter ? 'skillLevel') or s.skill_level = p_filter->>'skillLevel')
      and (not (p_filter ? 'from') or s.starts_at >= (p_filter->>'from')::timestamptz)
      and (not (p_filter ? 'to') or s.starts_at < (p_filter->>'to')::timestamptz)
      and s.guest_count + (select count(*) from public.session_members m
                          where m.session_id = s.id and m.status = 'confirmed') < s.team_size
    order by s.starts_at,s.id limit v_limit offset v_offset
  ) x;
  return v_result;
end $$;

create function hoopup_private.support_command(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := hoopup_private.require_user();
  v_target uuid;
  v_session uuid;
  v_report_id uuid;
begin
  if p_action in ('block','unblock') then
    v_target := (p_input->>'userId')::uuid;
    if v_target = v_uid then return jsonb_build_object('ok',false,'code','cannot_block_self'); end if;
    if p_action = 'block' then
      insert into public.user_blocks(blocker_id,blocked_id) values(v_uid,v_target) on conflict do nothing;
    else delete from public.user_blocks where blocker_id = v_uid and blocked_id = v_target;
    end if;
    return jsonb_build_object('ok',true,'code',case when p_action = 'block' then 'blocked' else 'unblocked' end);
  elsif p_action = 'report' then
    v_target := (p_input->>'targetId')::uuid;
    if p_input->>'targetType' = 'message' then
      select session_id into v_session from public.messages where id = v_target;
      if not found or not hoopup_private.is_member(v_session) then
        return jsonb_build_object('ok',false,'code','forbidden');
      end if;
      insert into public.reports(reporter_id,target_message_id,reason)
        values(v_uid,v_target,p_input->>'reason') returning id into v_report_id;
    elsif p_input->>'targetType' = 'session' then
      if not hoopup_private.can_view_session(v_target) then return jsonb_build_object('ok',false,'code','not_found'); end if;
      insert into public.reports(reporter_id,target_session_id,reason)
        values(v_uid,v_target,p_input->>'reason') returning id into v_report_id;
    elsif p_input->>'targetType' = 'user' then
      insert into public.reports(reporter_id,target_user_id,reason)
        values(v_uid,v_target,p_input->>'reason') returning id into v_report_id;
    else return jsonb_build_object('ok',false,'code','invalid_input');
    end if;
    return jsonb_build_object('ok',true,'code','reported','reportId',v_report_id);
  end if;
  return jsonb_build_object('ok',false,'code','invalid_action');
end $$;

-- No caller can execute a privileged helper until the allowlist in migration 003.
revoke all on all functions in schema hoopup_private from public, anon, authenticated;
commit;

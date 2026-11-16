begin;

create function public.hoopup_save_profile(p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.save_profile(p_input);
$$;

create function public.hoopup_create_session(p_request_id uuid,p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.create_session(p_request_id,p_input);
$$;

create function public.hoopup_get_session(p_session_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select hoopup_private.session_summary(p_session_id);
$$;

create function public.hoopup_list_sessions(p_filter jsonb default '{}') returns jsonb
language sql stable security invoker set search_path = '' as $$
  select hoopup_private.list_sessions(p_filter);
$$;

create function hoopup_private.my_sessions(p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := hoopup_private.require_user(); v_rows jsonb;
begin
  select coalesce(jsonb_agg(x.summary order by x.starts_at,x.id),'[]'::jsonb) into v_rows from (
    select s.id,s.starts_at,hoopup_private.session_summary(s.id) as summary
    from public.sessions s where hoopup_private.can_view_session(s.id) and
      (s.host_id = v_uid or exists(select 1 from public.session_members m
        where m.session_id = s.id and m.user_id = v_uid))
    order by s.starts_at,s.id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
  ) x;
  return v_rows;
end $$;

create function public.hoopup_my_sessions(p_limit integer default 20,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select hoopup_private.my_sessions(p_limit,p_offset);
$$;

create function public.hoopup_join_session(p_session_id uuid,p_position text default null) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'join',jsonb_build_object('position',p_position));
$$;

create function public.hoopup_decide_request(p_session_id uuid,p_user_id uuid,p_approve boolean) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'decide',jsonb_build_object('userId',p_user_id,
    'decision',case when p_approve then 'confirmed' when not p_approve then 'declined' end));
$$;

create function public.hoopup_withdraw(p_session_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'withdraw');
$$;

create function public.hoopup_update_session(p_session_id uuid,p_patch jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'update',p_patch);
$$;

create function public.hoopup_set_recruitment(p_session_id uuid,p_open boolean) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'recruitment',jsonb_build_object('open',p_open));
$$;

create function public.hoopup_end_session(p_session_id uuid,p_lifecycle text) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'end',jsonb_build_object('lifecycle',p_lifecycle));
$$;

create function public.hoopup_send_message(p_session_id uuid,p_client_message_id uuid,p_body text) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.session_command(p_session_id,'send',jsonb_build_object(
    'clientMessageId',p_client_message_id,'body',p_body));
$$;

create function public.hoopup_block_user(p_user_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.support_command('block',jsonb_build_object('userId',p_user_id));
$$;

create function public.hoopup_unblock_user(p_user_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.support_command('unblock',jsonb_build_object('userId',p_user_id));
$$;

create function public.hoopup_report(p_target_type text,p_target_id uuid,p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$
  select hoopup_private.support_command('report',jsonb_build_object(
    'targetType',p_target_type,'targetId',p_target_id,'reason',p_reason));
$$;

create policy profiles_read on public.profiles for select to authenticated using ((select auth.uid()) is not null);
create policy courts_read on public.courts for select to authenticated using ((select auth.uid()) is not null);
create policy sessions_read on public.sessions for select to authenticated
  using (hoopup_private.can_view_session(id));
create policy members_read on public.session_members for select to authenticated
  using (user_id = (select auth.uid()) or hoopup_private.is_host(session_id)
    or (status = 'confirmed' and hoopup_private.is_member(session_id)));
create policy messages_read on public.messages for select to authenticated
  using (hoopup_private.is_member(session_id));
create policy blocks_read on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

grant select on public.profiles,public.courts,public.sessions,public.session_members,
  public.messages,public.user_blocks,public.reports to authenticated;
grant usage on schema hoopup_private to authenticated;

-- Allow only authorized entry/helper functions, never trigger functions.
revoke all on all functions in schema hoopup_private from public,anon,authenticated;
grant execute on function hoopup_private.require_user(),hoopup_private.is_member(uuid),
  hoopup_private.is_host(uuid),hoopup_private.host_blocked(uuid),
  hoopup_private.can_view_session(uuid),hoopup_private.session_summary(uuid),
  hoopup_private.save_profile(jsonb),hoopup_private.create_session(uuid,jsonb),
  hoopup_private.session_command(uuid,text,jsonb),hoopup_private.list_sessions(jsonb),
  hoopup_private.my_sessions(integer,integer),hoopup_private.support_command(text,jsonb)
  to authenticated;

-- PostgreSQL defaults EXECUTE to PUBLIC; restrict only the newly introduced API names.
do $$
declare v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'hoopup_save_profile','hoopup_create_session','hoopup_get_session','hoopup_list_sessions',
      'hoopup_my_sessions','hoopup_join_session','hoopup_decide_request','hoopup_withdraw',
      'hoopup_update_session','hoopup_set_recruitment','hoopup_end_session','hoopup_send_message',
      'hoopup_block_user','hoopup_unblock_user','hoopup_report'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated',v_fn);
    execute format('grant execute on function %s to authenticated',v_fn);
  end loop;
end $$;

commit;

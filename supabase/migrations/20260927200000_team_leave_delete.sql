create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role_value public.team_member_role;
  organization_id_value uuid;
  organization_role_value public.member_role;
  remaining_managers integer;
begin
  select
    t.organization_id
  into organization_id_value
  from public.teams t
  where t.id = p_team_id;

  if organization_id_value is null then
    raise exception 'Team not found';
  end if;

  select
    tm.role
  into member_role_value
  from public.team_memberships tm
  where tm.team_id = p_team_id
    and tm.user_id = auth.uid();

  if member_role_value is null then
    raise exception 'You are not a member of this team';
  end if;

  select
    om.role
  into organization_role_value
  from public.organization_members om
  where om.organization_id = organization_id_value
    and om.user_id = auth.uid();

  if member_role_value = 'manager' then
    select count(*)
    into remaining_managers
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.role = 'manager'
      and tm.user_id <> auth.uid();

    if remaining_managers = 0
       and organization_role_value not in ('owner', 'admin') then
      raise exception 'You are the last team manager. Assign another manager before leaving the team.';
    end if;
  end if;

  delete from public.team_access_requests
  where team_id = p_team_id
    and user_id = auth.uid();

  delete from public.team_memberships
  where team_id = p_team_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id_value uuid;
  organization_role_value public.member_role;
  caller_is_manager boolean;
  game_count integer;
begin
  select
    t.organization_id
  into organization_id_value
  from public.teams t
  where t.id = p_team_id;

  if organization_id_value is null then
    raise exception 'Team not found';
  end if;

  select
    om.role
  into organization_role_value
  from public.organization_members om
  where om.organization_id = organization_id_value
    and om.user_id = auth.uid();

  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'manager'
  )
  into caller_is_manager;

  if organization_role_value not in ('owner', 'admin')
     and not caller_is_manager then
    raise exception 'You do not have permission to delete this team';
  end if;

  select count(*)
  into game_count
  from public.games g
  where g.home_team_id = p_team_id
     or g.away_team_id = p_team_id;

  if game_count > 0 then
    raise exception 'This team cannot be deleted because it has existing games. Delete or archive those games first.';
  end if;

  delete from public.team_access_requests
  where team_id = p_team_id;

  delete from public.team_memberships
  where team_id = p_team_id;

  delete from public.players
  where team_id = p_team_id;

  delete from public.teams
  where id = p_team_id;
end;
$$;

revoke all on function public.leave_team(uuid) from public;
revoke all on function public.delete_team(uuid) from public;

grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.delete_team(uuid) to authenticated;

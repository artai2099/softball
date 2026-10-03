-- Fix team creation, leave, and delete.
-- Team creator becomes a manager automatically.
-- Organization owner/admin can delete any team in the organization.
-- A team member can leave a team, except the last manager cannot leave
-- unless they are also an organization owner/admin.

create or replace function public.create_team(
  p_organization_id uuid,
  p_name text,
  p_short_name text,
  p_city text,
  p_color text
)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team public.teams;
begin
  if not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.teams(
    organization_id,
    name,
    short_name,
    city,
    color
  )
  values(
    p_organization_id,
    p_name,
    p_short_name,
    p_city,
    p_color
  )
  returning * into new_team;

  insert into public.team_memberships(team_id, user_id, role)
  values(new_team.id, auth.uid(), 'manager');

  return new_team;
end;
$$;

create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team_org_id uuid;
  my_role public.team_member_role;
  org_role public.member_role;
  manager_count integer;
begin
  select organization_id
    into team_org_id
  from public.teams
  where id = p_team_id;

  if team_org_id is null then
    raise exception 'Team not found';
  end if;

  select om.role
    into org_role
  from public.organization_members om
  where om.organization_id = team_org_id
    and om.user_id = auth.uid();

  if org_role is null then
    raise exception 'Not authorized';
  end if;

  select tm.role
    into my_role
  from public.team_memberships tm
  where tm.team_id = p_team_id
    and tm.user_id = auth.uid();

  if my_role is null then
    raise exception 'You are not a member of this team';
  end if;

  if my_role = 'manager' and org_role not in ('owner','admin') then
    select count(*)
      into manager_count
    from public.team_memberships
    where team_id = p_team_id
      and role = 'manager';

    if manager_count <= 1 then
      raise exception 'You are the last team manager. Add another manager before leaving.';
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
  team_org_id uuid;
  org_role public.member_role;
  is_manager boolean;
begin
  select organization_id
    into team_org_id
  from public.teams
  where id = p_team_id;

  if team_org_id is null then
    raise exception 'Team not found';
  end if;

  select om.role
    into org_role
  from public.organization_members om
  where om.organization_id = team_org_id
    and om.user_id = auth.uid();

  select exists(
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'manager'
  )
  into is_manager;

  if org_role not in ('owner','admin') and not is_manager then
    raise exception 'You do not have permission to delete this team';
  end if;

  if exists(
    select 1
    from public.games g
    where g.organization_id = team_org_id
      and g.home_team_id = p_team_id
  ) then
    raise exception 'Cannot delete a team that has games. Delete or reassign its games first.';
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

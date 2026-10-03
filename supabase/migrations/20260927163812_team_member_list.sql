create or replace function public.get_team_members(
  p_team_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  role public.team_member_role,
  display_name text
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  team_org_id uuid;
begin
  select organization_id
    into team_org_id
  from public.teams
  where teams.id = p_team_id;

  if team_org_id is null then
    raise exception 'Team not found';
  end if;

  if not public.is_org_member(team_org_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  return query
  select
    tm.id,
    tm.user_id,
    tm.role,
    coalesce(nullif(trim(p.display_name), ''), 'Team member')
  from public.team_memberships tm
  left join public.profiles p
    on p.id = tm.user_id
  where tm.team_id = p_team_id
  order by tm.created_at;
end;
$function$;

revoke all on function public.get_team_members(uuid) from public;

grant execute on function public.get_team_members(uuid) to authenticated;

alter table public.teams
  add column if not exists allow_self_join boolean not null default false;

create index if not exists teams_self_join_idx
  on public.teams (allow_self_join, name);

create or replace function public.find_joinable_teams(
  p_search text default ''
)
returns table (
  id uuid,
  name text,
  short_name text,
  city text,
  color text,
  player_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.short_name,
    t.city,
    t.color,
    count(p.id)::bigint
  from public.teams t
  left join public.players p
    on p.team_id = t.id
   and p.active = true
  where t.allow_self_join = true
    and (
      nullif(trim(p_search), '') is null
      or lower(t.name) like '%' || lower(trim(p_search)) || '%'
      or lower(coalesce(t.short_name, '')) like '%' || lower(trim(p_search)) || '%'
      or lower(coalesce(t.city, '')) like '%' || lower(trim(p_search)) || '%'
    )
  group by
    t.id,
    t.name,
    t.short_name,
    t.city,
    t.color
  order by lower(t.name)
  limit 50;
$$;

create or replace function public.join_team(
  p_team_id uuid
)
returns public.team_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_membership public.team_memberships;
  new_membership public.team_memberships;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in'
      using errcode = '40100';
  end if;

  if not exists (
    select 1
    from public.teams
    where id = p_team_id
      and allow_self_join = true
  ) then
    raise exception 'This team is not currently accepting new members'
      using errcode = '42501';
  end if;

  select *
  into existing_membership
  from public.team_memberships
  where team_id = p_team_id
    and user_id = auth.uid();

  if existing_membership.id is not null then
    return existing_membership;
  end if;

  insert into public.team_memberships (
    team_id,
    user_id,
    role
  )
  values (
    p_team_id,
    auth.uid(),
    'viewer'::public.team_member_role
  )
  returning *
  into new_membership;

  return new_membership;
end;
$$;

create or replace function public.set_team_joinable(
  p_team_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_member(
    p_team_id,
    array['manager']::public.team_member_role[]
  ) then
    raise exception 'Only the team manager can change team join settings'
      using errcode = '42501';
  end if;

  update public.teams
  set allow_self_join = p_enabled
  where id = p_team_id;

  return p_enabled;
end;
$$;

revoke all on function public.find_joinable_teams(text) from public;
grant execute on function public.find_joinable_teams(text) to authenticated;

revoke all on function public.join_team(uuid) from public;
grant execute on function public.join_team(uuid) to authenticated;

revoke all on function public.set_team_joinable(uuid, boolean) from public;
grant execute on function public.set_team_joinable(uuid, boolean) to authenticated;

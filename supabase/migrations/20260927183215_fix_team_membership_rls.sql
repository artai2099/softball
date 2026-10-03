-- Fix recursive team_memberships RLS policies.
-- Team permissions are evaluated through SECURITY DEFINER helper functions.

create or replace function public.is_team_member(
  p_team_id uuid,
  p_roles public.team_member_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and (
        p_roles is null
        or tm.role = any(p_roles)
      )
  );
$$;


create or replace function public.is_team_manager(
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_team_member(
    p_team_id,
    array['manager']::public.team_member_role[]
  );
$$;


create or replace function public.is_org_owner_for_team(
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.organization_members om
      on om.organization_id = t.organization_id
    where t.id = p_team_id
      and om.user_id = auth.uid()
      and om.role = 'owner'
  );
$$;


-- Only a team manager can manage a team.
-- Organization owners can also manage the teams in their organization.
create or replace function public.can_manage_team(
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_team_manager(p_team_id)
    or public.is_org_owner_for_team(p_team_id);
$$;


-- Team membership policies
drop policy if exists "Users can see their team memberships"
  on public.team_memberships;

drop policy if exists "Team managers can manage members"
  on public.team_memberships;

drop policy if exists "team memberships read"
  on public.team_memberships;

drop policy if exists "team managers manage members"
  on public.team_memberships;


-- A user can see their own membership.
-- A team manager or organization owner can see all memberships
-- for that team.
create policy "team memberships read"
on public.team_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_manager(team_id)
  or public.is_org_owner_for_team(team_id)
);


-- Team managers and organization owners can add members.
create policy "team managers insert members"
on public.team_memberships
for insert
to authenticated
with check (
  public.is_team_manager(team_id)
  or public.is_org_owner_for_team(team_id)
);


-- Team managers and organization owners can change member roles.
create policy "team managers update members"
on public.team_memberships
for update
to authenticated
using (
  public.is_team_manager(team_id)
  or public.is_org_owner_for_team(team_id)
)
with check (
  public.is_team_manager(team_id)
  or public.is_org_owner_for_team(team_id)
);


-- Team managers and organization owners can remove members.
create policy "team managers delete members"
on public.team_memberships
for delete
to authenticated
using (
  public.is_team_manager(team_id)
  or public.is_org_owner_for_team(team_id)
);


-- Fix access-request reads so they also use the safe helper
-- functions rather than querying team_memberships directly.
drop policy if exists "team access requests read"
  on public.team_access_requests;

create policy "team access requests read"
on public.team_access_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_manager(team_id)
  or public.is_org_owner_for_team(team_id)
);


-- Explicit function permissions.
revoke all on function public.is_team_member(
  uuid,
  public.team_member_role[]
) from public;

grant execute on function public.is_team_member(
  uuid,
  public.team_member_role[]
) to authenticated;


revoke all on function public.is_team_manager(uuid) from public;
grant execute on function public.is_team_manager(uuid) to authenticated;


revoke all on function public.is_org_owner_for_team(uuid) from public;
grant execute on function public.is_org_owner_for_team(uuid) to authenticated;


revoke all on function public.can_manage_team(uuid) from public;
grant execute on function public.can_manage_team(uuid) to authenticated;

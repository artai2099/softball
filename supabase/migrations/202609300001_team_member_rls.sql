-- Allow users who belong to a team to read that team,
-- without granting them organization membership.

drop policy if exists "members read teams" on public.teams;

create policy "members or team members read teams"
on public.teams
for select
using (
  public.is_org_member(organization_id)
  or exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = public.teams.id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "members read players" on public.players;

create policy "members or team members read players"
on public.players
for select
using (
  exists (
    select 1
    from public.teams t
    where t.id = public.players.team_id
      and (
        public.is_org_member(t.organization_id)
        or exists (
          select 1
          from public.team_memberships tm
          where tm.team_id = t.id
            and tm.user_id = auth.uid()
        )
      )
  )
);

do $$
begin
  create type public.team_access_request_status as enum (
    'pending',
    'approved',
    'denied',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;


create table if not exists public.team_access_requests (
  id uuid primary key default gen_random_uuid(),

  team_id uuid not null
    references public.teams(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  status public.team_access_request_status not null default 'pending',

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),

  unique(team_id, user_id, status)
);

create index if not exists team_access_requests_team_idx
  on public.team_access_requests(team_id);

create index if not exists team_access_requests_user_idx
  on public.team_access_requests(user_id);

alter table public.team_access_requests enable row level security;


-- Users can see their own requests.
-- Team managers and organization owners can see requests
-- for teams they manage.
create policy "team access requests read"
on public.team_access_requests
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = team_access_requests.team_id
      and tm.user_id = auth.uid()
      and tm.role = 'manager'
  )
  or exists (
    select 1
    from public.teams t
    join public.organization_members om
      on om.organization_id = t.organization_id
    where t.id = team_access_requests.team_id
      and om.user_id = auth.uid()
      and om.role = 'owner'
  )
);


-- Any member of the team's organization may request access.
-- They can only submit a request for themselves.
create policy "organization members can request team access"
on public.team_access_requests
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.teams t
    where t.id = team_access_requests.team_id
      and public.is_org_member(t.organization_id)
  )
);


-- Users may cancel their own pending request.
create policy "users can cancel own team access request"
on public.team_access_requests
for update
using (
  user_id = auth.uid()
  and status = 'pending'
)
with check (
  user_id = auth.uid()
);


-- Do not allow clients to directly delete requests.
revoke delete on public.team_access_requests from authenticated;


-- Secure function for managers/owners to approve a request.
create or replace function public.approve_team_access_request(
  p_request_id uuid
)
returns public.team_memberships
language plpgsql
security definer
set search_path = public
as $function$
declare
  request_row public.team_access_requests%rowtype;
  result_member public.team_memberships%rowtype;
  caller_can_approve boolean;
begin
  select *
    into request_row
  from public.team_access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Access request is no longer pending';
  end if;

  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = request_row.team_id
      and tm.user_id = auth.uid()
      and tm.role = 'manager'
  )
  or exists (
    select 1
    from public.teams t
    join public.organization_members om
      on om.organization_id = t.organization_id
    where t.id = request_row.team_id
      and om.user_id = auth.uid()
      and om.role = 'owner'
  )
  into caller_can_approve;

  if not caller_can_approve then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  insert into public.team_memberships(
    team_id,
    user_id,
    role
  )
  values(
    request_row.team_id,
    request_row.user_id,
    'viewer'
  )
  on conflict (team_id, user_id)
  do update set role = team_memberships.role
  returning * into result_member;

  update public.team_access_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_request_id;

  return result_member;
end;
$function$;


-- Secure function for managers/owners to deny a request.
create or replace function public.deny_team_access_request(
  p_request_id uuid
)
returns public.team_access_requests
language plpgsql
security definer
set search_path = public
as $function$
declare
  request_row public.team_access_requests%rowtype;
  result_request public.team_access_requests%rowtype;
  caller_can_approve boolean;
begin
  select *
    into request_row
  from public.team_access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Access request is no longer pending';
  end if;

  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = request_row.team_id
      and tm.user_id = auth.uid()
      and tm.role = 'manager'
  )
  or exists (
    select 1
    from public.teams t
    join public.organization_members om
      on om.organization_id = t.organization_id
    where t.id = request_row.team_id
      and om.user_id = auth.uid()
      and om.role = 'owner'
  )
  into caller_can_approve;

  if not caller_can_approve then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  update public.team_access_requests
  set
    status = 'denied',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_request_id
  returning * into result_request;

  return result_request;
end;
$function$;


revoke all on function public.approve_team_access_request(uuid) from public;
grant execute on function public.approve_team_access_request(uuid) to authenticated;

revoke all on function public.deny_team_access_request(uuid) from public;
grant execute on function public.deny_team_access_request(uuid) to authenticated;

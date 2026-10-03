create or replace function public.add_org_member_by_email(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  target_user uuid;
  caller_role public.member_role;
begin

  select role
  into caller_role
  from public.organization_members
  where organization_id=p_organization_id
  and user_id=auth.uid();

  if caller_role not in ('owner','admin') then
    raise exception 'Not authorized'
    using errcode='42501';
  end if;


  if p_role='owner' then
    raise exception 'Ownership transfer is protected'
    using errcode='22000';
  end if;


  select id
  into target_user
  from auth.users
  where lower(email)=lower(trim(p_email));


  -- NEW BEHAVIOR
  -- User does not exist yet
  if target_user is null then

    insert into public.organization_invitations
    (
      organization_id,
      email,
      role,
      created_by
    )
    values
    (
      p_organization_id,
      lower(trim(p_email)),
      p_role,
      auth.uid()
    )
    on conflict (organization_id,email)
    do update set role=excluded.role;

    return;

  end if;


  insert into public.organization_members
  (
    organization_id,
    user_id,
    role
  )
  values
  (
    p_organization_id,
    target_user,
    p_role
  )
  on conflict(organization_id,user_id)
  do update set role=excluded.role;

end;
$$;

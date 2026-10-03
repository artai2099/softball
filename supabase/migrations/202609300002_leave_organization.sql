create or replace function public.leave_organization(
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_owner_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in'
      using errcode = '40100';
  end if;

  select role::text
    into v_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_user_id;

  if v_role is null then
    raise exception 'You do not belong to this organization'
      using errcode = '42501';
  end if;

  if v_role = 'owner' then
    select count(*)
      into v_owner_count
    from public.organization_members
    where organization_id = p_organization_id
      and role::text = 'owner';

    if v_owner_count <= 1 then
      raise exception 'You are the only owner. Transfer ownership before leaving the organization.'
        using errcode = '42501';
    end if;
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_user_id;

  return true;
end;
$$;

revoke all on function public.leave_organization(uuid) from public;
grant execute on function public.leave_organization(uuid) to authenticated;

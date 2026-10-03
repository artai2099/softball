-- Teams are discoverable and joinable by default.
-- Team managers can turn self-joining off when needed.

alter table public.teams
  alter column allow_self_join set default true;

update public.teams
set allow_self_join = true
where allow_self_join = false;

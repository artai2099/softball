create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','admin','scorekeeper','viewer');
create type public.game_status as enum ('scheduled','live','final');
create type public.game_visibility as enum ('private','public');
create type public.inning_half as enum ('top','bottom');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  short_name text not null default '',
  city text not null default '',
  color text not null default '#0066b2',
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  jersey_number integer not null check (jersey_number between 0 and 999),
  position text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(team_id,jersey_number)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid() unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  home_team_id uuid references public.teams(id),
  away_team_id uuid references public.teams(id),
  home_name text not null,
  away_name text not null,
  game_date timestamptz not null,
  venue text not null default '',
  visibility public.game_visibility not null default 'private',
  status public.game_status not null default 'scheduled',
  innings_scheduled integer not null default 7 check (innings_scheduled between 1 and 12),
  inning integer not null default 1 check (inning > 0),
  half public.inning_half not null default 'top',
  outs integer not null default 0 check (outs between 0 and 2),
  balls integer not null default 0 check (balls between 0 and 3),
  strikes integer not null default 0 check (strikes between 0 and 2),
  pitch_count integer not null default 0,
  home_score integer not null default 0,
  away_score integer not null default 0,
  bases jsonb not null default '{"1":null,"2":null,"3":null}'::jsonb,
  version integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);

create index games_organization_date_idx on public.games(organization_id,game_date desc);
create index games_public_id_idx on public.games(public_id);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  sequence integer not null,
  idempotency_key uuid not null,
  result text not null,
  details jsonb not null default '{}'::jsonb,
  state_after jsonb not null,
  recorded_by uuid references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(game_id,sequence),
  unique(game_id,idempotency_key)
);

create table public.api_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  primary key(key_hash,window_start)
);
create index api_rate_limits_window_idx on public.api_rate_limits(window_start);

create or replace function public.is_org_member(org_id uuid, allowed_roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id=org_id and m.user_id=auth.uid()
      and (allowed_roles is null or m.role=any(allowed_roles))
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_events enable row level security;
alter table public.api_rate_limits enable row level security;

create policy "profiles own read" on public.profiles for select using (id=auth.uid());
create policy "profiles own update" on public.profiles for update using (id=auth.uid());
create policy "members read organizations" on public.organizations for select using (public.is_org_member(id));
create policy "members read memberships" on public.organization_members for select using (public.is_org_member(organization_id));
create policy "admins manage memberships" on public.organization_members for all using (public.is_org_member(organization_id,array['owner','admin']::public.member_role[])) with check (public.is_org_member(organization_id,array['owner','admin']::public.member_role[]));
create policy "members read teams" on public.teams for select using (public.is_org_member(organization_id));
create policy "staff create teams" on public.teams for insert with check (public.is_org_member(organization_id,array['owner','admin','scorekeeper']::public.member_role[]));
create policy "staff update teams" on public.teams for update using (public.is_org_member(organization_id,array['owner','admin','scorekeeper']::public.member_role[]));
create policy "members read players" on public.players for select using (exists(select 1 from public.teams t where t.id=team_id and public.is_org_member(t.organization_id)));
create policy "staff manage players" on public.players for all using (exists(select 1 from public.teams t where t.id=team_id and public.is_org_member(t.organization_id,array['owner','admin','scorekeeper']::public.member_role[]))) with check (exists(select 1 from public.teams t where t.id=team_id and public.is_org_member(t.organization_id,array['owner','admin','scorekeeper']::public.member_role[])));
create policy "members or public read games" on public.games for select using (visibility='public' or public.is_org_member(organization_id));
create policy "staff create games" on public.games for insert with check (public.is_org_member(organization_id,array['owner','admin','scorekeeper']::public.member_role[]) and created_by=auth.uid());
create policy "staff update games" on public.games for update using (public.is_org_member(organization_id,array['owner','admin','scorekeeper']::public.member_role[]));
create policy "members or public read events" on public.game_events for select using (exists(select 1 from public.games g where g.id=game_id and (g.visibility='public' or public.is_org_member(g.organization_id))));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare org_id uuid; clean_name text;
begin
  clean_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1));
  insert into public.profiles(id,display_name) values(new.id,clean_name);
  insert into public.organizations(name,slug,created_by)
  values(clean_name||'''s organization',lower(regexp_replace(clean_name,'[^a-zA-Z0-9]+','-','g'))||'-'||left(new.id::text,8),new.id)
  returning id into org_id;
  insert into public.organization_members(organization_id,user_id,role) values(org_id,new.id,'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.consume_rate_limit(p_key_hash text,p_limit integer default 60,p_window_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public as $$
declare bucket timestamptz; current_count integer;
begin
  if random()<0.01 then delete from public.api_rate_limits where window_start<now()-interval '1 day'; end if;
  bucket:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  insert into public.api_rate_limits(key_hash,window_start,request_count) values(p_key_hash,bucket,1)
  on conflict(key_hash,window_start) do update set request_count=api_rate_limits.request_count+1
  returning request_count into current_count;
  return current_count<=p_limit;
end $$;

create or replace function public.list_org_members(p_organization_id uuid)
returns table(user_id uuid,email text,display_name text,role public.member_role)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_org_member(p_organization_id,array['owner','admin']::public.member_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select m.user_id,u.email,p.display_name,m.role from public.organization_members m join auth.users u on u.id=m.user_id join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id order by p.display_name;
end $$;

create or replace function public.add_org_member_by_email(p_organization_id uuid,p_email text,p_role public.member_role)
returns void language plpgsql security definer set search_path=public as $$
declare target_user uuid; caller_role public.member_role;
begin
  select role into caller_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid();
  if caller_role not in ('owner','admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_role='owner' then raise exception 'Ownership transfer is a separate protected operation' using errcode='22000'; end if;
  if caller_role='admin' and p_role='admin' then raise exception 'Only an owner may add another administrator' using errcode='42501'; end if;
  select id into target_user from auth.users where lower(email)=lower(trim(p_email));
  if target_user is null then raise exception 'That user must create a GameDay account before being added' using errcode='P0002'; end if;
  if exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=target_user and role='owner') then raise exception 'The organization owner role cannot be changed here' using errcode='22000'; end if;
  insert into public.organization_members(organization_id,user_id,role) values(p_organization_id,target_user,p_role)
  on conflict(organization_id,user_id) do update set role=excluded.role;
end $$;

create or replace function public.record_game_event(
  p_game_id uuid,
  p_result text,
  p_details jsonb,
  p_idempotency_key uuid,
  p_expected_version integer
) returns public.games language plpgsql security definer set search_path=public as $$
declare
  g public.games%rowtype; existing_event public.game_events%rowtype; event_sequence integer;
  final_result text:=p_result; runner text:=p_idempotency_key::text; runs integer:=0; out_delta integer:=0;
  valid_positions text[]:=array['P','C','1B','2B','3B','SS','LF','CF','RF']; required_key text;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found' using errcode='P0002'; end if;
  if not public.is_org_member(g.organization_id,array['owner','admin','scorekeeper']::public.member_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into existing_event from public.game_events where game_id=p_game_id and idempotency_key=p_idempotency_key;
  if found then return g; end if;
  if g.version<>p_expected_version then raise exception 'Game was updated by another scorekeeper' using errcode='40001'; end if;
  if g.status='final' then raise exception 'Game is final' using errcode='22000'; end if;
  if g.status='scheduled' then g.status:='live'; end if;
  if p_result not in ('ball','strike','foul','single','double','triple','home_run','walk','hbp','strikeout','out','error','double_play','triple_play') then raise exception 'Unsupported result' using errcode='22000'; end if;
  foreach required_key in array case p_result when 'error' then array['error_position'] when 'out' then array['out_position_1'] when 'double_play' then array['out_position_1','out_position_2'] when 'triple_play' then array['out_position_1','out_position_2','out_position_3'] else array[]::text[] end loop
    if not (upper(coalesce(p_details->>required_key,''))=any(valid_positions)) then raise exception 'A valid defensive position is required for %',replace(required_key,'_',' ') using errcode='22000'; end if;
  end loop;
  if p_result in ('ball','strike','foul','single','double','triple','home_run','walk','hbp','strikeout','out','error','double_play','triple_play') then g.pitch_count:=g.pitch_count+1; end if;
  if p_result='ball' then g.balls:=g.balls+1; if g.balls>=4 then final_result:='walk'; g.balls:=0; g.strikes:=0; end if;
  elsif p_result='strike' then g.strikes:=g.strikes+1; if g.strikes>=3 then final_result:='strikeout'; g.strikes:=0; g.balls:=0; out_delta:=1; end if;
  elsif p_result='foul' then if g.strikes<2 then g.strikes:=g.strikes+1; end if;
  elsif p_result in ('strikeout','out') then out_delta:=1; g.balls:=0; g.strikes:=0;
  elsif p_result='double_play' then out_delta:=2; g.balls:=0; g.strikes:=0;
  elsif p_result='triple_play' then out_delta:=3; g.balls:=0; g.strikes:=0;
  else g.balls:=0; g.strikes:=0;
  end if;
  if final_result in ('walk','hbp') then
    if g.bases->>'1' is not null then
      if g.bases->>'2' is not null then
        if g.bases->>'3' is not null then runs:=runs+1; end if;
        g.bases:=jsonb_set(g.bases,'{3}',coalesce(g.bases->'2','null'::jsonb));
      end if;
      g.bases:=jsonb_set(g.bases,'{2}',coalesce(g.bases->'1','null'::jsonb));
    end if;
    g.bases:=jsonb_set(g.bases,'{1}',to_jsonb(runner));
  elsif final_result in ('single','error') then
    if g.bases->>'3' is not null then runs:=runs+1; end if;
    g.bases:=jsonb_build_object('1',runner,'2',g.bases->'1','3',g.bases->'2');
  elsif final_result='double' then
    if g.bases->>'3' is not null then runs:=runs+1; end if; if g.bases->>'2' is not null then runs:=runs+1; end if;
    g.bases:=jsonb_build_object('1',null,'2',runner,'3',g.bases->'1');
  elsif final_result='triple' then
    runs:=(case when g.bases->>'1' is null then 0 else 1 end)+(case when g.bases->>'2' is null then 0 else 1 end)+(case when g.bases->>'3' is null then 0 else 1 end);
    g.bases:=jsonb_build_object('1',null,'2',null,'3',runner);
  elsif final_result='home_run' then
    runs:=1+(case when g.bases->>'1' is null then 0 else 1 end)+(case when g.bases->>'2' is null then 0 else 1 end)+(case when g.bases->>'3' is null then 0 else 1 end);
    g.bases:='{"1":null,"2":null,"3":null}'::jsonb;
  end if;
  if g.half='top' then g.away_score:=g.away_score+runs; else g.home_score:=g.home_score+runs; end if;
  if g.half='bottom' and g.inning>=g.innings_scheduled and g.home_score>g.away_score then g.status:='final'; end if;
  g.outs:=g.outs+out_delta;
  if g.outs>=3 then
    g.outs:=0; g.balls:=0; g.strikes:=0; g.bases:='{"1":null,"2":null,"3":null}'::jsonb;
    if g.half='top' and g.inning>=g.innings_scheduled and g.home_score>g.away_score then g.status:='final';
    elsif g.half='bottom' and g.inning>=g.innings_scheduled and g.home_score<>g.away_score then g.status:='final';
    elsif g.half='top' then g.half:='bottom';
    else g.half:='top'; g.inning:=g.inning+1;
    end if;
  end if;
  g.version:=g.version+1; g.updated_at:=now();
  select coalesce(max(sequence),0)+1 into event_sequence from public.game_events where game_id=p_game_id;
  update public.games set status=g.status,inning=g.inning,half=g.half,outs=g.outs,balls=g.balls,strikes=g.strikes,pitch_count=g.pitch_count,home_score=g.home_score,away_score=g.away_score,bases=g.bases,version=g.version,updated_at=g.updated_at where id=g.id returning * into g;
  insert into public.game_events(game_id,sequence,idempotency_key,result,details,state_after,recorded_by)
  values(g.id,event_sequence,p_idempotency_key,final_result,p_details,jsonb_build_object('status',g.status,'inning',g.inning,'half',g.half,'outs',g.outs,'balls',g.balls,'strikes',g.strikes,'pitch_count',g.pitch_count,'home_score',g.home_score,'away_score',g.away_score,'bases',g.bases,'version',g.version),auth.uid());
  return g;
end $$;

create or replace function public.undo_game_event(p_game_id uuid,p_expected_version integer)
returns public.games language plpgsql security definer set search_path=public as $$
declare g public.games%rowtype; target_event public.game_events%rowtype; previous_event public.game_events%rowtype; state jsonb; new_version integer;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found' using errcode='P0002'; end if;
  if not public.is_org_member(g.organization_id,array['owner','admin','scorekeeper']::public.member_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if g.version<>p_expected_version then raise exception 'Game was updated by another scorekeeper' using errcode='40001'; end if;
  select * into target_event from public.game_events where game_id=p_game_id and voided_at is null order by sequence desc limit 1;
  if not found then raise exception 'There is no play to undo' using errcode='22000'; end if;
  update public.game_events set voided_at=now(),voided_by=auth.uid() where id=target_event.id;
  select * into previous_event from public.game_events where game_id=p_game_id and voided_at is null order by sequence desc limit 1;
  new_version:=g.version+1;
  if found then state:=previous_event.state_after;
  else state:='{"status":"live","inning":1,"half":"top","outs":0,"balls":0,"strikes":0,"pitch_count":0,"home_score":0,"away_score":0,"bases":{"1":null,"2":null,"3":null}}'::jsonb;
  end if;
  update public.games set
    status=coalesce((state->>'status')::public.game_status,'live'),inning=coalesce((state->>'inning')::integer,1),half=coalesce((state->>'half')::public.inning_half,'top'),
    outs=coalesce((state->>'outs')::integer,0),balls=coalesce((state->>'balls')::integer,0),strikes=coalesce((state->>'strikes')::integer,0),pitch_count=coalesce((state->>'pitch_count')::integer,0),
    home_score=coalesce((state->>'home_score')::integer,0),away_score=coalesce((state->>'away_score')::integer,0),bases=coalesce(state->'bases','{"1":null,"2":null,"3":null}'::jsonb),version=new_version,updated_at=now()
  where id=p_game_id returning * into g;
  return g;
end $$;

create or replace function public.finish_game(p_game_id uuid,p_expected_version integer)
returns public.games language plpgsql security definer set search_path=public as $$
declare g public.games%rowtype;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found' using errcode='P0002'; end if;
  if not public.is_org_member(g.organization_id,array['owner','admin','scorekeeper']::public.member_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if g.version<>p_expected_version then raise exception 'Game was updated by another scorekeeper' using errcode='40001'; end if;
  update public.games set status='final',version=version+1,updated_at=now() where id=p_game_id returning * into g;
  return g;
end $$;

revoke all on function public.record_game_event(uuid,text,jsonb,uuid,integer) from public;
grant execute on function public.record_game_event(uuid,text,jsonb,uuid,integer) to authenticated;
revoke all on function public.undo_game_event(uuid,integer) from public;
grant execute on function public.undo_game_event(uuid,integer) to authenticated;
revoke all on function public.finish_game(uuid,integer) from public;
grant execute on function public.finish_game(uuid,integer) to authenticated;
revoke all on function public.consume_rate_limit(text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
revoke all on function public.list_org_members(uuid) from public;
grant execute on function public.list_org_members(uuid) to authenticated;
revoke all on function public.add_org_member_by_email(uuid,text,public.member_role) from public;
grant execute on function public.add_org_member_by_email(uuid,text,public.member_role) to authenticated;

alter publication supabase_realtime add table public.games,public.game_events;

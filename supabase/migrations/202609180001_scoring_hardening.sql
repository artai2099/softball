-- GameDay Pro scoring hardening: additive migration.
-- Adds batter tracking and replaces the scoring/undo RPCs without changing their public signatures.

alter table public.games add column if not exists current_batter_id uuid references public.players(id);

create or replace function public.record_game_event(
  p_game_id uuid,
  p_result text,
  p_details jsonb,
  p_idempotency_key uuid,
  p_expected_version integer
) returns public.games language plpgsql security definer set search_path=public as $$
declare
  g public.games%rowtype; existing_event public.game_events%rowtype; event_sequence integer;
  final_result text:=p_result; runner text:=coalesce(nullif(p_details->>'batter_id',''),p_idempotency_key::text); batter_id uuid; runs integer:=0; out_delta integer:=0;
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
  if p_details ? 'batter_id' then
    begin batter_id:=(p_details->>'batter_id')::uuid; exception when invalid_text_representation then raise exception 'Invalid batter_id' using errcode='22000'; end;
    if g.home_team_id is not null and not exists(select 1 from public.players p where p.id=batter_id and p.team_id=g.home_team_id and p.active) then raise exception 'Batter is not an active player on the home team' using errcode='22000'; end if;
    g.current_batter_id:=batter_id;
  end if;
  if p_result not in ('ball','strike','foul','single','double','triple','home_run','walk','hbp','strikeout','out','error','double_play','triple_play') then raise exception 'Unsupported result' using errcode='22000'; end if;
  foreach required_key in array case p_result when 'error' then array['error_position'] when 'out' then array['out_position_1'] when 'double_play' then array['out_position_1','out_position_2'] when 'triple_play' then array['out_position_1','out_position_2','out_position_3'] else array[]::text[] end loop
    if not (upper(coalesce(p_details->>required_key,''))=any(valid_positions)) then raise exception 'A valid defensive position is required for %',replace(required_key,'_',' ') using errcode='22000'; end if;
  end loop;
  if p_result in ('ball','strike','foul','single','double','triple','home_run','hbp','error','out','double_play','triple_play') then g.pitch_count:=g.pitch_count+1; end if;
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
  update public.games set status=g.status,inning=g.inning,half=g.half,outs=g.outs,balls=g.balls,strikes=g.strikes,pitch_count=g.pitch_count,current_batter_id=g.current_batter_id,home_score=g.home_score,away_score=g.away_score,bases=g.bases,version=g.version,updated_at=g.updated_at where id=g.id returning * into g;
  insert into public.game_events(game_id,sequence,idempotency_key,result,details,state_after,recorded_by)
  values(g.id,event_sequence,p_idempotency_key,final_result,p_details,jsonb_build_object('status',g.status,'inning',g.inning,'half',g.half,'outs',g.outs,'balls',g.balls,'strikes',g.strikes,'pitch_count',g.pitch_count,'current_batter_id',g.current_batter_id,'home_score',g.home_score,'away_score',g.away_score,'bases',g.bases,'version',g.version),auth.uid());
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
  if g.status='final' then raise exception 'Final games must be reopened before undo' using errcode='22000'; end if;
  select * into target_event from public.game_events where game_id=p_game_id and voided_at is null order by sequence desc limit 1;
  if not found then raise exception 'There is no play to undo' using errcode='22000'; end if;
  update public.game_events set voided_at=now(),voided_by=auth.uid() where id=target_event.id;
  select * into previous_event from public.game_events where game_id=p_game_id and voided_at is null order by sequence desc limit 1;
  new_version:=g.version+1;
  if found then state:=previous_event.state_after;
  else state:='{"status":"live","inning":1,"half":"top","outs":0,"balls":0,"strikes":0,"pitch_count":0,"current_batter_id":null,"home_score":0,"away_score":0,"bases":{"1":null,"2":null,"3":null}}'::jsonb;
  end if;
  update public.games set
    status=coalesce((state->>'status')::public.game_status,'live'),inning=coalesce((state->>'inning')::integer,1),half=coalesce((state->>'half')::public.inning_half,'top'),
    outs=coalesce((state->>'outs')::integer,0),balls=coalesce((state->>'balls')::integer,0),strikes=coalesce((state->>'strikes')::integer,0),pitch_count=coalesce((state->>'pitch_count')::integer,0),current_batter_id=nullif(state->>'current_batter_id','')::uuid,
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

create or replace function public.reopen_game(p_game_id uuid,p_expected_version integer)
returns public.games language plpgsql security definer set search_path=public as $$
declare g public.games%rowtype;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found' using errcode='P0002'; end if;
  if not public.is_org_member(g.organization_id,array['owner','admin','scorekeeper']::public.member_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if g.version<>p_expected_version then raise exception 'Game was updated by another scorekeeper' using errcode='40001'; end if;
  if g.status<>'final' then raise exception 'Game is not final' using errcode='22000'; end if;
  update public.games set status='live',version=version+1,updated_at=now() where id=p_game_id returning * into g;
  return g;
end $$;

revoke all on function public.record_game_event(uuid,text,jsonb,uuid,integer) from public;
grant execute on function public.record_game_event(uuid,text,jsonb,uuid,integer) to authenticated;
revoke all on function public.undo_game_event(uuid,integer) from public;
grant execute on function public.undo_game_event(uuid,integer) to authenticated;
revoke all on function public.finish_game(uuid,integer) from public;
grant execute on function public.finish_game(uuid,integer) to authenticated;
revoke all on function public.reopen_game(uuid,integer) from public;
grant execute on function public.reopen_game(uuid,integer) to authenticated;

-- Transactional, auditable base-running actions for GameDay Pro.
-- Runner actions use the same event history and optimistic versioning as normal plays,
-- so Undo restores the exact prior game snapshot.

create or replace function public.record_runner_action(
  p_game_id uuid,
  p_action text,
  p_base_from text,
  p_base_to text,
  p_idempotency_key uuid,
  p_expected_version integer
) returns public.games
language plpgsql
security definer
set search_path=public
as $$
declare
  g public.games%rowtype;
  event_sequence integer;
  runner_id text;
  runs integer:=0;
  state jsonb;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found' using errcode='P0002'; end if;
  if not public.can_score_game(p_game_id) then raise exception 'Not authorized' using errcode='42501'; end if;

  if exists(select 1 from public.game_events where game_id=p_game_id and idempotency_key=p_idempotency_key) then
    return g;
  end if;
  if g.version<>p_expected_version then
    raise exception 'Game was updated by another scorekeeper' using errcode='40001';
  end if;
  if g.status='final' then raise exception 'Game is final' using errcode='22000'; end if;
  if p_action not in ('advance','score','out') then
    raise exception 'Unsupported runner action' using errcode='22000';
  end if;
  if p_base_from not in ('1','2','3') then
    raise exception 'Choose a runner on first, second, or third' using errcode='22000';
  end if;

  runner_id:=g.bases->>p_base_from;
  if runner_id is null or runner_id='' then
    raise exception 'There is no runner on that base' using errcode='22000';
  end if;

  if p_action='advance' then
    if p_base_from='3' then
      raise exception 'A runner on third must score or be recorded out' using errcode='22000';
    end if;
    if p_base_to is distinct from (case p_base_from when '1' then '2' else '3' end) then
      raise exception 'Runner must advance to the next base' using errcode='22000';
    end if;
    if g.bases->>p_base_to is not null then
      raise exception 'That base is occupied. Move that runner first.' using errcode='22000';
    end if;
    g.bases:=jsonb_set(g.bases,array[p_base_to],to_jsonb(runner_id),true);
    g.bases:=jsonb_set(g.bases,array[p_base_from],'null'::jsonb,true);
  elsif p_action='score' then
    if g.half='top' then g.away_score:=g.away_score+1; else g.home_score:=g.home_score+1; end if;
    g.bases:=jsonb_set(g.bases,array[p_base_from],'null'::jsonb,true);
    if g.half='bottom' and g.inning>=g.innings_scheduled and g.home_score>g.away_score then
      g.status:='final';
    end if;
  else
    g.bases:=jsonb_set(g.bases,array[p_base_from],'null'::jsonb,true);
    g.outs:=g.outs+1;
    if g.outs>=3 then
      g.outs:=0;
      g.balls:=0;
      g.strikes:=0;
      g.bases:='{"1":null,"2":null,"3":null}'::jsonb;
      if g.half='top' and g.inning>=g.innings_scheduled and g.home_score>g.away_score then
        g.status:='final';
      elsif g.half='bottom' and g.inning>=g.innings_scheduled and g.home_score<>g.away_score then
        g.status:='final';
      elsif g.half='top' then
        g.half:='bottom';
      else
        g.half:='top';
        g.inning:=g.inning+1;
      end if;
    end if;
  end if;

  if g.status='scheduled' then g.status:='live'; end if;
  g.version:=g.version+1;
  g.updated_at:=now();

  select coalesce(max(sequence),0)+1 into event_sequence
    from public.game_events where game_id=p_game_id;

  update public.games
     set status=g.status, inning=g.inning, half=g.half, outs=g.outs,
         balls=g.balls, strikes=g.strikes, pitch_count=g.pitch_count,
         current_batter_id=g.current_batter_id, home_score=g.home_score,
         away_score=g.away_score, bases=g.bases, version=g.version, updated_at=g.updated_at
   where id=g.id returning * into g;

  state:=jsonb_build_object(
    'status',g.status,'inning',g.inning,'half',g.half,'outs',g.outs,
    'balls',g.balls,'strikes',g.strikes,'pitch_count',g.pitch_count,
    'current_batter_id',g.current_batter_id,'home_score',g.home_score,
    'away_score',g.away_score,'bases',g.bases,'version',g.version
  );

  insert into public.game_events(
    game_id,sequence,idempotency_key,result,details,state_after,recorded_by
  ) values (
    g.id,event_sequence,p_idempotency_key,
    case p_action when 'advance' then 'runner_advance' when 'score' then 'runner_score' else 'runner_out' end,
    jsonb_build_object('base_from',p_base_from,'base_to',p_base_to,'runner_id',runner_id),
    state,auth.uid()
  );

  return g;
end;
$$;

revoke all on function public.record_runner_action(uuid,text,text,text,uuid,integer) from public;
grant execute on function public.record_runner_action(uuid,text,text,text,uuid,integer) to authenticated;

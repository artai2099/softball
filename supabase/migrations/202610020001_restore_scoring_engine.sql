-- GameDay Pro: restore the transactional scoring engine.
--
-- The 20261001005613 migration accidentally replaced record_game_event with
-- a stub that only inserted an event and incremented version. Restore the
-- complete transactional scorer so every play updates the real game state.

create or replace function public.record_game_event(
  p_game_id uuid,
  p_result text,
  p_details jsonb,
  p_idempotency_key uuid,
  p_expected_version integer
) returns public.games
language plpgsql
security definer
set search_path=public
as $$
declare
  g public.games%rowtype;
  existing_event public.game_events%rowtype;
  event_sequence integer;
  final_result text:=p_result;
  runner text:=coalesce(nullif(p_details->>'batter_id',''),p_idempotency_key::text);
  batter_id uuid;
  next_batter_id uuid;
  lineup_id uuid;
  current_order integer;
  runs integer:=0;
  out_delta integer:=0;
  valid_positions text[]:=array['P','C','1B','2B','3B','SS','LF','CF','RF'];
  required_key text;
begin
  select *
    into g
    from public.games
   where id=p_game_id
   for update;

  if not found then
    raise exception 'Game not found' using errcode='P0002';
  end if;

  if not public.can_score_game(p_game_id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select *
    into existing_event
    from public.game_events
   where game_id=p_game_id
     and idempotency_key=p_idempotency_key;

  if found then
    return g;
  end if;

  if g.version<>p_expected_version then
    raise exception 'Game was updated by another scorekeeper' using errcode='40001';
  end if;

  if g.status='final' then
    raise exception 'Game is final' using errcode='22000';
  end if;

  if g.status='scheduled' then
    g.status:='live';
  end if;

  -- Load the saved home-team lineup when the home team is batting.
  if g.half='bottom' and g.home_team_id is not null then
    select gl.id
      into lineup_id
      from public.game_lineups gl
     where gl.game_id=g.id
       and gl.team_id=g.home_team_id
     limit 1;

    if lineup_id is not null then
      -- If this is the first home-team plate appearance, start with
      -- the first active batter in the saved order.
      if g.current_batter_id is null then
        select glp.player_id
          into g.current_batter_id
          from public.game_lineup_players glp
         where glp.lineup_id=lineup_id
           and glp.active=true
           and glp.batting_order is not null
         order by glp.batting_order
         limit 1;
      end if;

      if g.current_batter_id is null then
        raise exception 'The home team lineup has no active batting-order player' using errcode='22000';
      end if;

      -- The client may identify the batter, but it must match the saved
      -- batting order. This prevents arbitrary batter IDs from entering stats.
      if p_details ? 'batter_id' then
        begin
          batter_id:=(p_details->>'batter_id')::uuid;
        exception when invalid_text_representation then
          raise exception 'Invalid batter_id' using errcode='22000';
        end;

        if batter_id<>g.current_batter_id then
          raise exception 'Batter does not match the saved batting order' using errcode='22000';
        end if;
      end if;
    elsif p_details ? 'batter_id' then
      begin
        batter_id:=(p_details->>'batter_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid batter_id' using errcode='22000';
      end;

      if not exists (
        select 1
          from public.players p
         where p.id=batter_id
           and p.team_id=g.home_team_id
           and p.active
      ) then
        raise exception 'Batter is not an active player on the home team' using errcode='22000';
      end if;

      g.current_batter_id:=batter_id;
    end if;
  elsif p_details ? 'batter_id' then
    begin
      batter_id:=(p_details->>'batter_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid batter_id' using errcode='22000';
    end;

    if g.home_team_id is not null
       and not exists (
         select 1
           from public.players p
          where p.id=batter_id
            and p.team_id=g.home_team_id
            and p.active
       )
    then
      raise exception 'Batter is not an active player on the home team' using errcode='22000';
    end if;

    g.current_batter_id:=batter_id;
  end if;

  if p_result not in (
    'ball','strike','foul','single','double','triple','home_run',
    'walk','hbp','strikeout','out','error','double_play','triple_play'
  ) then
    raise exception 'Unsupported result' using errcode='22000';
  end if;

  foreach required_key in array
    case p_result
      when 'error' then array['error_position']
      when 'out' then array['out_position_1']
      when 'double_play' then array['out_position_1','out_position_2']
      when 'triple_play' then array['out_position_1','out_position_2','out_position_3']
      else array[]::text[]
    end
  loop
    if not (upper(coalesce(p_details->>required_key,''))=any(valid_positions)) then
      raise exception 'A valid defensive position is required for %',
        replace(required_key,'_',' ')
        using errcode='22000';
    end if;
  end loop;

  if p_result in (
    'ball','strike','foul','single','double','triple','home_run',
    'hbp','error','out','double_play','triple_play'
  ) then
    g.pitch_count:=g.pitch_count+1;
  end if;

  if p_result='ball' then
    g.balls:=g.balls+1;

    if g.balls>=4 then
      final_result:='walk';
      g.balls:=0;
      g.strikes:=0;
    end if;

  elsif p_result='strike' then
    g.strikes:=g.strikes+1;

    if g.strikes>=3 then
      final_result:='strikeout';
      g.strikes:=0;
      g.balls:=0;
      out_delta:=1;
    end if;

  elsif p_result='foul' then
    if g.strikes<2 then
      g.strikes:=g.strikes+1;
    end if;

  elsif p_result in ('strikeout','out') then
    out_delta:=1;
    g.balls:=0;
    g.strikes:=0;

  elsif p_result='double_play' then
    out_delta:=2;
    g.balls:=0;
    g.strikes:=0;

  elsif p_result='triple_play' then
    out_delta:=3;
    g.balls:=0;
    g.strikes:=0;

  else
    g.balls:=0;
    g.strikes:=0;
  end if;

  if final_result in ('walk','hbp') then
    if g.bases->>'1' is not null then
      if g.bases->>'2' is not null then
        if g.bases->>'3' is not null then
          runs:=runs+1;
        end if;

        g.bases:=jsonb_set(
          g.bases,
          '{3}',
          coalesce(g.bases->'2','null'::jsonb)
        );
      end if;

      g.bases:=jsonb_set(
        g.bases,
        '{2}',
        coalesce(g.bases->'1','null'::jsonb)
      );
    end if;

    g.bases:=jsonb_set(g.bases,'{1}',to_jsonb(runner));

  elsif final_result in ('single','error') then
    if g.bases->>'3' is not null then
      runs:=runs+1;
    end if;

    g.bases:=jsonb_build_object(
      '1',runner,
      '2',g.bases->'1',
      '3',g.bases->'2'
    );

  elsif final_result='double' then
    if g.bases->>'3' is not null then
      runs:=runs+1;
    end if;

    if g.bases->>'2' is not null then
      runs:=runs+1;
    end if;

    g.bases:=jsonb_build_object(
      '1',null,
      '2',runner,
      '3',g.bases->'1'
    );

  elsif final_result='triple' then
    runs:=
      (case when g.bases->>'1' is null then 0 else 1 end)
      +(case when g.bases->>'2' is null then 0 else 1 end)
      +(case when g.bases->>'3' is null then 0 else 1 end);

    g.bases:=jsonb_build_object(
      '1',null,
      '2',null,
      '3',runner
    );

  elsif final_result='home_run' then
    runs:=
      1
      +(case when g.bases->>'1' is null then 0 else 1 end)
      +(case when g.bases->>'2' is null then 0 else 1 end)
      +(case when g.bases->>'3' is null then 0 else 1 end);

    g.bases:='{"1":null,"2":null,"3":null}'::jsonb;
  end if;

  if g.half='top' then
    g.away_score:=g.away_score+runs;
  else
    g.home_score:=g.home_score+runs;
  end if;

  if g.half='bottom'
     and g.inning>=g.innings_scheduled
     and g.home_score>g.away_score then
    g.status:='final';
  end if;

  g.outs:=g.outs+out_delta;

  if g.outs>=3 then
    g.outs:=0;
    g.balls:=0;
    g.strikes:=0;
    g.bases:='{"1":null,"2":null,"3":null}'::jsonb;

    if g.half='top'
       and g.inning>=g.innings_scheduled
       and g.home_score>g.away_score then
      g.status:='final';

    elsif g.half='bottom'
       and g.inning>=g.innings_scheduled
       and g.home_score<>g.away_score then
      g.status:='final';

    elsif g.half='top' then
      g.half:='bottom';

    else
      g.half:='top';
      g.inning:=g.inning+1;
    end if;
  end if;

  -- A completed plate appearance advances the saved batting order.
  -- Balls, strikes and fouls leave the current batter unchanged.
  if lineup_id is not null
     and g.half='bottom'
     and final_result in (
       'walk','hbp','single','double','triple','home_run',
       'strikeout','out','error','double_play','triple_play'
     )
     and g.current_batter_id is not null
  then
    select glp.batting_order
      into current_order
      from public.game_lineup_players glp
     where glp.lineup_id=lineup_id
       and glp.player_id=g.current_batter_id
     limit 1;

    if current_order is not null then
      select glp.player_id
        into next_batter_id
        from public.game_lineup_players glp
       where glp.lineup_id=lineup_id
         and glp.active=true
         and glp.batting_order is not null
         and glp.batting_order>current_order
       order by glp.batting_order
       limit 1;

      if next_batter_id is null then
        select glp.player_id
          into next_batter_id
          from public.game_lineup_players glp
         where glp.lineup_id=lineup_id
           and glp.active=true
           and glp.batting_order is not null
         order by glp.batting_order
         limit 1;
      end if;

      g.current_batter_id:=next_batter_id;
    end if;
  end if;

  g.version:=g.version+1;
  g.updated_at:=now();

  select coalesce(max(sequence),0)+1
    into event_sequence
    from public.game_events
   where game_id=p_game_id;

  update public.games
     set status=g.status,
         inning=g.inning,
         half=g.half,
         outs=g.outs,
         balls=g.balls,
         strikes=g.strikes,
         pitch_count=g.pitch_count,
         current_batter_id=g.current_batter_id,
         home_score=g.home_score,
         away_score=g.away_score,
         bases=g.bases,
         version=g.version,
         updated_at=g.updated_at
   where id=g.id
  returning * into g;

  insert into public.game_events(
    game_id,
    sequence,
    idempotency_key,
    result,
    details,
    state_after,
    recorded_by
  )
  values(
    g.id,
    event_sequence,
    p_idempotency_key,
    final_result,
    p_details,
    jsonb_build_object(
      'status',g.status,
      'inning',g.inning,
      'half',g.half,
      'outs',g.outs,
      'balls',g.balls,
      'strikes',g.strikes,
      'pitch_count',g.pitch_count,
      'current_batter_id',g.current_batter_id,
      'home_score',g.home_score,
      'away_score',g.away_score,
      'bases',g.bases,
      'version',g.version
    ),
    auth.uid()
  );

  return g;
end
$$;

-- Keep the RPC callable by authenticated scorekeepers and protected from
-- anonymous execution.
revoke all on function public.record_game_event(uuid,text,jsonb,uuid,integer) from public;
grant execute on function public.record_game_event(uuid,text,jsonb,uuid,integer) to authenticated;

-- Fix ambiguous lineup_id reference in substitution function.

create or replace function public.record_game_substitution(
  p_game_id uuid,
  p_outgoing_player_id uuid,
  p_incoming_player_id uuid,
  p_batting_order integer,
  p_position text,
  p_expected_version integer
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_lineup_id uuid;
  outgoing public.game_lineup_players%rowtype;
  incoming_team_id uuid;
  effective_position text;
begin
  select *
    into g
    from public.games
   where id = p_game_id
   for update;

  if not found then
    raise exception 'Game not found'
      using errcode='P0002';
  end if;

  if not public.can_score_game(p_game_id) then
    raise exception 'Not authorized'
      using errcode='42501';
  end if;

  if g.status <> 'live' then
    raise exception 'Substitutions can only be made during a live game'
      using errcode='22000';
  end if;

  if g.version <> p_expected_version then
    raise exception 'Game was updated by another scorekeeper'
      using errcode='40001';
  end if;

  if p_batting_order is null or p_batting_order <= 0 then
    raise exception 'A valid batting order is required'
      using errcode='22000';
  end if;

  select gl.id
    into v_lineup_id
    from public.game_lineups gl
   where gl.game_id = g.id
     and gl.team_id = g.home_team_id
   limit 1;

  if v_lineup_id is null then
    raise exception 'Home lineup not found'
      using errcode='22000';
  end if;

  select *
    into outgoing
    from public.game_lineup_players glp
   where glp.lineup_id = v_lineup_id
     and glp.player_id = p_outgoing_player_id
     and glp.batting_order = p_batting_order
     and glp.active = true
   limit 1;

  if not found then
    raise exception 'Outgoing player is not active in that batting spot'
      using errcode='22000';
  end if;

  select p.team_id
    into incoming_team_id
    from public.players p
   where p.id = p_incoming_player_id
     and p.active = true
   limit 1;

  if not found or incoming_team_id <> g.home_team_id then
    raise exception 'Incoming player is not an active home-team player'
      using errcode='22000';
  end if;

  if exists (
    select 1
      from public.game_lineup_players glp
     where glp.lineup_id = v_lineup_id
       and glp.player_id = p_incoming_player_id
       and glp.active = true
  ) then
    raise exception 'Incoming player is already active in the lineup'
      using errcode='22000';
  end if;

  effective_position :=
    coalesce(
      nullif(trim(p_position), ''),
      outgoing.position,
      ''
    );

  insert into public.game_substitutions (
    game_id,
    inning,
    half,
    batting_order,
    outgoing_player_id,
    incoming_player_id,
    position,
    created_by
  )
  values (
    g.id,
    g.inning,
    g.half,
    p_batting_order,
    p_outgoing_player_id,
    p_incoming_player_id,
    effective_position,
    auth.uid()
  );

  update public.game_lineup_players
     set active = false,
         left_at = now()
   where id = outgoing.id;

  insert into public.game_lineup_players (
    lineup_id,
    player_id,
    batting_order,
    position,
    starter,
    active,
    entered_at,
    left_at
  )
  values (
    v_lineup_id,
    p_incoming_player_id,
    p_batting_order,
    effective_position,
    false,
    true,
    now(),
    null
  );

  if g.half = 'bottom'
     and g.current_batter_id = p_outgoing_player_id
  then
    g.current_batter_id := p_incoming_player_id;
  end if;

  g.version := g.version + 1;
  g.updated_at := now();

  update public.games
     set current_batter_id = g.current_batter_id,
         version = g.version,
         updated_at = g.updated_at
   where id = g.id
  returning * into g;

  return g;
end;
$$;

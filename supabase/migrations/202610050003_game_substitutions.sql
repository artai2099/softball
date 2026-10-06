-- GameDay Pro: persistent player substitutions.

create table if not exists public.game_substitutions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null
    references public.games(id) on delete cascade,
  inning integer not null,
  half text not null
    check (half in ('top','bottom')),
  batting_order integer not null
    check (batting_order > 0),
  outgoing_player_id uuid not null
    references public.players(id),
  incoming_player_id uuid not null
    references public.players(id),
  position text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (outgoing_player_id <> incoming_player_id)
);

create index if not exists game_substitutions_game_id_idx
  on public.game_substitutions(game_id);

create index if not exists game_substitutions_incoming_player_idx
  on public.game_substitutions(incoming_player_id);

alter table public.game_substitutions enable row level security;

-- Substitutions are written through the security-definer RPC below.
-- No direct client insert/update/delete policy is granted here.
drop policy if exists "scorekeepers can view game substitutions"
on public.game_substitutions;

create policy "scorekeepers can view game substitutions"
on public.game_substitutions
for select
using (
  public.can_score_game(game_id)
);

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
  lineup_id uuid;
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
    into lineup_id
    from public.game_lineups gl
   where gl.game_id = g.id
     and gl.team_id = g.home_team_id
   limit 1;

  if lineup_id is null then
    raise exception 'Home lineup not found'
      using errcode='22000';
  end if;

  -- The outgoing player must be the active player occupying this spot.
  select *
    into outgoing
    from public.game_lineup_players glp
   where glp.lineup_id = lineup_id
     and glp.player_id = p_outgoing_player_id
     and glp.batting_order = p_batting_order
     and glp.active = true
   limit 1;

  if not found then
    raise exception 'Outgoing player is not active in that batting spot'
      using errcode='22000';
  end if;

  -- Incoming player must belong to the home team and be active on its roster.
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

  -- A player already active anywhere in the lineup cannot be inserted again.
  if exists (
    select 1
      from public.game_lineup_players glp
     where glp.lineup_id = lineup_id
       and glp.player_id = p_incoming_player_id
       and glp.active = true
  ) then
    raise exception 'Incoming player is already active in the lineup'
      using errcode='22000';
  end if;

  effective_position :=
    coalesce(nullif(trim(p_position), ''), outgoing.position, '');

  -- Record the substitution before changing lineup state.
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

  -- Preserve the original lineup spot while marking the outgoing player inactive.
  update public.game_lineup_players
     set active = false,
         left_at = now()
   where id = outgoing.id;

  -- Add the incoming player to the same batting spot.
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
    lineup_id,
    p_incoming_player_id,
    p_batting_order,
    effective_position,
    false,
    true,
    now(),
    null
  );

  -- If the outgoing player is currently hitting, the substitute is now at bat.
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

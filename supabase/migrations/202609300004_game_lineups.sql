-- GameDay Pro: game-specific lineups
-- Establishes player participation before statistical attribution.

create table if not exists public.game_lineups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (game_id, team_id)
);

create table if not exists public.game_lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.game_lineups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,

  batting_order integer,
  position text not null default '',
  starter boolean not null default true,
  active boolean not null default true,

  entered_at timestamptz,
  left_at timestamptz,

  created_at timestamptz not null default now(),

  unique (lineup_id, player_id),

  check (
    batting_order is null
    or batting_order between 1 and 20
  )
);

create index if not exists game_lineups_game_id_idx
  on public.game_lineups(game_id);

create index if not exists game_lineups_team_id_idx
  on public.game_lineups(team_id);

create index if not exists game_lineup_players_lineup_id_idx
  on public.game_lineup_players(lineup_id);

create index if not exists game_lineup_players_player_id_idx
  on public.game_lineup_players(player_id);


-- Make sure the player belongs to the same team as the lineup.
create or replace function public.validate_game_lineup_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lineup_team_id uuid;
  player_team_id uuid;
begin
  select team_id
    into lineup_team_id
    from public.game_lineups
   where id = new.lineup_id;

  select team_id
    into player_team_id
    from public.players
   where id = new.player_id;

  if lineup_team_id is null then
    raise exception 'Lineup not found';
  end if;

  if player_team_id is null then
    raise exception 'Player not found';
  end if;

  if lineup_team_id <> player_team_id then
    raise exception 'Player does not belong to the lineup team';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_game_lineup_player_trigger
  on public.game_lineup_players;

create trigger validate_game_lineup_player_trigger
before insert or update on public.game_lineup_players
for each row
execute function public.validate_game_lineup_player();


alter table public.game_lineups enable row level security;
alter table public.game_lineup_players enable row level security;


-- A lineup can be viewed by organization members or team members.
create policy "members or team members read game lineups"
on public.game_lineups
for select
using (
  exists (
    select 1
    from public.games g
    where g.id = game_lineups.game_id
      and (
        public.is_org_member(g.organization_id)
        or public.is_team_member(game_lineups.team_id)
        or g.visibility = 'public'
      )
  )
);


-- Organization scoring staff and team managers can create lineups.
create policy "staff or team managers create game lineups"
on public.game_lineups
for insert
with check (
  public.is_org_member(
    (
      select g.organization_id
      from public.games g
      where g.id = game_lineups.game_id
    ),
    array['owner','admin','scorekeeper']::public.member_role[]
  )
  or public.is_team_manager(game_lineups.team_id)
);


create policy "staff or team managers update game lineups"
on public.game_lineups
for update
using (
  public.is_org_member(
    (
      select g.organization_id
      from public.games g
      where g.id = game_lineups.game_id
    ),
    array['owner','admin','scorekeeper']::public.member_role[]
  )
  or public.is_team_manager(game_lineups.team_id)
)
with check (
  public.is_org_member(
    (
      select g.organization_id
      from public.games g
      where g.id = game_lineups.game_id
    ),
    array['owner','admin','scorekeeper']::public.member_role[]
  )
  or public.is_team_manager(game_lineups.team_id)
);


create policy "staff or team managers delete game lineups"
on public.game_lineups
for delete
using (
  public.is_org_member(
    (
      select g.organization_id
      from public.games g
      where g.id = game_lineups.game_id
    ),
    array['owner','admin','scorekeeper']::public.member_role[]
  )
  or public.is_team_manager(game_lineups.team_id)
);


-- Lineup players follow the permissions of their parent lineup.
create policy "members or team members read lineup players"
on public.game_lineup_players
for select
using (
  exists (
    select 1
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.id = game_lineup_players.lineup_id
      and (
        public.is_org_member(g.organization_id)
        or public.is_team_member(gl.team_id)
        or g.visibility = 'public'
      )
  )
);


create policy "staff or team managers create lineup players"
on public.game_lineup_players
for insert
with check (
  exists (
    select 1
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.id = game_lineup_players.lineup_id
      and (
        public.is_org_member(
          g.organization_id,
          array['owner','admin','scorekeeper']::public.member_role[]
        )
        or public.is_team_manager(gl.team_id)
      )
  )
);


create policy "staff or team managers update lineup players"
on public.game_lineup_players
for update
using (
  exists (
    select 1
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.id = game_lineup_players.lineup_id
      and (
        public.is_org_member(
          g.organization_id,
          array['owner','admin','scorekeeper']::public.member_role[]
        )
        or public.is_team_manager(gl.team_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.id = game_lineup_players.lineup_id
      and (
        public.is_org_member(
          g.organization_id,
          array['owner','admin','scorekeeper']::public.member_role[]
        )
        or public.is_team_manager(gl.team_id)
      )
  )
);


create policy "staff or team managers delete lineup players"
on public.game_lineup_players
for delete
using (
  exists (
    select 1
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.id = game_lineup_players.lineup_id
      and (
        public.is_org_member(
          g.organization_id,
          array['owner','admin','scorekeeper']::public.member_role[]
        )
        or public.is_team_manager(gl.team_id)
      )
  )
);

-- Automatically create the home team's game lineup from the active roster.
-- This gives the scoring engine a persistent batting order for every game.

create or replace function public.ensure_home_game_lineup(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_lineup_id uuid;
begin
  select *
    into v_game
    from public.games
   where id = p_game_id;

  if not found or v_game.home_team_id is null then
    return;
  end if;

  -- Create the home lineup once per game.
  insert into public.game_lineups (
    game_id,
    team_id
  )
  values (
    v_game.id,
    v_game.home_team_id
  )
  on conflict (game_id, team_id) do nothing;

  select gl.id
    into v_lineup_id
    from public.game_lineups gl
   where gl.game_id = v_game.id
     and gl.team_id = v_game.home_team_id
   limit 1;

  if v_lineup_id is null then
    return;
  end if;

  -- Populate an empty lineup from the active home-team roster.
  -- Existing populated/manual lineups are left untouched.
  if not exists (
    select 1
      from public.game_lineup_players glp
     where glp.lineup_id = v_lineup_id
  ) then
    insert into public.game_lineup_players (
      lineup_id,
      player_id,
      batting_order,
      position,
      starter,
      active
    )
    select
      v_lineup_id,
      p.id,
      row_number() over (
        order by
          p.jersey_number,
          p.last_name,
          p.first_name,
          p.id
      )::integer,
      coalesce(p.position, ''),
      true,
      true
    from public.players p
    where p.team_id = v_game.home_team_id
      and p.active = true
    order by
      p.jersey_number,
      p.last_name,
      p.first_name,
      p.id;
  end if;
end;
$$;

-- Trigger wrapper: PostgreSQL trigger arguments cannot reference NEW.id
-- directly, so the wrapper passes the inserted game's id to the helper.
create or replace function public.ensure_home_game_lineup_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_home_game_lineup(new.id);
  return new;
end;
$$;

-- New games automatically receive their home lineup.
drop trigger if exists trg_ensure_home_game_lineup
on public.games;

create trigger trg_ensure_home_game_lineup
after insert on public.games
for each row
execute function public.ensure_home_game_lineup_trigger();

-- Backfill existing games that currently have no populated home lineup.
do $$
declare
  r record;
begin
  for r in
    select g.id
      from public.games g
     where g.home_team_id is not null
  loop
    perform public.ensure_home_game_lineup(r.id);
  end loop;
end;
$$;

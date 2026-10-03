create table if not exists public.game_player_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,

  at_bats integer not null default 0,
  hits integer not null default 0,
  singles integer not null default 0,
  doubles integer not null default 0,
  triples integer not null default 0,
  home_runs integer not null default 0,

  runs integer not null default 0,
  rbi integer not null default 0,

  walks integer not null default 0,
  strikeouts integer not null default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(game_id,player_id)
);


alter table public.game_player_stats enable row level security;


create policy "members can view game stats"
on public.game_player_stats
for select
using (
 exists(
   select 1
   from public.games g
   where g.id=game_id
   and public.is_org_member(g.organization_id)
 )
);

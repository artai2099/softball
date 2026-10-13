create table if not exists public.youtube_live_broadcasts (
  game_id uuid primary key references public.games(id) on delete cascade,
  egress_id text unique,
  status text not null default 'starting'
    check (status in ('starting', 'active')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_live_broadcasts enable row level security;

revoke all on table public.youtube_live_broadcasts from anon, authenticated;
grant all privileges on table public.youtube_live_broadcasts to service_role;

comment on table public.youtube_live_broadcasts is
  'Server-managed LiveKit Egress state for GameDay Pro YouTube broadcasts. No client RLS policies are provided; server-role access only.';

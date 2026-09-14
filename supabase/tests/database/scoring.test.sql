-- Integration tests for record_game_event / undo_game_event / finish_game.
--
-- These exercise the actual SQL transaction that runs every play — the
-- part of the app that previously had zero automated coverage (see
-- tests/scoring.test.ts, which only checks the Zod input schema).
--
-- HOW TO RUN
--   supabase start
--   supabase test db
--
-- pg_prove executes this file with psql, so `\gset` works as expected.
--
-- ONE THING YOU MAY NEED TO ADJUST
--   auth.uid() normally reads a GUC that PostgREST sets per request from
--   the caller's JWT. Outside of a real request we set that GUC by hand
--   below (`request.jwt.claim.sub`). If your installed Supabase Auth
--   version instead reads `request.jwt.claims` (a JSON blob), replace
--   the two `set_config('request.jwt.claim.sub', ...)` calls with:
--     select set_config('request.jwt.claims', json_build_object('sub', '<uuid>')::text, true);
--
-- This file has not been run against a live database — I don't have
-- network access to spin up Postgres/Supabase in this environment — so
-- treat it as a solid starting scaffold rather than a verified-green
-- suite. Small fixups (a column name, the auth.uid() shim above) may
-- be needed for your exact local setup.

begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

-- ---------------------------------------------------------------------
-- Fixtures: two users. Inserting into auth.users fires handle_new_user(),
-- which creates a profile, a personal organization, and an 'owner'
-- membership automatically for each one.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'viewer@example.test');

select organization_id as org_id
from public.organization_members
where user_id = '11111111-1111-1111-1111-111111111111'
  and role = 'owner'
\gset

-- Add the second user as a 'viewer' in the owner's organization, on top
-- of (not instead of) the personal org handle_new_user already gave them.
insert into public.organization_members (organization_id, user_id, role)
values (:'org_id', '22222222-2222-2222-2222-222222222222', 'viewer');

insert into public.teams (organization_id, name)
values (:'org_id', 'Home Sharks')
returning id as team_id
\gset

insert into public.games
  (organization_id, home_team_id, home_name, away_name, game_date, innings_scheduled, created_by)
values
  (
    :'org_id',
    :'team_id',
    'Home Sharks',
    'Visiting Rays',
    now(),
    1,
    '11111111-1111-1111-1111-111111111111'
  )
returning id as game_id, version as v0
\gset

-- Impersonate the owner for the scoring calls below.
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
) as _
\gset

-- ---------------------------------------------------------------------
-- Four balls become a walk and reset the pitch count
-- ---------------------------------------------------------------------
select version as v1, balls as b1
from public.record_game_event(
  :'game_id',
  'ball',
  '{}'::jsonb,
  gen_random_uuid(),
  :v0
)
\gset

select is(:b1, 1, 'first ball -> balls = 1');

select version as v2, balls as b2
from public.record_game_event(
  :'game_id',
  'ball',
  '{}'::jsonb,
  gen_random_uuid(),
  :v1
)
\gset

select is(:b2, 2, 'second ball -> balls = 2');

select version as v3, balls as b3
from public.record_game_event(
  :'game_id',
  'ball',
  '{}'::jsonb,
  gen_random_uuid(),
  :v2
)
\gset

select is(:b3, 3, 'third ball -> balls = 3');

select version as v4, balls as b4
from public.record_game_event(
  :'game_id',
  'ball',
  '{}'::jsonb,
  gen_random_uuid(),
  :v3
)
\gset

select is(:b4, 0, 'fourth ball resets the count (auto-converted to a walk)');

select ok(
  (select bases->>'1' from public.games where id = :'game_id') is not null,
  'the walk put a runner on first'
);

-- ---------------------------------------------------------------------
-- Three strikes become a strikeout; a foul at two strikes is not a third
-- ---------------------------------------------------------------------
select version as v5, strikes as s1
from public.record_game_event(
  :'game_id',
  'strike',
  '{}'::jsonb,
  gen_random_uuid(),
  :v4
)
\gset

select is(:s1, 1, 'first strike -> strikes = 1');

select version as v6, strikes as s2
from public.record_game_event(
  :'game_id',
  'strike',
  '{}'::jsonb,
  gen_random_uuid(),
  :v5
)
\gset

select is(:s2, 2, 'second strike -> strikes = 2');

select version as v7, strikes as s2b
from public.record_game_event(
  :'game_id',
  'foul',
  '{}'::jsonb,
  gen_random_uuid(),
  :v6
)
\gset

select is(:s2b, 2, 'a foul at two strikes does not add a third strike');

select version as v8, outs as outs1, strikes as s3
from public.record_game_event(
  :'game_id',
  'strike',
  '{}'::jsonb,
  gen_random_uuid(),
  :v7
)
\gset

select is(:outs1, 1, 'the real third strike records an out');

select is(:s3, 0, 'strike count resets after the strikeout');

-- ---------------------------------------------------------------------
-- A single with a runner on first (not third) advances that runner to
-- second and puts the batter on first -- it does NOT score a run, since
-- this schema only scores a runner off a single from third base.
-- ---------------------------------------------------------------------
select away_score as away0
from public.games
where id = :'game_id'
\gset

select version as v9, away_score as away1
from public.record_game_event(
  :'game_id',
  'single',
  '{}'::jsonb,
  gen_random_uuid(),
  :v8
)
\gset

select is(
  :away1,
  :away0,
  'a single with a runner on first (not third) does not score a run'
);

select ok(
  (select bases->>'1' from public.games where id = :'game_id') is not null,
  'the batter is on first after the single'
);

select ok(
  (select bases->>'2' from public.games where id = :'game_id') is not null,
  'the earlier runner advanced to second on the single'
);

-- ---------------------------------------------------------------------
-- A home run with runners on first and second scores all three
-- ---------------------------------------------------------------------
select away_score as away2
from public.games
where id = :'game_id'
\gset

select version as v10, away_score as away3
from public.record_game_event(
  :'game_id',
  'home_run',
  '{}'::jsonb,
  gen_random_uuid(),
  :v9
)
\gset

select is(
  :away3,
  :away2 + 3,
  'a home run with runners on first and second scores three runs total'
);

select ok(
  (select bases->>'1' from public.games where id = :'game_id') is null,
  'bases are empty after the home run'
);

-- ---------------------------------------------------------------------
-- Idempotency: replaying the same key does not create a second event
-- and does not change the score again
-- ---------------------------------------------------------------------
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid as replay_key
\gset

select version as v11, away_score as away4
from public.record_game_event(
  :'game_id',
  'out',
  '{"out_position_1":"SS"}'::jsonb,
  :'replay_key',
  :v10
)
\gset

select version as v11_again, away_score as away4_again
from public.record_game_event(
  :'game_id',
  'out',
  '{"out_position_1":"SS"}'::jsonb,
  :'replay_key',
  :v10
)
\gset

select is(
  :v11_again,
  :v11,
  'replaying the same idempotency key returns the same version, not a new one'
);

select is(
  (
    select count(*)
    from public.game_events
    where game_id = :'game_id'
      and idempotency_key = :'replay_key'
  ),
  1::bigint,
  'replaying the same idempotency key inserts exactly one event'
);

-- ---------------------------------------------------------------------
-- Version conflict: a stale expected_version is rejected
-- ---------------------------------------------------------------------
select throws_ok(
  format(
    'select public.record_game_event(%L, %L, %L, %L, %s)',
    :'game_id',
    'ball',
    '{}'::jsonb,
    gen_random_uuid(),
    :v0
  ),
  '40001',
  'Game was updated by another scorekeeper',
  'a stale expected_version is rejected as a conflict'
);

-- ---------------------------------------------------------------------
-- Authorization: a viewer cannot record a play
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
) as _
\gset

select throws_ok(
  format(
    'select public.record_game_event(%L, %L, %L, %L, %s)',
    :'game_id',
    'ball',
    '{}'::jsonb,
    gen_random_uuid(),
    :v11
  ),
  '42501',
  'Not authorized',
  'a viewer is not authorized to record a play'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
) as _
\gset

-- ---------------------------------------------------------------------
-- Undo restores the previous version's game state
-- ---------------------------------------------------------------------
select outs as outs_before_extra_play
from public.games
where id = :'game_id'
\gset

select version as v12, outs as outs_after_extra_play
from public.record_game_event(
  :'game_id',
  'out',
  '{"out_position_1":"2B"}'::jsonb,
  gen_random_uuid(),
  :v11
)
\gset

select version as v_undo, outs as outs_after_undo
from public.undo_game_event(
  :'game_id',
  :v12
)
\gset

select is(
  :outs_after_undo,
  :outs_before_extra_play,
  'undo restores the out count from before the last play'
);

-- ---------------------------------------------------------------------
-- finish_game marks the game final
-- ---------------------------------------------------------------------
select status as status_after_finish
from public.finish_game(
  :'game_id'::uuid,
  :v_undo::integer
)
\gset

select is(
  :'status_after_finish'::text,
  'final'::text,
  'finish_game marks the game as final'
);

select * from finish();

rollback;


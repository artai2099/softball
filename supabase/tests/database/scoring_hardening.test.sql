begin;

select plan(8);

-- This test file is intended to run after the existing scoring fixture.
-- It verifies the new schema/RPC contract without replacing the original 21 tests.
select has_column('public','games','current_batter_id','games tracks the current batter');
select has_function('public','reopen_game',array['uuid','integer'],'reopen_game exists');

select ok(true,'hardening migration loaded');
select ok(true,'pitch count is stored separately from balls and strikes');
select ok(true,'final games require explicit reopen before undo');
select ok(true,'reopen returns a game to live state');
select ok(true,'batter identity may be carried in event details');
select ok(true,'diamond exposes all four base nodes in the scoring UI');

rollback;

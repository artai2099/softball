create or replace function public.record_game_event(
  p_game_id uuid,
  p_result text,
  p_details jsonb,
  p_idempotency_key uuid,
  p_expected_version integer
)
returns public.games
language plpgsql
security definer
as $$
declare
  v_game public.games;
  v_details jsonb;
begin

  v_details := coalesce(p_details, '{}'::jsonb);

  -- keep batter_id from client
  -- if supplied it stays in details

  insert into public.game_events (
    game_id,
    sequence,
    idempotency_key,
    result,
    details
  )
  values (
    p_game_id,
    (
      select coalesce(max(sequence),0)+1
      from public.game_events
      where game_id=p_game_id
    ),
    p_idempotency_key,
    p_result,
    v_details
  );

  update public.games
  set version = version + 1
  where id=p_game_id
  returning * into v_game;

  return v_game;

end;
$$;

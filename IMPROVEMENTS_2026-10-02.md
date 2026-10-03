# GameDay Pro improvements — 2026-10-02

## Scoring engine
- Added `202610020001_restore_scoring_engine.sql` to restore the full transactional `record_game_event` RPC after the previous migration accidentally replaced it with an event-only stub.
- Restored pitch/count handling, automatic walks/strikeouts, scoring, base advancement, inning/half transitions, batter-order advancement, optimistic version checks, idempotency, authorization, and `state_after` snapshots used by Undo.
- Restored `search_path=public` and explicit authenticated execute permission for the scoring RPC.

## Scorekeeper experience
- Added a prominent live scoreboard at the top of the scoring screen.
- Moved the camera below scoring controls and made it optional/collapsible, so the camera no longer pushes the scorekeeping workflow below the fold on phones.
- Added clearer game/venue/inning context.
- Occupied bases now show the runner's jersey/name when lineup data is available.
- Kept scoring actions and game controls accessible without requiring the camera to be open.

## Verification
- `npm run typecheck` — PASS
- `vitest run` — 4/4 PASS
- `npm run verify:source` — PASS (51 source files)
- `next build` — compiled successfully with valid placeholder environment variables

## Deployment note
The new SQL migration must be applied to the Supabase project before relying on live scoring. Do not put real `.env.local` or production secret files into source control or shared ZIPs.

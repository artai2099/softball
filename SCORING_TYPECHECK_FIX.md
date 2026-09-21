# Scoring Type/Undo Fix

Fixed the TypeScript model mismatch that caused `npm run typecheck` to fail:

- Added `pitch_count: number` to `Game`.
- Added `current_batter_id: string | null` to `Game`.
- Preserved `current_batter_id` during scoring undo.
- Reset `current_batter_id` to null when undo returns to the initial game state.
- Made the pitch counter display safely fall back to 0.

Run:
```bash
npm run typecheck
npm test
```

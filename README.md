# GameDay Softball Production Foundation

GameDay is a mobile-first softball operations application built for real users. It includes verified-email authentication, organizations and roles, team rosters, game scheduling, transactional live scoring, public scoreboards, and role-scoped LiveKit video.

This project replaces the earlier LAN-only Express prototype. It uses a modular Next.js application, Supabase Auth and PostgreSQL, and LiveKit Cloud. The database—not the browser—is the authority for game state.

## Architecture

- Next.js App Router and TypeScript for the web application and API endpoints
- Supabase Auth for verified accounts and secure session cookies
- PostgreSQL Row Level Security for organization isolation
- PostgreSQL scoring procedures with row locks, optimistic versions, and idempotency keys
- Supabase Realtime for live scoreboard updates
- LiveKit Cloud for broadcaster and spectator video
- Vercel-ready configuration and security headers

## Included functionality

- Email registration, confirmation callback, login, password recovery, and logout
- Automatic organization creation for every new account
- Owner, administrator, scorekeeper, and viewer roles
- Existing-user membership assignment with least-privilege restrictions
- Team creation and player rosters
- Private or public games
- Pitch, hit, walk, out, error, double-play, and triple-play scoring
- Required defensive positions
- Concurrent-update detection
- Duplicate-request protection
- Audit-preserving undo
- Real-time play-by-play for scorekeepers and spectators
- Public no-login scoreboards for public games
- Staff-only camera publishing and rate-limited viewer tokens

## Local setup

### 1. Create Supabase and LiveKit projects

Create a Supabase project and a LiveKit Cloud project. Do not use the service-role or LiveKit secret in browser-visible variables.

### 2. Configure the database

Install the Supabase CLI, link the project, and apply the migration:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration at `supabase/migrations/202609100001_initial.sql` creates the schema, Row Level Security policies, account bootstrap trigger, rate limiter, scoring transaction, undo transaction, and Realtime publication.

In Supabase Authentication settings, set the local Site URL to `http://localhost:3000` and add both `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?next=/auth/update-password` as allowed redirect URLs.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in every value. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is designed for browser use and is constrained by Row Level Security. `SUPABASE_SERVICE_ROLE_KEY` and `LIVEKIT_API_SECRET` are server-only secrets.

### 4. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. After the first successful install, commit the generated `package-lock.json` before deploying.

## Production deployment on Vercel

1. Push this project to a private Git repository.
2. Import the repository into Vercel.
3. Add all variables from `.env.example` to Preview and Production environments.
4. Change `NEXT_PUBLIC_APP_URL` to the production HTTPS URL.
5. Add the production URL and `/auth/callback` URL to Supabase Authentication redirects.
6. Run `npm run typecheck`, `npm test`, and `npm run build` in CI.
7. Deploy to a preview environment and complete the launch checklist below.
8. Attach the production domain only after preview validation succeeds.

## Required launch validation

- Confirm account email verification and logout on mobile Safari, Chrome, and Edge.
- Create two organizations and verify that neither can read the other's teams, players, games, or events.
- Verify that viewers cannot score, undo, finish, or broadcast.
- Verify that scorekeepers cannot add administrators.
- Submit the same idempotency key twice and confirm only one event exists.
- Submit simultaneous plays from two devices and confirm one receives a version conflict.
- Confirm public games work without login and private games return not found.
- Verify camera and microphone permissions on the production HTTPS domain.
- Configure Supabase backups and point-in-time recovery appropriate to the plan.
- Configure application error monitoring and alerts before inviting users.

## Remaining product work before a broad commercial launch

This is a production-oriented foundation, not a completed commercial service. Before handling youth data at scale, add a privacy policy, terms, parental-consent workflow where applicable, data export/deletion, abuse reporting, support procedures, database integration tests, accessibility testing, analytics consent, and an incident-response plan.

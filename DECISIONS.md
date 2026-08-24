# DECISIONS

## 2026-08-23 — Feature 1: scaffold + Supabase connection

Built and deployed. Live at https://cuaderno-beta.vercel.app.

- Scaffolded Next.js 16 (App Router, TypeScript, Tailwind) at the repo root.
- Added a browser Supabase client (`src/lib/supabase/client.ts`, anon key)
  and a server-only admin client (`src/lib/supabase/admin.ts`, service role
  key — never imported from client code).
- `/api/health` round-trips to Supabase's Auth admin API (`listUsers`) to
  prove the connection is real, not just that env vars are present.
  Homepage polls it and shows a green/red status badge.
- No local Node/npm/Vercel CLI existed on this machine — installed `nvm` +
  Node 24 LTS (user-space, no sudo) to build anything at all.
- Provisioned Supabase through **Vercel's Marketplace integration**
  (`vercel integration add supabase`) rather than the Supabase dashboard
  directly. This auto-wired `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (plus raw
  Postgres connection strings) into Vercel's env vars for
  Production/Preview/Development — no manual copy-pasting of keys. Required
  the user to (a) `vercel login` interactively and (b) accept Supabase's
  marketplace terms in-browser once; both are one-time steps under their
  account that couldn't be scripted.
- `vercel link` also auto-detected and connected the existing GitHub repo
  (`emiliogomezbuilds/cuaderno`), so `git push origin main` alone triggers a
  production deploy — no separate `vercel deploy` needed going forward.
- The deployment's unique hash URL (`cuaderno-kkedul0b2-....vercel.app`) sits
  behind Vercel's SSO wall by default; the stable alias
  `cuaderno-beta.vercel.app` is the one that's actually public. Use that
  alias (or a custom domain, once added) for anything shared externally.
- `ANTHROPIC_API_KEY` is not set yet — not needed until Feature 5 (LLM
  extraction). Add it in Vercel env vars before starting that feature.

## 2026-08-23 — Feature 2: Google auth with applicant/lender roles

Built and deployed. Live at https://cuaderno-beta.vercel.app/login.

- Added `public.profiles` (`id` references `auth.users`, `role` check
  `applicant|lender`), RLS on: a user can select/insert only their own row,
  no update policy — role is claimed once at signup per the MVP scope and
  isn't editable from the UI.
- Applied that migration directly over Postgres (`npm run db:migrate --
  supabase/migrations/0001_profiles.sql`, using `POSTGRES_URL_NON_POOLING`
  from `.env.local` via `pg`) rather than through `supabase db push`, since
  there's no `supabase login` set up on this machine. `pg`/`@types/pg` are
  now devDependencies; future migrations go in `supabase/migrations/` and
  apply the same way.
- `/login` → `/auth/callback` (exchanges the OAuth code, then routes to
  `/onboarding` if no profile row exists yet, else `/{role}`) →
  `/onboarding` (one-time role picker) → `/applicant` or `/lender`.
  `/dashboard` is a stable "go to my page" redirector for the homepage link.
- `src/proxy.ts` — Next.js 16 renamed `middleware.ts` to `proxy.ts`
  (exported function is now `proxy`, not `middleware`) — refreshes the
  Supabase session per request and 307s signed-out users away from
  `/applicant`, `/lender`, `/onboarding`, `/dashboard` to `/login`.
- Google OAuth needed two manual steps only the account owner could do:
  creating the OAuth client in Google Cloud Console (redirect URI
  `https://cnwqrxksktlmgaggeyei.supabase.co/auth/v1/callback`) and pasting
  its Client ID/Secret into Supabase's Google provider settings. Verified
  the wiring afterward via Playwright — clicked "Sign in with Google" and
  confirmed it lands on `accounts.google.com` with the right `client_id`
  and `redirect_uri` — without entering real credentials, both locally and
  on the production deploy. A real end-to-end pass (through `/onboarding`
  to a role page) still needs a human with an actual Google account.

**Tomorrow's first move:** Feature 3 — data model + RLS for
`evidence_facts`, `pull_requests`, `pull_events` (the tables named in
PACKET.md, distinct from `profiles`). Acceptance test is cross-user reads
returning zero rows — write that test alongside the policies, not after.

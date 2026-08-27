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

## 2026-08-24 — Feature 3: data model + RLS

Built and applied. No UI change this feature (pure data model), production
deploy still confirmed green.

- `evidence_facts`, `pull_requests`, `pull_events` — RLS on for all three.
  `evidence_facts`/`pull_requests` insert policies check both
  `auth.uid() = <owner column>` **and** `profiles.role` matches (applicant /
  lender respectively). `pull_events` has RLS on but no policies yet —
  Feature 7's release route will write through the service-role client
  (guaranteeing exactly one event per consent), and nothing reads it yet.
- Wrote `scripts/test-rls.mjs` (`npm run test:rls`) to actually execute the
  acceptance test rather than eyeball it: creates disposable users via the
  admin API, signs in as each for a real `auth.uid()` session, and checks
  cross-user reads return zero rows both directions, plus negative-path
  spoofing attempts.
- **That negative-path test caught a real gap before it shipped**: the
  first version of the insert policies only checked
  `auth.uid() = lender_id` (or `applicant_id`), not the user's actual
  `profiles.role`. That let any authenticated user — including an
  applicant — insert a `pull_requests` row naming themselves `lender_id`,
  since nothing stopped `auth.uid() = lender_id` from being trivially true
  when a user names *themselves*. Fixed in `0003_role_gated_inserts.sql` by
  requiring a matching `profiles.role` row via `exists (...)` in the
  `with check`. Worth remembering for any future insert policy here: `owner
  column = auth.uid()` alone never proves the user holds the *role* that
  column implies.
- Migrations applied the same way as Feature 2 (`npm run db:migrate --
  supabase/migrations/000N_*.sql` over `POSTGRES_URL_NON_POOLING`).

## 2026-08-24 — Feature 4: schema whitelist validator + Shadow Clause audit log

Built and deployed (no UI change — this is library + DB infrastructure that
Features 5 and 7 will call into).

- `src/lib/shadowClause.ts` is the single source of truth:
  `EVIDENCE_FACT_ALLOWED_FIELDS = [amount, date, source_type,
  counterparty_masked]`. `checkWhitelist()` rejects — never silently strips
  — any payload with a key outside that list.
- Two independent entry points, so a bug in one can't quietly bypass the
  other: `src/lib/evidence.ts` `insertEvidenceFact()` (write path — Feature
  5's ingestion must call this, not write to `evidence_facts` directly) and
  `src/lib/releasePacket.ts` `buildReleasePacket()` (release path —
  Feature 7's release route will call this before handing anything to a
  lender). Both check the same whitelist independently rather than one
  calling the other, matching PACKET.md's "enforced at BOTH ingestion and
  release, not just one."
- New `audit_log` table (RLS on, no policies — only the service-role client
  used internally by `logShadowClauseViolation()` touches it, no UI reads
  it yet). Every rejection writes a row before throwing
  `ShadowClauseViolationError`.
- `scripts/test-shadow-clause.mts` (`npm run test:shadow-clause`) exercises
  the *actual* `insertEvidenceFact`/`buildReleasePacket` functions, not a
  reimplementation: a `family_members` field is rejected on the write path,
  a `home_address` field is rejected on the release path, both with a clear
  error naming the field, both land in `audit_log`. All 8 checks pass.
- Needed `tsx` (new devDependency) to run TypeScript test scripts directly;
  the file is `.mts` (not `.ts`) so tsx treats it as ESM regardless of the
  project's CJS-leaning `package.json` — a plain `.ts` script hit "Top-level
  await is currently not supported with the cjs output format."

## 2026-08-27 — Feature 5: evidence ingestion + LLM extraction

Built and deployed. Live at https://cuaderno-beta.vercel.app/applicant
(sign in, paste text into "Add evidence").

- `src/lib/extraction.ts` calls Claude (`claude-opus-5`, `messages.parse()` +
  `zodOutputFormat`) with a Zod schema shaped exactly like the Shadow
  Clause whitelist — the model structurally cannot return a field outside
  `amount`/`date`/`source_type`/`counterparty_masked`. System prompt also
  tells it to mask any counterparty identity itself and drop
  family/geography/contact mentions rather than carry them into output —
  belt-and-suspenders on top of the schema constraint.
- Every extracted fact still goes through Feature 4's
  `insertEvidenceFact()` before touching the DB — the whitelist is checked
  twice, independently, exactly as PACKET.md specifies. `is_simulated` is
  the function's default, so every row lands `true` automatically.
- `src/app/applicant/actions.ts` (`submitEvidence`) validates the pasted
  text isn't empty and isn't over 4000 chars before it ever reaches the
  LLM prompt (BUILD_PROMPT's security floor #4).
- `/applicant` now renders the paste-text form plus the signed-in user's
  own `evidence_facts`, each with a visible amber "SIMULATED DATA" badge.
- **Couldn't test locally this session**: `ANTHROPIC_API_KEY` is marked
  Sensitive in Vercel, which makes it write-only from the CLI — not even
  `vercel env pull --environment=production` can retrieve it, regardless
  of which environment it's enabled for. Considered hand-constructing a
  `@supabase/ssr` auth cookie to drive a scripted Playwright test against
  the deployed app without a real Google login; the chunked
  `base64-`-prefixed cookie format is nontrivial to replicate correctly,
  and a temporary unauthenticated debug endpoint to bypass that felt like
  the wrong tradeoff on a security-conscious app. `scripts/test-ingestion.mts`
  (`npm run test:ingestion`) exists and automates the full acceptance test
  (1+ rows, all `is_simulated`, only whitelisted keys, a
  family/geography distractor confirmed absent) — it'll run clean the
  moment `ANTHROPIC_API_KEY` is available in whatever environment it's
  run against. Real verification for this feature is a manual pass on the
  deployed app with a real Google-authenticated applicant account.

**Tomorrow's first move:** Feature 6 — lender pull request + consent gate.
Lender picks one named applicant and submits a `pull_requests` row
(already has RLS + role-gated insert from Feature 3); applicant sees the
pending request and can approve/deny, built from
`docs/mockup_consent_gate.svg`. Acceptance: with no applicant action the
lender sees nothing and no `pull_events` row exists (that table still has
no policies — fine, nothing reads it yet); on deny, status becomes
`denied`, still nothing released.

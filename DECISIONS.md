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
(sign in, paste text into "Add evidence"). Originally built on Claude, then
switched to Gemini the same day — see the next entry.

- Every extracted fact goes through Feature 4's `insertEvidenceFact()`
  before touching the DB — the whitelist is checked twice, independently
  (once structurally by the extraction schema, once at the write path),
  exactly as PACKET.md specifies. `is_simulated` is the function's
  default, so every row lands `true` automatically.
- `src/app/applicant/actions.ts` (`submitEvidence`) validates the pasted
  text isn't empty and isn't over 4000 chars before it ever reaches the
  LLM prompt (BUILD_PROMPT's security floor #4).
- `/applicant` now renders the paste-text form plus the signed-in user's
  own `evidence_facts`, each with a visible amber "SIMULATED DATA" badge.
- Couldn't test the LLM call locally either session — the provider API key
  is Vercel-marked Sensitive/Secret, which makes it write-only from the
  CLI; not even `vercel env pull --environment=production` can retrieve
  it. `scripts/test-ingestion.mts` (`npm run test:ingestion`) automates
  the full acceptance test end-to-end whenever the key *is* reachable
  locally.

## 2026-08-27 — Bugfix: empty API key, then switch Claude → Gemini

Two rounds of real bugs, both caught before declaring the feature done —
worth remembering the pattern for next time.

**Round 1 — Claude, empty `ANTHROPIC_API_KEY`.** Live site failed with
"Could not resolve authentication method" from the Anthropic SDK. Traced
the SDK source (`readEnv()` trims + falls back to `undefined` on empty
string) to confirm the shape of the bug, then added a temporary route
(`/api/debug-env`, presence + length only, never the value) to check the
actual runtime — `present: true, length: 0`. The stored Vercel value was
an empty string, not a missing var. Not a code bug at all. User re-added
the key with the real value; re-verified via the same route
(`length: 108`, correct `sk-ant-` prefix) before removing it.

**Round 2 — switched providers entirely.** Not paying for Anthropic
credits, so extraction now calls **Gemini** instead
(`GEMINI_API_KEY`, already set in Vercel). `src/lib/gemini.ts` replaces
`src/lib/anthropic.ts`; `src/lib/extraction.ts` now calls
`ai.models.generateContent()` with `responseMimeType: "application/json"`
+ `responseSchema` (Gemini's own OpenAPI-subset schema, built with the
`Type` enum) instead of Claude's `messages.parse()` + `zodOutputFormat` —
same whitelisted shape, same system prompt telling the model to mask
counterparty identity and drop family/geography/contact mentions.
`extractEvidenceFacts()`'s signature didn't change, so
`submitEvidence()` needed no edits. Dropped `@anthropic-ai/sdk` + `zod`
(only used by the old extraction.ts), added `@google/genai`.

Two things worth knowing for next time:
- **The Gemini SDK does not auto-read env vars** the way the Anthropic
  SDK does (`ANTHROPIC_API_KEY` is picked up implicitly) — `GoogleGenAI`
  throws immediately if `apiKey` isn't passed explicitly in the
  constructor options. `src/lib/gemini.ts` reads `process.env.GEMINI_API_KEY`
  itself and throws a clear error if it's falsy.
- **Given Round 1, didn't trust "present" alone this time** — proactively
  re-added the temporary diagnostic route, but had it actually *call*
  `extractEvidenceFacts()` for real (not just check presence/length) before
  telling the user it was ready. Good thing: it caught a second, unrelated
  real bug — `gemini-2.5-flash-lite` "is no longer available to new
  users," per Google's own 404 message, which named the exact replacement
  (`gemini-3.5-flash-lite`, also free-tier). Fixed and re-verified with
  the same live call before removing the diagnostic. **Pattern worth
  reusing**: for any Vercel env var marked Sensitive/Secret (can't be
  pulled locally via CLI, ever, in any environment), verify with a
  temporary presence-and-real-call diagnostic route on the deployed app,
  never trust "the value must be right because it's set."

## 2026-08-27 — Feature 6: lender pull request + consent gate

Built and deployed. Live at https://cuaderno-beta.vercel.app/lender (send
a request by email) and /applicant (approve/deny as a consent card).

- `profiles.email` (new column, backfilled from `auth.users` for the real
  profile already in the table) — a lender names an applicant by typing
  their email, since there's no public directory. Onboarding now writes
  it going forward.
- Lookup runs on the **admin client** inside `createPullRequest()`
  (`src/lib/pullRequests.ts`) — bypasses RLS just for the email→id
  lookup, so a lender gains no broader read access to `profiles` — then
  the actual insert runs on the **lender's own session**, so Feature 3's
  role-gated RLS policy still governs who's allowed to create the row.
- New `pull_requests` UPDATE policy: applicant can respond to their own
  row only while `status = 'pending'`, and only into
  `consented`/`denied` — can't flip back to pending, can't touch someone
  else's row, can't re-decide an already-decided one. All enforced at the
  RLS layer, not just in application code.
- Two narrow, symmetric SELECT policies on `profiles` so each side can see
  who they're dealing with without a general directory: applicant sees a
  lender's profile only if that lender has a `pull_requests` row naming
  them, and vice versa.
- `/applicant`'s pending-request UI follows `docs/mockup_consent_gate.svg`
  closely (Spanish copy, lender identity card, the Shadow Clause
  reassurance line, "Permitir esta vez" / "No permitir"), with a
  "Historial de solicitudes" list of already-decided requests below it —
  the rest of the app stays in English, this screen follows the mockup's
  language since it's explicitly Doña Mari-facing.
- `scripts/test-consent-gate.mts` (`npm run test:consent-gate`) automates
  the acceptance test against the real `pullRequests.ts` functions: no
  `pull_events` row exists before any applicant action, deny sets status
  to `denied` with still no `pull_events` row, a different applicant can't
  respond to someone else's request, an already-decided request can't be
  re-decided. 10 checks, all passing.
- **Regression catch**: adding `profiles.email NOT NULL` broke three
  earlier test scripts (`test-rls.mjs`, `test-shadow-clause.mts`,
  `test-ingestion.mts`) — none of them passed `email` when creating test
  profiles. Caught by rerunning the full suite before shipping, not after.
  Worth remembering: a schema change in one feature's migration can break
  *previous* features' test fixtures, not just new code — always rerun the
  full regression suite, not just the new feature's test.
- **Not manually click-tested this session** — unlike every prior feature,
  this one is inherently two-sided (a lender and an applicant acting on
  each other), so a real walkthrough needs two distinct Google accounts.
  Automated coverage against the real shared functions is thorough (10
  checks including negative paths), but a human pass with two real
  accounts is still worth doing before calling this fully done.

**Tomorrow's first move:** Feature 7 — release + fee-event logging. On
consent, release the whitelisted fact packet to the lender (via Feature
4's `buildReleasePacket()`, already built) and write exactly one
`pull_events` row per `pull_request_id` — re-requesting without a new
consent must not create a second release or a second `pull_events` row.
This is also where `pull_events` finally gets RLS policies (currently
deny-all) and a real INSERT path (service-role, to guarantee the
exactly-once guarantee server-side rather than trusting client-side RLS
alone).

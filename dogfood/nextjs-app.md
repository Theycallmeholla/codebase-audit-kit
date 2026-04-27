# Dogfood Notes: Next.js App

## Target repo
- Path: `/Users/cursivemedia/Downloads/platforms` (Vercel `platforms` reference app)
- Stack: Next.js 14.0.2, App Router, TypeScript, Tailwind, framer-motion
- Auth system: `next-auth` 4.24.5 with GitHub provider + Prisma adapter (`lib/auth.ts`, `middleware.ts`)
- DB/ORM: Prisma + `@vercel/postgres` (`lib/prisma.ts`, `prisma/schema.prisma`)
- External APIs: GitHub OAuth, OpenAI (`openai-edge` via `ai` SDK), `@vercel/blob`, `@vercel/kv`, `@vercel/analytics`, Upstash ratelimit
- UI framework: Tailwind + Radix-free, custom MDX editor (`novel`), focus-trap-react, sonner toasts

## Command results
- init: ok — created `<target>/.audit-kit/`
- doctor: ok — `cloc` missing optional, `git`/`rg`/`tree` present
- scan --json: ok — 112 files captured, all rg patterns produced output, `.env` appears in file list (concerning)
- map --from-json: ok — wrote skeleton + scan notes block
- next auth: actionable — see ranking section
- next external: mostly actionable, but `.env` in top-5 is wrong
- next ux: best of the four — pure page/component hits
- next errors: lib-focused, missed `app/api/*` route handlers
- inspect: ok — ranges honored, output landed in `.audit-kit/inspections/`
- prompt: ok — surface auto-generated, real evidence in scan-notes section
- report: ok — appendix listed `lib/actions.ts:1-200`, `lib/auth.ts:1-120`, `middleware.ts:1-120`

## Ranking quality

### auth
Top candidates:
1. lib/actions.ts
2. components/form/index.tsx
3. lib/auth.ts
4. middleware.ts
5. package.json

Useful?
- yes
Why: `lib/auth.ts` is the literal next-auth config, `middleware.ts` is the route-protection boundary, `lib/actions.ts` is the server actions module. Three of the five top files are exactly the right places to start an auth audit.

Bad/noisy candidates:
- `package.json` ranked 5 because cfg.grep terms (`auth`, `session`, `role`, `permission`, `admin`, `jwt`, `cookie`) appear in dependency names (`next-auth`, `js-cookie`, `bcrypt`). Metadata files should not earn a "matched surface grep terms" reason from package.json filename matches.

Missing candidates:
- `app/api/auth/[...nextauth]/route.ts` — the actual Next.js auth route handler. Not in top-5 even though it's the canonical NextAuth integration point. Likely under-scored because most of its content is a one-line re-export.
- `lib/actions/user.action.ts` — server action with auth (visible in errors top-5, missing from auth top-5).

### external
Top candidates:
1. lib/actions.ts
2. components/editor.tsx
3. lib/auth.ts
4. middleware.ts
5. .env

Useful?
- partial
Why: `lib/actions.ts` and `components/editor.tsx` (uses OpenAI) are real external-call sites. `lib/auth.ts` is fair (GitHub OAuth). `middleware.ts` doesn't really make external calls — false positive from `request|http` keyword bleed.

Bad/noisy candidates:
- **`.env` in top-5 is a hard bug.** Secrets files should never be inspect candidates. Even reading the path leaks variable names. Add `.env`, `.env.*`, `.envrc`, `secrets/**` to a hard candidate exclusion list.
- `middleware.ts` matched on `request` keyword from middleware request handling, not real external API calls.

Missing candidates:
- `app/api/*` route handlers (auth, domain, generate, migrate, upload) — these are the real external boundaries (request in, validate, call DB or third-party, respond). None ranked.
- `lib/fetchers.ts` — explicit fetcher module for the app's data layer. Should be top-3 for external; was not in top-5.

### ux
Top candidates:
1. components/editor.tsx
2. components/form/index.tsx
3. app/[domain]/[slug]/page.tsx
4. app/[domain]/layout.tsx
5. app/[domain]/page.tsx

Useful?
- yes
Why: All five are real UI surface — the editor, the form, the dynamic pages, the layout. This is the cleanest result of the four surfaces. The `cfg.grep` set for ux (`disabled`, `hidden`, `submit`, `checkout`, `autocomplete`, etc.) maps directly to UI files in a Next.js codebase.

Bad/noisy candidates:
- none in top-5

Missing candidates:
- `components/form/select-site.tsx` and other form sub-components — likely not in top-5 because aggregate score lower than `form/index.tsx`. Acceptable.

### errors
Top candidates:
1. lib/actions.ts
2. lib/actions/user.action.ts
3. lib/domains.ts
4. lib/remark-plugins.tsx
5. lib/utils.ts

Useful?
- partial
Why: `lib/actions.ts` and `lib/actions/user.action.ts` are correct — they handle write paths where error swallowing matters. `lib/remark-plugins.tsx` is reasonable (debug-leftovers signal hit it). `lib/domains.ts` is reasonable.

Bad/noisy candidates:
- `lib/utils.ts` — generic helper file; matched only because of `cache` supporting signal. Low-value for error audit.

Missing candidates:
- `app/api/*/route.ts` — error handling at API boundaries is exactly where production error-handling regressions hide. Missed entirely.
- `middleware.ts` — auth/boundary errors aren't covered.
- No `error.tsx` / `not-found.tsx` route boundaries surfaced. Next.js error boundaries are file-name conventions and a stack-aware ranker would auto-include them.

## Inspection quality
- Ranges helped: 200 lines of `lib/actions.ts` is a useful auditable slice; the full file would have hit the 12000-byte cap with truncation. Ranges removed that pain.
- Inspect chose enough context: at 1-120 / 1-200 the function bodies for auth callbacks and the first batch of server actions were complete. Range header is in the persisted inspection file, so the report appendix recovered the exact span.
- Report appendix correctly reflected the inspected ranges (`lib/actions.ts:1-200`, `lib/auth.ts:1-120`, `middleware.ts:1-120`).

## Prompt quality
- Enough context: yes for evidence (the "Grep signals" tail of the scan notes embeds real lines from `lib/auth.ts`, `lib/fetchers.ts`, `lib/actions.ts`). A downstream Claude run could open the right files first.
- Too much scan noise: yes — the repo-map block ships an empty Stack/Entry-Points template (the `--from-json` path doesn't auto-fill), then re-ships the entire scan summary right after. About 60% of the prompt is the scan dump pasted twice (once via repo map, once via the surface instructions block). Could be dedented.
- Actionable for Claude Code: yes for auth/ux. Marginal for external (because `.env` candidate would be a trap if blindly inspected). Actionable for errors only after expanding scope to `app/api/*` manually.

## Top observed product fixes
1. **Hard-exclude secrets files from candidates.** `.env`, `.env.*`, `.envrc`, anything under `secrets/`, anything under `.audit-kit/` (already), and any `*.pem`/`*.key`. Even appearing as a candidate is a leak risk.
2. **Stack-aware structural candidate boosts for Next.js.** When `next` is in dependencies, give automatic boosts to:
   - `middleware.ts`, `middleware.js` (auth)
   - `app/api/**/route.ts`, `pages/api/**` (external + auth + errors)
   - `app/**/error.tsx`, `app/**/not-found.tsx` (errors)
   - `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/loading.tsx` (ux)
   - `lib/auth*.ts`, `lib/session*.ts`, `lib/fetchers*.ts` (auth/external)
   These are file-name conventions, not content, so they survive the keyword-soup ranking failure mode. This is the lever that fixes the "missed app/api/* route handlers" gap.
3. **Don't reward surface-grep matches against metadata filenames** (`package.json`, `tsconfig.json`, `*.config.*`). When the only surface match is a substring inside a metadata filename or its dependency-name list, downgrade to a metadata-tier reason instead of the +5 surface boost.

## Do not build yet
Only recommend fixes that showed up in this run. The three fixes above are the entire backlog from the platforms dogfood. Skip:
- map auto-fill (still wanted but didn't block this run)
- prompt deduplication (cosmetic; Claude tolerates it)
- workflow chaining command (didn't matter once `prompt` auto-generates surfaces)
- new surfaces (no evidence of need)

## Follow-up fixes implemented
- secrets exclusion: `secretFileGlobs` in `src/lib/policy.ts` covers `.env`, `.env.*`, `.envrc`, `secrets/**`, `*.pem`, `*.key`, `*.cert`, `*.crt`. `next.ts` filters them out of candidates via `isSecretPath` and also passes them as `--glob '!...'` excludes to the live surface ripgrep so they never even surface as match lines.
- Next.js structural boosts: `isNextJsProject` detects via `next.config.*`, `app/**/page.tsx|layout.tsx`, or `app/api/**/route.ts`. `nextJsStructuralReason` maps file-name conventions to `+4` boosts with explicit reasons — `Next.js auth/cache boundary: middleware.`, `Next.js API route boundary.`, `Next.js UX page component.`, `Next.js layout boundary.`, `Next.js error boundary.`, `Next.js not-found boundary.`, `Next.js loading UX boundary.`, `Next.js auth library boundary.`, `Next.js fetcher/data boundary.`, `Next.js server action boundary.`, `Next.js form component boundary.`.
- metadata de-rank: `isMetadataPath` covers `package.json`, lockfiles, `tsconfig.json`, `next.config.*`, `postcss.config.*`, `tailwind.config.*`, eslint/prettier configs. `addSurfaceReason` skips these for the surface grep boost (+5) and the scan-signal boost (+4); they can still earn the low `+1` metadata-framing reason.
- tests added: `tests/next.test.ts` now covers secrets exclusion, metadata no-boost, Next.js middleware/api/page/form structural boosts, and a non-Next.js sanity case. 27/27 across the suite.

## Re-run results on `~/Downloads/platforms`

### auth top 5
1. `lib/actions.ts` — server action boundary
2. `lib/auth.ts` — auth library boundary
3. `middleware.ts` — middleware boundary
4. `lib/actions/user.action.ts` — server action boundary
5. `components/profile.tsx`

`package.json` is gone. All five are real auth-relevant code.

### external top 5
1. `lib/actions.ts` — server action boundary
2. `lib/fetchers.ts` — fetcher/data boundary (was missing before)
3. `lib/auth.ts`
4. `.gitignore` — false positive: cfg.grep terms (`http`, `api`) hit ignore patterns. Low impact (no leak), but a follow-up could exclude `.gitignore`/`.gitattributes` like docs.
5. `app/api/generate/route.ts` — API route boundary (was missing before)

`.env` is gone.

### ux top 5
1. `app/[domain]/[slug]/page.tsx` — UX page component
2. `app/[domain]/layout.tsx` — layout boundary
3. `app/[domain]/page.tsx` — UX page component
4. `components/form/index.tsx` — form component boundary
5. `app/app/(dashboard)/site/[id]/not-found.tsx` — not-found boundary

All five are real UX surface.

### errors top 5
1. `lib/actions.ts` — server action boundary
2. `lib/actions/user.action.ts` — server action boundary
3. `app/api/domain/[slug]/verify/route.ts` — API route boundary (was missing before)
4. `components/form/delete-site-form.tsx` — form component boundary
5. `middleware.ts` — middleware boundary

API route boundaries now surface.

### Remaining noise
- `.gitignore` ranked #4 in external because the surface terms hit the ignore patterns. Not a security risk, but a small ranking drag. Candidate for the next pass: extend secrets-style exclusion to dotfiles like `.gitignore`, `.gitattributes`, `.dockerignore`, `.npmignore`.

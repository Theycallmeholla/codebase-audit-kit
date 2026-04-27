# Platforms Auth Audit

Target: `~/Downloads/platforms` (Vercel platforms reference, Next.js 14 + next-auth + Prisma).
Surface: `auth` only.
Date: 2026-04-27.

## Files inspected
- `lib/actions.ts:1-220` (server actions, withSiteAuth/withPostAuth wiring)
- `lib/auth.ts:1-120` (next-auth config, session/jwt callbacks, `withSiteAuth`/`withPostAuth` wrappers)
- `middleware.ts:1-120` (route matcher and host-based rewrite/auth gate)
- `lib/actions/user.action.ts:1-160` (parallel password-auth code path)
- `components/profile.tsx:1-160` (session usage in UI)
- `app/api/upload/route.ts:1-200` (POST handler — earned via "API route boundary" reason after middleware bypass became suspicious)
- `app/api/generate/route.ts:1-200` (LLM endpoint with rate limit — used as positive contrast)
- `app/api/migrate/route.ts:1-200` (commented-out migration script)
- `app/api/domain/[slug]/verify/route.ts:1-120` (Vercel domain-verify proxy)
- `prisma/schema.prisma` (to confirm User model fields used by `lib/actions/user.action.ts`)
- `rg -n "user.action|sigInUser|createUser"` across the repo (to confirm zero callers)

## Confirmed findings

### AUTH-001 — P0 — `app/api/upload/route.ts`: unauthenticated public upload
POST handler streams `req.body` into `@vercel/blob` `put()` with `access: "public"`. Only check is `BLOB_READ_WRITE_TOKEN` env var. No session, no rate limit, no size cap, no content-type allow-list, no per-user storage prefix. `middleware.ts` matcher excludes `/api/` so the auth gate never runs upstream. Confidence: high.

### AUTH-002 — P1 — `app/api/domain/[slug]/verify/route.ts`: unauthenticated domain verification
GET handler decodes `params.slug` as a domain and calls `verifyDomain` / `getDomainResponse` / `getConfigResponse` against Vercel APIs. No session, no ownership check (the requester does not have to own a `Site` whose `customDomain` matches the slug), no rate limit. Same middleware-bypass root cause as AUTH-001. Confidence: high.

### AUTH-003 — P2 — `lib/actions/user.action.ts`: dead parallel password-auth code path
Defines `sigInUser` (typo), `createUser`, `getUser`, `updateUser` using bcrypt + a fresh `new PrismaClient()` instance, referencing `dbUser.password`, `data.companyName`, `dbUser.role`. The current `prisma/schema.prisma` User model has no `password` or `companyName` field, and `rg user.action` returns zero importers. Two failure modes: (1) schema drift if it does compile in deployed env, (2) accidental future wiring would create a parallel auth path that bypasses NextAuth sessions entirely and leaks Prisma connections. `bcrypt` cost is 15 (≈3s/hash, DoS-friendly). Confidence: high.

## False positives / assumptions
- `lib/auth.ts:281-291` uses `// @ts-expect-error` in the session/jwt callbacks. Looked suspicious but the underlying `token.sub` / `token.user.username` access is correct for the next-auth JWT strategy in use; only typing is sloppy. Below the audit's severity bar (P3 maintainability), not recorded.
- `middleware.ts:374` does `req.headers.get("host")!.replace(...)` (non-null assertion). Throws on absent Host header, which Vercel always supplies. Below severity bar; not recorded.
- `createSite` in `lib/actions.ts:27` has no rate limit — any logged-in user can spam-create sites. Session-gated, application-level abuse only, no security boundary breach. Below severity bar.
- `updateSite` (`lib/actions.ts:68` via `withSiteAuth`) lets a site owner change `customDomain` to any string. Vercel's verify flow + Prisma unique constraint prevents direct hijack. Not a finding under the inspected slice; the related risk lives in AUTH-002.
- AUTH-001 and AUTH-002 share a root cause (middleware excludes `/api/`). Recorded as separate findings because they have distinct fixes and different blast radii. The matcher itself is not a separate finding because the architectural pattern (middleware does host routing, each API route owns its auth) is intentional.

## Workflow notes

### Did `next` pick the right files?
Yes. `next auth` returned `lib/actions.ts`, `lib/auth.ts`, `middleware.ts`, `lib/actions/user.action.ts`, `components/profile.tsx` as top-5. All five carried real evidence used in the audit. The "Next.js auth library boundary" / "Next.js server action boundary" / "Next.js auth/cache boundary: middleware." reasons made the priority obvious without reading code first. AUTH-001 came from `app/api/upload/route.ts` which was *not* in the auth top-5 — but the audit reached it because middleware inspection surfaced the matcher bypass and the API-route directory listing was one `ls` away. Worth noting: `next auth` could plausibly include `app/api/auth/[...nextauth]/route.ts` itself (the actual NextAuth integration), and would have served the audit even better if `app/api/**/route.ts` ranked for `auth` directly, not just for `external`/`uploads`/`errors`.

### Did `inspect` ranges provide enough context?
Yes for the initial five files (1-220 / 1-160 each). `app/api/upload/route.ts:1-200` and `app/api/domain/[slug]/verify/route.ts:1-120` were small enough that ranges were redundant but harmless. `app/api/migrate/route.ts:1-200` returned almost entirely commented-out code — wasted attention slice. Not a blocker.

### Did `ledger:add` capture the finding cleanly?
Yes once shell quoting was figured out. The first attempt to record AUTH-002 failed because zsh tried to glob-expand the unquoted `app/api/domain/[slug]/verify/route.ts` argument. A small UX hit; quoting fixed it.

### Did `report` output look usable?
Findings section is clean — severity, file, evidence, fix, impact, next file, open question, files-inspected per finding, plus a Recommended Fix Order block sorted by severity then confidence. Severity breakdown counts are correct.

The "Scope" block, however, embeds the entire `## Notes From Latest Scan` dump from `repo-map.md` — about 80 lines of grep-signal output (`./lib/auth.ts:47: jwt: async ...` etc.) right at the top of the report. That is noise in an executive document and would make this report awkward to share with a reviewer. The report should either truncate or omit the scan-notes block in the Scope section (the structured map fields above the scan notes are what belongs there).

## Product fixes suggested by this actual audit

1. **Truncate or strip the scan-notes block from `report`'s Scope section.** The current report pastes ~80 lines of raw grep output into the executive-summary scope, which makes the report look like an internal scratchpad instead of a deliverable. Keep the structured "Stack / Entry Points / Risk Surfaces / Hot Files" portion of `repo-map.md` and drop everything from `## Notes From Latest Scan` onward (or compress it to a single "scan generated at, N files captured" line).
2. **Boost `app/api/**/route.ts` for the `auth` surface, not only `external`/`uploads`/`errors`.** AUTH-001 lived in `app/api/upload/route.ts`; auth issues in API routes are at least as common as in middleware/server-action files. The structural-boost map in `nextJsStructuralReason` should include `auth` for `app/api/**/route.ts`.
3. **Document `ledger:add` shell quoting for paths with `[slug]` segments**, or accept paths via a positional argument that doesn't go through option parsing for the `--file`-related flags. The first AUTH-002 attempt failed silently from zsh's "no matches found" glob expansion — the audit-kit CLI didn't even run. A one-line note in the README example, or stripping zsh glob expansion via clearer quoting in the ledger:add example, would prevent the same trap on the next real audit.

Do not invent product fixes. The three above all surfaced while running this audit and would each have saved time if they had already been in place.

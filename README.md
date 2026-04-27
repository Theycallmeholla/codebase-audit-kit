# Codebase Audit Kit

Token-efficient codebase audit CLI.

The mistake is reading code first. This tool forces the better workflow:

```text
cheap signals -> next -> inspect -> Claude -> ledger:add -> report
```

## Installation

```bash
npm install
npm run build
npm link
```

Or run locally:

```bash
npm run dev -- init
```

## Quickstart

```bash
audit-kit version
audit-kit doctor
audit-kit init
audit-kit scan --json
audit-kit next auth
```

## Full Workflow

Inside the repo you want to audit:

```bash
audit-kit init
audit-kit doctor
audit-kit scan --json
audit-kit map --from-json
audit-kit surface:list
audit-kit next auth
audit-kit inspect src/file.ts:1-120
audit-kit prompt auth
audit-kit ledger:add ...
audit-kit report
```

`prompt <surface>` auto-generates the surface prompt if it does not exist yet, so the explicit `surface <name>` step is no longer required.

Then paste `.audit-kit/prompts/claude-auth-*.md` into Claude Code.

## Safety Model

- Cheap signals first, source inspection second.
- `inspect` rejects paths outside the target repo root.
- Generated artifacts stay under the target repo’s `.audit-kit/`.
- `clean` requires `--force` before it removes anything.

## Generated Files

```text
.audit-kit/
  config.json
  ledger.json
  latest-scan.md
  latest-scan.json
  repo-map.md
  scans/
  prompts/
  surfaces/
  inspections/
  reports/
```

## Commands

### `audit-kit init`

Creates:

```text
.audit-kit/
  config.json
  ledger.json
  scans/
  prompts/
  surfaces/
```

### `audit-kit scan`

Collects cheap signals:

- metadata files
- project structure
- file list
- size profile via `cloc` if installed
- hot files via git churn
- high-yield `rg` patterns

It does **not** summarize the whole codebase.

Use `audit-kit scan --json` to also write `.audit-kit/latest-scan.json` for downstream tooling.

### `audit-kit map`

Creates `.audit-kit/repo-map.md`.

Use `audit-kit map --from-json` to prefer `.audit-kit/latest-scan.json` when it exists. The map is a compact working artifact. Fill in missing parts manually or with Claude after reading the scan.

### `audit-kit doctor`

Checks local dependencies before an audit run.

- required: `git`, `rg`
- optional: `tree`, `cloc`

Missing optional tools print install hints. Missing required tools exit nonzero.

Use `audit-kit doctor --json` for machine-readable health checks.

### `audit-kit surface:list`

Prints supported surfaces and a one-line description for each.

### `audit-kit next <surface>`

Writes a next-step prompt with:

- top grep commands to run
- top 5 candidate files from latest scan signals
- reasons each file earned inspection
- a Claude-ready mini prompt

### `audit-kit surface <surface>`

Supported surfaces:

```text
auth
payments
db
external
uploads
admin
jobs
cache
errors
tests
ux
```

Creates a focused prompt for that risk surface.

### `audit-kit inspect <file...>`

Reads one or more earned files under the repo root with guardrails:

- rejects paths outside the repo
- rejects ignored directories like `node_modules`, `dist`, and `.audit-kit`
- truncates each file to 12000 bytes by default
- writes `.audit-kit/inspections/inspection-<timestamp>.md`

Pass a line range with `path:start-end` to focus on a specific span:

```bash
audit-kit inspect src/index.ts:1-80 src/lib/scan.ts:120-220
```

Range headers in the output include the exact span (`## src/index.ts:1-80`) so the report appendix can show what was inspected.

#### Shell quoting

In zsh, quote paths containing brackets, parentheses, spaces, or globs so the shell does not glob-expand them before audit-kit sees the argument:

```bash
audit-kit inspect "app/api/domain/[slug]/verify/route.ts:1-120"
audit-kit inspect "components/(marketing)/hero.tsx"
```

### `audit-kit prompt <surface>`

Creates a Claude-ready prompt using:

- repo map
- selected surface (auto-generated when `.audit-kit/surfaces/<surface>.md` is missing)
- current audit ledger

Invalid surfaces fail clearly. Run `audit-kit surface:list` to see supported names.

### `audit-kit ledger:export`

Exports the ledger without mutating it.

- `--format md`: markdown table plus detail blocks
- `--format json`: raw ledger JSON

### `audit-kit report`

Builds a markdown audit report from:

- `.audit-kit/ledger.json`
- `.audit-kit/repo-map.md` when present
- `.audit-kit/inspections/*.md` so the appendix lists every file actually inspected (deduplicated with ledger `filesInspected`)

Writes `.audit-kit/reports/report-<timestamp>.md`.

### `audit-kit version`

Prints package name, package version, and current Node version.

### `audit-kit clean`

Without `--force`, prints what would be removed.

- default: removes generated `scans`, `prompts`, `inspections`, and `reports`
- `--all --force`: removes the entire `.audit-kit/` directory, but refuses if `ledger.json` has findings
- `--all --force --include-ledger`: also removes `ledger.json` (destroys recorded findings)
- preserves `config.json`, `ledger.json`, and `repo-map.md` unless `--all` is used

## Smoke Test Another Repo

```bash
mkdir -p /tmp/audit-kit-smoke-target/src

cat > /tmp/audit-kit-smoke-target/package.json <<'EOF'
{
  "name": "audit-kit-smoke-target",
  "version": "0.0.1",
  "type": "module"
}
EOF

cat > /tmp/audit-kit-smoke-target/src/index.ts <<'EOF'
export function authHandler() {
  const token = process.env.AUTH_TOKEN;
  console.log(token);
  return "auth";
}
EOF

node dist/index.js init -p /tmp/audit-kit-smoke-target
node dist/index.js scan -p /tmp/audit-kit-smoke-target --json
node dist/index.js map -p /tmp/audit-kit-smoke-target --from-json
node dist/index.js next -p /tmp/audit-kit-smoke-target auth
node dist/index.js inspect -p /tmp/audit-kit-smoke-target src/index.ts
```

## Publishing / Local Development

```bash
npm run prepack
npm pack --dry-run
```

`prepack` runs typecheck, tests, and build before packaging.

### `audit-kit ledger:add`

Example:

```bash
audit-kit ledger:add \
  --surface payments \
  --severity P1 \
  --title "Webhook handler is not idempotent" \
  --file "src/api/stripe/webhook.ts" \
  --evidence "No event.id persistence before side effects" \
  --fix "Store event.id with unique constraint before processing" \
  --impact "Duplicate webhook processing can create duplicate side effects" \
  --confidence high \
  --next-file "src/jobs/reconcile-payments.ts" \
  --open-question "Is there any upstream idempotency key storage?" \
  --files-inspected src/api/stripe/webhook.ts src/jobs/reconcile-payments.ts
```

In zsh, quote paths containing brackets, parentheses, spaces, or globs in `--file` and `--files-inspected` so the shell does not glob-expand them:

```bash
audit-kit ledger:add \
  --surface auth \
  --severity P1 \
  --title "Unauthenticated domain verification endpoint" \
  --file "app/api/domain/[slug]/verify/route.ts" \
  --evidence "GET handler hits Vercel verify API without session or ownership check" \
  --fix "Require getSession() and ownership check before calling Vercel APIs" \
  --files-inspected "app/api/domain/[slug]/verify/route.ts" middleware.ts lib/auth.ts
```

### `audit-kit ledger:list`

Prints findings.

## Audit Principle

Bad:

```text
Audit this repo.
```

Good:

```text
Audit the payment webhook for signature verification, idempotency, DB writes, retries, and partial failure. Only inspect files that earned inspection through metadata, grep, git churn, or route relevance.
```

## Final Workflow

```text
cheap signals -> next -> inspect -> Claude -> ledger:add -> report
```

## Severity Filter

Only report:

- `P0`: security breach, data loss, fraud, revenue loss, order/payment failure
- `P1`: broken core flow or high-confidence production bug
- `P2`: likely production bug with clear failure scenario
- `P3`: maintainability risk with concrete future cost

Ignore pure style comments.

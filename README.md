# Codebase Audit Kit

Token-efficient codebase audit CLI.

The mistake is reading code first. This tool forces the better workflow:

```text
cheap signals -> repo map -> attack surfaces -> targeted reads -> ledger-only memory -> repeat
```

## Install

```bash
npm install
npm run build
npm link
```

Or run locally:

```bash
npm run dev -- init
```

## Workflow

Inside the repo you want to audit:

```bash
audit-kit init
audit-kit doctor
audit-kit scan
audit-kit map
audit-kit surface auth
audit-kit prompt auth
```

Then paste `.audit-kit/prompts/claude-auth-*.md` into Claude Code.

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

### `audit-kit surface:list`

Prints supported surfaces and a one-line description for each.

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

### `audit-kit prompt <surface>`

Creates a Claude-ready prompt using:

- repo map
- selected surface
- current audit ledger

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
  --confidence high
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

## Severity Filter

Only report:

- `P0`: security breach, data loss, fraud, revenue loss, order/payment failure
- `P1`: broken core flow or high-confidence production bug
- `P2`: likely production bug with clear failure scenario
- `P3`: maintainability risk with concrete future cost

Ignore pure style comments.

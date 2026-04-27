# Codebase Audit Kit

Token-efficient codebase audit CLI.

The mistake is reading code first. This tool forces the better workflow:

```text
cheap signals -> next -> inspect -> Claude -> ledger:add -> report
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
audit-kit scan --json
audit-kit map --from-json
audit-kit surface:list
audit-kit next auth
audit-kit inspect <earned-files>
audit-kit prompt auth
audit-kit ledger:add ...
audit-kit report
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

### `audit-kit prompt <surface>`

Creates a Claude-ready prompt using:

- repo map
- selected surface
- current audit ledger

### `audit-kit ledger:export`

Exports the ledger without mutating it.

- `--format md`: markdown table plus detail blocks
- `--format json`: raw ledger JSON

### `audit-kit report`

Builds a markdown audit report from:

- `.audit-kit/ledger.json`
- `.audit-kit/repo-map.md` when present

Writes `.audit-kit/reports/report-<timestamp>.md`.

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

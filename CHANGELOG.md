# Changelog

## 0.1.0

### Security
- Hardened `inspect` against symlink escapes. After `resolveRepoPath`, the real
  path is checked against the real repo root and the ignored-dir policy. A
  symlink that resolves outside the repo or into an ignored dir (e.g.
  `node_modules`) is rejected before any read or write.
- Validated `ledger:add` inputs at runtime via Zod. Invalid `severity`,
  `confidence`, or unknown `surface` values now fail the command with a clear
  error and leave `ledger.json` untouched.
- Wrapped CLI errors so command failures exit nonzero with a single red
  message instead of an unhandled rejection stack trace.

### CI / hygiene
- Added GitHub Actions workflow (`.github/workflows/ci.yml`) running
  `npm ci && npm run prepack` on Node 20 and 22 for push and pull_request.

### Cleanup
- `audit-kit version` now reads `name`/`version` from `package.json` at startup
  instead of using a hardcoded string.
- `inspect` truncation uses `StringDecoder` so multi-byte characters at the
  byte boundary are dropped cleanly instead of becoming `�`.
- Report's recommended-fix ordering reuses the canonical `sortFindings`
  (severity → confidence → ID), removing a duplicate `localeCompare`-based
  sort that would have drifted as severities changed.
- `addFinding` derives the next ID from the max existing number per surface
  rather than `findings.length + 1`, so manual ledger edits cannot create ID
  collisions.

### Initial features
- Token-budgeted scan, repo map, surface prompts, and Claude-ready prompts.
- Doctor, inspect, next, ledger export, and audit reporting workflows.
- Smoke and packaging-focused test coverage.

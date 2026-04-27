# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`codebase-audit-kit` is a Node 20+ TypeScript CLI (`audit-kit`) that drives a token-efficient audit workflow over **another** target repo. It does not analyze its own source — it generates artifacts inside `<target>/.audit-kit/`.

The enforced workflow is:

```
cheap signals -> next -> inspect -> Claude -> ledger:add -> report
```

The point is to keep large file reads off the critical path. Cheap signals (metadata, tree, `cloc`, git churn, `rg` pattern hits) are gathered first; full source is only read after a file has "earned" inspection.

## Commands

```bash
npm install
npm run dev -- <subcommand>   # tsx, no build needed
npm run build                 # tsc -> dist/
npm run check                 # tsc --noEmit
npm run test                  # vitest run
npx vitest run tests/scan.test.ts            # single test file
npx vitest run -t "scan writes summary"      # single test by name
npm run prepack               # check + test + build, gates publish
```

After `npm run build`, `npm link` exposes the `audit-kit` bin globally; or run `node dist/index.js <cmd>` directly. Every CLI command accepts `-p <path>` to target a different repo (default `process.cwd()`).

## Architecture

### Entrypoint and command surface
`src/index.ts` is a thin Commander shell. Each subcommand calls one function in `src/lib/` and prints the result. Add new commands by wiring a `src/lib/<feature>.ts` module here — keep `index.ts` free of business logic.

### Pipeline (must run in order; downstream stages assume upstream artifacts)
1. `init` (`lib/init.ts`) — creates `.audit-kit/{config.json, ledger.json, scans/, prompts/, surfaces/, inspections/, reports/}`.
2. `scan` (`lib/scan.ts`) — collects cheap signals only: metadata file heads, `tree`/`find` fallback, `cloc`, git churn, and a fixed list of `rg` patterns. Writes `latest-scan.md`; with `--json` also writes `latest-scan.json` (the structured `ScanJson` type) which downstream stages depend on.
3. `map` (`lib/map.ts`) — distills scan output into `repo-map.md`. `--from-json` prefers `latest-scan.json`.
4. `next <surface>` (`lib/next.ts`) — **requires `latest-scan.json`**. Joins scan grep hits + git churn + metadata to score top 5 "earned" files for a surface and emits a Claude-ready next-step prompt.
5. `surface <name>` / `prompt <name>` (`lib/surface.ts`, `lib/prompt.ts`) — broader surface-audit prompts using `repo-map.md` + ledger.
6. `inspect <file...>` (`lib/inspect.ts`) — only after files are earned. Reads, truncates to `--max-bytes` (default 12000), writes timestamped `inspections/inspection-*.md`.
7. `ledger:add` (`lib/ledger.ts`) — appends a `Finding` to `ledger.json` with auto-ID `<SURFACE>-NNN`. `ledger:list` / `ledger:export` read it; `report` (`lib/report.ts`) renders it as markdown.

### Surface registry
`src/lib/surface.ts` exports `surfaceConfig`, the single source of truth for the supported surfaces (`auth`, `payments`, `db`, `external`, `uploads`, `admin`, `jobs`, `cache`, `errors`, `tests`, `ux`). Each entry defines `title`, `focus`, and `grep` terms reused by `next`, `surface`, and `prompt`. Add a surface by extending this map — no other registration is needed, but also add a matching named pattern in `scan.ts`'s `rgPatterns` if you want `next` to score it.

### Filesystem and safety boundaries
- `src/lib/policy.ts` — single source of `ignoredDirNames` (`node_modules`, `.git`, `dist`, `.next`, `.audit-kit`, …) and `lockfileNames`. Anything that filters paths must read from here.
- `src/lib/fs.ts::resolveRepoPath` — guardrail used by `inspect`. Rejects paths outside the repo root and paths inside ignored dirs. Any new command that opens user-supplied paths must funnel through this.
- All generated artifacts live under `<target>/.audit-kit/`. The kit never writes outside that directory in the target repo.
- `src/lib/shell.ts::optional` — wraps external tools (`rg`, `tree`, `cloc`, `git`) so missing tools degrade to `[unavailable] …` instead of throwing. `doctor` (`lib/doctor.ts`) advertises which tools are required (`git`, `rg`) vs optional (`tree`, `cloc`).

### Module conventions
- ESM only (`"type": "module"`). Internal imports use `.js` extensions even for `.ts` sources (NodeNext resolution).
- TypeScript `strict` is on, `rootDir: src`, `outDir: dist`. No path aliases.
- Output is written via `lib/fs.ts::writeText`, which auto-creates parent dirs — don't reach for `fs/promises` directly when an existing helper applies.

### Tests
Vitest, in `tests/`. `tests/helpers.ts` provides `makeTempDir` with automatic cleanup via `afterEach` — every test that touches the filesystem should use it so runs stay hermetic. `tests/smoke.test.ts` exercises the full pipeline end-to-end against a synthetic target repo; treat it as the contract for the workflow ordering described above. `tests/packaging.test.ts` validates publish metadata; keep it green when touching `package.json`.

### Severity contract
`lib/ledger.ts` defines `Severity = P0 | P1 | P2 | P3` with a fixed sort (severity, then confidence, then ID). The CLI and prompts both reference this scheme — keep the meanings in `README.md`'s "Severity Filter" section and the ledger types in sync.

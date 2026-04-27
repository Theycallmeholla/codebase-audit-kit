import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";

type SurfaceDefinition = {
  title: string;
  description: string;
  focus: string[];
  grep: string[];
};

const surfaceConfig: Record<string, SurfaceDefinition> = {
  auth: {
    title: "Auth / Permissions",
    description: "Session trust, authorization, and privilege boundaries.",
    focus: ["session trust", "role checks", "authorization gaps", "admin-only actions", "tenant/account scoping"],
    grep: ["auth", "session", "role", "permission", "admin", "jwt", "cookie"]
  },
  payments: {
    title: "Payments / Billing / Webhooks",
    description: "Payment correctness, idempotency, and webhook safety.",
    focus: ["payment verification", "idempotency", "webhook signature checks", "duplicate events", "partial failure", "refund/cancel states"],
    grep: ["stripe", "paypal", "checkout", "billing", "subscription", "webhook", "invoice"]
  },
  db: {
    title: "Database Writes / Data Integrity",
    description: "Write safety, transactions, and data consistency risks.",
    focus: ["unsafe writes", "missing transactions", "race conditions", "unique constraints", "migration risk", "trusted client input"],
    grep: ["create", "update", "delete", "upsert", "transaction", "BEGIN", "COMMIT", "rollback"]
  },
  external: {
    title: "External APIs",
    description: "Retries, timeouts, rate limits, and secret handling.",
    focus: ["timeouts", "retry behavior", "partial success", "rate limits", "secrets", "error surfacing"],
    grep: ["fetch", "axios", "request", "http", "api", "timeout", "retry"]
  },
  uploads: {
    title: "Uploads / Untrusted Input",
    description: "File validation, storage assumptions, and traversal risk.",
    focus: ["file type validation", "size limits", "path traversal", "public access", "malware risk", "storage assumptions"],
    grep: ["upload", "multipart", "formData", "blob", "file", "mime", "path"]
  },
  admin: {
    title: "Admin Functionality",
    description: "Privilege checks around dangerous or bulk actions.",
    focus: ["privilege checks", "dangerous actions", "bulk edits", "impersonation", "audit logging"],
    grep: ["admin", "delete", "impersonate", "bulk", "role", "permission"]
  },
  jobs: {
    title: "Background Jobs / Cron / Queues",
    description: "Retry behavior, duplication, and job observability.",
    focus: ["retries", "idempotency", "dead letters", "visibility", "duplicate execution", "timeouts"],
    grep: ["cron", "job", "queue", "worker", "schedule", "retry"]
  },
  cache: {
    title: "Caching / Stale Data",
    description: "Invalidation gaps, privacy leaks, and stale reads.",
    focus: ["wrong cache keys", "stale user data", "revalidation gaps", "privacy leaks", "mutation invalidation"],
    grep: ["cache", "revalidate", "stale", "redis", "ttl", "no-store"]
  },
  errors: {
    title: "Error Handling / Observability",
    description: "Swallowed errors, poor logging, and weak recovery paths.",
    focus: ["swallowed errors", "generic errors", "missing logs", "silent partial failures", "bad user recovery"],
    grep: ["catch", "throw", "logger", "console.error", "alert", "try"]
  },
  tests: {
    title: "Tests / CI",
    description: "Coverage gaps around risky or failure-prone flows.",
    focus: ["missing tests around risky flows", "fake coverage", "skipped tests", "no integration tests", "no failure-path tests"],
    grep: ["describe", "it\\(", "test\\(", "skip", "todo", "expect"]
  },
  ux: {
    title: "UX / Conversion Flow",
    description: "User friction, dead ends, and checkout/form breakage.",
    focus: ["blocked user action", "hidden payment/submit buttons", "bad defaults", "disabled dead ends", "form friction", "generic alerts", "mobile/autofill issues"],
    grep: ["disabled", "hidden", "d-none", "alert\\(", "autocomplete", "checkout", "submit", "payment", "shipping"]
  }
};

export function listSurfaces(): string {
  return [
    "Supported surfaces:",
    ...Object.entries(surfaceConfig).map(([name, cfg]) => `- ${name}: ${cfg.description}`)
  ].join("\n");
}

export async function createSurfacePrompt(root: string, surface: string): Promise<string> {
  const cfg = surfaceConfig[surface];
  if (!cfg) {
    throw new Error(`Unknown surface: ${surface}`);
  }

  const mapPath = path.join(auditDir(root), "repo-map.md");
  const map = (await exists(mapPath)) ? await readText(mapPath) : "[repo map missing -- run audit-kit map first]";

  const prompt = `# Attack Surface Audit: ${cfg.title}

## Goal

Find production-impacting issues only. Do not review style. Do not read files broadly. Inspect only files that earned their way in through metadata, grep, git churn, or direct flow relevance.

## Repo Map

${map.slice(0, 10000)}

## Focus

${cfg.focus.map((x) => `- ${x}`).join("\n")}

## Suggested Grep

\`\`\`bash
${cfg.grep.map((x) => `rg -n ${JSON.stringify(x)} .`).join("\n")}
\`\`\`

## Instructions For Claude Code

1. Start with cheap signals:
   - metadata files
   - route/entrypoint lists
   - grep results
   - git churn
   - tests by filename/name
2. Do not open source files until each file has a specific reason.
3. For each file opened, state why it earned inspection.
4. Audit this surface for:
${cfg.focus.map((x) => `   - ${x}`).join("\n")}
5. Return only findings that meet this severity filter:
   - P0: security breach, data loss, fraud, revenue loss, order/payment failure
   - P1: broken core user flow or high-confidence production bug
   - P2: likely production bug with clear failure scenario
   - P3: maintainability risk with concrete future cost
6. Ignore naming, formatting, theoretical rewrites, and generic advice.

## Required Output

| Severity | File | Function/Area | Issue | Evidence | Customer/Business Impact | Minimal Fix | Confidence | Next File |
|---|---|---|---|---|---|---|---|---|

Then add:

## False Positives / Assumptions

## Next 3 Files To Inspect

## Single Highest-Leverage Fix
`;

  const out = path.join(auditDir(root), "surfaces", `${surface}.md`);
  await writeText(out, prompt);
  return out;
}

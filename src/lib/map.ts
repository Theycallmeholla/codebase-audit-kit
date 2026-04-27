import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";

export async function createMap(root: string): Promise<string> {
  const scanPath = path.join(auditDir(root), "latest-scan.md");
  const scan = (await exists(scanPath)) ? await readText(scanPath) : "";

  const map = `# Repo Map

This file is intentionally compact. Do not turn it into a full source summary.

## Stack

- Language:
- Framework:
- Package manager:
- Runtime:
- Database / ORM:
- Auth:
- Payments:
- Background jobs:
- External APIs:
- Test framework:
- Deployment:

## Entry Points

- Web routes:
- API routes:
- CLI / jobs:
- Webhooks:
- Admin routes:

## Risk Surfaces

1. Auth / permissions:
2. Payments / billing / webhooks:
3. Database writes / migrations:
4. External APIs:
5. File upload / user input:
6. Admin functionality:
7. Background jobs / cron / queues:
8. Caching / stale data:
9. Error handling / observability:
10. Tests / CI:
11. UX / conversion flow:

## Hot Files

Use git churn, grep hits, and metadata. Add only files that earned inspection.

| File | Reason | Surface |
|---|---|---|
|  |  |  |

## Files Earned For Inspection

| File | Why it earned inspection | Question to answer |
|---|---|---|
|  |  |  |

## Notes From Latest Scan

Paste only compact facts here. Do not paste raw source.

\`\`\`
${scan.slice(0, 12000)}
\`\`\`
`;

  const out = path.join(auditDir(root), "repo-map.md");
  await writeText(out, map);
  return out;
}

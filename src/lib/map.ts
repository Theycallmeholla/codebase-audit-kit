import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";
import type { ScanJson } from "./scan.js";

function renderScanNotes(scan: ScanJson): string {
  return [
    `Generated: ${scan.generatedAt}`,
    `Files captured: ${scan.files.length}`,
    `Metadata hits: ${scan.metadataHits.join(", ") || "none"}`,
    "",
    "Top file paths:",
    ...scan.files.slice(0, 40).map((file) => `- ${file}`),
    "",
    "Structure:",
    scan.tree,
    "",
    "Size profile:",
    scan.cloc,
    "",
    "Hot files:",
    scan.hotFiles,
    "",
    "Grep signals:",
    ...scan.grepSignals.map((signal) => `- ${signal.name}: ${signal.output.slice(0, 400)}`)
  ].join("\n");
}

export async function createMap(root: string, options?: { fromJson?: boolean }): Promise<string> {
  const jsonPath = path.join(auditDir(root), "latest-scan.json");
  const scanPath = path.join(auditDir(root), "latest-scan.md");

  let scanNotes = "";
  if (options?.fromJson && (await exists(jsonPath))) {
    const scan = JSON.parse(await readText(jsonPath)) as ScanJson;
    scanNotes = renderScanNotes(scan);
  } else {
    scanNotes = (await exists(scanPath)) ? await readText(scanPath) : "";
  }

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
${scanNotes.slice(0, 12000)}
\`\`\`
`;

  const out = path.join(auditDir(root), "repo-map.md");
  await writeText(out, map);
  return out;
}

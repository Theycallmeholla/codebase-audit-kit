import path from "node:path";
import { auditDir, ensureDir, exists, writeText } from "./fs.js";

export async function initProject(root: string): Promise<void> {
  const dir = auditDir(root);
  await ensureDir(dir);
  await ensureDir(path.join(dir, "scans"));
  await ensureDir(path.join(dir, "prompts"));
  await ensureDir(path.join(dir, "surfaces"));

  const configPath = path.join(dir, "config.json");
  if (!(await exists(configPath))) {
    await writeText(
      configPath,
      JSON.stringify(
        {
          version: 1,
          defaultSeverityFilter: ["P0", "P1", "P2", "P3"],
          ignoredDirs: [
            "node_modules",
            ".git",
            "dist",
            "build",
            ".next",
            "coverage",
            "vendor",
            "target",
            ".turbo"
          ],
          auditOrder: [
            "auth",
            "payments",
            "db",
            "external",
            "uploads",
            "admin",
            "jobs",
            "cache",
            "errors",
            "tests",
            "ux"
          ]
        },
        null,
        2
      )
    );
  }

  const ledgerPath = path.join(dir, "ledger.json");
  if (!(await exists(ledgerPath))) {
    await writeText(ledgerPath, JSON.stringify({ findings: [] }, null, 2));
  }
}

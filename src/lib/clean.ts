import { promises as fs } from "node:fs";
import path from "node:path";
import { auditDir, exists } from "./fs.js";

const generatedEntries = ["scans", "prompts", "inspections", "reports"];

export type CleanResult = {
  removed: string[];
  dryRun: boolean;
};

async function removeIfExists(target: string): Promise<boolean> {
  if (!(await exists(target))) {
    return false;
  }
  await fs.rm(target, { recursive: true, force: true });
  return true;
}

export async function cleanAuditArtifacts(root: string, options: { all?: boolean; force?: boolean }): Promise<CleanResult> {
  const base = auditDir(root);
  const targets = options.all ? [base] : generatedEntries.map((entry) => path.join(base, entry));

  if (!options.force) {
    return { removed: targets, dryRun: true };
  }

  const removed: string[] = [];
  for (const target of targets) {
    if (await removeIfExists(target)) {
      removed.push(target);
    }
  }

  return { removed, dryRun: false };
}

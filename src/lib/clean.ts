import { promises as fs } from "node:fs";
import path from "node:path";
import { auditDir, exists } from "./fs.js";
import { readLedger } from "./ledger.js";

const generatedEntries = ["scans", "prompts", "inspections", "reports"];

export type CleanResult = {
  removed: string[];
  dryRun: boolean;
  warning?: string;
};

type LedgerState =
  | { kind: "missing" }
  | { kind: "readable"; findings: number }
  | { kind: "unreadable"; error: string };

async function removeIfExists(target: string): Promise<boolean> {
  if (!(await exists(target))) {
    return false;
  }
  await fs.rm(target, { recursive: true, force: true });
  return true;
}

async function inspectLedger(root: string): Promise<LedgerState> {
  const ledgerPath = path.join(auditDir(root), "ledger.json");
  if (!(await exists(ledgerPath))) {
    return { kind: "missing" };
  }
  try {
    const ledger = await readLedger(root);
    return { kind: "readable", findings: ledger.findings.length };
  } catch (error) {
    return { kind: "unreadable", error: error instanceof Error ? error.message : String(error) };
  }
}

function ledgerBlockMessage(state: LedgerState): string | undefined {
  if (state.kind === "readable" && state.findings > 0) {
    return `Refusing to remove ledger.json with ${state.findings} finding${state.findings === 1 ? "" : "s"}. Re-run with --include-ledger to confirm destruction of audit findings.`;
  }
  if (state.kind === "unreadable") {
    return `Refusing to remove ledger.json: cannot validate its contents (${state.error}). Re-run with --include-ledger to discard it anyway.`;
  }
  return undefined;
}

export async function cleanAuditArtifacts(
  root: string,
  options: { all?: boolean; force?: boolean; includeLedger?: boolean }
): Promise<CleanResult> {
  const base = auditDir(root);
  const targets = options.all ? [base] : generatedEntries.map((entry) => path.join(base, entry));

  let warning: string | undefined;
  if (options.all && !options.includeLedger) {
    const state = await inspectLedger(root);
    const block = ledgerBlockMessage(state);
    if (block) {
      if (!options.force) {
        return { removed: targets, dryRun: true, warning: block };
      }
      throw new Error(block);
    }
  }

  if (!options.force) {
    return { removed: targets, dryRun: true, warning };
  }

  const removed: string[] = [];
  for (const target of targets) {
    if (await removeIfExists(target)) {
      removed.push(target);
    }
  }

  return { removed, dryRun: false, warning };
}

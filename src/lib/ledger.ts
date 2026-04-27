import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";

type Finding = {
  id: string;
  surface: string;
  severity: "P0" | "P1" | "P2" | "P3";
  title: string;
  file: string;
  evidence: string;
  fix: string;
  confidence: "high" | "medium" | "low";
  status: "open" | "fixed" | "wontfix";
  createdAt: string;
};

type Ledger = {
  findings: Finding[];
};

async function readLedger(root: string): Promise<Ledger> {
  const ledgerPath = path.join(auditDir(root), "ledger.json");
  if (!(await exists(ledgerPath))) {
    return { findings: [] };
  }
  return JSON.parse(await readText(ledgerPath)) as Ledger;
}

async function writeLedger(root: string, ledger: Ledger): Promise<void> {
  await writeText(path.join(auditDir(root), "ledger.json"), JSON.stringify(ledger, null, 2));
}

export async function addFinding(root: string, input: {
  surface: string;
  severity: "P0" | "P1" | "P2" | "P3";
  title: string;
  file?: string;
  evidence: string;
  fix: string;
  confidence?: "high" | "medium" | "low";
}): Promise<void> {
  const ledger = await readLedger(root);
  const count = ledger.findings.length + 1;
  const id = `${input.surface.toUpperCase()}-${String(count).padStart(3, "0")}`;

  ledger.findings.push({
    id,
    surface: input.surface,
    severity: input.severity,
    title: input.title,
    file: input.file ?? "",
    evidence: input.evidence,
    fix: input.fix,
    confidence: input.confidence ?? "medium",
    status: "open",
    createdAt: new Date().toISOString()
  });

  await writeLedger(root, ledger);
}

export async function listFindings(root: string): Promise<string> {
  const ledger = await readLedger(root);

  if (ledger.findings.length === 0) {
    return "No findings yet.";
  }

  return [
    "| ID | Severity | Surface | Status | Title | File | Confidence |",
    "|---|---|---|---|---|---|---|",
    ...ledger.findings.map((f) => `| ${f.id} | ${f.severity} | ${f.surface} | ${f.status} | ${f.title} | ${f.file} | ${f.confidence} |`)
  ].join("\n");
}

export async function compactLedger(root: string): Promise<string> {
  const ledger = await readLedger(root);
  if (ledger.findings.length === 0) {
    return "No confirmed findings yet.";
  }

  return ledger.findings
    .map((f) => {
      return [
        `ID: ${f.id}`,
        `Surface: ${f.surface}`,
        `Severity: ${f.severity}`,
        `Status: ${f.status}`,
        `File: ${f.file || "unknown"}`,
        `Issue: ${f.title}`,
        `Evidence: ${f.evidence}`,
        `Minimal fix: ${f.fix}`,
        `Confidence: ${f.confidence}`
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

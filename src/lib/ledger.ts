import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";

export type Severity = "P0" | "P1" | "P2" | "P3";
export type Confidence = "high" | "medium" | "low";
export type FindingStatus = "open" | "fixed" | "wontfix";

export type Finding = {
  id: string;
  surface: string;
  severity: Severity;
  title: string;
  file: string;
  evidence: string;
  fix: string;
  confidence: Confidence;
  status: FindingStatus;
  createdAt: string;
  impact?: string;
  nextFile?: string;
  openQuestion?: string;
  filesInspected?: string[];
};

export type Ledger = {
  findings: Finding[];
};

type AddFindingInput = {
  surface: string;
  severity: Severity;
  title: string;
  file?: string;
  evidence: string;
  fix: string;
  confidence?: Confidence;
  impact?: string;
  nextFile?: string;
  openQuestion?: string;
  filesInspected?: string[];
};

const severityOrder: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3
};

const confidenceOrder: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2
};

function normalizeFinding(raw: Partial<Finding>): Finding {
  return {
    id: raw.id ?? "UNKNOWN-000",
    surface: raw.surface ?? "unknown",
    severity: (raw.severity as Severity | undefined) ?? "P3",
    title: raw.title ?? "Untitled finding",
    file: raw.file ?? "",
    evidence: raw.evidence ?? "",
    fix: raw.fix ?? "",
    confidence: (raw.confidence as Confidence | undefined) ?? "medium",
    status: (raw.status as FindingStatus | undefined) ?? "open",
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
    impact: raw.impact,
    nextFile: raw.nextFile,
    openQuestion: raw.openQuestion,
    filesInspected: raw.filesInspected ?? []
  };
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    const confidenceDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confidenceDiff !== 0) {
      return confidenceDiff;
    }

    return a.id.localeCompare(b.id);
  });
}

export async function readLedger(root: string): Promise<Ledger> {
  const ledgerPath = path.join(auditDir(root), "ledger.json");
  if (!(await exists(ledgerPath))) {
    return { findings: [] };
  }

  const parsed = JSON.parse(await readText(ledgerPath)) as { findings?: Partial<Finding>[] };
  return {
    findings: (parsed.findings ?? []).map((finding) => normalizeFinding(finding))
  };
}

async function writeLedger(root: string, ledger: Ledger): Promise<void> {
  await writeText(path.join(auditDir(root), "ledger.json"), JSON.stringify(ledger, null, 2));
}

function renderFindingDetails(f: Finding): string {
  return [
    `ID: ${f.id}`,
    `Surface: ${f.surface}`,
    `Severity: ${f.severity}`,
    `Status: ${f.status}`,
    `File: ${f.file || "unknown"}`,
    `Issue: ${f.title}`,
    `Evidence: ${f.evidence}`,
    `Minimal fix: ${f.fix}`,
    `Confidence: ${f.confidence}`,
    `Impact: ${f.impact || "not provided"}`,
    `Next file: ${f.nextFile || "not provided"}`,
    `Open question: ${f.openQuestion || "not provided"}`,
    `Files inspected: ${f.filesInspected && f.filesInspected.length > 0 ? f.filesInspected.join(", ") : "not provided"}`
  ].join("\n");
}

export async function addFinding(root: string, input: AddFindingInput): Promise<void> {
  const ledger = await readLedger(root);
  const count = ledger.findings.length + 1;
  const id = `${input.surface.toUpperCase()}-${String(count).padStart(3, "0")}`;

  ledger.findings.push(
    normalizeFinding({
      id,
      surface: input.surface,
      severity: input.severity,
      title: input.title,
      file: input.file ?? "",
      evidence: input.evidence,
      fix: input.fix,
      confidence: input.confidence ?? "medium",
      status: "open",
      createdAt: new Date().toISOString(),
      impact: input.impact,
      nextFile: input.nextFile,
      openQuestion: input.openQuestion,
      filesInspected: input.filesInspected ?? []
    })
  );

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
    ...sortFindings(ledger.findings).map((f) => `| ${f.id} | ${f.severity} | ${f.surface} | ${f.status} | ${f.title} | ${f.file} | ${f.confidence} |`)
  ].join("\n");
}

export async function compactLedger(root: string): Promise<string> {
  const ledger = await readLedger(root);
  if (ledger.findings.length === 0) {
    return "No confirmed findings yet.";
  }

  return sortFindings(ledger.findings)
    .map((f) => renderFindingDetails(f))
    .join("\n\n---\n\n");
}

export async function exportLedger(root: string, format: "json" | "md" = "md"): Promise<string> {
  const ledger = await readLedger(root);

  if (format === "json") {
    return JSON.stringify(ledger, null, 2);
  }

  if (ledger.findings.length === 0) {
    return ["No findings yet.", "", "No confirmed findings yet."].join("\n");
  }

  return [
    await listFindings(root),
    "",
    ...sortFindings(ledger.findings).map((finding) => renderFindingDetails(finding))
  ].join("\n\n");
}

export function getSeverityBreakdown(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { P0: 0, P1: 0, P2: 0, P3: 0 }
  );
}

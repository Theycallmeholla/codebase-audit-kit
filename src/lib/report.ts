import { promises as fs } from "node:fs";
import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";
import { compactLedger, getSeverityBreakdown, readLedger, sortFindings, type Finding } from "./ledger.js";

function ledgerFiles(findings: Finding[]): string[] {
  return findings.flatMap((finding) => finding.filesInspected ?? []).filter(Boolean);
}

async function inspectionFiles(root: string): Promise<string[]> {
  const dir = path.join(auditDir(root), "inspections");
  if (!(await exists(dir))) return [];

  const files = await fs.readdir(dir);
  const paths: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await fs.readFile(path.join(dir, file), "utf8");
    let fenceLen = 0;
    for (const line of content.split("\n")) {
      const fenceMatch = line.match(/^(`{3,})\s*$/);
      if (fenceMatch) {
        const len = fenceMatch[1].length;
        if (fenceLen === 0) {
          fenceLen = len;
        } else if (len === fenceLen) {
          fenceLen = 0;
        }
        continue;
      }
      if (fenceLen > 0) continue;
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        paths.push(heading[1].trim());
      }
    }
  }
  return paths;
}

async function uniqueFilesInspected(root: string, findings: Finding[]): Promise<string[]> {
  const fromLedger = ledgerFiles(findings);
  const fromInspections = await inspectionFiles(root);
  return [...new Set([...fromLedger, ...fromInspections])].sort();
}

const scopeSectionsAllowed = new Set([
  "Stack",
  "Entry Points",
  "Risk Surfaces",
  "Files Earned For Inspection"
]);

function trimRepoMapScope(repoMap: string): string {
  const lines = repoMap.split("\n");
  const titleMatch = repoMap.match(/^#\s+(.+)$/m);
  const title = titleMatch ? `# ${titleMatch[1].trim()}` : "# Repo Map";

  const sections: string[] = [];
  let current: { name: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current && scopeSectionsAllowed.has(current.name)) {
        sections.push(`## ${current.name}\n${current.body.join("\n").trimEnd()}`);
      }
      current = { name: heading[1].trim(), body: [] };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  if (current && scopeSectionsAllowed.has(current.name)) {
    sections.push(`## ${current.name}\n${current.body.join("\n").trimEnd()}`);
  }

  if (sections.length === 0) {
    return `${title}\n\nRepo map skeleton in use; no scope sections recorded yet.`;
  }

  return [title, "", ...sections.map((section) => section.trim())].join("\n\n").trim();
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return "No confirmed findings yet.";
  }

  return sortFindings(findings)
    .map((finding) => {
      return [
        `### ${finding.id} ${finding.title}`,
        `- Severity: ${finding.severity}`,
        `- Surface: ${finding.surface}`,
        `- File: ${finding.file || "unknown"}`,
        `- Confidence: ${finding.confidence}`,
        `- Evidence: ${finding.evidence}`,
        `- Minimal fix: ${finding.fix}`,
        `- Impact: ${finding.impact || "not provided"}`,
        `- Next file: ${finding.nextFile || "not provided"}`,
        `- Open question: ${finding.openQuestion || "not provided"}`,
        `- Files inspected: ${finding.filesInspected && finding.filesInspected.length > 0 ? finding.filesInspected.join(", ") : "not provided"}`
      ].join("\n");
    })
    .join("\n\n");
}

export async function createReport(root: string): Promise<string> {
  const ledger = await readLedger(root);
  const repoMapPath = path.join(auditDir(root), "repo-map.md");
  const repoMapRaw = (await exists(repoMapPath)) ? await readText(repoMapPath) : "";
  const scope = repoMapRaw ? trimRepoMapScope(repoMapRaw) : "Repo map not available.";
  const findings = sortFindings(ledger.findings);
  const severityBreakdown = getSeverityBreakdown(findings);
  const fixOrder = sortFindings(findings);
  const openQuestions = findings.map((finding) => finding.openQuestion).filter((value): value is string => Boolean(value));
  const filesInspected = await uniqueFilesInspected(root, findings);

  const report = `# Audit Report

Generated: ${new Date().toISOString()}

## Executive Summary

${findings.length === 0 ? "No confirmed findings yet." : `${findings.length} confirmed findings recorded in the ledger.`}

## Scope

${scope}

## Severity Breakdown

- P0: ${severityBreakdown.P0}
- P1: ${severityBreakdown.P1}
- P2: ${severityBreakdown.P2}
- P3: ${severityBreakdown.P3}

## Findings

${renderFindings(findings)}

## Recommended Fix Order

${fixOrder.length === 0 ? "No confirmed findings yet." : fixOrder.map((finding) => `- ${finding.id} ${finding.title} (${finding.severity}, ${finding.confidence})`).join("\n")}

## Open Questions

${openQuestions.length === 0 ? "No open questions recorded." : openQuestions.map((question) => `- ${question}`).join("\n")}

## Appendix: Files Inspected

${filesInspected.length === 0 ? "No files inspected recorded." : filesInspected.map((file) => `- ${file}`).join("\n")}
`;

  const out = path.join(auditDir(root), "reports", `report-${Date.now()}.md`);
  await writeText(out, report);
  return out;
}

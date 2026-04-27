import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";
import { compactLedger } from "./ledger.js";
import type { ScanJson } from "./scan.js";
import { getSurfaceDefinition } from "./surface.js";

type Candidate = {
  file: string;
  reasons: string[];
  score: number;
};

function parseMatchedFiles(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("["))
    .map((line) => {
      const match = line.match(/^\.?\/?([^:]+):\d+:/);
      return match?.[1] ?? "";
    })
    .filter(Boolean);
}

function parseHotFiles(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("["))
    .map((line) => line.replace(/^\d+\s+/, ""))
    .filter(Boolean);
}

function collectCandidates(scan: ScanJson, surface: string): Candidate[] {
  const candidates = new Map<string, Candidate>();

  const addReason = (file: string, reason: string, score: number): void => {
    const current = candidates.get(file) ?? { file, reasons: [], score: 0 };
    if (!current.reasons.includes(reason)) {
      current.reasons.push(reason);
      current.score += score;
    }
    candidates.set(file, current);
  };

  const surfaceSignal = scan.grepSignals.find((signal) => signal.name === surface);
  if (surfaceSignal) {
    for (const file of parseMatchedFiles(surfaceSignal.output)) {
      addReason(file, `Matched ${surface} grep signal from latest scan.`, 4);
    }
  }

  for (const signal of scan.grepSignals.filter((item) => ["known-problems", "debug-leftovers", "env-vars", "payments", "auth", "uploads", "cache", "errors"].includes(item.name))) {
    for (const file of parseMatchedFiles(signal.output)) {
      addReason(file, `Matched supporting scan signal: ${signal.name}.`, signal.name === surface ? 3 : 1);
    }
  }

  for (const file of parseHotFiles(scan.hotFiles).slice(0, 10)) {
    addReason(file, "High git churn from latest scan.", 2);
  }

  for (const file of scan.metadataHits) {
    addReason(file, "Metadata file that frames stack and entrypoints.", 1);
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 5);
}

export async function createNextPrompt(root: string, surface: string): Promise<string> {
  const cfg = getSurfaceDefinition(surface);
  const mapPath = path.join(auditDir(root), "repo-map.md");
  const scanJsonPath = path.join(auditDir(root), "latest-scan.json");

  if (!(await exists(scanJsonPath))) {
    throw new Error("Missing latest scan JSON. Run audit-kit scan --json first.");
  }

  const scan = JSON.parse(await readText(scanJsonPath)) as ScanJson;
  const repoMap = (await exists(mapPath)) ? await readText(mapPath) : "[missing repo map]";
  const ledger = await compactLedger(root);
  const grepCommands = cfg.grep.map((term) => `rg -n ${JSON.stringify(term)} .`);
  const candidates = collectCandidates(scan, surface);

  const prompt = `# Next Step: ${cfg.title}

## Top Grep Commands

${grepCommands.map((command) => `- ${command}`).join("\n")}

## Top 5 Candidate Files

${candidates.length === 0
    ? "- No candidate files earned inspection from the latest scan."
    : candidates
        .map((candidate) => {
          return [`- ${candidate.file}`, ...candidate.reasons.map((reason) => `  Reason: ${reason}`)].join("\n");
        })
        .join("\n")}

## Claude Mini Prompt

You are auditing the ${surface} surface under a strict token budget.

Start with these grep commands:
${grepCommands.map((command) => `- ${command}`).join("\n")}

Only inspect these earned files unless new evidence justifies expanding scope:
${candidates.map((candidate) => `- ${candidate.file}: ${candidate.reasons.join(" ")}`).join("\n") || "- No earned files yet; rely on the grep output first."}

Repo map excerpt:
${repoMap.slice(0, 4000)}

Ledger:
${ledger}
`;

  const out = path.join(auditDir(root), "prompts", `next-${surface}-${Date.now()}.md`);
  await writeText(out, prompt);
  return out;
}

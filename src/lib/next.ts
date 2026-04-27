import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";
import { compactLedger } from "./ledger.js";
import { ignoredGlobs, lockfileNames } from "./policy.js";
import type { ScanJson } from "./scan.js";
import { optional } from "./shell.js";
import { getSurfaceDefinition } from "./surface.js";

type Candidate = {
  file: string;
  reasons: string[];
  score: number;
};

const docPenaltyExact = new Set(["readme.md", "changelog.md", "license", "license.md"]);
const docPenaltyPrefixes = ["docs/"];

const selfReferencePaths = new Set([
  "src/lib/scan.ts",
  "src/lib/surface.ts",
  "src/lib/map.ts",
  "src/lib/init.ts"
]);

const lockfileSet = new Set<string>([...lockfileNames]);

function isDocPath(file: string): boolean {
  const lower = file.toLowerCase();
  if (docPenaltyExact.has(lower)) return true;
  return docPenaltyPrefixes.some((prefix) => lower.startsWith(prefix));
}

function isSelfReferencePath(file: string): boolean {
  return selfReferencePaths.has(file);
}

function isLockfile(file: string): boolean {
  const base = file.split("/").pop() ?? file;
  return lockfileSet.has(base);
}

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

async function runSurfaceGrep(root: string, terms: string[]): Promise<string[]> {
  if (terms.length === 0) return [];
  const pattern = terms.join("|");
  const excludes = [
    ...ignoredGlobs,
    ...lockfileNames,
    ...lockfileNames.map((name) => `**/${name}`)
  ]
    .map((glob) => `--glob '!${glob}'`)
    .join(" ");
  const command = `rg -n --hidden ${excludes} ${JSON.stringify(pattern)} . | head -80`;
  const output = await optional("sh", ["-c", command], root);
  return parseMatchedFiles(output);
}

async function collectCandidates(
  root: string,
  scan: ScanJson,
  surface: string,
  surfaceTerms: string[]
): Promise<Candidate[]> {
  const candidates = new Map<string, Candidate>();

  const addReason = (file: string, reason: string, score: number): void => {
    if (isLockfile(file)) return;
    const current = candidates.get(file) ?? { file, reasons: [], score: 0 };
    if (!current.reasons.includes(reason)) {
      current.reasons.push(reason);
      current.score += score;
    }
    candidates.set(file, current);
  };

  const surfaceTermFiles = await runSurfaceGrep(root, surfaceTerms);
  for (const file of surfaceTermFiles) {
    addReason(file, `Matched ${surface} surface grep terms.`, 5);
  }

  const surfaceSignal = scan.grepSignals.find((signal) => signal.name === surface);
  if (surfaceSignal) {
    for (const file of parseMatchedFiles(surfaceSignal.output)) {
      addReason(file, `Matched ${surface} grep signal from latest scan.`, 4);
    }
  }

  const supportingNames = new Set([
    "known-problems",
    "debug-leftovers",
    "env-vars",
    "payments",
    "auth",
    "uploads",
    "cache",
    "errors"
  ]);

  for (const signal of scan.grepSignals.filter((item) => supportingNames.has(item.name) && item.name !== surface)) {
    for (const file of parseMatchedFiles(signal.output)) {
      addReason(file, `Matched supporting scan signal: ${signal.name}.`, 1);
    }
  }

  for (const file of parseHotFiles(scan.hotFiles).slice(0, 10)) {
    addReason(file, "High git churn from latest scan.", 2);
  }

  for (const file of scan.metadataHits) {
    addReason(file, "Metadata file that frames stack and entrypoints.", 1);
  }

  for (const candidate of candidates.values()) {
    if (isDocPath(candidate.file)) {
      candidate.score -= 5;
      candidate.reasons.push("Penalty: documentation file.");
    }
    if (isSelfReferencePath(candidate.file)) {
      candidate.score -= 3;
      candidate.reasons.push("Penalty: audit-kit pattern-defining file.");
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.score >= 2)
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
  const candidates = await collectCandidates(root, scan, surface, cfg.grep);

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

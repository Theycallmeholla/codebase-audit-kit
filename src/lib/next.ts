import path from "node:path";
import { auditDir, exists, parseJson, readText, writeText } from "./fs.js";
import { compactLedger } from "./ledger.js";
import { ignoredGlobs, lockfileNames, secretFileGlobs } from "./policy.js";
import { scanJsonErrorMessage, scanJsonSchema, type ScanJson } from "./scan.js";
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

const metadataExact = new Set<string>([
  "package.json",
  "tsconfig.json",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs"
]);

const metadataPatterns = [
  /^next\.config\.(js|mjs|ts|cjs)$/,
  /^postcss\.config\.(js|mjs|ts|cjs)$/,
  /^tailwind\.config\.(js|mjs|ts|cjs)$/
];

function normalizePath(file: string): string {
  return file.replace(/^\.\//, "").replaceAll("\\", "/");
}

function isDocPath(file: string): boolean {
  const lower = normalizePath(file).toLowerCase();
  if (docPenaltyExact.has(lower)) return true;
  return docPenaltyPrefixes.some((prefix) => lower.startsWith(prefix));
}

function isSelfReferencePath(file: string): boolean {
  return selfReferencePaths.has(normalizePath(file));
}

function isLockfile(file: string): boolean {
  const base = normalizePath(file).split("/").pop() ?? file;
  return lockfileSet.has(base);
}

function isMetadataPath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  const base = normalized.split("/").pop() ?? normalized;
  if (isLockfile(normalized)) return true;
  if (metadataExact.has(base)) return true;
  return metadataPatterns.some((pattern) => pattern.test(base));
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`, "i");
}

const secretFileRegexes = secretFileGlobs.map((glob) => globToRegex(glob));

function isSecretPath(file: string): boolean {
  const normalized = normalizePath(file);
  const base = normalized.split("/").pop() ?? normalized;
  return secretFileRegexes.some((regex) => regex.test(normalized) || regex.test(base));
}

function parseMatchedFiles(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("["))
    .map((line) => {
      const match = line.match(/^\.?\/?([^:]+):\d+:/);
      return match?.[1] ? normalizePath(match[1]) : "";
    })
    .filter(Boolean);
}

function parseHotFiles(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("["))
    .map((line) => normalizePath(line.replace(/^\d+\s+/, "")))
    .filter(Boolean);
}

async function runSurfaceGrep(root: string, terms: string[]): Promise<string[]> {
  if (terms.length === 0) return [];
  const pattern = terms.join("|");
  const excludes = [
    ...ignoredGlobs,
    ...lockfileNames,
    ...lockfileNames.map((name) => `**/${name}`),
    ...secretFileGlobs
  ]
    .map((glob) => `--glob '!${glob}'`)
    .join(" ");
  const command = `rg -n --hidden ${excludes} ${JSON.stringify(pattern)} . | head -80`;
  const output = await optional("sh", ["-c", command], root);
  return parseMatchedFiles(output);
}

function isNextJsProject(scan: ScanJson): boolean {
  const files = new Set(scan.files.map(normalizePath));
  if ([...files].some((file) => /^next\.config\.(js|mjs|ts|cjs)$/.test(file))) return true;
  if ([...files].some((file) => /^app\/.+\/(page|layout)\.tsx$/.test(file) || /^app\/api\/.+\/route\.(ts|js)$/.test(file))) return true;
  if (files.has("app/page.tsx") || files.has("app/layout.tsx")) return true;
  return scan.metadataHits.includes("package.json") && scan.files.some((file) => normalizePath(file) === "next-env.d.ts");
}

function nextJsStructuralReason(file: string, surface: string): string | undefined {
  const normalized = normalizePath(file);

  if (/^middleware\.(ts|js)$/.test(normalized) && ["auth", "cache", "errors"].includes(surface)) {
    return "Next.js auth/cache boundary: middleware.";
  }
  if (/^app\/api\/.+\/route\.(ts|js)$/.test(normalized)) {
    if (surface === "auth") return "Next.js API route auth boundary.";
    if (["external", "uploads", "errors"].includes(surface)) return "Next.js API route boundary.";
  }
  if ((/^app\/page\.tsx$/.test(normalized) || /^app\/.+\/page\.tsx$/.test(normalized)) && ["ux", "errors"].includes(surface)) {
    return "Next.js UX page component.";
  }
  if ((/^app\/layout\.tsx$/.test(normalized) || /^app\/.+\/layout\.tsx$/.test(normalized)) && ["ux", "auth", "errors"].includes(surface)) {
    return "Next.js layout boundary.";
  }
  if ((/^app\/error\.tsx$/.test(normalized) || /^app\/.+\/error\.tsx$/.test(normalized)) && surface === "errors") {
    return "Next.js error boundary.";
  }
  if ((/^app\/not-found\.tsx$/.test(normalized) || /^app\/.+\/not-found\.tsx$/.test(normalized)) && ["ux", "errors"].includes(surface)) {
    return "Next.js not-found boundary.";
  }
  if ((/^app\/loading\.tsx$/.test(normalized) || /^app\/.+\/loading\.tsx$/.test(normalized)) && surface === "ux") {
    return "Next.js loading UX boundary.";
  }
  if (/^lib\/auth.*\.ts$/.test(normalized) && surface === "auth") {
    return "Next.js auth library boundary.";
  }
  if (/^lib\/fetchers.*\.ts$/.test(normalized) && ["external", "cache", "errors"].includes(surface)) {
    return "Next.js fetcher/data boundary.";
  }
  if ((/^lib\/actions.*\.ts$/.test(normalized) || /^lib\/actions\/.+\.ts$/.test(normalized)) && ["auth", "db", "external", "uploads", "errors"].includes(surface)) {
    return "Next.js server action boundary.";
  }
  if ((/^components\/.*\/form.*\.tsx$/.test(normalized) || /^components\/form\//.test(normalized)) && ["ux", "auth", "errors"].includes(surface)) {
    return "Next.js form component boundary.";
  }

  return undefined;
}

async function collectCandidates(
  root: string,
  scan: ScanJson,
  surface: string,
  surfaceTerms: string[]
): Promise<Candidate[]> {
  const candidates = new Map<string, Candidate>();

  const addReason = (file: string, reason: string, score: number): void => {
    const normalized = normalizePath(file);
    if (isLockfile(normalized) || isSecretPath(normalized)) return;
    const current = candidates.get(normalized) ?? { file: normalized, reasons: [], score: 0 };
    if (!current.reasons.includes(reason)) {
      current.reasons.push(reason);
      current.score += score;
    }
    candidates.set(normalized, current);
  };

  const addSurfaceReason = (file: string, reason: string, score: number): void => {
    if (isMetadataPath(file)) return;
    addReason(file, reason, score);
  };

  const surfaceTermFiles = await runSurfaceGrep(root, surfaceTerms);
  for (const file of surfaceTermFiles) {
    addSurfaceReason(file, `Matched ${surface} surface grep terms.`, 5);
  }

  const surfaceSignal = scan.grepSignals.find((signal) => signal.name === surface);
  if (surfaceSignal) {
    for (const file of parseMatchedFiles(surfaceSignal.output)) {
      addSurfaceReason(file, `Matched ${surface} grep signal from latest scan.`, 4);
    }
  }

  if (isNextJsProject(scan)) {
    for (const file of scan.files.map(normalizePath)) {
      const reason = nextJsStructuralReason(file, surface);
      if (reason) {
        addReason(file, reason, 4);
      }
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

  const scan: ScanJson = parseJson(await readText(scanJsonPath), scanJsonSchema, scanJsonErrorMessage);
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

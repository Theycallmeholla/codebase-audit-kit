import path from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import { auditDir, ensureDir, writeText } from "./fs.js";
import { ignoredGlobs, lockfileNames } from "./policy.js";
import { optional } from "./shell.js";

const ignore = [...ignoredGlobs];

const metadataFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "requirements.txt",
  "pyproject.toml",
  "poetry.lock",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "composer.json",
  "composer.lock",
  "Gemfile",
  "Gemfile.lock",
  "Dockerfile",
  "docker-compose.yml",
  "compose.yml",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  ".env.example",
  "README.md"
];

const rgPatterns = [
  { name: "known-problems", pattern: "TODO|FIXME|HACK|XXX" },
  { name: "debug-leftovers", pattern: "console\\.log|debugger|print\\(" },
  { name: "env-vars", pattern: "process\\.env\\.|getenv\\(|ENV\\[" },
  { name: "code-exec", pattern: "eval\\(|new Function|exec\\(|shell_exec|system\\(" },
  { name: "secrets", pattern: "secret|password|api[_-]?key|token" },
  { name: "sql-injection", pattern: "query.*\\$\\{|execute.*format\\(|cursor\\.execute.*%|DB::raw|rawQuery" },
  { name: "promise-all", pattern: "Promise\\.all" },
  { name: "transactions", pattern: "transaction|BEGIN|COMMIT|rollback|atomic" },
  { name: "swallowed-errors", pattern: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}" },
  { name: "payments", pattern: "stripe|paypal|checkout|billing|subscription|webhook" },
  { name: "auth", pattern: "auth|session|role|permission|admin|jwt|cookie" },
  { name: "uploads", pattern: "upload|multipart|formData|blob|file" },
  { name: "cache", pattern: "cache|revalidate|stale|redis|ttl" }
];

const rgExcludePatterns = [
  ...ignoredGlobs,
  ...lockfileNames,
  ...lockfileNames.map((name) => `**/${name}`)
];

const rgExcludeGlobs = rgExcludePatterns.map((pattern) => `--glob '!${pattern}'`).join(" ");

export type ScanResult = {
  summary: string;
  outputPath: string;
};

export const scanJsonSchema = z.object({
  files: z.array(z.string()),
  metadataHits: z.array(z.string()),
  tree: z.string(),
  cloc: z.string(),
  hotFiles: z.string(),
  grepSignals: z.array(
    z.object({
      name: z.string(),
      pattern: z.string(),
      output: z.string()
    })
  ),
  generatedAt: z.string()
});

export type ScanJson = z.infer<typeof scanJsonSchema>;

export const scanJsonErrorMessage = "Invalid latest-scan.json. Run audit-kit scan --json again.";

export async function scanProject(root: string, maxFiles: number, options?: { json?: boolean }): Promise<ScanResult> {
  await ensureDir(auditDir(root));

  const files = await fg(["**/*"], {
    cwd: root,
    onlyFiles: true,
    dot: true,
    ignore
  });

  const selectedFiles = files.slice(0, maxFiles);
  const metadataHits = metadataFiles.filter((file) => files.includes(file));

  const metadataContent = await Promise.all(
    metadataHits.map(async (file) => {
      const content = await optional("sh", ["-c", `sed -n '1,160p' ${JSON.stringify(file)}`], root);
      return `## ${file}\n\n\`\`\`\n${content}\n\`\`\``;
    })
  );

  const tree = await optional(
    "sh",
    ["-c", "tree -L 3 -I 'node_modules|dist|build|.git|coverage|.next|vendor|target|.audit-kit' 2>/dev/null || find . -maxdepth 3 -type f | sort | head -250"],
    root
  );

  const cloc = await optional(
    "sh",
    ["-c", "cloc . --exclude-dir=node_modules,dist,build,.git,coverage,.next,vendor,target,.audit-kit 2>/dev/null || echo 'cloc not installed'"],
    root
  );

  const hotFiles = await optional(
    "sh",
    ["-c", "git log --pretty=format: --name-only 2>/dev/null | sort | uniq -c | sort -rn | head -30 || echo 'git history unavailable'"],
    root
  );

  const grepSignals: Array<{ name: string; pattern: string; output: string }> = [];
  const grepSections: string[] = [];

  for (const item of rgPatterns) {
    const out = await optional(
      "sh",
      ["-c", `rg -n --hidden ${rgExcludeGlobs} ${JSON.stringify(item.pattern)} . | head -80`],
      root
    );
    grepSignals.push({ name: item.name, pattern: item.pattern, output: out });
    grepSections.push(`## ${item.name}\n\n\`\`\`\n${out}\n\`\`\``);
  }

  const generatedAt = new Date().toISOString();
  const summary = `# Audit Kit Scan

Generated: ${generatedAt}

## File Count

${files.length} files detected. Showing first ${selectedFiles.length} paths.

## File Paths

\`\`\`
${selectedFiles.join("\n")}
\`\`\`

## Structure

\`\`\`
${tree}
\`\`\`

## Size Profile

\`\`\`
${cloc}
\`\`\`

## Hot Files by Git Churn

\`\`\`
${hotFiles}
\`\`\`

# Metadata Files

${metadataContent.join("\n\n")}

# Ripgrep Signals

${grepSections.join("\n\n")}
`;

  const outputPath = path.join(auditDir(root), "scans", `scan-${Date.now()}.md`);
  await writeText(outputPath, summary);
  await writeText(path.join(auditDir(root), "latest-scan.md"), summary);
  if (options?.json) {
    const payload: ScanJson = {
      files: selectedFiles,
      metadataHits,
      tree,
      cloc,
      hotFiles,
      grepSignals,
      generatedAt
    };
    await writeText(path.join(auditDir(root), "latest-scan.json"), JSON.stringify(payload, null, 2));
  }

  return { summary, outputPath };
}

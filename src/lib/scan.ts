import path from "node:path";
import fg from "fast-glob";
import { auditDir, ensureDir, writeText } from "./fs.js";
import { optional } from "./shell.js";

const ignore = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/target/**",
  "**/.turbo/**",
  "**/.audit-kit/**"
];

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

export type ScanResult = {
  summary: string;
  outputPath: string;
};

export async function scanProject(root: string, maxFiles: number): Promise<ScanResult> {
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

  const grepSections: string[] = [];

  for (const item of rgPatterns) {
    const out = await optional(
      "sh",
      ["-c", `rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!.git' --glob '!coverage' --glob '!.next' --glob '!vendor' --glob '!target' --glob '!.audit-kit' ${JSON.stringify(item.pattern)} . | head -80`],
      root
    );
    grepSections.push(`## ${item.name}\n\n\`\`\`\n${out}\n\`\`\``);
  }

  const summary = `# Audit Kit Scan

Generated: ${new Date().toISOString()}

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

  return { summary, outputPath };
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { auditDir, ensureDir, resolveRepoPath } from "./fs.js";

function truncateUtf8(content: string, maxBytes: number): { body: string; truncated: boolean } {
  const buffer = Buffer.from(content, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return { body: content, truncated: false };
  }

  return {
    body: buffer.subarray(0, maxBytes).toString("utf8"),
    truncated: true
  };
}

export async function inspectFiles(root: string, filePaths: string[], maxBytes = 12000): Promise<string> {
  if (filePaths.length === 0) {
    throw new Error("Provide at least one file to inspect.");
  }

  const sections = await Promise.all(
    filePaths.map(async (inputPath) => {
      const { absolutePath, relativePath } = resolveRepoPath(root, inputPath);
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        throw new Error(`Not a file: ${inputPath}`);
      }

      const content = await fs.readFile(absolutePath, "utf8");
      const { body, truncated } = truncateUtf8(content, maxBytes);
      const suffix = truncated ? "\n\n[truncated]" : "";

      return `## ${relativePath}\n\n\`\`\`\n${body}${suffix}\n\`\`\``;
    })
  );

  const output = sections.join("\n\n");
  const dir = path.join(auditDir(root), "inspections");
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `inspection-${Date.now()}.md`), output, "utf8");
  return output;
}

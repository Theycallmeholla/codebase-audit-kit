import { promises as fs } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { auditDir, ensureDir, isIgnoredRelativePath, isWithinRoot, rel, resolveRepoPath } from "./fs.js";

type InspectSpec = {
  inputPath: string;
  filePath: string;
  range?: { start: number; end: number };
};

function parseSpec(input: string): InspectSpec {
  const match = input.match(/^(.*):(\d+)-(\d+)$/);
  if (!match) {
    return { inputPath: input, filePath: input };
  }

  const filePath = match[1];
  const start = Number(match[2]);
  const end = Number(match[3]);

  if (!filePath || start < 1 || end < 1 || start > end) {
    throw new Error(`Invalid range in "${input}". Use file.ts:start-end with 1 <= start <= end.`);
  }

  return { inputPath: input, filePath, range: { start, end } };
}

function truncateUtf8(content: string, maxBytes: number): { body: string; truncated: boolean } {
  const buffer = Buffer.from(content, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return { body: content, truncated: false };
  }

  const decoder = new StringDecoder("utf8");
  const body = decoder.write(buffer.subarray(0, maxBytes));
  return { body, truncated: true };
}

function sliceLines(content: string, start: number, end: number): string {
  const lines = content.split("\n");
  return lines.slice(start - 1, end).join("\n");
}

export async function inspectFiles(root: string, filePaths: string[], maxBytes = 12000): Promise<string> {
  if (filePaths.length === 0) {
    throw new Error("Provide at least one file to inspect.");
  }

  const realRoot = await fs.realpath(root);

  const sections = await Promise.all(
    filePaths.map(async (input) => {
      const spec = parseSpec(input);
      const { absolutePath, relativePath } = resolveRepoPath(root, spec.filePath);
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        throw new Error(`Not a file: ${spec.inputPath}`);
      }

      const realPath = await fs.realpath(absolutePath);
      if (!isWithinRoot(realRoot, realPath)) {
        throw new Error(`Symlink escapes repo root: ${spec.inputPath}`);
      }
      if (isIgnoredRelativePath(rel(realRoot, realPath))) {
        throw new Error(`Symlink resolves into ignored directory: ${spec.inputPath}`);
      }

      const content = await fs.readFile(absolutePath, "utf8");
      const sliced = spec.range ? sliceLines(content, spec.range.start, spec.range.end) : content;
      const { body, truncated } = truncateUtf8(sliced, maxBytes);
      const suffix = truncated ? "\n\n[truncated]" : "";
      const header = spec.range ? `${relativePath}:${spec.range.start}-${spec.range.end}` : relativePath;

      return `## ${header}\n\n\`\`\`\n${body}${suffix}\n\`\`\``;
    })
  );

  const output = sections.join("\n\n");
  const dir = path.join(auditDir(root), "inspections");
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `inspection-${Date.now()}.md`), output, "utf8");
  return output;
}

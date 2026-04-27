import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { ignoredDirNames } from "./policy.js";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export function auditDir(root: string): string {
  return path.join(root, ".audit-kit");
}

export function rel(root: string, filePath: string): string {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

export function isWithinRoot(root: string, filePath: string): boolean {
  const relative = rel(root, filePath);
  return relative !== "" && !relative.startsWith("../") && relative !== "..";
}

export function isIgnoredRelativePath(relativePath: string): boolean {
  const parts = relativePath.split("/").filter(Boolean);
  return parts.some((part) => ignoredDirNames.includes(part as (typeof ignoredDirNames)[number]));
}

export function parseJson<S extends z.ZodTypeAny>(content: string, schema: S, friendly: string): z.output<S> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${friendly} (JSON parse error: ${message})`);
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${friendly} (${issues})`);
  }
  return result.data;
}

export function resolveRepoPath(root: string, inputPath: string): { absolutePath: string; relativePath: string } {
  const absolutePath = path.resolve(root, inputPath);
  const relativePath = rel(root, absolutePath);

  if (!isWithinRoot(root, absolutePath)) {
    throw new Error(`Path is outside repo root: ${inputPath}`);
  }

  if (isIgnoredRelativePath(relativePath)) {
    throw new Error(`Path is in an ignored directory: ${inputPath}`);
  }

  return { absolutePath, relativePath };
}

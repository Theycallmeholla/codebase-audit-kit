import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { inspectFiles } from "../src/lib/inspect.js";
import { ensureDir } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

describe("inspectFiles", () => {
  it("rejects paths outside the repo root", async () => {
    const root = await makeTempDir("audit-kit-inspect-");
    await initProject(root);

    await expect(inspectFiles(root, ["../outside.ts"])).rejects.toThrow("Path is outside repo root");
  });

  it("writes inspection markdown for a valid file", async () => {
    const root = await makeTempDir("audit-kit-inspect-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "app.ts"), "export const ok = true;\n", "utf8");

    const output = await inspectFiles(root, ["src/app.ts"]);
    const files = await readdir(path.join(root, ".audit-kit", "inspections"));

    expect(output).toContain("## src/app.ts");
    expect(output).toContain("export const ok = true;");
    expect(files.some((file) => file.startsWith("inspection-") && file.endsWith(".md"))).toBe(true);
  });

  it("returns the requested line range with a range header", async () => {
    const root = await makeTempDir("audit-kit-inspect-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    const lines = ["one", "two", "three", "four", "five"].join("\n");
    await writeFile(path.join(root, "src", "lines.ts"), `${lines}\n`, "utf8");

    const output = await inspectFiles(root, ["src/lines.ts:2-4"]);
    const files = await readdir(path.join(root, ".audit-kit", "inspections"));
    const inspectionPath = path.join(root, ".audit-kit", "inspections", files[0]);
    const persisted = await readFile(inspectionPath, "utf8");

    expect(output).toContain("## src/lines.ts:2-4");
    expect(output).toContain("two\nthree\nfour");
    expect(output).not.toContain("one");
    expect(output).not.toContain("five");
    expect(persisted).toContain("## src/lines.ts:2-4");
  });

  it("rejects an inverted range", async () => {
    const root = await makeTempDir("audit-kit-inspect-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "lines.ts"), "a\nb\nc\n", "utf8");

    await expect(inspectFiles(root, ["src/lines.ts:5-2"])).rejects.toThrow("Invalid range");
  });

  it("rejects an outside-root path even when a range is provided", async () => {
    const root = await makeTempDir("audit-kit-inspect-");
    await initProject(root);

    await expect(inspectFiles(root, ["../outside.ts:1-3"])).rejects.toThrow("Path is outside repo root");
  });
});

import { readdir, writeFile } from "node:fs/promises";
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
});

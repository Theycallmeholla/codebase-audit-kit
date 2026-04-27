import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject, type ScanJson } from "../src/lib/scan.js";
import { ensureDir } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

describe("scanProject", () => {
  it("writes grep signals to JSON and excludes lockfile-only hits from grep output", async () => {
    const root = await makeTempDir("audit-kit-scan-");
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "auth.ts"), "const token = process.env.AUTH_TOKEN;\n", "utf8");
    await writeFile(path.join(root, "package-lock.json"), "{\"name\":\"token-from-lockfile\"}\n", "utf8");

    await scanProject(root, 50, { json: true });

    const scan = JSON.parse(await readFile(path.join(root, ".audit-kit", "latest-scan.json"), "utf8")) as ScanJson;
    const secretsSignal = scan.grepSignals.find((signal) => signal.name === "secrets");

    expect(scan.grepSignals.length).toBeGreaterThan(0);
    expect(secretsSignal?.output).toContain("src/auth.ts");
    expect(secretsSignal?.output).not.toContain("package-lock.json");
  });

  it("excludes ignored directories from the tree output", async () => {
    const root = await makeTempDir("audit-kit-scan-");
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "real.ts"), "export const ok = true;\n", "utf8");
    await ensureDir(path.join(root, "node_modules", "junkpkg"));
    await writeFile(path.join(root, "node_modules", "junkpkg", "secret.js"), "module.exports = 1;\n", "utf8");
    await ensureDir(path.join(root, "dist"));
    await writeFile(path.join(root, "dist", "leak.js"), "console.log('build artifact');\n", "utf8");

    await scanProject(root, 50, { json: true });

    const scan = JSON.parse(await readFile(path.join(root, ".audit-kit", "latest-scan.json"), "utf8")) as ScanJson;

    expect(scan.tree).not.toContain("junkpkg");
    expect(scan.tree).not.toContain("secret.js");
    expect(scan.tree).not.toContain("leak.js");
    expect(scan.tree).toContain("real.ts");
  });
});

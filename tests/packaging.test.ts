import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("packaging", () => {
  it("only publishes the intended files", async () => {
    await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: process.cwd() });
    const parsed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const files = parsed[0]?.files.map((file) => file.path) ?? [];

    expect(files).toContain("dist/index.js");
    expect(files).toContain("README.md");
    expect(files).toContain("LICENSE");
    expect(files).toContain("CHANGELOG.md");
    expect(files).not.toContain("tests/smoke.test.ts");
    expect(files).not.toContain("src/index.ts");
    expect(files.some((file) => file.startsWith(".audit-kit/"))).toBe(false);
    expect(files.some((file) => file.startsWith("node_modules/"))).toBe(false);
  });
});

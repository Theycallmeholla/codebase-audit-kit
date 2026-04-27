import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createMap } from "../src/lib/map.js";
import { createNextPrompt } from "../src/lib/next.js";
import { scanProject } from "../src/lib/scan.js";
import { ensureDir } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

describe("createNextPrompt", () => {
  it("creates a next-step prompt for a valid surface", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "auth.ts"), "export const requireAuth = () => 'auth';\n", "utf8");

    await scanProject(root, 50, { json: true });
    await createMap(root, { fromJson: true });
    const output = await createNextPrompt(root, "auth");
    const content = await readFile(output, "utf8");

    expect(output).toMatch(/next-auth-.*\.md$/);
    expect(content).toContain("## Top Grep Commands");
    expect(content).toContain("## Claude Mini Prompt");
  });
});

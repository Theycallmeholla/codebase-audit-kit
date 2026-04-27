import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createSurfacePrompt } from "../src/lib/surface.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "audit-kit-surface-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("surface prompts", () => {
  it("generates a prompt for a valid surface", async () => {
    const root = await makeTempDir();
    await initProject(root);

    const output = await createSurfacePrompt(root, "auth");

    expect(output).toMatch(/\.audit-kit\/surfaces\/auth\.md$/);
  });

  it("throws for an invalid surface", async () => {
    const root = await makeTempDir();
    await initProject(root);

    await expect(createSurfacePrompt(root, "bogus")).rejects.toThrow("Unknown surface: bogus");
  });
});

import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createSurfacePrompt } from "../src/lib/surface.js";
import { makeTempDir } from "./helpers.js";

describe("surface prompts", () => {
  it("generates a prompt for a valid surface", async () => {
    const root = await makeTempDir("audit-kit-surface-");
    await initProject(root);

    const output = await createSurfacePrompt(root, "auth");

    expect(output).toMatch(/\.audit-kit\/surfaces\/auth\.md$/);
  });

  it("throws for an invalid surface", async () => {
    const root = await makeTempDir("audit-kit-surface-");
    await initProject(root);

    await expect(createSurfacePrompt(root, "bogus")).rejects.toThrow("Unknown surface: bogus");
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createClaudePrompt } from "../src/lib/prompt.js";
import { makeTempDir } from "./helpers.js";

describe("createClaudePrompt", () => {
  it("auto-generates the surface prompt when missing", async () => {
    const root = await makeTempDir("audit-kit-prompt-");
    await initProject(root);

    const out = await createClaudePrompt(root, "auth");
    const content = await readFile(out, "utf8");

    expect(content).not.toContain("[missing surface prompt");
    expect(content).toContain("Attack Surface Audit: Auth / Permissions");
    expect(content).toContain("Current surface:\nauth");
  });

  it("rejects invalid surfaces", async () => {
    const root = await makeTempDir("audit-kit-prompt-");
    await initProject(root);

    await expect(createClaudePrompt(root, "bogus")).rejects.toThrow("Unknown surface: bogus");
  });
});

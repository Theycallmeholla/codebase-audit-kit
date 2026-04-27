import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { makeTempDir } from "./helpers.js";

describe("initProject", () => {
  it("creates the audit-kit scaffold and defaults", async () => {
    const root = await makeTempDir("audit-kit-init-");

    await initProject(root);

    const configPath = path.join(root, ".audit-kit", "config.json");
    const ledgerPath = path.join(root, ".audit-kit", "ledger.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as { auditOrder: string[] };
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as { findings: unknown[] };

    expect(config.auditOrder).toContain("auth");
    expect(ledger.findings).toEqual([]);
  });
});

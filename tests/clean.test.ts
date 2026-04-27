import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanAuditArtifacts } from "../src/lib/clean.js";
import { initProject } from "../src/lib/init.js";
import { addFinding } from "../src/lib/ledger.js";
import { exists } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

describe("cleanAuditArtifacts", () => {
  it("dry-run lists targets and returns no warning when ledger is empty", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);

    const result = await cleanAuditArtifacts(root, { all: true });

    expect(result.dryRun).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.removed).toContain(path.join(root, ".audit-kit"));
  });

  it("dry-run with --all warns when ledger has findings and --include-ledger missing", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);
    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "test",
      evidence: "e",
      fix: "f"
    });

    const result = await cleanAuditArtifacts(root, { all: true });

    expect(result.dryRun).toBe(true);
    expect(result.warning).toMatch(/Refusing to remove ledger\.json with 1 finding/);
    expect(result.warning).toMatch(/--include-ledger/);
  });

  it("force --all refuses when ledger has findings without --include-ledger", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);
    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "test",
      evidence: "e",
      fix: "f"
    });

    await expect(
      cleanAuditArtifacts(root, { all: true, force: true })
    ).rejects.toThrow(/Refusing to remove ledger\.json/);

    expect(await exists(path.join(root, ".audit-kit", "ledger.json"))).toBe(true);
  });

  it("force --all --include-ledger removes the entire .audit-kit directory", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);
    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "test",
      evidence: "e",
      fix: "f"
    });

    const result = await cleanAuditArtifacts(root, { all: true, force: true, includeLedger: true });

    expect(result.dryRun).toBe(false);
    expect(result.removed).toContain(path.join(root, ".audit-kit"));
    expect(await exists(path.join(root, ".audit-kit"))).toBe(false);
  });

  it("force --all refuses when ledger.json is malformed unless --include-ledger is passed", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);
    await writeFile(path.join(root, ".audit-kit", "ledger.json"), "{ not json", "utf8");

    await expect(
      cleanAuditArtifacts(root, { all: true, force: true })
    ).rejects.toThrow(/Refusing to remove ledger\.json: cannot validate its contents/);

    expect(await exists(path.join(root, ".audit-kit", "ledger.json"))).toBe(true);

    const dryRun = await cleanAuditArtifacts(root, { all: true });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.warning).toMatch(/cannot validate its contents/);

    const result = await cleanAuditArtifacts(root, { all: true, force: true, includeLedger: true });
    expect(result.dryRun).toBe(false);
    expect(await exists(path.join(root, ".audit-kit"))).toBe(false);
  });

  it("force --all refuses when ledger.json fails schema validation unless --include-ledger is passed", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);
    await writeFile(
      path.join(root, ".audit-kit", "ledger.json"),
      JSON.stringify({ findings: [{ id: "AUTH-001" }] }, null, 2),
      "utf8"
    );

    await expect(
      cleanAuditArtifacts(root, { all: true, force: true })
    ).rejects.toThrow(/Refusing to remove ledger\.json: cannot validate its contents/);

    expect(await exists(path.join(root, ".audit-kit", "ledger.json"))).toBe(true);
  });

  it("default clean preserves ledger and config without --all", async () => {
    const root = await makeTempDir("audit-kit-clean-");
    await initProject(root);
    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "test",
      evidence: "e",
      fix: "f"
    });

    const result = await cleanAuditArtifacts(root, { force: true });

    expect(result.dryRun).toBe(false);
    expect(await exists(path.join(root, ".audit-kit", "ledger.json"))).toBe(true);
    const ledger = JSON.parse(await readFile(path.join(root, ".audit-kit", "ledger.json"), "utf8")) as {
      findings: Array<{ id: string }>;
    };
    expect(ledger.findings.length).toBe(1);
  });
});

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createMap } from "../src/lib/map.js";
import { createNextPrompt } from "../src/lib/next.js";
import { exportLedger, readLedger } from "../src/lib/ledger.js";
import { createReport } from "../src/lib/report.js";
import { makeTempDir } from "./helpers.js";

async function writeScanJson(root: string, content: string): Promise<void> {
  await writeFile(path.join(root, ".audit-kit", "latest-scan.json"), content, "utf8");
}

async function writeLedgerJson(root: string, content: string): Promise<void> {
  await writeFile(path.join(root, ".audit-kit", "ledger.json"), content, "utf8");
}

describe("json artifact validation", () => {
  it("next fails clearly when latest-scan.json is corrupt JSON", async () => {
    const root = await makeTempDir("audit-kit-jsonval-");
    await initProject(root);
    await writeScanJson(root, "{not json");

    await expect(createNextPrompt(root, "auth")).rejects.toThrow(/Invalid latest-scan\.json/);
    await expect(createNextPrompt(root, "auth")).rejects.toThrow(/Run audit-kit scan --json again/);
  });

  it("map fails clearly when latest-scan.json has the wrong shape", async () => {
    const root = await makeTempDir("audit-kit-jsonval-");
    await initProject(root);
    await writeScanJson(
      root,
      JSON.stringify({
        files: "not-an-array",
        metadataHits: [],
        tree: "",
        cloc: "",
        hotFiles: "",
        grepSignals: [],
        generatedAt: ""
      })
    );

    await expect(createMap(root, { fromJson: true })).rejects.toThrow(/Invalid latest-scan\.json/);
    await expect(createMap(root, { fromJson: true })).rejects.toThrow(/files:/);
  });

  it("report fails clearly when ledger.json has a malformed entry", async () => {
    const root = await makeTempDir("audit-kit-jsonval-");
    await initProject(root);
    await writeLedgerJson(
      root,
      JSON.stringify({
        findings: [
          {
            id: "AUTH-001",
            surface: "auth",
            severity: "CATASTROPHIC",
            title: "bad",
            evidence: "e",
            fix: "f"
          }
        ]
      })
    );

    await expect(createReport(root)).rejects.toThrow(/Invalid ledger\.json/);
    await expect(createReport(root)).rejects.toThrow(/Fix or re-run audit-kit init/);
  });

  it("exportLedger fails clearly when ledger.json is malformed", async () => {
    const root = await makeTempDir("audit-kit-jsonval-");
    await initProject(root);
    await writeLedgerJson(root, "{not json");

    await expect(exportLedger(root, "json")).rejects.toThrow(/Invalid ledger\.json/);
    await expect(exportLedger(root, "md")).rejects.toThrow(/Invalid ledger\.json/);
  });

  it("backward-compatible: old ledger entries missing newer optional fields still load", async () => {
    const root = await makeTempDir("audit-kit-jsonval-");
    await initProject(root);
    await writeLedgerJson(
      root,
      JSON.stringify({
        findings: [
          {
            id: "AUTH-001",
            surface: "auth",
            severity: "P1",
            title: "Pre-existing entry",
            evidence: "e",
            fix: "f"
          }
        ]
      })
    );

    const ledger = await readLedger(root);
    expect(ledger.findings).toHaveLength(1);
    const finding = ledger.findings[0]!;
    expect(finding.id).toBe("AUTH-001");
    expect(finding.severity).toBe("P1");
    expect(finding.confidence).toBe("medium");
    expect(finding.status).toBe("open");
    expect(finding.file).toBe("");
    expect(finding.filesInspected).toEqual([]);
    expect(finding.impact).toBeUndefined();
    expect(finding.nextFile).toBeUndefined();
  });
});

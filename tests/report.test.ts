import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { addFinding } from "../src/lib/ledger.js";
import { createReport } from "../src/lib/report.js";
import { writeText } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

describe("report", () => {
  it("creates a valid empty report", async () => {
    const root = await makeTempDir("audit-kit-report-");
    await initProject(root);

    const out = await createReport(root);
    const content = await readFile(out, "utf8");

    expect(content).toContain("## Executive Summary");
    expect(content).toContain("No confirmed findings yet.");
    expect(content).toContain("## Findings");
  });

  it("sorts findings by severity and confidence in report output", async () => {
    const root = await makeTempDir("audit-kit-report-");
    await initProject(root);
    await writeText(path.join(root, ".audit-kit", "repo-map.md"), "# Repo Map\n\n- Scope item");

    await addFinding(root, {
      surface: "auth",
      severity: "P2",
      title: "Lower severity issue",
      file: "src/a.ts",
      evidence: "Evidence A",
      fix: "Fix A",
      confidence: "low"
    });
    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "Higher confidence issue",
      file: "src/b.ts",
      evidence: "Evidence B",
      fix: "Fix B",
      confidence: "high"
    });
    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "Lower confidence same severity",
      file: "src/c.ts",
      evidence: "Evidence C",
      fix: "Fix C",
      confidence: "medium"
    });

    const out = await createReport(root);
    const content = await readFile(out, "utf8");
    const first = content.indexOf("AUTH-002 Higher confidence issue");
    const second = content.indexOf("AUTH-003 Lower confidence same severity");
    const third = content.indexOf("AUTH-001 Lower severity issue");

    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(content).toContain("## Recommended Fix Order");
  });
});

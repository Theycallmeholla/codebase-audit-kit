import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { addFinding } from "../src/lib/ledger.js";
import { inspectFiles } from "../src/lib/inspect.js";
import { createReport } from "../src/lib/report.js";
import { ensureDir, writeText } from "../src/lib/fs.js";
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

  it("appends inspected files from inspections directory and ledger, deduplicated", async () => {
    const root = await makeTempDir("audit-kit-report-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "alpha.ts"), "export const alpha = 1;\n", "utf8");
    await writeFile(path.join(root, "src", "beta.ts"), "export const beta = 2;\n", "utf8");

    await inspectFiles(root, ["src/alpha.ts", "src/beta.ts:1-1"]);

    await addFinding(root, {
      surface: "auth",
      severity: "P2",
      title: "Ledger-only inspected file",
      file: "src/gamma.ts",
      evidence: "Evidence",
      fix: "Fix",
      filesInspected: ["src/alpha.ts", "src/gamma.ts"]
    });

    const out = await createReport(root);
    const content = await readFile(out, "utf8");
    const appendix = content.split("## Appendix: Files Inspected")[1] ?? "";

    expect(appendix).toContain("- src/alpha.ts");
    expect(appendix).toContain("- src/beta.ts:1-1");
    expect(appendix).toContain("- src/gamma.ts");
    expect(appendix.match(/- src\/alpha\.ts/g)?.length ?? 0).toBe(1);
  });

  it("strips scan dump and grep signals from the report Scope", async () => {
    const root = await makeTempDir("audit-kit-report-");
    await initProject(root);

    const repoMap = [
      "# Repo Map",
      "",
      "## Stack",
      "",
      "- Language: TypeScript",
      "- Framework: Next.js",
      "",
      "## Entry Points",
      "",
      "- API routes: app/api/*",
      "",
      "## Risk Surfaces",
      "",
      "1. Auth / permissions:",
      "",
      "## Hot Files",
      "",
      "| File | Reason | Surface |",
      "|---|---|---|",
      "| src/lib/scan.ts | churn | auth |",
      "",
      "## Files Earned For Inspection",
      "",
      "| File | Why it earned inspection | Question to answer |",
      "|---|---|---|",
      "| lib/auth.ts | next-auth config | session trust |",
      "",
      "## Notes From Latest Scan",
      "",
      "```",
      "Generated: 2026-04-27",
      "Grep signals:",
      "- auth: ./lib/auth.ts:1:import { getServerSession }",
      "- secrets: ./lib/auth.ts:33: name: '__Secure-next-auth.session-token'",
      "- env-vars: ./lib/auth.ts:6: process.env.VERCEL_URL",
      "```"
    ].join("\n");

    await writeText(path.join(root, ".audit-kit", "repo-map.md"), repoMap);

    const out = await createReport(root);
    const content = await readFile(out, "utf8");
    const scope = content.split("## Scope")[1]?.split("## Severity Breakdown")[0] ?? "";

    expect(scope).toContain("## Stack");
    expect(scope).toContain("## Entry Points");
    expect(scope).toContain("## Risk Surfaces");
    expect(scope).toContain("## Files Earned For Inspection");
    expect(scope).toContain("- Language: TypeScript");
    expect(scope).not.toContain("Notes From Latest Scan");
    expect(scope).not.toContain("Grep signals");
    expect(scope).not.toContain("getServerSession");
    expect(scope).not.toContain("__Secure-next-auth.session-token");
    expect(scope).not.toContain("Hot Files");
  });

  it("keeps Scope short when repo-map is the empty skeleton", async () => {
    const root = await makeTempDir("audit-kit-report-");
    await initProject(root);
    await writeText(path.join(root, ".audit-kit", "repo-map.md"), "# Repo Map\n\nThis file is intentionally compact.\n");

    const out = await createReport(root);
    const content = await readFile(out, "utf8");
    const scope = content.split("## Scope")[1]?.split("## Severity Breakdown")[0] ?? "";

    expect(scope.split("\n").length).toBeLessThan(20);
    expect(scope).not.toContain("Grep signals");
  });
});

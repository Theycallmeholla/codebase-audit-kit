import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { addFinding, compactLedger, exportLedger, listFindings, readLedger } from "../src/lib/ledger.js";
import { makeTempDir } from "./helpers.js";

describe("ledger", () => {
  it("adds a finding and renders list and compact views", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);

    await addFinding(root, {
      surface: "payments",
      severity: "P1",
      title: "Webhook handler is not idempotent",
      file: "src/api/stripe/webhook.ts",
      evidence: "No event.id persistence before side effects",
      fix: "Store event.id with unique constraint before processing",
      confidence: "high",
      impact: "Duplicate side effects possible",
      nextFile: "src/jobs/reconcile-payments.ts",
      openQuestion: "Is idempotency handled upstream?",
      filesInspected: ["src/api/stripe/webhook.ts", "src/jobs/reconcile-payments.ts"]
    });

    const listed = await listFindings(root);
    const compact = await compactLedger(root);
    const ledger = await readLedger(root);

    expect(listed).toContain("PAYMENTS-001");
    expect(listed).toContain("Webhook handler is not idempotent");
    expect(compact).toContain("Minimal fix: Store event.id with unique constraint before processing");
    expect(compact).toContain("Confidence: high");
    expect(compact).toContain("Impact: Duplicate side effects possible");
    expect(ledger.findings[0]?.nextFile).toBe("src/jobs/reconcile-payments.ts");
    expect(ledger.findings[0]?.filesInspected).toEqual(["src/api/stripe/webhook.ts", "src/jobs/reconcile-payments.ts"]);
  });

  it("exports ledger as JSON and markdown without mutating the ledger", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);

    await addFinding(root, {
      surface: "auth",
      severity: "P1",
      title: "Missing role check",
      file: "src/auth.ts",
      evidence: "Admin action only checks session",
      fix: "Require admin role before action",
      confidence: "high"
    });

    const before = await readFile(path.join(root, ".audit-kit", "ledger.json"), "utf8");
    const asJson = await exportLedger(root, "json");
    const asMd = await exportLedger(root, "md");
    const after = await readFile(path.join(root, ".audit-kit", "ledger.json"), "utf8");

    expect(JSON.parse(asJson).findings).toHaveLength(1);
    expect(asMd).toContain("| ID | Severity | Surface | Status | Title | File | Confidence |");
    expect(asMd).toContain("Missing role check");
    expect(after).toBe(before);
  });
});

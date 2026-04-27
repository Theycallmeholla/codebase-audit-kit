import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { addFinding, compactLedger, listFindings } from "../src/lib/ledger.js";
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
      confidence: "high"
    });

    const listed = await listFindings(root);
    const compact = await compactLedger(root);

    expect(listed).toContain("PAYMENTS-001");
    expect(listed).toContain("Webhook handler is not idempotent");
    expect(compact).toContain("Minimal fix: Store event.id with unique constraint before processing");
    expect(compact).toContain("Confidence: high");
  });
});

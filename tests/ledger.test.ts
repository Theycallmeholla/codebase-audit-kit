import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { addFinding, compactLedger, listFindings } from "../src/lib/ledger.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "audit-kit-ledger-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ledger", () => {
  it("adds a finding and renders list and compact views", async () => {
    const root = await makeTempDir();
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

import { readFile, writeFile } from "node:fs/promises";
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

  it("rejects an invalid severity and leaves the ledger unchanged", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);
    const ledgerPath = path.join(root, ".audit-kit", "ledger.json");
    const before = await readFile(ledgerPath, "utf8");

    await expect(
      addFinding(root, {
        surface: "auth",
        severity: "NOTAVALIDSEV" as never,
        title: "x",
        evidence: "x",
        fix: "x"
      })
    ).rejects.toThrow(/severity/);

    expect(await readFile(ledgerPath, "utf8")).toBe(before);
  });

  it("rejects an invalid confidence and leaves the ledger unchanged", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);
    const ledgerPath = path.join(root, ".audit-kit", "ledger.json");
    const before = await readFile(ledgerPath, "utf8");

    await expect(
      addFinding(root, {
        surface: "auth",
        severity: "P1",
        title: "x",
        evidence: "x",
        fix: "x",
        confidence: "wishful" as never
      })
    ).rejects.toThrow(/confidence/);

    expect(await readFile(ledgerPath, "utf8")).toBe(before);
  });

  it("rejects an unknown surface and leaves the ledger unchanged", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);
    const ledgerPath = path.join(root, ".audit-kit", "ledger.json");
    const before = await readFile(ledgerPath, "utf8");

    await expect(
      addFinding(root, {
        surface: "made-up-surface",
        severity: "P1",
        title: "x",
        evidence: "x",
        fix: "x"
      })
    ).rejects.toThrow(/surface/);

    expect(await readFile(ledgerPath, "utf8")).toBe(before);
  });

  it("assigns next ID per surface from max existing, not array length", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);

    for (const title of ["one", "two", "three"]) {
      await addFinding(root, {
        surface: "auth",
        severity: "P2",
        title,
        evidence: "e",
        fix: "f"
      });
    }

    const ledgerPath = path.join(root, ".audit-kit", "ledger.json");
    const before = JSON.parse(await readFile(ledgerPath, "utf8")) as { findings: Array<{ id: string }> };
    expect(before.findings.map((f) => f.id)).toEqual(["AUTH-001", "AUTH-002", "AUTH-003"]);

    const trimmed = { findings: before.findings.filter((f) => f.id !== "AUTH-002") };
    await writeFile(ledgerPath, JSON.stringify(trimmed, null, 2), "utf8");

    await addFinding(root, {
      surface: "auth",
      severity: "P2",
      title: "after delete",
      evidence: "e",
      fix: "f"
    });

    const after = await readLedger(root);
    const ids = after.findings.map((f) => f.id);
    expect(ids).toContain("AUTH-004");
    expect(ids).not.toContain("AUTH-002");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("numbers findings independently per surface", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);

    await addFinding(root, { surface: "auth", severity: "P1", title: "a", evidence: "e", fix: "f" });
    await addFinding(root, { surface: "payments", severity: "P1", title: "p", evidence: "e", fix: "f" });
    await addFinding(root, { surface: "auth", severity: "P1", title: "a2", evidence: "e", fix: "f" });

    const ledger = await readLedger(root);
    const ids = ledger.findings.map((f) => f.id);
    expect(ids).toEqual(["AUTH-001", "PAYMENTS-001", "AUTH-002"]);
  });

  it("accepts a valid finding with optional fields omitted", async () => {
    const root = await makeTempDir("audit-kit-ledger-");
    await initProject(root);

    await addFinding(root, {
      surface: "auth",
      severity: "P2",
      title: "Optional fields omitted",
      evidence: "evidence",
      fix: "fix"
    });

    const ledger = await readLedger(root);
    expect(ledger.findings).toHaveLength(1);
    expect(ledger.findings[0]?.severity).toBe("P2");
    expect(ledger.findings[0]?.confidence).toBe("medium");
    expect(ledger.findings[0]?.file).toBe("");
    expect(ledger.findings[0]?.filesInspected).toEqual([]);
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

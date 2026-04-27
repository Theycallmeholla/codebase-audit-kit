import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createMap } from "../src/lib/map.js";
import { createNextPrompt } from "../src/lib/next.js";
import { scanProject } from "../src/lib/scan.js";
import { ensureDir } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

describe("createNextPrompt", () => {
  it("creates a next-step prompt for a valid surface", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "auth.ts"), "export const requireAuth = () => 'auth';\n", "utf8");

    await scanProject(root, 50, { json: true });
    await createMap(root, { fromJson: true });
    const output = await createNextPrompt(root, "auth");
    const content = await readFile(output, "utf8");

    expect(output).toMatch(/next-auth-.*\.md$/);
    expect(content).toContain("## Top Grep Commands");
    expect(content).toContain("## Claude Mini Prompt");
  });

  it("ranks different surfaces differently when scan signals differ", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "auth-only.ts"),
      "export function requireAuth() { return 'session role permission'; }\n",
      "utf8"
    );
    await writeFile(
      path.join(root, "src", "payments-only.ts"),
      "export function chargeStripe() { return 'stripe checkout subscription'; }\n",
      "utf8"
    );

    await scanProject(root, 50, { json: true });
    await createMap(root, { fromJson: true });
    const authOut = await createNextPrompt(root, "auth");
    const paymentsOut = await createNextPrompt(root, "payments");
    const authContent = await readFile(authOut, "utf8");
    const paymentsContent = await readFile(paymentsOut, "utf8");

    const authTop = authContent.split("## Top 5 Candidate Files")[1]?.split("## Claude")[0] ?? "";
    const paymentsTop = paymentsContent.split("## Top 5 Candidate Files")[1]?.split("## Claude")[0] ?? "";

    expect(authTop).toContain("src/auth-only.ts");
    expect(paymentsTop).toContain("src/payments-only.ts");
    expect(authTop).not.toContain("src/payments-only.ts");
    expect(paymentsTop).not.toContain("src/auth-only.ts");
  });

  it("excludes lockfiles and down-ranks documentation files", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "auth.ts"),
      "export function requireAuth() { return 'session role permission jwt cookie'; }\n",
      "utf8"
    );
    await writeFile(
      path.join(root, "README.md"),
      "Auth notes: session role permission jwt cookie admin.\n",
      "utf8"
    );
    await writeFile(
      path.join(root, "package-lock.json"),
      JSON.stringify({ name: "auth-token-fake", lockfileVersion: 3 }),
      "utf8"
    );

    await scanProject(root, 50, { json: true });
    await createMap(root, { fromJson: true });
    const output = await createNextPrompt(root, "auth");
    const content = await readFile(output, "utf8");
    const top = content.split("## Top 5 Candidate Files")[1]?.split("## Claude")[0] ?? "";

    expect(top).toContain("src/auth.ts");
    expect(top).not.toContain("package-lock.json");

    const firstFile = top.match(/-\s+([^\n]+)/)?.[1] ?? "";
    expect(firstFile.trim()).toBe("src/auth.ts");
  });
});

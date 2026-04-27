import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/lib/init.js";
import { createMap } from "../src/lib/map.js";
import { createNextPrompt } from "../src/lib/next.js";
import { scanProject } from "../src/lib/scan.js";
import { ensureDir } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

function candidateBlock(content: string): string {
  return content.split("## Top 5 Candidate Files")[1]?.split("## Claude")[0] ?? "";
}

async function createNextFor(root: string, surface: string): Promise<string> {
  await scanProject(root, 100, { json: true });
  await createMap(root, { fromJson: true });
  const output = await createNextPrompt(root, surface);
  return readFile(output, "utf8");
}

describe("createNextPrompt", () => {
  it("creates a next-step prompt for a valid surface", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "auth.ts"), "export const requireAuth = () => 'auth';\n", "utf8");

    const content = await createNextFor(root, "auth");

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

    const authTop = candidateBlock(await createNextFor(root, "auth"));
    const paymentsTop = candidateBlock(await createNextFor(root, "payments"));

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
    await writeFile(path.join(root, "README.md"), "Auth notes: session role permission jwt cookie admin.\n", "utf8");
    await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ name: "auth-token-fake", lockfileVersion: 3 }), "utf8");

    const top = candidateBlock(await createNextFor(root, "auth"));

    expect(top).toContain("src/auth.ts");
    expect(top).not.toContain("package-lock.json");

    const firstFile = top.match(/-\s+([^\n]+)/)?.[1] ?? "";
    expect(firstFile.trim()).toBe("src/auth.ts");
  });

  it("excludes secrets files from candidates even when they match surface terms", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await ensureDir(path.join(root, "secrets"));
    await writeFile(path.join(root, ".env"), "AUTH_SECRET=session role permission\n", "utf8");
    await writeFile(path.join(root, ".env.local"), "NEXT_PUBLIC_AUTH=session\n", "utf8");
    await writeFile(path.join(root, "secrets", "prod.key"), "jwt cookie admin\n", "utf8");
    await writeFile(path.join(root, "src", "auth.ts"), "export const auth = 'session role permission';\n", "utf8");

    const top = candidateBlock(await createNextFor(root, "auth"));

    expect(top).toContain("src/auth.ts");
    expect(top).not.toContain(".env");
    expect(top).not.toContain(".env.local");
    expect(top).not.toContain("secrets/prod.key");
  });

  it("does not give metadata files surface-grep boost", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { "next-auth": "latest", "js-cookie": "latest" } }),
      "utf8"
    );
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }), "utf8");
    await writeFile(path.join(root, "src", "auth.ts"), "export const auth = 'session role permission jwt cookie';\n", "utf8");

    const top = candidateBlock(await createNextFor(root, "auth"));

    expect(top).toContain("src/auth.ts");
    expect(top).not.toContain("package.json\n  Reason: Matched auth surface grep terms.");
    expect(top).not.toContain("package.json\n  Reason: Matched auth grep signal from latest scan.");
  });

  it("boosts Next.js middleware for auth", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await writeFile(path.join(root, "next.config.js"), "module.exports = {};\n", "utf8");
    await writeFile(path.join(root, "middleware.ts"), "export function middleware() {}\n", "utf8");

    const top = candidateBlock(await createNextFor(root, "auth"));

    expect(top).toContain("middleware.ts");
    expect(top).toContain("Next.js auth/cache boundary: middleware.");
  });

  it("boosts Next.js API routes for external and errors", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "app", "api", "foo"));
    await writeFile(path.join(root, "next.config.js"), "module.exports = {};\n", "utf8");
    await writeFile(path.join(root, "app", "api", "foo", "route.ts"), "export async function GET() { return Response.json({ ok: true }); }\n", "utf8");

    const externalTop = candidateBlock(await createNextFor(root, "external"));
    const errorsTop = candidateBlock(await createNextFor(root, "errors"));

    expect(externalTop).toContain("app/api/foo/route.ts");
    expect(errorsTop).toContain("app/api/foo/route.ts");
    expect(externalTop).toContain("Next.js API route boundary.");
    expect(errorsTop).toContain("Next.js API route boundary.");
  });

  it("ranks Next.js API routes for auth even with no auth keywords in the file", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "app", "api", "upload"));
    await writeFile(path.join(root, "next.config.js"), "module.exports = {};\n", "utf8");
    await writeFile(
      path.join(root, "app", "api", "upload", "route.ts"),
      "import { put } from '@vercel/blob';\nexport async function POST(req) { return Response.json(await put('x', req.body, { access: 'public' })); }\n",
      "utf8"
    );

    const top = candidateBlock(await createNextFor(root, "auth"));

    expect(top).toContain("app/api/upload/route.ts");
    expect(top).toContain("Next.js API route auth boundary.");
  });

  it("boosts Next.js pages and forms for ux", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "app", "dashboard"));
    await ensureDir(path.join(root, "components", "form"));
    await writeFile(path.join(root, "next.config.js"), "module.exports = {};\n", "utf8");
    await writeFile(path.join(root, "app", "dashboard", "page.tsx"), "export default function Page() { return null; }\n", "utf8");
    await writeFile(path.join(root, "components", "form", "index.tsx"), "export function Form() { return null; }\n", "utf8");

    const top = candidateBlock(await createNextFor(root, "ux"));

    expect(top).toContain("app/dashboard/page.tsx");
    expect(top).toContain("components/form/index.tsx");
    expect(top).toContain("Next.js UX page component.");
    expect(top).toContain("Next.js form component boundary.");
  });

  it("keeps non-Next repo behavior working", async () => {
    const root = await makeTempDir("audit-kit-next-");
    await initProject(root);
    await ensureDir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "api.ts"), "export async function callApi() { return fetch('/api'); }\n", "utf8");

    const top = candidateBlock(await createNextFor(root, "external"));

    expect(top).toContain("src/api.ts");
    expect(top).not.toContain("Next.js");
  });
});

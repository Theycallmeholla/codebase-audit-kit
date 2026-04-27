import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDir } from "../src/lib/fs.js";
import { makeTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("CLI smoke target", () => {
  it("writes all artifacts under the target repo and keeps grep signals clean", async () => {
    const target = await makeTempDir("audit-kit-smoke-");
    await ensureDir(path.join(target, "src"));
    await writeFile(
      path.join(target, "package.json"),
      JSON.stringify({ name: "smoke-target", version: "0.0.1", type: "module" }, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(target, "package-lock.json"),
      JSON.stringify({ name: "token-from-lockfile", lockfileVersion: 3 }, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(target, "src", "index.ts"),
      'export function authHandler() {\n  const token = process.env.AUTH_TOKEN;\n  console.log(token);\n  return "auth";\n}\n',
      "utf8"
    );
    await writeFile(path.join(target, "src", "routes.ts"), 'export const routes = ["/auth/login", "/admin"];\n', "utf8");

    const cwd = process.cwd();
    await execFileAsync("node", ["dist/index.js", "init", "-p", target], { cwd });
    await execFileAsync("node", ["dist/index.js", "scan", "-p", target, "--json"], { cwd });
    await execFileAsync("node", ["dist/index.js", "map", "-p", target, "--from-json"], { cwd });
    await execFileAsync("node", ["dist/index.js", "next", "-p", target, "auth"], { cwd });
    const inspect = await execFileAsync("node", ["dist/index.js", "inspect", "-p", target, "src/index.ts"], { cwd });

    const scanJson = JSON.parse(await readFile(path.join(target, ".audit-kit", "latest-scan.json"), "utf8")) as {
      grepSignals: Array<{ name: string; output: string }>;
    };
    const nextFiles = await readdir(path.join(target, ".audit-kit", "prompts"));
    const inspectionFiles = await readdir(path.join(target, ".audit-kit", "inspections"));
    const nextPromptPath = path.join(target, ".audit-kit", "prompts", nextFiles.find((file) => file.startsWith("next-auth-")) ?? "");
    const nextPrompt = await readFile(nextPromptPath, "utf8");
    const secretsSignal = scanJson.grepSignals.find((signal) => signal.name === "secrets");

    expect(secretsSignal?.output).toContain("src/index.ts");
    expect(secretsSignal?.output).not.toContain("package-lock.json");
    expect(inspect.stdout).toContain("## src/index.ts");
    expect(inspect.stdout).not.toContain(target);
    expect(nextPrompt).toContain("src/index.ts");
    expect(nextPrompt).not.toContain("[no output]");
    expect(inspectionFiles.some((file) => file.startsWith("inspection-"))).toBe(true);
  });
});

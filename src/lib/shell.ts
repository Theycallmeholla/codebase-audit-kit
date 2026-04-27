import { spawn } from "node:child_process";

export type ShellResult = {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
};

export async function run(command: string, args: string[], cwd: string): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      resolve({
        command: [command, ...args].join(" "),
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on("error", (error) => {
      resolve({
        command: [command, ...args].join(" "),
        code: 1,
        stdout: "",
        stderr: error.message
      });
    });
  });
}

export async function optional(command: string, args: string[], cwd: string): Promise<string> {
  const result = await run(command, args, cwd);
  if (result.code !== 0) {
    return `[unavailable] ${result.command}\n${result.stderr}`;
  }
  return result.stdout || "[no output]";
}

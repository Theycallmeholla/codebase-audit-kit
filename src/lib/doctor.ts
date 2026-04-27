import pc from "picocolors";
import { run } from "./shell.js";

type ToolCheck = {
  name: string;
  required: boolean;
  installHint?: string;
};

type ToolStatus = ToolCheck & {
  available: boolean;
  location: string;
};

export type DoctorResult = {
  ok: boolean;
  output: string;
  json: {
    ok: boolean;
    requiredTools: ToolStatus[];
    optionalTools: ToolStatus[];
    missingRequired: string[];
    missingOptional: string[];
  };
};

const toolChecks: ToolCheck[] = [
  { name: "git", required: true },
  { name: "rg", required: true },
  { name: "tree", required: false, installHint: "Install with `brew install tree`." },
  { name: "cloc", required: false, installHint: "Install with `brew install cloc`." }
];

async function checkTool(cwd: string, tool: ToolCheck): Promise<ToolStatus> {
  const result = await run("sh", ["-c", `command -v ${tool.name}`], cwd);
  return {
    ...tool,
    available: result.code === 0,
    location: result.stdout || "not found"
  };
}

export async function runDoctor(root: string): Promise<DoctorResult> {
  const statuses = await Promise.all(toolChecks.map((tool) => checkTool(root, tool)));
  const missingRequired = statuses.filter((tool) => tool.required && !tool.available);
  const requiredLines = statuses
    .filter((tool) => tool.required)
    .map((tool) => `${tool.available ? pc.green("OK") : pc.red("MISSING")} ${tool.name}${tool.available ? ` (${tool.location})` : ""}`);
  const optionalLines = statuses
    .filter((tool) => !tool.required)
    .map((tool) => {
      if (tool.available) {
        return `${pc.green("OK")} ${tool.name} (${tool.location})`;
      }
      return `${pc.yellow("OPTIONAL")} ${tool.name} missing. ${tool.installHint ?? ""}`.trim();
    });

  const output = [
    "# Audit Kit Doctor",
    "",
    "## Required Tools",
    ...requiredLines,
    "",
    "## Optional Tools",
    ...optionalLines,
    "",
    missingRequired.length === 0
      ? pc.green("Doctor passed. Required tools are available.")
      : pc.red(`Doctor failed. Missing required tools: ${missingRequired.map((tool) => tool.name).join(", ")}`)
  ].join("\n");

  return {
    ok: missingRequired.length === 0,
    output,
    json: {
      ok: missingRequired.length === 0,
      requiredTools: statuses.filter((tool) => tool.required),
      optionalTools: statuses.filter((tool) => !tool.required),
      missingRequired: missingRequired.map((tool) => tool.name),
      missingOptional: statuses.filter((tool) => !tool.required && !tool.available).map((tool) => tool.name)
    }
  };
}

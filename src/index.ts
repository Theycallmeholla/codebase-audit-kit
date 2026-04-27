#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";
import { initProject } from "./lib/init.js";
import { scanProject } from "./lib/scan.js";
import { createMap } from "./lib/map.js";
import { createSurfacePrompt } from "./lib/surface.js";
import { addFinding, listFindings } from "./lib/ledger.js";
import { createClaudePrompt } from "./lib/prompt.js";

const program = new Command();

program
  .name("audit-kit")
  .description("Token-efficient codebase audit CLI: cheap signals -> map -> attack surfaces -> ledger -> Claude prompt")
  .version("0.1.0");

program
  .command("init")
  .description("Create .audit-kit config and folders")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    await initProject(opts.path);
    console.log(pc.green("Created .audit-kit/"));
  });

program
  .command("scan")
  .description("Collect cheap repo signals without reading full source files")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--max-files <n>", "max file paths to include", "250")
  .action(async (opts) => {
    const result = await scanProject(opts.path, Number(opts.maxFiles));
    console.log(result.summary);
  });

program
  .command("map")
  .description("Build a compact repo map from scan output")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    const out = await createMap(opts.path);
    console.log(pc.green(`Wrote ${out}`));
  });

program
  .command("surface")
  .description("Create a focused attack-surface audit prompt")
  .argument("<surface>", "auth | payments | db | external | uploads | admin | jobs | cache | errors | tests | ux")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (surface, opts) => {
    const out = await createSurfacePrompt(opts.path, surface);
    console.log(pc.green(`Wrote ${out}`));
  });

program
  .command("prompt")
  .description("Create the next Claude-ready prompt using map + ledger + selected surface")
  .argument("<surface>", "surface name")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (surface, opts) => {
    const out = await createClaudePrompt(opts.path, surface);
    console.log(pc.green(`Wrote ${out}`));
  });

program
  .command("ledger:list")
  .description("List audit findings")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    console.log(await listFindings(opts.path));
  });

program
  .command("ledger:add")
  .description("Add a finding to the audit ledger")
  .requiredOption("--surface <surface>", "surface")
  .requiredOption("--severity <severity>", "P0 | P1 | P2 | P3")
  .requiredOption("--title <title>", "finding title")
  .requiredOption("--evidence <evidence>", "exact evidence")
  .requiredOption("--fix <fix>", "minimal fix")
  .option("--confidence <confidence>", "high | medium | low", "medium")
  .option("--file <file>", "file path", "")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    await addFinding(opts.path, opts);
    console.log(pc.green("Finding added."));
  });

program.parseAsync();

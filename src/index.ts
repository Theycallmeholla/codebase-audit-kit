#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import { cleanAuditArtifacts } from "./lib/clean.js";
import { runDoctor } from "./lib/doctor.js";
import { initProject } from "./lib/init.js";
import { inspectFiles } from "./lib/inspect.js";
import { scanProject } from "./lib/scan.js";
import { createMap } from "./lib/map.js";
import { createNextPrompt } from "./lib/next.js";
import { createSurfacePrompt, listSurfaces } from "./lib/surface.js";
import { addFinding, exportLedger, listFindings } from "./lib/ledger.js";
import { createClaudePrompt } from "./lib/prompt.js";
import { createReport } from "./lib/report.js";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string; version: string };
const program = new Command();
const packageName = pkg.name;
const packageVersion = pkg.version;

program
  .name("audit-kit")
  .description("Token-efficient codebase audit CLI: cheap signals -> map -> attack surfaces -> ledger -> Claude prompt")
  .version(packageVersion);

program
  .command("version")
  .description("Print audit-kit and runtime version info")
  .action(() => {
    console.log(`${packageName} ${packageVersion}`);
    console.log(`node ${process.version}`);
  });

program
  .command("init")
  .description("Create .audit-kit config and folders")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    await initProject(opts.path);
    console.log(pc.green("Created .audit-kit/"));
  });

program
  .command("doctor")
  .description("Check required and optional local audit tools")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--json", "print machine-readable output")
  .action(async (opts) => {
    const result = await runDoctor(opts.path);
    console.log(opts.json ? JSON.stringify(result.json, null, 2) : result.output);
    if (!result.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("clean")
  .description("Remove generated audit artifacts")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--all", "remove the entire .audit-kit directory")
  .option("--force", "perform the removal")
  .action(async (opts) => {
    const result = await cleanAuditArtifacts(opts.path, { all: Boolean(opts.all), force: Boolean(opts.force) });
    if (result.dryRun) {
      console.log("Would remove:");
      console.log(result.removed.join("\n"));
      return;
    }

    if (result.removed.length === 0) {
      console.log("Nothing removed.");
      return;
    }

    console.log("Removed:");
    console.log(result.removed.join("\n"));
  });

program
  .command("scan")
  .description("Collect cheap repo signals without reading full source files")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--max-files <n>", "max file paths to include", "250")
  .option("--json", "also write .audit-kit/latest-scan.json")
  .action(async (opts) => {
    const result = await scanProject(opts.path, Number(opts.maxFiles), { json: Boolean(opts.json) });
    console.log(result.summary);
  });

program
  .command("map")
  .description("Build a compact repo map from scan output")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--from-json", "prefer .audit-kit/latest-scan.json when available")
  .action(async (opts) => {
    const out = await createMap(opts.path, { fromJson: Boolean(opts.fromJson) });
    console.log(pc.green(`Wrote ${out}`));
  });

program
  .command("surface:list")
  .description("List supported audit surfaces")
  .action(() => {
    console.log(listSurfaces());
  });

program
  .command("next")
  .description("Recommend the next cheap commands and earned files for a surface")
  .argument("<surface>", "surface name")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (surface, opts) => {
    const out = await createNextPrompt(opts.path, surface);
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
  .command("inspect")
  .description("Read earned source files under repo and ignore boundaries")
  .argument("<file...>", "one or more repo-relative file paths")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--max-bytes <n>", "max bytes per file", "12000")
  .action(async (files, opts) => {
    const output = await inspectFiles(opts.path, files, Number(opts.maxBytes));
    console.log(output);
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
  .command("report")
  .description("Build a markdown audit report from the ledger")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    const out = await createReport(opts.path);
    console.log(out);
  });

program
  .command("ledger:list")
  .description("List audit findings")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    console.log(await listFindings(opts.path));
  });

program
  .command("ledger:export")
  .description("Export the audit ledger as markdown or JSON")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .option("--format <format>", "md | json", "md")
  .action(async (opts) => {
    console.log(await exportLedger(opts.path, opts.format === "json" ? "json" : "md"));
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
  .option("--impact <impact>", "customer or business impact")
  .option("--next-file <nextFile>", "next file to inspect")
  .option("--open-question <openQuestion>", "open question to resolve")
  .option("--files-inspected <paths...>", "files inspected before confirming this finding")
  .option("--file <file>", "file path", "")
  .option("-p, --path <path>", "target repo path", process.cwd())
  .action(async (opts) => {
    await addFinding(opts.path, {
      surface: opts.surface,
      severity: opts.severity,
      title: opts.title,
      file: opts.file,
      evidence: opts.evidence,
      fix: opts.fix,
      confidence: opts.confidence,
      impact: opts.impact,
      nextFile: opts.nextFile,
      openQuestion: opts.openQuestion,
      filesInspected: opts.filesInspected
    });
    console.log(pc.green("Finding added."));
  });

program.parseAsync().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(message));
  process.exit(1);
});

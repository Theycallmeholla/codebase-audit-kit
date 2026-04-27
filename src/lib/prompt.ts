import path from "node:path";
import { auditDir, exists, readText, writeText } from "./fs.js";
import { compactLedger } from "./ledger.js";

export async function createClaudePrompt(root: string, surface: string): Promise<string> {
  const mapPath = path.join(auditDir(root), "repo-map.md");
  const surfacePath = path.join(auditDir(root), "surfaces", `${surface}.md`);

  const map = (await exists(mapPath)) ? await readText(mapPath) : "[missing repo map]";
  const surfacePrompt = (await exists(surfacePath)) ? await readText(surfacePath) : `[missing surface prompt for ${surface}]`;
  const ledger = await compactLedger(root);

  const prompt = `You are auditing a codebase with a strict token budget.

Core rule:
Do not read code first. Use cheap evidence first. Open source files only after they earn inspection.

Current surface:
${surface}

Current audit ledger:
${ledger}

Repo map:
${map.slice(0, 9000)}

Surface instructions:
${surfacePrompt.slice(0, 9000)}

Your task:
1. Run cheap commands first: metadata, tree/find, rg, git churn, tests.
2. Pick the smallest set of files that can answer the surface question.
3. Explain why each file earned inspection.
4. Read only those files.
5. Return findings only if they have concrete evidence and business/user impact.

Required output:
- Findings table: severity, file, function/area, issue, evidence, impact, minimal fix, confidence, next file
- False positives / assumptions
- Next 3 files to inspect and why
- Single highest-leverage fix first

Severity filter:
- P0: security breach, data loss, fraud, revenue loss, order/payment failure
- P1: broken core user flow or high-confidence production bug
- P2: likely production bug with clear failure scenario
- P3: maintainability risk with concrete future cost

Ignore:
- style preferences
- naming
- formatting
- broad rewrites
- generic advice
`;

  const out = path.join(auditDir(root), "prompts", `claude-${surface}-${Date.now()}.md`);
  await writeText(out, prompt);
  return out;
}

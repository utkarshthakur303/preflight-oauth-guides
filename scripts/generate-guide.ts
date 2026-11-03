/**
 * CLI for the research pipeline.
 *
 *   pnpm guide shopify
 *   pnpm guide "Salesforce Service Cloud"
 *   pnpm guide linear.app --pages 8
 *
 * Writes src/data/guides/<slug>.json and streams the investigation to stdout,
 * so the pipeline can be exercised and judged without the web UI in the way.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runPipeline, type PipelineEvent } from "../src/lib/research/pipeline";
import { TIER_META } from "../src/lib/rubric";

// Load .env.local without taking a dependency on dotenv.
for (const file of [".env.local", ".env"]) {
  const p = resolve(file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const argv = process.argv.slice(2);
const pagesFlag = argv.indexOf("--pages");
const maxPages = pagesFlag !== -1 ? Number(argv[pagesFlag + 1]) : 6;
const seeded = argv.includes("--seeded");
const query = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  if (pagesFlag !== -1 && i === pagesFlag + 1) return false;
  return true;
}).join(" ");

if (!query) {
  console.error("usage: pnpm guide <app name or url> [--pages N] [--seeded]");
  process.exit(1);
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const onEvent = (e: PipelineEvent) => {
  switch (e.type) {
    case "stage":
      if (e.status === "running") console.log(`\n${bold("▸ " + e.label)}`);
      else console.log(`  ${green("✓")} ${e.detail ?? "done"}`);
      break;
    case "log":
      console.log(dim(`    ${e.message}`));
      break;
    case "source":
      console.log(
        e.verdict === "read"
          ? `    ${green("read")} ${e.url} ${dim(e.why ?? "")}`
          : `    ${yellow("skip")} ${e.url} ${dim(e.why ?? "")}`,
      );
      break;
    case "counts":
      console.log(
        dim(
          `    discovered ${e.discovered} → shortlisted ${e.shortlisted} → relevant ${e.triaged} → read ${e.read}`,
        ),
      );
      break;
    case "downgrade":
      console.log(`    ${red("downgrade")} ${e.about}: ${e.from} → ${e.to} (${e.why})`);
      break;
    case "usage":
      break;
    case "error":
      console.error(red(`    error: ${e.message}`));
      break;
  }
};

async function main() {
const guide = await runPipeline({
  appNameOrUrl: query,
  origin: seeded ? "seeded" : "live",
  maxPagesToRead: maxPages,
  emit: onEvent,
});

const outDir = resolve("src/data/guides");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `${guide.slug}.json`);
writeFileSync(outPath, JSON.stringify(guide, null, 2) + "\n");

const w = guide.rubric.reviewWaitBusinessDays.value;
const c = guide.rubric.costUsd.value;
const p = guide.rubric.prerequisiteArtifacts.value;
const h = guide.rubric.humanOnlyBlockers.value;

const totals = guide.generation.models.reduce(
  (a, m) => ({
    calls: a.calls + m.calls,
    input: a.input + m.inputTokens,
    output: a.output + m.outputTokens,
  }),
  { calls: 0, input: 0, output: 0 },
);

console.log(`
${bold(guide.appName)}  ${bold(TIER_META[guide.tier].label)}  ${dim("· " + guide.confidence + " confidence")}
${dim("─".repeat(60))}
  tier set by      ${guide.tierRationale.join("; ")}
  setup time       ${guide.rubric.selfServeMinutes.value ?? "unknown"} min ${dim("[" + guide.rubric.selfServeMinutes.evidence + "]")}
  review wait      ${w ? `${w.min}-${w.max} business days` : "unknown"} ${dim("[" + guide.rubric.reviewWaitBusinessDays.evidence + "]")}
  cost             ${c ? "$" + c.amount : "unknown"} ${dim("[" + guide.rubric.costUsd.evidence + "]")}
  prerequisites    ${p?.length ? p.join(", ") : p ? "none" : "unknown"} ${dim("[" + guide.rubric.prerequisiteArtifacts.evidence + "]")}
  human-only       ${h ? `${h.length} step(s)` : "unknown"} ${dim("[" + guide.rubric.humanOnlyBlockers.evidence + "]")}
  steps            ${guide.steps.length} (${guide.steps.filter((s) => s.actor === "agent").length} agent, ${guide.steps.filter((s) => s.actor === "human").length} human, ${guide.steps.filter((s) => s.actor === "either").length} either)
  nuances          ${guide.nuances.length}
  conflicts        ${guide.conflicts.length}
  open questions   ${guide.openQuestions.length}
  sources          ${guide.sources.length} verified citation(s)
${dim("─".repeat(60))}
  pages            ${guide.generation.docPagesDiscovered} discovered → ${guide.generation.docPagesRead} read
  model calls      ${totals.calls}
  tokens           ${totals.input.toLocaleString()} in / ${totals.output.toLocaleString()} out
  wall clock       ${(guide.generation.durationMs / 1000).toFixed(1)}s
${guide.generation.models.map((m) => dim(`    ${m.role.padEnd(11)} ${m.model.padEnd(20)} ${m.calls} calls  ${m.inputTokens.toLocaleString()} in / ${m.outputTokens.toLocaleString()} out`)).join("\n")}

written → ${outPath}
`);
}

main().catch((err) => {
  console.error(`\n${red("pipeline failed")}: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(dim(err.stack.split("\n").slice(1, 4).join("\n")));
  process.exit(1);
});

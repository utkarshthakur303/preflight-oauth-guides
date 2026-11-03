/**
 * Generates the seeded library.
 *
 * The eight apps below were chosen for spread across the difficulty range
 * rather than popularity, because a library where everything lands in the same
 * tier demonstrates nothing. Six come from the 262 toolkits Composio's own
 * directory lists as bring-your-own-OAuth-app; two have Composio-managed OAuth
 * and are included precisely because their docs still give real reasons to
 * register your own — branding, scopes, and the shared rate-limit quota.
 *
 * Runs sequentially. Groq's free tier allows 8,000 tokens per minute per model,
 * so running these in parallel would spend the whole run in backoff.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runPipeline, type PipelineEvent } from "../src/lib/research/pipeline";
import { TIER_META } from "../src/lib/rubric";

for (const file of [".env.local", ".env"]) {
  const p = resolve(file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SEEDS: { query: string; why: string }[] = [
  { query: "Shopify", why: "bring-your-own · app store review before distribution" },
  { query: "Salesforce Service Cloud", why: "bring-your-own · enterprise security review" },
  { query: "Xero", why: "bring-your-own · app partner certification" },
  { query: "DocuSign", why: "bring-your-own · go-live promotion process" },
  { query: "Workday", why: "bring-your-own · tenant-gated, no public self-serve" },
  { query: "PayPal", why: "bring-your-own · sandbox to live-credential promotion" },
  { query: "Webflow", why: "bring-your-own · marketplace listing is optional" },
  { query: "eBay", why: "bring-your-own · production keyset application" },
  { query: "GitHub", why: "Composio-managed · the instant baseline for comparison" },
  { query: "Slack", why: "Composio-managed · distribution review if you publish" },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const seeds = only.length
  ? SEEDS.filter((s) => only.some((o) => s.query.toLowerCase().includes(o.toLowerCase())))
  : SEEDS;

const outDir = resolve("src/data/guides");
mkdirSync(outDir, { recursive: true });

const quiet = (e: PipelineEvent) => {
  if (e.type === "stage" && e.status === "done") console.log(`      ${e.label}: ${e.detail ?? "ok"}`);
  if (e.type === "downgrade") console.log(`      ! downgraded ${e.about} (${e.why})`);
};

const results: string[] = [];

async function main() {
for (const [i, seed] of seeds.entries()) {
  console.log(`\n[${i + 1}/${seeds.length}] ${seed.query}  — ${seed.why}`);
  try {
    const guide = await runPipeline({
      appNameOrUrl: seed.query,
      origin: "seeded",
      maxPagesToRead: 7,
      emit: quiet,
    });
    writeFileSync(
      resolve(outDir, `${guide.slug}.json`),
      JSON.stringify(guide, null, 2) + "\n",
    );
    const w = guide.rubric.reviewWaitBusinessDays.value;
    results.push(
      `  ${guide.appName.padEnd(26)} ${TIER_META[guide.tier].label.padEnd(16)} ${guide.confidence.padEnd(7)} ` +
        `${guide.sources.length} cites  ${guide.generation.docPagesRead} pages  ` +
        `wait ${w ? `${w.min}-${w.max}d` : "unknown"}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`      FAILED: ${msg.slice(0, 300)}`);
    results.push(`  ${seed.query.padEnd(26)} FAILED  ${msg.slice(0, 80)}`);
  }
}

console.log(`\n${"=".repeat(78)}\nSEEDED LIBRARY\n${"=".repeat(78)}`);
for (const r of results) console.log(r);
console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

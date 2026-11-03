/**
 * Bundles src/data/guides/*.json into a single statically-importable index.
 *
 * The app reads guides through a plain `import`, not `fs`, so that the library
 * is part of the JavaScript bundle and works identically on a laptop and on
 * Vercel's serverless runtime — where reading arbitrary files out of `src/` at
 * request time is not something to rely on.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("src/data/guides");
const out = resolve("src/data/guides-index.json");

mkdirSync(dir, { recursive: true });

const guides = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")))
      .sort((a, b) => a.appName.localeCompare(b.appName))
  : [];

writeFileSync(out, JSON.stringify(guides, null, 2) + "\n");
console.log(`guides-index.json written — ${guides.length} guide(s)`);
for (const g of guides) {
  console.log(`  ${g.slug.padEnd(28)} ${g.tier.padEnd(12)} ${g.confidence.padEnd(7)} ${g.sources.length} cites`);
}

/**
 * Builds src/data/catalog.json from Composio's public "Managed OAuth apps" page.
 *
 * Why parse the committed markdown instead of calling the Composio API:
 * the page at /toolkits/managed-auth is the canonical, public split between
 * toolkits Composio provides an OAuth app for and toolkits where the developer
 * has to register their own. It needs no API key, so the catalog is
 * reproducible by anyone who clones this repo, and the demo cannot break
 * because of an expired credential. The Composio API (v3.1 /toolkits/{slug},
 * field `composio_managed_auth_schemes`) says the same thing per-toolkit and is
 * wired up as optional live enrichment in src/lib/composio.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SRC = resolve("data/sources/composio-managed-auth.md");
const OUT = resolve("src/data/catalog.json");
const PROVENANCE = JSON.parse(readFileSync(resolve("data/sources/PROVENANCE.json"), "utf8"));

const md = readFileSync(SRC, "utf8");

/** `| [Aircall](/toolkits/aircall.md) | \`AIRCALL\` |` -> { name, slug, docPath } */
const ROW = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*`([A-Z0-9_]+)`\s*\|/;

const SECTIONS = [
  { heading: /^##\s+Composio-managed OAuth available/, managedOAuth: true },
  { heading: /^##\s+Bring your own OAuth app/, managedOAuth: false },
];

const toolkits = [];
let current = null;

for (const line of md.split("\n")) {
  const section = SECTIONS.find((s) => s.heading.test(line));
  if (section) {
    current = section;
    continue;
  }
  if (line.startsWith("## ")) {
    current = null;
    continue;
  }
  if (!current) continue;

  const m = line.match(ROW);
  if (!m) continue;

  const [, name, docPath, slug] = m;
  toolkits.push({
    slug,
    name: name.trim(),
    composioDocUrl: `https://docs.composio.dev${docPath.replace(/\.md$/, "")}`,
    managedOAuth: current.managedOAuth,
    // Composio exposes a lot of vendor-hosted MCP servers as toolkits. Those are
    // a different setup story (point an MCP client at a URL) and are not what the
    // guide library is for, so they are flagged rather than silently mixed in.
    isMcpToolkit: slug.endsWith("_MCP"),
  });
}

const managed = toolkits.filter((t) => t.managedOAuth);
const byo = toolkits.filter((t) => !t.managedOAuth);

// Sanity-check against the counts the page states in its own headings. If
// Composio restructures the page, the build fails loudly instead of shipping a
// half-parsed catalog.
const stated = {};
for (const line of md.split("\n")) {
  const m = line.match(/^##\s+(Composio-managed OAuth available|Bring your own OAuth app)\s+\((\d+)\)/);
  if (m) stated[m[1]] = Number(m[2]);
}
const expectManaged = stated["Composio-managed OAuth available"];
const expectByo = stated["Bring your own OAuth app"];

const problems = [];
if (expectManaged !== managed.length)
  problems.push(`managed: page says ${expectManaged}, parsed ${managed.length}`);
if (expectByo !== byo.length) problems.push(`byo: page says ${expectByo}, parsed ${byo.length}`);
if (problems.length) {
  console.error("Catalog parse mismatch:\n  " + problems.join("\n  "));
  process.exit(1);
}

const catalog = {
  generatedAt: new Date().toISOString(),
  source: {
    url: PROVENANCE.sources[0].url,
    fetchedAt: PROVENANCE.fetched_at,
    file: "data/sources/composio-managed-auth.md",
  },
  counts: {
    total: toolkits.length,
    managedOAuth: managed.length,
    bringYourOwn: byo.length,
    bringYourOwnExcludingMcp: byo.filter((t) => !t.isMcpToolkit).length,
  },
  toolkits: toolkits.sort((a, b) => a.name.localeCompare(b.name)),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");

console.log(`catalog.json written`);
console.log(`  total           ${catalog.counts.total}`);
console.log(`  managed OAuth   ${catalog.counts.managedOAuth}`);
console.log(`  bring your own  ${catalog.counts.bringYourOwn} (${catalog.counts.bringYourOwnExcludingMcp} excluding vendor MCP toolkits)`);

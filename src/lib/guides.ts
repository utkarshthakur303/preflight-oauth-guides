import { Guide } from "./schema";
import { TIER_META } from "./rubric";
import index from "@/data/guides-index.json";
import catalog from "@/data/catalog.json";

/**
 * Access to the seeded library and the Composio catalog it is scoped against.
 *
 * Guides are validated on the way in rather than trusted. They are produced by
 * a language model, and a malformed one should surface as a loud build-time
 * failure instead of a page that renders "undefined business days".
 */

export type CatalogToolkit = {
  slug: string;
  name: string;
  composioDocUrl: string;
  managedOAuth: boolean;
  isMcpToolkit: boolean;
};

export type CatalogData = {
  generatedAt: string;
  source: { url: string; fetchedAt: string; file: string };
  counts: {
    total: number;
    managedOAuth: number;
    bringYourOwn: number;
    bringYourOwnExcludingMcp: number;
  };
  toolkits: CatalogToolkit[];
};

export const CATALOG = catalog as CatalogData;

let cached: Guide[] | null = null;

export function allGuides(): Guide[] {
  if (cached) return cached;

  const parsed: Guide[] = [];
  for (const raw of index as unknown[]) {
    const result = Guide.safeParse(raw);
    if (result.success) {
      parsed.push(result.data);
    } else {
      const slug =
        (raw as { slug?: string })?.slug ?? "(unknown)";
      console.error(
        `[guides] skipping malformed guide "${slug}": ${result.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
    }
  }

  cached = parsed.sort(
    (a, b) =>
      TIER_META[a.tier].order - TIER_META[b.tier].order ||
      a.appName.localeCompare(b.appName),
  );
  return cached;
}

export function getGuide(slug: string): Guide | null {
  return allGuides().find((g) => g.slug === slug) ?? null;
}

export function guidesBySlugs(slugs: string[]): Guide[] {
  const bySlug = new Map(allGuides().map((g) => [g.slug, g]));
  return slugs.map((s) => bySlug.get(s)).filter((g): g is Guide => Boolean(g));
}

/** Toolkits that need a guide and don't have one yet — the honest backlog. */
export function coverage() {
  const have = new Set(allGuides().map((g) => g.composioToolkitSlug));
  const byo = CATALOG.toolkits.filter((t) => !t.managedOAuth && !t.isMcpToolkit);
  return {
    target: byo.length,
    covered: byo.filter((t) => have.has(t.slug)).length,
    remaining: byo.filter((t) => !have.has(t.slug)),
  };
}

/** Catalog search for the generate box, so people can pick a real toolkit. */
export function searchCatalog(q: string, limit = 8): CatalogToolkit[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const have = new Set(allGuides().map((g) => g.composioToolkitSlug));

  return CATALOG.toolkits
    .filter((t) => t.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      // Un-guided bring-your-own toolkits first: that is the gap this exists to fill.
      const score = (t: CatalogToolkit) =>
        (have.has(t.slug) ? 0 : 2) + (t.managedOAuth ? 0 : 1);
      return (
        score(b) - score(a) ||
        a.name.toLowerCase().indexOf(needle) - b.name.toLowerCase().indexOf(needle) ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, limit);
}

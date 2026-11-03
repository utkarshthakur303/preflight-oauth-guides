import { MODELS, TokenLedger, chatJson } from "../groq";
import { relevantYield } from "./relevance";

/**
 * Finding and reading a provider's documentation.
 *
 * The central decision here: we never scrape a search engine. Instead we use
 * the two files developer platforms now publish for exactly this purpose —
 * `/llms.txt` (a curated index written for language models) and `/sitemap.xml`
 * — and we prefer the `.md` twin of any doc page over its HTML. That gives
 * clean markdown with no HTML parsing, no rendering, no API bill, and no
 * dependency on a search provider's terms. It is how this project found
 * Composio's own managed-OAuth directory in a single request.
 *
 * It degrades in a defined order: llms.txt, then llms-full.txt, then
 * sitemap.xml (following sitemap indexes one level), then a plain fetch of the
 * docs root with its links harvested. When a provider offers none of those we
 * say so in the guide rather than inventing coverage.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;

export type DiscoveryMethod =
  | "llms.txt"
  | "llms-full.txt"
  | "robots.txt sitemap"
  | "sitemap.xml"
  | "docs-root-links";

export type DiscoveredSource = {
  /** Every mechanism that contributed, for the reader and the README. */
  methods: DiscoveryMethod[];
  /** The host that produced the most plausible pages. */
  docsRoot: string;
  urls: string[];
  /** Per-host detail, so a run can be explained after the fact. */
  perRoot: { root: string; method: DiscoveryMethod; found: number; relevant: number }[];
};

type RootDiscovery = { method: DiscoveryMethod; docsRoot: string; urls: string[] };

export type ProviderHypothesis = {
  providerName: string;
  /** Candidate documentation roots, best guess first. */
  docsRoots: string[];
  /** Where the developer registers the OAuth app, if the model knows it. */
  developerConsoleUrl: string | null;
};

async function timedFetch(url: string, init: RequestInit = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ask the smart model where a provider's docs live, then verify by fetching.
 *
 * The model supplies hypotheses only. Nothing it says reaches a guide unless a
 * real HTTP request confirms the page exists, so a wrong guess costs a failed
 * fetch rather than a wrong citation.
 */
export async function hypothesiseProvider(
  appNameOrUrl: string,
  ledger: TokenLedger,
): Promise<ProviderHypothesis> {
  let seeded: string | null = null;
  try {
    const u = new URL(
      appNameOrUrl.startsWith("http") ? appNameOrUrl : `https://${appNameOrUrl}`,
    );
    if (u.hostname.includes(".")) seeded = u.origin;
  } catch {
    /* it was a plain name */
  }

  const result = await chatJson<ProviderHypothesis>({
    model: MODELS.smart,
    role: "adjudicate",
    ledger,
    maxTokens: 1200,
    system: [
      "You locate developer documentation for SaaS providers.",
      "Return JSON only, matching:",
      '{"providerName": string, "docsRoots": string[], "developerConsoleUrl": string|null}',
      "",
      "docsRoots: 2-5 origins or path prefixes most likely to host the OAuth / API documentation,",
      "best guess first. Prefer dedicated developer domains (developers.x.com, docs.x.com, x.dev).",
      "Include the bare marketing origin only as a last resort.",
      "developerConsoleUrl: the page where a developer creates an OAuth app, or null if unsure.",
      "Never invent a URL you are not reasonably confident exists. null is better than a guess.",
    ].join("\n"),
    user: seeded
      ? `App: ${appNameOrUrl}\nKnown website: ${seeded}`
      : `App: ${appNameOrUrl}`,
  });

  const roots = (result.docsRoots ?? [])
    .map((r) => (r.startsWith("http") ? r : `https://${r}`))
    .filter((r) => {
      try {
        new URL(r);
        return true;
      } catch {
        return false;
      }
    });

  if (seeded && !roots.includes(seeded)) roots.push(seeded);

  return {
    providerName: result.providerName || appNameOrUrl,
    docsRoots: [...new Set(roots)].slice(0, 6),
    developerConsoleUrl: result.developerConsoleUrl ?? null,
  };
}

function absolutise(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function sameSiteish(url: string, root: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(root);
    const tail = (h: string) => h.split(".").slice(-2).join(".");
    return tail(a.hostname) === tail(b.hostname);
  } catch {
    return false;
  }
}

/** Pull URLs out of an llms.txt (markdown link list) or llms-full.txt. */
function urlsFromLlmsTxt(text: string, root: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
    const u = absolutise(m[1], root);
    if (u) out.add(u);
  }
  // llms-full.txt sometimes lists bare URLs rather than markdown links.
  for (const m of text.matchAll(/^\s*(https?:\/\/\S+)\s*$/gm)) out.add(m[1]);
  return [...out];
}

function urlsFromSitemap(xml: string): { pages: string[]; indexes: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const isIndex = /<sitemapindex/i.test(xml);
  return isIndex ? { pages: [], indexes: locs } : { pages: locs, indexes: [] };
}

/**
 * Read a sitemap, transparently un-gzipping a `.xml.gz`.
 *
 * Large sites commonly serve only the gzipped variant — Shopify's sitemap index
 * points at `sitemap_standard.xml.gz` and nothing else. `fetch` only
 * auto-decompresses when the server sets `content-encoding`, which it doesn't
 * for a file that is genuinely named `.gz`, so we do it ourselves.
 */
async function fetchSitemapText(url: string): Promise<string | null> {
  try {
    const res = await timedFetch(url);
    if (!res.ok) return null;

    const gzipped =
      url.endsWith(".gz") ||
      (res.headers.get("content-type") ?? "").includes("gzip");

    if (!gzipped) return await res.text();
    if (!res.body) return null;

    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

/**
 * Sitemap locations declared in robots.txt.
 *
 * This is the standardised place to look, and it pays off in practice: it is
 * how we find Shopify's `sitemap_md.xml`, a sitemap of 8,954 markdown pages that
 * nothing links to and no conventional path would have guessed.
 */
async function sitemapsFromRobots(origin: string): Promise<string[]> {
  try {
    const res = await timedFetch(`${origin}/robots.txt`);
    if (!res.ok) return [];
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) return [];

    return [...text.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)]
      .map((m) => m[1])
      .filter((u) => /^https?:\/\//i.test(u));
  } catch {
    return [];
  }
}

/**
 * Expand a set of sitemap URLs into page URLs, following indexes one level.
 *
 * Child sitemaps are ranked so that markdown and documentation ones are read
 * first, and we stop once there is plenty to triage — reading every shard of a
 * 50,000-page sitemap would buy nothing.
 */
async function expandSitemaps(
  sitemapUrls: string[],
  budget = 12_000,
  deadlineMs = 45_000,
): Promise<string[]> {
  const pages = new Set<string>();
  const queue = [...sitemapUrls];
  let indexesFollowed = 0;
  // Some providers shard a sitemap across dozens of large gzipped files behind
  // slow responses. Enumeration is not worth an unbounded wait: whatever has
  // been collected by the deadline is plenty for the relevance prefilter.
  const stopAt = Date.now() + deadlineMs;

  while (queue.length && pages.size < budget && Date.now() < stopAt) {
    const next = queue.shift()!;
    const xml = await fetchSitemapText(next);
    if (!xml) continue;

    const { pages: p, indexes } = urlsFromSitemap(xml);
    for (const u of p) pages.add(u);

    if (indexes.length && indexesFollowed < 6) {
      indexesFollowed++;
      const ranked = indexes.sort(
        (a, b) =>
          Number(/_md|\bmd\b|doc|developer|api|guide|help/i.test(b)) -
          Number(/_md|\bmd\b|doc|developer|api|guide|help/i.test(a)),
      );
      queue.push(...ranked.slice(0, 4));
    }
  }

  return [...pages];
}

function urlsFromHtml(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="([^"#?]+)"/g)) {
    const u = absolutise(m[1], base);
    if (u && sameSiteish(u, base)) out.add(u);
  }
  return [...out];
}

/**
 * Enumerate candidate doc pages for a provider.
 *
 * Every candidate host is probed and the results are *merged*, then ranked by
 * how many pages survive the relevance prefilter. Providers routinely split
 * developer docs, merchant help and marketing across hosts, and the one with
 * the tidiest index is often not the one documenting OAuth. Measuring yield
 * rather than trusting a mechanism avoids betting the guide on that.
 */
export async function discoverDocUrls(
  docsRoots: string[],
): Promise<DiscoveredSource | null> {
  const found: RootDiscovery[] = [];
  // A whole-stage ceiling on top of the per-sitemap one, so a provider that
  // blocks our requests or serves very slowly degrades to a thinner candidate
  // list rather than hanging the run.
  const stopAt = Date.now() + 100_000;

  for (const root of docsRoots.slice(0, 4)) {
    if (Date.now() > stopAt && found.length) break;
    const r = await discoverFromRoot(root);
    if (r) found.push(r);
  }

  if (!found.length) return null;

  const perRoot = found.map((f) => ({
    root: f.docsRoot,
    method: f.method,
    found: f.urls.length,
    relevant: relevantYield(f.urls),
  }));

  const best = [...perRoot].sort(
    (a, b) => b.relevant - a.relevant || b.found - a.found,
  )[0];

  // Canonicalise before merging. A provider's sitemaps commonly list both
  // `page` and `page.md`, and reading both burns two extraction calls against a
  // tight per-minute token budget to learn the same thing twice. `fetchDocPage`
  // prefers the markdown twin regardless, so the extension carries no
  // information worth keeping here.
  const merged = new Set<string>();
  for (const f of found) {
    for (const u of f.urls) {
      merged.add(u.replace(/\.md$/i, "").replace(/\/$/, "").split("#")[0]);
    }
  }

  return {
    methods: [...new Set(found.map((f) => f.method))],
    docsRoot: best.root,
    urls: [...merged],
    perRoot,
  };
}

async function discoverFromRoot(root: string): Promise<RootDiscovery | null> {
  {
    let origin: string;
    try {
      origin = new URL(root).origin;
    } catch {
      return null;
    }

    // Collect from every mechanism this host offers, then keep the richest.
    // Returning on the first hit cost us GitHub: docs.github.com publishes a
    // 215-entry llms.txt that omits the OAuth app pages entirely, while its
    // sitemap has them. A curated index is not automatically the better one.
    const found: RootDiscovery[] = [];

    // 1 & 2. llms.txt, then llms-full.txt. Curated by the provider for exactly
    // this purpose, so when present it beats everything else.
    for (const file of ["llms.txt", "llms-full.txt"] as const) {
      try {
        const res = await timedFetch(`${origin}/${file}`);
        const ct = res.headers.get("content-type") ?? "";
        if (res.ok && !ct.includes("html")) {
          const text = await res.text();
          const urls = urlsFromLlmsTxt(text, origin).filter((u) =>
            sameSiteish(u, origin),
          );
          if (urls.length >= 5) {
            found.push({
              method: file === "llms.txt" ? "llms.txt" : "llms-full.txt",
              docsRoot: origin,
              urls: [...new Set(urls)],
            });
          }
        }
      } catch {
        /* try the next mechanism */
      }
    }

    // 3. Sitemaps declared in robots.txt — the standardised location, and the
    //    only way to reach some providers' markdown sitemaps.
    const declared = await sitemapsFromRobots(origin);
    if (declared.length) {
      const urls = (await expandSitemaps(declared)).filter((u) =>
        sameSiteish(u, origin),
      );
      if (urls.length >= 5) {
        found.push({ method: "robots.txt sitemap", docsRoot: origin, urls });
      }
    }

    // 4. Conventional sitemap paths.
    if (!found.some((f) => f.method === "robots.txt sitemap")) {
      const guessed = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/docs/sitemap.xml`,
      ];
      const urls = (await expandSitemaps(guessed)).filter((u) =>
        sameSiteish(u, origin),
      );
      if (urls.length >= 5) {
        found.push({ method: "sitemap.xml", docsRoot: origin, urls });
      }
    }

    // 5. Last resort when nothing structured turned up: harvest the root's links.
    if (!found.length) {
      try {
        const res = await timedFetch(root);
        if (res.ok) {
          const harvested = urlsFromHtml(await res.text(), root);
          if (harvested.length >= 5) {
            found.push({ method: "docs-root-links", docsRoot: origin, urls: harvested });
          }
        }
      } catch {
        /* nothing usable at this root */
      }
    }

    if (!found.length) return null;

    const merged = new Set<string>();
    for (const f of found) for (const u of f.urls) merged.add(u);

    return {
      method: [...found].sort((a, b) => relevantYield(b.urls) - relevantYield(a.urls))[0].method,
      docsRoot: origin,
      urls: [...merged],
    };
  }
}

export type FetchedPage = {
  url: string;
  /** The URL we actually read, which may be the `.md` twin. */
  readFrom: string;
  title: string;
  text: string;
  fetchedAt: string;
};

/** Strip an HTML document down to readable text. */
function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    // Keep block boundaries so sentences don't fuse across elements.
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return {
    title,
    text: decodeEntities(body)
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  return s
    .replace(/&([a-z]+|#\d+);/gi, (m, e: string) => named[e.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

/**
 * Read a doc page, preferring its markdown twin.
 *
 * Docs built with Mintlify, Fumadocs, Docusaurus and friends serve `page.md`
 * alongside `page`. Reading that instead of the HTML means no parsing, no
 * navigation chrome in the text, and roughly a third of the tokens — which is
 * most of why this pipeline is cheap enough to run on a free tier.
 */
export async function fetchDocPage(
  url: string,
  maxChars = 24_000,
): Promise<FetchedPage | null> {
  const clean = url.split("#")[0];
  const candidates = clean.endsWith(".md")
    ? [clean]
    : [`${clean.replace(/\/$/, "")}.md`, clean];

  for (const candidate of candidates) {
    try {
      const res = await timedFetch(candidate);
      if (!res.ok) continue;

      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();

      // A `.md` guess that silently returns the HTML app shell is not markdown.
      const looksHtml = ct.includes("html") || /^\s*<(!doctype|html)/i.test(raw);
      if (candidate.endsWith(".md") && looksHtml) continue;
      if (!raw.trim()) continue;

      const { title, text } = looksHtml
        ? htmlToText(raw)
        : {
            title: raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "",
            text: raw,
          };

      // Single-page doc apps serve the same navigation shell for every URL.
      // It passes a naive length check and then yields nothing, wasting an
      // extraction call against the rate limit, so hold HTML to a higher bar
      // than markdown (which is genuinely terse sometimes).
      if (text.length < (looksHtml ? 900 : 250)) continue;

      return {
        url: clean,
        readFrom: candidate,
        title: title || clean,
        text: text.slice(0, maxChars),
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      /* try the next candidate */
    }
  }

  return null;
}


/**
 * Second opinion on an ambiguous product name.
 *
 * Asked for "Gemini", the locate step confidently proposes Google's AI
 * documentation, finds nothing about registering an OAuth app, and reports
 * that nothing could be established — while docs.gemini.com, the crypto
 * exchange, publishes a perfectly readable llms.txt. The first interpretation
 * of a name is not always the one the user meant, and a dead end is the signal
 * to ask for alternatives rather than to give up.
 *
 * Only called when discovery has already come back empty, so it costs nothing
 * on the common path.
 */
export async function alternateInterpretations(
  appNameOrUrl: string,
  alreadyTried: string[],
  ledger: TokenLedger,
): Promise<ProviderHypothesis[]> {
  const tried = alreadyTried.map((r) => {
    try {
      return new URL(r).hostname;
    } catch {
      return r;
    }
  });

  const result = await chatJson<{
    candidates: { providerName: string; docsRoots: string[]; developerConsoleUrl: string | null }[];
  }>({
    model: MODELS.smart,
    role: "adjudicate",
    ledger,
    maxTokens: 900,
    system: [
      "A product name was ambiguous and the first interpretation led nowhere.",
      "Name OTHER distinct companies or products that go by this name — different organisations,",
      "not other pages of the same one.",
      "",
      'Return JSON only: {"candidates": [{"providerName": string, "docsRoots": string[], "developerConsoleUrl": string|null}]}',
      "",
      "At most 3 candidates, most likely first. Prefer ones that plainly have a developer API.",
      "Return an empty array if the name is not actually ambiguous.",
    ].join("\n"),
    user: `Name: ${appNameOrUrl}\nAlready tried, do not repeat: ${tried.join(", ") || "none"}`,
  });

  return (result.candidates ?? [])
    .map((c) => ({
      providerName: c.providerName || appNameOrUrl,
      docsRoots: (c.docsRoots ?? [])
        .map((r) => (r.startsWith("http") ? r : `https://${r}`))
        .filter((r) => {
          try {
            return !tried.includes(new URL(r).hostname);
          } catch {
            return false;
          }
        }),
      developerConsoleUrl: c.developerConsoleUrl ?? null,
    }))
    .filter((c) => c.docsRoots.length);
}

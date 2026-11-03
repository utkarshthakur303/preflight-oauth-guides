/**
 * URL relevance scoring — the free prefilter that runs before any model does.
 *
 * Its only job is to get a sitemap of tens of thousands of pages down to a few
 * hundred worth spending tokens on. It is deliberately crude: it must not throw
 * away a page that matters, and it is not qualified to make the final call. The
 * triage model does that next.
 *
 * It also decides which of a provider's documentation hosts is the useful one,
 * by counting how many plausible pages each yields. That measurement replaced an
 * earlier design that ranked discovery *mechanisms* instead, which went wrong on
 * Shopify: a curated 69-entry `llms.txt` on their merchant help site outranked a
 * sitemap of 8,954 developer pages, and the sitemap was the one containing every
 * page about OAuth credentials and app review.
 */

const RELEVANT_PATH = new RegExp(
  [
    "oauth",
    "o-auth",
    "auth",
    "scope",
    "permission",
    "consent",
    "app-registration",
    "register",
    "credential",
    "client-id",
    "client-secret",
    "token",
    "review",
    "verif",
    "approv",
    "publish",
    "listing",
    "marketplace",
    "partner",
    "developer",
    "create-app",
    "apps?/",
    "getting-started",
    "quickstart",
    "security",
  ].join("|"),
  "i",
);

const IRRELEVANT_PATH =
  /\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip|woff2?)$|\/(blog|changelog|pricing|careers|legal|press|community|events|customers|case-stud|release-notes)/i;

/**
 * Translated copies of the same docs.
 *
 * Shopify's help centre publishes every page under a locale prefix, so a
 * sitemap offers the identical article forty times over. An early run cheerfully
 * read `help.shopify.com/ar/partners/build-integrate` — the Arabic edition —
 * and extracted nothing, having spent a fetch and an extraction call to do it.
 * English-language paths only; an unprefixed path is assumed English.
 */
const NON_ENGLISH_LOCALE =
  /^\/(ar|bg|cs|da|de|el|es|et|fa|fi|fr|he|hi|hr|hu|id|it|ja|ko|lt|lv|ms|nb|nl|no|pl|pt|pt-br|ro|ru|sk|sl|sr|sv|th|tr|uk|vi|zh|zh-cn|zh-tw|zh-hans|zh-hant)(\/|$)/i;

/**
 * Generated API reference. The single biggest source of false positives: on
 * shopify.dev, 7,607 of 8,954 pages are GraphQL reference, and hundreds have
 * "App" or "Scope" in the path while saying nothing about registering an app.
 */
const REFERENCE_NOISE =
  /\/(connections|objects|mutations|queries|interfaces|unions|enums|scalars|input-objects|payloads|hooks|components|utilities)\//i;

export function scoreUrl(url: string): number {
  if (IRRELEVANT_PATH.test(url)) return -99;

  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return -99;
  }

  if (NON_ENGLISH_LOCALE.test(path)) return -99;

  let score = 0;
  if (RELEVANT_PATH.test(path)) score += 2;
  if (/oauth|client-secret|client-id|app-registration|credential|create-app|register/i.test(path))
    score += 4;
  // Approval and distribution pages are weighted at least as heavily as the
  // technical auth pages. They carry the timeline, the cost and the
  // prerequisites — the four rubric dimensions a developer actually plans
  // around — and an earlier version under-weighted them, so runs filled up on
  // token-exchange reference and reported the review wait as unknown.
  if (/review|verif|approv|publish|listing|marketplace|partner|launch|submit|distribut/i.test(path))
    score += 5;
  if (/requirement|policy|quality-check|checklist|prerequisite/i.test(path)) score += 3;
  if (/scope|consent|permission/i.test(path)) score += 2;

  if (REFERENCE_NOISE.test(path)) score -= 8;
  // Versioned reference trees ("/latest/", "/2024-07/") are never setup guides.
  if (/\/(latest|unstable|\d{4}-\d{2})\//i.test(path)) score -= 5;
  // Deep paths tend to be reference minutiae; shallow ones are guides.
  score -= Math.max(0, path.split("/").length - 6) * 0.75;

  return score;
}

/** How many of these URLs look like they could discuss OAuth app setup. */
export function relevantYield(urls: string[]): number {
  let n = 0;
  for (const u of urls) if (scoreUrl(u) > 0) n++;
  return n;
}

export function shortlist(urls: string[], limit = 200): string[] {
  const scored = urls
    .map((u) => ({ u, score: scoreUrl(u) }))
    .filter((x) => x.score > -90)
    .sort((a, b) => b.score - a.score);

  const positive = scored.filter((x) => x.score > 0);

  // On a small site the keyword filter can be harsher than the model would be,
  // so when there is little to sift we hand over everything plausible and let
  // the triage model decide. The prefilter exists to save tokens on big
  // sitemaps, not to make judgements it isn't qualified to make.
  if (positive.length < 12 && scored.length <= limit) {
    return scored.filter((x) => x.score > -8).map((x) => x.u).slice(0, limit);
  }

  return positive.slice(0, limit).map((x) => x.u);
}

/**
 * Topic buckets used to spread the pages we read across the questions a guide
 * has to answer.
 *
 * Without this, triage ranks a provider's deepest OAuth reference pages highest
 * and we read five variations on token exchange while the review timeline stays
 * unknown. The guide needs one page about registering, one about approval, one
 * about requirements — breadth beats depth when five pages is the whole budget.
 */
export type Topic =
  | "register"
  | "approval"
  | "requirements"
  | "scopes"
  | "other";

export function topicOf(url: string): Topic {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return "other";
  }
  if (/review|approv|verif|submit|publish|launch|listing|marketplace|distribut/.test(path))
    return "approval";
  if (/requirement|policy|quality-check|checklist|prerequisite|eligib/.test(path))
    return "requirements";
  if (/create-app|app-registration|register|credential|client-id|client-secret|manage-credentials|partner/.test(path))
    return "register";
  if (/scope|consent|permission/.test(path)) return "scopes";
  return "other";
}

/**
 * Pick pages to read, round-robin across topics so no single topic can crowd
 * out the others, while still taking the highest-ranked page within each.
 */
export function diversify<T>(
  items: T[],
  urlOf: (t: T) => string,
  limit: number,
): T[] {
  const order: Topic[] = ["register", "approval", "requirements", "scopes", "other"];
  const buckets = new Map<Topic, T[]>(order.map((t) => [t, []]));
  for (const it of items) buckets.get(topicOf(urlOf(it)))!.push(it);

  const out: T[] = [];
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const t of order) {
      const b = buckets.get(t)!;
      if (!b.length) continue;
      out.push(b.shift()!);
      progressed = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

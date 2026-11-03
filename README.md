# Preflight

**Find out whether your integration ships this week or next quarter — before you start building it.**

A developer wiring an AI agent to third-party apps has to register their own OAuth app with each provider. That takes two minutes with one provider and two months with another, and the documentation almost never says which. Preflight investigates a provider's own docs and reports the timeline, the cost, the blockers, and which steps an agent can take off your hands — with every claim labelled by how it is known.

- **Live:** _(deployment URL)_
- **Generate any app live:** `/generate` — works for apps inside and outside Composio's catalog
- **Machine-readable:** `/api/guides` and `/api/guides/<slug>`

---

## The scope decision, and why

Composio's own [managed OAuth apps directory](https://docs.composio.dev/toolkits/managed-auth) splits the catalog in two. I parsed it at build time rather than taking its word for it, and the parser fails loudly if my counts disagree with the counts the page states in its own headings:

| | |
|---|---|
| Toolkits with a **Composio-managed** OAuth app | **125** |
| Toolkits where you must **bring your own** | **262** |
| …of those, first-party apps rather than vendor MCP servers | **150** |

The brief asks for a library of guides for 100 apps. **Those 100 come out of the 150.** They are the toolkits where Composio hands the developer a link to the provider's docs and wishes them luck, so the scope is read off Composio's data rather than chosen by me.

Guides for *managed* toolkits still matter, which is why two are seeded. Composio's own documentation lists concrete reasons to bring your own app anyway: your brand on the consent screen, scopes beyond their defaults, trigger polling faster than their two-minute floor, and rate limits that are otherwise **shared across every Composio customer**. "Managed" means "you can defer this", not "you will never do it".

There is also prior art worth noticing: Composio ships exactly two hand-written guides of this kind, for [Google](https://docs.composio.dev/kb/guide/platform-google-oauth) and [Microsoft](https://docs.composio.dev/kb/guide/platform-microsoft-oauth) OAuth. This project is the generalisation of those two to the other 150.

---

## Running it

```bash
pnpm install
cp .env.example .env.local      # add a free Groq key from console.groq.com
pnpm catalog                    # parse Composio's directory → src/data/catalog.json
pnpm guide shopify              # generate one guide, streamed to your terminal
pnpm seed                       # generate the whole seeded library (~25 min)
pnpm dev
```

The only required credential is `GROQ_API_KEY`, which is free and needs no card. `COMPOSIO_API_KEY` is optional — see "Why the catalog isn't read from their API" below.

Scripts: `pnpm catalog` (rebuild the toolkit catalog), `pnpm guide <app>` (one guide), `pnpm seed` (the library), `pnpm build` (rebuilds the catalog, then Next.js).

---

## How a guide gets made

```
discover   every doc URL the provider publishes              no model
shortlist  keyword scoring on URL paths                      no model
triage     which handful actually discuss OAuth setup        gpt-oss-20b
extract    per page, claims with verbatim quotes             gpt-oss-20b
adjudicate one guide from those claims                       gpt-oss-120b
verify     every quote re-checked against the fetched text   no model
```

A real run against Shopify: **19,560 pages discovered → 200 shortlisted → 17 judged relevant → 6 read.** The two stages that do the heaviest narrowing cost nothing, which is what keeps the whole thing inside a free tier.

### Three decisions worth defending

**1. We never scrape a search engine.** Discovery reads `/llms.txt`, then `/llms-full.txt`, then the sitemaps declared in `robots.txt`, then conventional sitemap paths, then the docs root's links — and prefers each page's `.md` twin over its HTML. No search API, no Firecrawl bill, no HTML parsing, roughly a third of the tokens. It's how this project found Composio's own managed-auth directory in a single request. `robots.txt` matters more than it sounds: it is the only route to Shopify's `sitemap_md.xml`, a sitemap of 8,954 markdown pages that nothing links to.

**2. The big model never sees a documentation page.** It sees short claims that each carry a quote, which keeps its input near 3k tokens instead of 40k. That is the difference between running on a free tier and not running at all — and it means every sentence the big model writes is anchored to something a small model actually read.

**3. Citations are checked after the fact.** A model asked for citations will sometimes produce a plausible URL and a plausible quote for something it inferred. So after generation, every quote is matched against the text really fetched. A quote that isn't there loses its citation and the claim is demoted from `cited` to `inferred`. This fires in practice — you can watch it happen on `/generate`.

---

## The rubric: difficulty is computed, not asserted

A model is never asked how hard something is. It fills in five measurable dimensions:

| Dimension | Meaning |
|---|---|
| `selfServeMinutes` | keyboard time, excluding all waiting |
| `reviewWaitBusinessDays` | `{min, max}` the **provider** takes to come back to you |
| `humanOnlyBlockers` | steps an agent cannot do, each with a reason |
| `costUsd` | money that must change hands |
| `prerequisiteArtifacts` | privacy policy, verified domain, company, demo video, security questionnaire… |

`deriveTier()` turns those into **Instant / Same day / Days / Weeks / Enterprise-gated** as a pure function. It is a **ladder, not a weighted average**: each dimension sets a floor, and the tier is the highest floor any one of them demands. Four easy dimensions must not be able to hide one disqualifying requirement — "you need a SOC 2 report" is not offset by a quick signup form. The worst thing about your integration is what decides when you ship.

Because it's arithmetic over published numbers, guides are comparable, and every guide page shows the working.

**Confidence is computed separately and never mixed in.** How hard setup is and how much we know are different questions; one blended score would hide both.

### Null is not zero

Every dimension is nullable, and null means *we looked and could not establish it*. A null contributes nothing to the tier, drags confidence to `low`, and the guide states which dimensions the tier is blind to.

This is load-bearing. `{min: 0, max: 0}` asserts that **nobody reviews your app** — a strong, checkable claim. Failing to find a review process is a shrug. An early version conflated the two and produced guides promising no approval was needed for providers that plainly require one.

---

## The launch planner

Nobody integrates one app. `/plan` takes the apps your agent needs and works out a date on the model that **provider reviews overlap but your own keyboard work does not**, then names the single approval setting the date. It reports the weakest confidence in the stack alongside the number, because a date inherited from a guide with an unknown review wait is a guess wearing a suit.

---

## What I checked by hand, and what it found

Two guides were verified against primary sources after generation. Both found real errors, and both errors were the *same class*: the citation was genuine and the inference from it was wrong.

### Shopify — the guide was measuring the wrong event

The generated guide reported a **0–30 business day review**, citing:

> "If your quality check has a list of changes that you need to make to your app, then you have 30 days to make those changes."

The quote is real and verification passed. But that is **the developer's deadline to respond**, not Shopify's review time. It also pulled in Built for Shopify badge requirements — 50 net installs, five reviews, a minimum rating — which are a recognition programme and have nothing to do with registering an OAuth app.

Underneath both mistakes sat one conceptual error: **getting OAuth credentials and getting listed in a marketplace are different events with different timelines.** Shopify's own docs are explicit that client ID and secret are available immediately in the Dev Dashboard, and that [distribution](https://shopify.dev/docs/apps/launch/distribution) is a separate later choice — custom distribution lets a named merchant install with no review at all.

**Fixed** by teaching the adjudication step that the rubric measures the path to *working credentials*, that marketplace listing is an optional separate path belonging in `nuances`, and that a deadline imposed on the developer is not a review duration.

### Xero — spot-checked and held up

Checked the developer-portal path, the 50-redirect-URI limit, the granular-scopes migration date and the "no review for app creation" claim against Xero's documentation. All supported. The guide's own open questions correctly flag that no official review SLA could be found rather than inventing one.

### What I could not verify

- **No OAuth app in this project was ever submitted for approval.** Every review-stage claim comes from documentation, not experience. Real approval times are set by reviewer queues, and no provider publishes a reliable SLA.
- **No paid or enterprise-gated provider was tested end to end.** Workday and Snowflake guides describe paths that require a tenant or an account I do not have.
- **Cross-product contamination is still possible.** A provider documenting several app surfaces can have a requirement from one attributed to another; with six pages read, there isn't always enough context to tell. Seeded guides are reviewed for this. Live ones are not, and are labelled `unreviewed` in the UI.

---

## Limitations

- **Only public documentation is read.** Where no SLA is published, the wait is `unknown`, not estimated.
- **Quote checking catches invention, not misreading.** It proves a sentence exists on the page. It cannot prove the model drew the right conclusion — which is exactly how the Shopify error survived to the hand-check.
- **Staleness.** Every citation carries a fetch date; there is no re-verification job, so an old guide can be confidently wrong.
- **Six pages is a thin read.** It is what a free tier's 8,000 tokens/minute affords. More pages would measurably improve accuracy.
- **Hosted generation can hit a platform function timeout.** A run takes two to three minutes. The CLI has no such limit; the UI reports honestly if the connection closes early.
- **The planner assumes one developer working serially and reviews running in parallel.** Both assumptions are stated on the page.

### Why the catalog isn't read from their API

Composio exposes `composio_managed_auth_schemes` on `GET /api/v3.1/toolkits/{slug}`, which would give the same managed/bring-your-own split live. I parse the public directory page instead and commit the raw markdown under `data/sources/`, so the catalog is reproducible by anyone who clones this repo and the demo cannot break because of an expired credential. The API path is the better choice for a production version, where staleness matters more than reproducibility.

### Running inside a free tier

Both models are free on Groq, capped at **8,000 tokens per minute each** — and `max_completion_tokens` is reserved against that budget before generation starts, so a request that merely *asks* for a large response can fail on its own. That single limit shaped the architecture:

- adjudication is split into two calls, because one call big enough to emit a whole guide could never fit
- pages are truncated to 6,000 characters for extraction
- a governor reads `x-ratelimit-remaining-tokens` off every response and waits when the next call wouldn't fit, rather than discovering the limit via 429s

A paid model would be faster and read more pages. The provider sits behind one interface in `src/lib/groq.ts`, so that is an env-var change rather than a rewrite.

---

## Layout

```
data/sources/            raw upstream docs, committed verbatim for reproducibility
scripts/
  build-catalog.mjs      Composio's directory → catalog.json, with a count assertion
  generate-guide.ts      CLI: one guide, streamed
  seed-guides.ts         CLI: the seeded library
src/lib/
  schema.ts              the guide schema; evidence levels; nullable rubric
  rubric.ts              deriveTier, confidenceFor, planStack — all pure functions
  groq.ts                two-tier model cascade, token ledger, rate governor
  research/
    relevance.ts         free URL scoring, topic buckets, diversification
    sources.ts           llms.txt / robots.txt / sitemap discovery, markdown-first fetch
    pipeline.ts          orchestration, extraction, adjudication, citation verification
src/app/                 library, guide pages, /generate, /plan, /method, JSON API
```

---

## What I'd do next

1. **Re-verification job.** Re-fetch each guide's citations on a schedule and flag the ones whose quotes have moved. Staleness is the biggest threat to trust here and it's the cheapest thing to fix.
2. **Let the agent attempt the setup.** The handoff split is already machine-readable at `/api/guides/<slug>` (`agentPlan.canAttempt` / `mustHandOff`). Driving a real console with a browser agent and recording the observed click-path would promote claims from `cited` to `verified` — the evidence level the schema supports but almost nothing currently reaches.
3. **Corrections from developers.** A developer who has actually been through Salesforce's security review knows something no document states. A correction path with provenance would beat any amount of additional crawling.

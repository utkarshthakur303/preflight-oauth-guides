# Preflight

**Find out whether your integration ships this week or next quarter — before you start building it.**

Live: **https://preflight-rust-psi.vercel.app**

---

## The problem, as I understood it

A developer building an agent has to register their own OAuth app with each provider they connect. That takes two minutes with GitHub and two months with Salesforce, and the documentation almost never says which.

The code isn't the hard part. The not-knowing is. You sit down on Monday to "add Xero", read five doc pages, email support, and still can't tell your team whether you're shipping Thursday or next quarter.

Preflight investigates a provider's own documentation and answers four questions: how long setup actually takes, what it costs, what could block you, and which steps an agent could do on your behalf. Every claim is labelled with how it is known.

## Why this scope

Composio's [managed OAuth apps directory](https://docs.composio.dev/toolkits/managed-auth) splits the catalog in two. I parse that page at build time rather than taking its word for it — the build fails if my counts disagree with the ones the page states:

| | |
|---|---|
| Toolkits with a Composio-managed OAuth app | **125** |
| Toolkits where you bring your own | **262** |
| …of those, first-party apps rather than vendor MCP servers | **150** |

The brief asks for guides for 100 apps. **Those 100 come out of the 150.** Today those developers get a link to the provider's docs and good luck. The scope is read off Composio's own data, not chosen by me.

Guides for *managed* toolkits still matter, which is why a few are included. Composio's docs list real reasons to bring your own app anyway: your brand on the consent screen, scopes beyond the defaults, trigger polling faster than the two-minute floor, and rate limits otherwise shared across every Composio customer.

One more thing I noticed: Composio already ships exactly two hand-written guides of this kind, for [Google](https://docs.composio.dev/kb/guide/platform-google-oauth) and [Microsoft](https://docs.composio.dev/kb/guide/platform-microsoft-oauth) OAuth. This is those two, generalised to the other 150.

## Running it

```bash
pnpm install
cp .env.example .env.local      # add a free Groq key from console.groq.com
pnpm catalog                    # parse Composio's directory
pnpm guide shopify              # generate one guide, streamed to your terminal
pnpm dev
```

One credential, free, no card needed. `pnpm seed` builds the whole seeded library.

## How a guide gets made

```
discover    every doc URL the provider publishes          no model
shortlist   keyword scoring on URL paths                  no model
triage      which handful discuss OAuth setup             small model
extract     per page, claims with verbatim quotes         small model
adjudicate  one guide, written from those claims          larger model
verify      every quote re-checked against the source     no model
```

A real Shopify run: **19,560 pages discovered → 200 shortlisted → 17 relevant → 6 read.** The two stages doing the heaviest narrowing cost nothing, which is what keeps this inside a free tier.

Three decisions I'd defend:

**No search engines.** Discovery reads `/llms.txt`, then sitemaps declared in `robots.txt`, then conventional paths — and prefers each page's `.md` twin over its HTML. No search API, no scraping, about a third of the tokens. It's how this project found Composio's own managed-auth directory in a single request. Pages that only render in a browser are retried through a free rendering proxy.

**The big model never sees a documentation page.** It sees short claims that each carry a quote. That keeps its input near 3k tokens instead of 40k, and means every sentence it writes is anchored to something that was actually read.

**Citations are checked afterwards.** A model asked for citations will sometimes produce a plausible URL and a plausible quote for something it inferred. So every quote is matched against the text really fetched; one that isn't there loses its citation and the claim drops from *cited* to *inferred*. You can watch this happen on `/generate` — a recent Gemini run confirmed 11 quotes and rejected 5.

## Difficulty is computed, not asserted

A model is never asked how hard something is. It fills in five measurable things:

| | |
|---|---|
| `selfServeMinutes` | keyboard time, excluding all waiting |
| `reviewWaitBusinessDays` | how long the **provider** takes to come back to you |
| `humanOnlyBlockers` | steps an agent can't do, each with a reason |
| `costUsd` | money that must change hands |
| `prerequisiteArtifacts` | privacy policy, verified domain, company, demo video… |

A pure function turns those into **Instant / Same day / Days / Weeks / Enterprise-gated**. It's a ladder, not an average: each dimension sets a floor and the tier is the highest floor any one of them demands. Four easy dimensions shouldn't be able to hide one disqualifying requirement — "you need a SOC 2 report" isn't offset by a quick signup form.

Confidence is computed separately and never mixed in. How hard setup is and how much we know are different questions.

**Null is not zero.** Every dimension can be null, meaning we looked and couldn't establish it. A null contributes nothing to the tier and drags confidence to low. `{min: 0, max: 0}` asserts that *nobody reviews your app* — a strong, checkable claim. Not having found a review process is a shrug. An early version conflated the two and cheerfully promised no approval was needed for providers that plainly require one.

## The launch planner

Nobody integrates one app. `/plan` takes everything your agent needs and works out a date, on the model that provider reviews overlap but your own keyboard work doesn't — then names the single approval setting the date. It reports the weakest confidence in the stack alongside the number, because a date inherited from a guide with an unknown review wait is a guess wearing a suit.

## What I checked by hand

Reviews live in `data/review-notes.json`, kept separate from the generated files so a regenerated guide never inherits a stale review. Each one appears on its guide page.

**Shopify was measuring the wrong event.** It reported a 0–30 day review, citing a real sentence: *"you have 30 days to make those changes."* That's the developer's deadline to respond, not Shopify's review time. It had also absorbed Built for Shopify badge requirements, which are a recognition programme. One cause under both: **getting credentials and getting listed are different events.** Shopify issues the client ID and secret immediately. Fixed, and the guide now reports the wait as unknown with the right reasoning.

**GitHub came out as "Weeks"** for an app you can register in two minutes. Every citation was sound; my taxonomy was wrong. A step reading "account email must be verified" was tagged `identity_verification`, which the ladder floors at weeks because it means government ID. Email and phone verification are now separate, and floored at instant.

Both errors passed citation checking, which is the lesson: **verification catches invented evidence, not bad reasoning over good evidence.**

**A guide with no evidence must not look like an easy one.** This came from looking at the library, not any single guide. `deriveTier` returns `instant` when nothing demands higher — correct, and catastrophic where nothing was established at all, because it rendered as a confident green **Instant**. Those guides now show **"Not established"**, explain why, and are excluded from the planner rather than contributing a silent zero.

**Not every provider has OAuth.** Asked about Groq, the honest answer isn't five unknowns — it's that Groq authenticates with API keys and has no app to register. Guides can now say that, and it counts as zero work in the planner.

## Limitations

- **No OAuth app here was ever submitted for approval.** Review-stage claims come from documentation, not experience. Real approval times are set by reviewer queues, and few providers publish an SLA.
- **Quote checking catches invention, not misreading.** It proves a sentence exists; it can't prove the right conclusion was drawn. That's how the Shopify error survived to the hand-check.
- **Six pages is a thin read**, and cross-product contamination is possible — a provider documenting several app surfaces can have a requirement from one attributed to another. Seeded guides are reviewed for this; live ones aren't, and are labelled `unreviewed`.
- **No re-verification job.** Every citation carries a fetch date, but an old guide can be confidently wrong.
- **Four seeded guides still show "Not established."** They predate the rendering fallback and would likely improve on regeneration.

**On the free tier:** Groq allows 8,000 tokens per minute and 200,000 per day, per model. That shaped real decisions — adjudication is split in two because one call large enough to write a whole guide could never fit, and a governor paces requests against the live rate-limit headers. A daily cap can't be waited out inside a request, so it's detected and the run falls through a chain of other models rather than failing. A paid model would be faster and read more pages; the provider sits behind one interface, so that's an env-var change.

## Layout

```
data/sources/        upstream docs committed verbatim, for reproducibility
data/review-notes/   what a person concluded after checking each guide
scripts/             catalog build, single-guide CLI, library seeding
src/lib/
  schema.ts          the guide shape; evidence levels; nullable rubric
  rubric.ts          deriveTier, confidenceFor, planStack — pure functions
  groq.ts            model tiers, token ledger, rate governor, fallbacks
  research/          discovery, relevance scoring, the pipeline, verification
src/app/             library, guide pages, /generate, /plan, /method, JSON API
```

## What I'd do next

1. **Re-verify on a schedule.** Re-fetch each guide's citations and flag quotes that have moved. Staleness is the biggest threat to trust here and the cheapest thing to fix.
2. **Let the agent attempt the setup.** The handoff split is already machine-readable at `/api/guides/<slug>`. Driving a real console and recording the observed path would promote claims from *cited* to *verified* — the evidence level the schema supports but nothing currently reaches.
3. **Take corrections from developers.** Someone who has actually been through Salesforce's security review knows something no document states. That would beat any amount of extra crawling.

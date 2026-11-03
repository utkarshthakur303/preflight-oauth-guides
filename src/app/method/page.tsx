import type { Metadata } from "next";
import Link from "next/link";
import { CATALOG, allGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Method — Preflight",
  description:
    "How guides are produced, how evidence is labelled and checked, and what this approach cannot do.",
};

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="p-4">
      <p className="mono text-[22px] font-semibold leading-none">{n}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{label}</p>
    </div>
  );
}

export default function MethodPage() {
  const guides = allGuides();
  const totalPagesDiscovered = guides.reduce(
    (n, g) => n + g.generation.docPagesDiscovered,
    0,
  );
  const totalPagesRead = guides.reduce((n, g) => n + g.generation.docPagesRead, 0);
  const totalTokens = guides.reduce(
    (n, g) => n + g.generation.models.reduce((m, x) => m + x.inputTokens + x.outputTokens, 0),
    0,
  );
  const totalCitations = guides.reduce((n, g) => n + g.sources.length, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">
        How these guides are made, and what they can&rsquo;t tell you
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        Guidance about approval timelines is only worth something if you can tell
        which parts are known and which are guesses. Everything below is about
        making that distinction visible rather than asking you to trust the
        output.
      </p>

      {guides.length > 0 && (
        <div className="card mt-6 grid divide-y hairline sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Stat n={totalPagesDiscovered.toLocaleString()} label="doc pages found across the library" />
          <Stat n={String(totalPagesRead)} label="pages actually read" />
          <Stat n={`${(totalTokens / 1000).toFixed(0)}k`} label="tokens spent, total" />
          <Stat n={String(totalCitations)} label="citations that survived checking" />
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold tracking-tight">Why this scope</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Composio&rsquo;s own{" "}
          <a className="brand-link" href={CATALOG.source.url} target="_blank" rel="noreferrer">
            managed OAuth apps directory
          </a>{" "}
          splits its catalog in two: {CATALOG.counts.managedOAuth} toolkits where
          Composio provides the OAuth app, and {CATALOG.counts.bringYourOwn} where
          the developer has to register their own. Strip out the vendor-hosted MCP
          toolkits, whose setup is a different problem, and{" "}
          {CATALOG.counts.bringYourOwnExcludingMcp} first-party apps remain. That
          is the library this is scoped to, and it is read out of their directory
          at build time rather than chosen by me.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Guides for managed toolkits still matter, which is why a couple are
          included. Composio&rsquo;s documentation lists concrete reasons to bring
          your own app anyway: your brand on the consent screen, scopes beyond
          their defaults, trigger polling faster than their two-minute floor, and
          rate limits that are otherwise shared across every Composio customer.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold tracking-tight">The pipeline</h2>
        <ol className="mt-3 space-y-3">
          {[
            {
              n: "1",
              t: "Locate",
              d: "A model proposes where the provider's developer docs might live. It only ever proposes — nothing it suggests is used unless a real HTTP request confirms the page exists.",
              cost: "1 call",
            },
            {
              n: "2",
              t: "Discover",
              d: "Read /llms.txt, then /llms-full.txt, then the sitemaps declared in robots.txt, then conventional sitemap paths, then the docs root's own links. Gzipped sitemaps are decompressed and sitemap indexes followed. Every candidate host is probed and the results merged, ranked by how many plausible pages each yields.",
              cost: "free",
            },
            {
              n: "3",
              t: "Shortlist",
              d: "Score URLs on path patterns alone. Approval and distribution pages score highest, generated API reference is penalised hard, non-English locale copies are dropped. Tens of thousands of pages become about two hundred.",
              cost: "free",
            },
            {
              n: "4",
              t: "Triage",
              d: "gpt-oss-20b ranks those two hundred by whether the page plausibly explains registering an OAuth app, in batches of forty.",
              cost: "~5 calls",
            },
            {
              n: "5",
              t: "Read & extract",
              d: "Fetch the winners, preferring each page's .md twin over its HTML. Spread the reads across topics — registering, approval, requirements, scopes — so one topic can't crowd out the rest. gpt-oss-20b pulls claims, each with a verbatim quote.",
              cost: "~6 calls",
            },
            {
              n: "6",
              t: "Adjudicate",
              d: "gpt-oss-120b turns those claims into a guide. It never sees a raw documentation page, only short quoted claims, which keeps its input near 3k tokens instead of 40k.",
              cost: "2 calls",
            },
            {
              n: "7",
              t: "Verify",
              d: "Every quote is checked against the text actually fetched. A quote that isn't there loses its citation, and the claim is demoted from cited to inferred.",
              cost: "free",
            },
          ].map((s) => (
            <li key={s.n} className="card flex gap-3 p-4">
              <span
                className="mono grid h-6 w-6 shrink-0 place-items-center rounded text-[11px] font-semibold"
                style={{ background: "var(--brand-wash)", color: "var(--brand)" }}
              >
                {s.n}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-[13.5px] font-semibold">{s.t}</h3>
                  <span className="mono text-[11px] text-muted">{s.cost}</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Two of the seven stages cost nothing, and they do the heaviest
          narrowing. That is the whole reason this runs on a free model tier.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold tracking-tight">
          Why a model never decides how hard something is
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          A model is asked for five measurable things — keyboard minutes, review
          wait in business days, steps only a person can do, money required, and
          artifacts you must already have. The tier is then computed from those
          by a pure function, as the worst floor any single dimension demands.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Not a weighted average, deliberately: four easy dimensions should not
          be able to hide one disqualifying requirement. &ldquo;You need a SOC 2
          report&rdquo; is not offset by a quick signup form. Because the tier is
          arithmetic over published numbers, two guides are comparable, and you
          can check the result yourself on any guide page.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Confidence is computed separately and never mixed in. How hard setup is
          and how much we actually know are different questions, and a single
          blended score would hide both.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold tracking-tight">
          Null is not zero
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Every dimension can be null, meaning we looked and could not establish
          it. A null contributes nothing to the tier and drags the guide&rsquo;s
          confidence to low, and the guide says which dimensions the tier is
          blind to.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          This matters more than it sounds. A review wait of{" "}
          <span className="mono">{"{min: 0, max: 0}"}</span> asserts that nobody
          reviews your app — a strong, checkable claim. Not having found a review
          process is a shrug. Early versions of the prompt conflated the two and
          produced guides that cheerfully promised no approval was needed for
          providers that certainly require one.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold tracking-tight">
          What this cannot do
        </h2>
        <ul className="mt-3 space-y-2">
          {[
            ["Only public documentation is read.", "Real approval times are set by reviewer queues, not docs. Where a provider publishes no SLA, the wait is marked unknown rather than estimated."],
            ["Cross-product contamination is possible.", "A provider may document several app surfaces. With only six pages read, a requirement belonging to one product can be attributed to another. Seeded guides are checked by hand for this; live ones are not."],
            ["Nothing here was submitted for approval.", "No OAuth app in this project was taken through a real review. Review-stage claims come from documentation, not from experience."],
            ["Docs go stale and so does this.", "Every citation carries a fetch date. There is no re-verification job yet, so an old guide can be confidently wrong."],
            ["Quote checking catches invention, not misreading.", "Verification proves a sentence exists on the page. It cannot prove the model drew the right conclusion from it."],
          ].map(([t, d]) => (
            <li key={t} className="card p-4">
              <p className="text-[13.5px] font-semibold">{t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold tracking-tight">
          Running inside a free tier
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Both models are free on Groq, capped at 8,000 tokens per minute each —
          and <span className="mono">max_completion_tokens</span> is reserved
          against that budget before generation starts, so a request that merely
          asks for a large response can fail on its own. That single limit shaped
          the architecture: adjudication is split into two calls because one call
          large enough to emit a whole guide could never fit, pages are truncated,
          and a governor reads the rate-limit headers off every response and waits
          when the next call wouldn&rsquo;t fit.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          The result is a guide in two to three minutes for zero cost. A paid
          model would be faster and would read more pages; the provider sits
          behind one interface, so that is an env-var change rather than a
          rewrite.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-2">
        <Link
          href="/generate"
          className="btn btn-primary"
        >
          Watch it run
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/"
          className="btn"
        >
          Back to the library
        </Link>
      </div>
    </div>
  );
}

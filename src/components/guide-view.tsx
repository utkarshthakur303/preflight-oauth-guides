import Link from "next/link";
import {
  CONFIDENCE_META,
  TIER_META,
  confidenceFor,
  deriveTier,
  isUngrounded,
} from "@/lib/rubric";
import type { Citation, Guide } from "@/lib/schema";
import {
  ActorBadge,
  ConfidenceBadge,
  EvidenceBadge,
  ManagedAuthBadge,
  TierBadge,
  UngroundedBadge,
} from "@/components/badges";

/**
 * The guide document.
 *
 * Shared, deliberately, between the library's static pages and the live
 * generation view. A guide produced on demand in front of an interviewer is
 * rendered by exactly the same code as a seeded one, so there is no chance of
 * the demo looking better than the real thing — or worse.
 *
 * Plain presentational component with no hooks and no server-only imports, so
 * it compiles into both the server and client graphs.
 */

/** Citations live in a <details> so the page prints and needs no JavaScript. */
function Citations({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <details className="mt-2 group">
      <summary className="mono cursor-pointer list-none text-[11px] text-muted hover:text-foreground">
        {citations.length} source{citations.length === 1 ? "" : "s"}{" "}
        <span className="group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span>
      </summary>
      <ul className="mt-2 space-y-2 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
        {citations.map((c, i) => (
          <li key={i} className="text-[12px] leading-relaxed">
            <blockquote className="text-foreground">&ldquo;{c.quote}&rdquo;</blockquote>
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="mono brand-link mt-1 inline-block break-all text-[10.5px]"
            >
              {c.url.replace(/^https?:\/\//, "")}
            </a>
            <span className="mono ml-2 text-[10.5px] text-muted">
              fetched {c.fetchedAt.slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Dimension({
  label,
  value,
  node,
  tone,
}: {
  label: string;
  value: string;
  node: { evidence: Guide["rubric"]["costUsd"]["evidence"]; citations: Citation[]; reasoning?: string };
  tone?: string;
}) {
  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        <EvidenceBadge level={node.evidence} />
      </div>
      <p
        className="mono mt-1.5 text-[17px] font-semibold leading-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {node.reasoning && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{node.reasoning}</p>
      )}
      <Citations citations={node.citations} />
    </div>
  );
}

export function GuideView({ g, showBackLink = true }: { g: Guide; showBackLink?: boolean }) {
  const r = g.rubric;
  const ungrounded = isUngrounded(r);
  const w = r.reviewWaitBusinessDays.value;
  const cost = r.costUsd.value;
  const prereqs = r.prerequisiteArtifacts.value;
  const blockers = r.humanOnlyBlockers.value;

  // Recomputed here rather than read from the file: the tier is a pure function
  // of the rubric, so showing it derived proves the stored value wasn't editorial.
  const recomputed = deriveTier(r);
  const recomputedConfidence = confidenceFor(r, {
    unresolvedConflicts: g.conflicts.filter((c) =>
      /unresolved|cannot|could not|unclear/i.test(c.resolution),
    ).length,
  });

  const agentSteps = g.steps.filter((s) => s.actor !== "human");
  const humanSteps = g.steps.filter((s) => s.actor === "human");
  const totals = g.generation.models.reduce(
    (a, m) => ({
      calls: a.calls + m.calls,
      input: a.input + m.inputTokens,
      output: a.output + m.outputTokens,
    }),
    { calls: 0, input: 0, output: 0 },
  );

  return (
    <article className="mx-auto max-w-3xl">
      {showBackLink && (
        <nav className="no-print mb-5 text-[12.5px]">
          <Link href="/" className="brand-link">
            ← Library
          </Link>
        </nav>
      )}

      <header>
        <div className="flex flex-wrap items-center gap-2">
          {ungrounded ? <UngroundedBadge size="lg" /> : <TierBadge tier={g.tier} size="lg" />}
          <ConfidenceBadge confidence={g.confidence} />
          <ManagedAuthBadge managed={g.composioManagedOAuth} />
          {g.generation.origin === "live" && (
            <span className="mono rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-muted"
              style={{ background: "color-mix(in oklab, var(--muted) 10%, transparent)" }}
              title="Generated on demand and not reviewed by a person.">
              unreviewed
            </span>
          )}
        </div>

        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
          Registering your own OAuth app with {g.appName}
        </h1>

        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{g.summary}</p>

        <div className="mono mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
          {g.developerConsoleUrl.value && (
            <a className="brand-link" href={g.developerConsoleUrl.value} target="_blank" rel="noreferrer">
              developer console ↗
            </a>
          )}
          {g.composioToolkitSlug && (
            <a
              className="brand-link"
              href={`https://docs.composio.dev/toolkits/${g.composioToolkitSlug.toLowerCase()}`}
              target="_blank"
              rel="noreferrer"
            >
              composio toolkit ↗
            </a>
          )}
          <a className="brand-link" href={`/api/guides/${g.slug}`}>
            json for agents ↗
          </a>
        </div>
      </header>

      {/* Why this tier — the arithmetic, shown. */}
      {ungrounded ? (
        <section
          className="mt-7 rounded-xl border p-4"
          style={{
            borderColor: "color-mix(in oklab, var(--ev-unknown) 40%, transparent)",
            background: "color-mix(in oklab, var(--ev-unknown) 7%, transparent)",
          }}
        >
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--ev-unknown)" }}>
            Nothing here was established
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed">
            None of the five dimensions could be read out of this
            provider&rsquo;s documentation, so no difficulty is reported — a
            tier would be a fabrication. The investigation is recorded below so
            you can see what was attempted and pick up where it stopped.
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            The usual cause is documentation rendered in the browser: the pages
            exist and were located, but the server returns a shell with no prose
            in it. Reading those needs a JavaScript-rendering fetch, which this
            project does not do.
          </p>
        </section>
      ) : (
      <section className="card mt-7 p-4">
        <h2 className="text-[13px] font-semibold">
          Why this is {TIER_META[g.tier].label.toLowerCase()}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          The tier is not a judgement. It is the worst floor demanded by any one
          dimension below, because the hardest requirement is what decides when
          you ship.
        </p>
        <ul className="mt-3 space-y-1.5">
          {g.tierRationale.map((reason, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
              <span aria-hidden className="mono shrink-0 text-muted">
                →
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
        {recomputed.tier !== g.tier && (
          <p className="mono mt-3 text-[11px]" style={{ color: "var(--ev-unknown)" }}>
            stored tier ({g.tier}) disagrees with the tier recomputed from the
            rubric ({recomputed.tier}) — the stored file is stale
          </p>
        )}
        <p className="mono mt-3 text-[11px] text-muted">
          {CONFIDENCE_META[g.confidence].label.toLowerCase()}:{" "}
          {recomputedConfidence.why}
        </p>
      </section>
      )}

      {/* The five dimensions. */}
      <section className="mt-5">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">
          The five things that decide the timeline
        </h2>
        <div className="card grid divide-y hairline sm:grid-cols-2 sm:divide-x">
          <Dimension
            label="Hands-on setup"
            value={
              r.selfServeMinutes.value === null
                ? "unknown"
                : r.selfServeMinutes.value >= 120
                  ? `${Math.round(r.selfServeMinutes.value / 60)} hours`
                  : `${r.selfServeMinutes.value} minutes`
            }
            node={r.selfServeMinutes}
          />
          <Dimension
            label="Waiting for the provider"
            value={
              w === null
                ? "unknown"
                : w.max === 0
                  ? "nobody reviews you"
                  : w.min === w.max
                    ? `${w.max} business days`
                    : `${w.min}–${w.max} business days`
            }
            node={r.reviewWaitBusinessDays}
            tone={w && w.max > 10 ? "var(--tier-4)" : w && w.max > 0 ? "var(--tier-2)" : undefined}
          />
          <Dimension
            label="Money required"
            value={
              cost === null
                ? "unknown"
                : cost.amount === 0
                  ? "nothing"
                  : `$${cost.amount}${cost.recurrence === "none" ? "" : ` / ${cost.recurrence.replace("_", " ")}`}`
            }
            node={r.costUsd}
            tone={cost && cost.amount > 0 ? "var(--tier-3)" : undefined}
          />
          <Dimension
            label="Things you must already have"
            value={
              prereqs === null
                ? "unknown"
                : prereqs.length === 0
                  ? "nothing"
                  : `${prereqs.length} artifact${prereqs.length === 1 ? "" : "s"}`
            }
            node={r.prerequisiteArtifacts}
          />
          <div className="p-4 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-medium text-muted">
                Steps only a person can do
              </p>
              <EvidenceBadge level={r.humanOnlyBlockers.evidence} />
            </div>
            {blockers === null ? (
              <p className="mono mt-1.5 text-[17px] font-semibold">unknown</p>
            ) : blockers.length === 0 ? (
              <p className="mono mt-1.5 text-[17px] font-semibold" style={{ color: "var(--tier-0)" }}>
                none — an agent can do all of it
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {blockers.map((b, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2 text-[13px]">
                    <span
                      className="mono rounded px-1.5 py-0.5 text-[10.5px] uppercase"
                      style={{
                        color: "var(--tier-3)",
                        background: "color-mix(in oklab, var(--tier-3) 10%, transparent)",
                      }}
                    >
                      {b.reason.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted">{b.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {r.humanOnlyBlockers.reasoning && (
              <p className="mt-1.5 text-[12px] text-muted">{r.humanOnlyBlockers.reasoning}</p>
            )}
            <Citations citations={r.humanOnlyBlockers.citations} />
          </div>
        </div>

        {prereqs && prereqs.length > 0 && (
          <div className="mono mt-2 flex flex-wrap gap-1.5">
            {prereqs.map((p) => (
              <span
                key={p}
                className="rounded border px-2 py-0.5 text-[11px] text-muted"
                style={{ borderColor: "var(--border)" }}
              >
                {p.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Steps. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">What to do</h2>
          <p className="mono text-[11px] text-muted">
            {agentSteps.length} an agent can do · {humanSteps.length} you must do
          </p>
        </div>

        {g.steps.length === 0 ? (
          <p className="card mt-2 p-4 text-[13px] text-muted">
            No procedure could be established from the provider&rsquo;s
            documentation. The open questions below are the place to start.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {g.steps.map((s, i) => (
              <li key={i} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="mono mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-semibold"
                    style={{ background: "var(--brand-wash)", color: "var(--brand)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13.5px] font-semibold">{s.title}</h3>
                      <ActorBadge actor={s.actor} reason={s.humanOnlyReason} />
                      {s.estimatedMinutes ? (
                        <span className="mono text-[11px] text-muted">
                          ~{s.estimatedMinutes}m
                        </span>
                      ) : null}
                      <span className="ml-auto">
                        <EvidenceBadge level={s.evidence} compact />
                      </span>
                    </div>

                    {s.where && (
                      <p className="mono mt-1 text-[11.5px]" style={{ color: "var(--brand)" }}>
                        {s.where}
                      </p>
                    )}
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.detail}</p>

                    {s.startsReviewWait && (
                      <p
                        className="mono mt-2 rounded px-2 py-1 text-[11px]"
                        style={{
                          background: "color-mix(in oklab, var(--tier-2) 10%, transparent)",
                          color: "var(--tier-2)",
                        }}
                      >
                        ⏳ the wait starts here
                        {w && w.max > 0 ? ` — ${w.min}–${w.max} business days` : ""}
                      </p>
                    )}

                    <Citations citations={s.citations} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Nuances. */}
      {g.nuances.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Things that catch people out
          </h2>
          <div className="mt-3 space-y-2">
            {g.nuances
              .slice()
              .sort(
                (a, b) =>
                  ["blocker", "gotcha", "note"].indexOf(a.severity) -
                  ["blocker", "gotcha", "note"].indexOf(b.severity),
              )
              .map((n, i) => {
                const color =
                  n.severity === "blocker"
                    ? "var(--tier-4)"
                    : n.severity === "gotcha"
                      ? "var(--tier-2)"
                      : "var(--muted)";
                return (
                  <div
                    key={i}
                    className="card border-l-[3px] p-4"
                    style={{ borderLeftColor: color }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="mono rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide"
                        style={{ color, background: `color-mix(in oklab, ${color} 10%, transparent)` }}
                      >
                        {n.severity}
                      </span>
                      <h3 className="text-[13.5px] font-semibold">{n.title}</h3>
                      <span className="ml-auto">
                        <EvidenceBadge level={n.evidence} compact />
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{n.detail}</p>
                    <Citations citations={n.citations} />
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* When you get stuck. */}
      {g.whenBlocked.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[15px] font-semibold tracking-tight">
            When you get stuck
          </h2>
          <dl className="card mt-3 divide-y hairline">
            {g.whenBlocked.map((b, i) => (
              <div key={i} className="p-4">
                <dt className="text-[13px] font-semibold">{b.situation}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-muted">
                  {b.action}
                  {b.contact && (
                    <span className="mono mt-1 block text-[11.5px]" style={{ color: "var(--brand)" }}>
                      {b.contact}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Disagreement between sources. */}
      {g.conflicts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Where the sources disagree
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Recorded rather than averaged. A midpoint between two contradictory
            documents is a number nobody published.
          </p>
          <div className="mt-3 space-y-2">
            {g.conflicts.map((c, i) => (
              <div key={i} className="card p-4">
                <h3 className="text-[13.5px] font-semibold">{c.about}</h3>
                <ul className="mt-2 space-y-2">
                  {c.positions.map((p, j) => (
                    <li key={j} className="border-l-2 pl-3 text-[12.5px]" style={{ borderColor: "var(--border)" }}>
                      <p className="font-medium">{p.claim}</p>
                      <blockquote className="mt-0.5 text-muted">
                        &ldquo;{p.citation.quote}&rdquo;
                      </blockquote>
                      <a
                        className="mono brand-link break-all text-[10.5px]"
                        href={p.citation.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.citation.url.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12.5px]">
                  <span className="font-medium">How we resolved it: </span>
                  <span className="text-muted">{c.resolution}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* What we could not establish. */}
      {g.openQuestions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[15px] font-semibold tracking-tight">
            What we could not establish
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Left visible on purpose. A gap you can see is more useful than a
            number we invented.
          </p>
          <div className="mt-3 space-y-2">
            {g.openQuestions.map((q, i) => (
              <div key={i} className="card p-4">
                <h3 className="text-[13.5px] font-semibold">{q.question}</h3>
                {q.whyItMatters && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                    {q.whyItMatters}
                  </p>
                )}
                {q.howToResolve && (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed">
                    <span className="font-medium">To settle it: </span>
                    <span className="text-muted">{q.howToResolve}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Provenance. */}
      <section className="mt-10 border-t hairline pt-5">
        <h2 className="text-[13px] font-semibold">How this guide was produced</h2>
        <dl className="mono mt-3 grid gap-x-6 gap-y-1.5 text-[11.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">generated</dt>
            <dd>{g.generation.generatedAt.slice(0, 16).replace("T", " ")}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">pages discovered</dt>
            <dd>{g.generation.docPagesDiscovered.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">pages read</dt>
            <dd>{g.generation.docPagesRead}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">verified citations</dt>
            <dd>{g.sources.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">model calls</dt>
            <dd>{totals.calls}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">tokens</dt>
            <dd>
              {totals.input.toLocaleString()} in / {totals.output.toLocaleString()} out
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">wall clock</dt>
            <dd>{(g.generation.durationMs / 1000).toFixed(1)}s</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">origin</dt>
            <dd>{g.generation.origin}</dd>
          </div>
        </dl>

        <ul className="mono mt-3 space-y-1 text-[11px] text-muted">
          {g.generation.models.map((m, i) => (
            <li key={i}>
              {m.role.padEnd(11, " ")} {m.model} — {m.calls} calls,{" "}
              {m.inputTokens.toLocaleString()} in / {m.outputTokens.toLocaleString()} out
            </li>
          ))}
        </ul>

        {g.generation.reviewNote && (
          <div
            className="mt-4 rounded-lg border p-3 text-[12.5px] leading-relaxed"
            style={{
              borderColor: "color-mix(in oklab, var(--ev-verified) 35%, transparent)",
              background: "color-mix(in oklab, var(--ev-verified) 7%, transparent)",
            }}
          >
            <p className="mono mb-1 text-[10.5px] uppercase tracking-wide" style={{ color: "var(--ev-verified)" }}>
              reviewed by hand
            </p>
            {g.generation.reviewNote}
          </div>
        )}

        {g.sources.length > 0 && (
          <details className="mt-4">
            <summary className="mono cursor-pointer text-[11.5px] text-muted hover:text-foreground">
              every source consulted ({g.sources.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {g.sources.map((s, i) => (
                <li key={i} className="mono text-[11px]">
                  <a className="brand-link break-all" href={s.url} target="_blank" rel="noreferrer">
                    {s.url.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </article>
  );
}

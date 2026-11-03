"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Guide } from "@/lib/schema";
import { TIER_META, planStack } from "@/lib/rubric";
import { ConfidenceBadge, TierBadge } from "./badges";

/**
 * The launch planner.
 *
 * A developer wiring up an agent connects eight apps, not one, so "how hard is
 * Shopify" is the wrong question. The one they actually have is "when can we
 * launch, and which of these is going to wreck the date" — and that has a
 * different answer from any individual guide, because provider reviews run in
 * parallel while your own keyboard work does not.
 *
 * It reports its own weakest link rather than a single confident number. A
 * launch date inherited from a guide with an unknown review wait is a guess
 * wearing a suit.
 */

function businessDaysToDate(days: number): string {
  if (days <= 0) return "today";
  const d = new Date();
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function Planner({ guides }: { guides: Guide[] }) {
  const [selected, setSelected] = useState<string[]>(() =>
    guides.slice(0, Math.min(3, guides.length)).map((g) => g.slug),
  );

  const chosen = useMemo(
    () => guides.filter((g) => selected.includes(g.slug)),
    [guides, selected],
  );
  const plan = useMemo(() => planStack(chosen), [chosen]);

  const toggle = (slug: string) =>
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  const maxWait = Math.max(1, ...plan.apps.map((a) => a.reviewWaitMax));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">
          Which apps does your agent need?
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Only apps with a guide can be planned. Generate more from the{" "}
          <Link href="/generate" className="brand-link">
            investigate page
          </Link>
          .
        </p>

        <ul className="mt-3 space-y-1.5">
          {guides.map((g) => {
            const on = selected.includes(g.slug);
            return (
              <li key={g.slug}>
                <label
                  className="card flex cursor-pointer items-center gap-3 p-3 transition-colors"
                  style={{
                    borderColor: on ? "var(--brand)" : "var(--border)",
                    background: on ? "var(--brand-wash)" : "var(--card)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(g.slug)}
                    className="accent-[var(--brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {g.appName}
                    </span>
                    <span className="mono block text-[11px] text-muted">
                      {g.rubric.selfServeMinutes.value ?? "?"}m setup ·{" "}
                      {g.rubric.reviewWaitBusinessDays.value
                        ? `${g.rubric.reviewWaitBusinessDays.value.max}d review`
                        : "review unknown"}
                    </span>
                  </span>
                  <TierBadge tier={g.tier} size="sm" />
                </label>
              </li>
            );
          })}
        </ul>

        {/* Gantt-ish view: approvals in parallel, so the longest bar is the date. */}
        {plan.apps.length > 0 && (
          <div className="card mt-5 p-4">
            <h3 className="text-[13px] font-semibold">Critical path</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Submit everything on day one and the reviews overlap, so the
              longest bar sets the date — unless your own setup work outlasts it.
            </p>
            <ul className="mt-3 space-y-2">
              {plan.apps
                .slice()
                .sort((a, b) => b.reviewWaitMax - a.reviewWaitMax)
                .map((a) => (
                  <li key={a.slug} className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
                    <Link
                      href={`/guide/${a.slug}`}
                      className="brand-link truncate text-[12px]"
                    >
                      {a.appName}
                    </Link>
                    <span
                      className="h-3 overflow-hidden rounded-sm"
                      style={{ background: "color-mix(in oklab, var(--muted) 12%, transparent)" }}
                    >
                      <span
                        className="block h-full rounded-sm"
                        style={{
                          width: `${Math.max(2, (a.reviewWaitMax / maxWait) * 100)}%`,
                          background: a.isLongPole ? "var(--tier-4)" : "var(--brand)",
                          opacity: a.reviewWaitMax === 0 ? 0.25 : 1,
                        }}
                      />
                    </span>
                    <span className="mono shrink-0 text-[11px] text-muted">
                      {a.reviewWaitMax === 0 ? "none" : `${a.reviewWaitMax}d`}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        {chosen.length === 0 ? (
          <div className="card p-4 text-[13px] text-muted">
            Pick at least one app.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="p-4" style={{ background: "var(--brand-wash)" }}>
              <p className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--brand)" }}>
                earliest realistic launch
              </p>
              <p className="mono mt-1 text-[26px] font-semibold leading-none">
                {plan.businessDays.pessimistic}
                <span className="ml-1 text-[13px] font-normal text-muted">
                  business day{plan.businessDays.pessimistic === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-1 text-[12px] text-muted">
                about {businessDaysToDate(plan.businessDays.pessimistic)}
                {plan.businessDays.optimistic !== plan.businessDays.pessimistic && (
                  <>
                    {" "}
                    · best case {plan.businessDays.optimistic}d
                  </>
                )}
              </p>
            </div>

            {plan.longPole && (
              <div className="border-t hairline p-4">
                <p className="mono text-[11px] uppercase tracking-wide text-muted">
                  long pole
                </p>
                <Link href={`/guide/${plan.longPole.slug}`} className="brand-link mt-0.5 block text-[14px] font-semibold">
                  {plan.longPole.appName}
                </Link>
                <p className="text-[12px] text-muted">{plan.longPole.reason}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                  Start this one first. Everything else can wait without costing
                  you a day.
                </p>
              </div>
            )}

            <dl className="mono divide-y hairline border-t hairline text-[12px]">
              <div className="flex justify-between p-3">
                <dt className="text-muted">your keyboard time</dt>
                <dd>
                  {plan.totalSelfServeMinutes >= 120
                    ? `${(plan.totalSelfServeMinutes / 60).toFixed(1)}h`
                    : `${plan.totalSelfServeMinutes}m`}
                </dd>
              </div>
              <div className="flex justify-between p-3">
                <dt className="text-muted">steps only you can do</dt>
                <dd>{plan.totalHumanOnlySteps}</dd>
              </div>
              <div className="flex justify-between p-3">
                <dt className="text-muted">money required</dt>
                <dd style={plan.totalCostUsd > 0 ? { color: "var(--tier-3)" } : undefined}>
                  ${plan.totalCostUsd}
                </dd>
              </div>
              <div className="flex items-center justify-between p-3">
                <dt className="text-muted">weakest guide</dt>
                <dd>
                  <ConfidenceBadge confidence={plan.weakestConfidence} />
                </dd>
              </div>
            </dl>

            {plan.notes.length > 0 && (
              <ul className="space-y-2 border-t hairline p-4">
                {plan.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                    <span aria-hidden className="mono shrink-0 text-muted">
                      !
                    </span>
                    <span className="text-muted">{n}</span>
                  </li>
                ))}
              </ul>
            )}

            <div
              className="border-t hairline p-3 text-[11.5px] leading-relaxed text-muted"
              style={{ background: "color-mix(in oklab, var(--muted) 4%, transparent)" }}
            >
              Reviews are assumed to run in parallel and your setup work to run
              serially, as one developer. Unknown dimensions count as zero, which
              makes this optimistic — read the weakest-guide figure above before
              you promise anyone a date.
            </div>
          </div>
        )}

        {chosen.length > 0 && (
          <div className="card mt-3 p-4">
            <p className="text-[12.5px] font-medium">Tier mix</p>
            <ul className="mt-2 space-y-1">
              {(["enterprise", "weeks", "days", "same_day", "instant"] as const)
                .map((t) => ({ t, n: chosen.filter((g) => g.tier === t).length }))
                .filter((x) => x.n > 0)
                .map(({ t, n }) => (
                  <li key={t} className="flex items-center justify-between gap-2">
                    <TierBadge tier={t} size="sm" />
                    <span className="mono text-[11px] text-muted">{n}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              {TIER_META[
                chosen.reduce(
                  (worst, g) =>
                    TIER_META[g.tier].order > TIER_META[worst].order ? g.tier : worst,
                  "instant" as Guide["tier"],
                )
              ].blurb}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Guide, Tier } from "@/lib/schema";
import { TIER_META, isUngrounded } from "@/lib/rubric";
import {
  ConfidenceBadge,
  ManagedAuthBadge,
  TierBadge,
  TierLadder,
  NoOAuthBadge,
  UngroundedBadge,
} from "./badges";

/**
 * The library view.
 *
 * Sorted by tier rather than alphabetically, because the question a developer
 * arrives with is "which of these is going to hurt" — and the answer should be
 * readable before they type anything.
 */

const TIERS: Tier[] = ["instant", "same_day", "days", "weeks", "enterprise"];

function waitLabel(g: Guide): string {
  const w = g.rubric.reviewWaitBusinessDays.value;
  if (w === null) return "review wait unknown";
  if (w.max === 0) return "no review";
  if (w.min === w.max) return `${w.max}d review`;
  return `${w.min}–${w.max}d review`;
}

function setupLabel(g: Guide): string {
  const m = g.rubric.selfServeMinutes.value;
  if (m === null) return "setup unknown";
  if (m >= 120) return `${Math.round(m / 60)}h setup`;
  return `${m}m setup`;
}

export function GuideCard({ guide }: { guide: Guide }) {
  const noOAuth = guide.oauthSupported?.value === false;
  const ungrounded = !noOAuth && isUngrounded(guide.rubric);
  const humanSteps = guide.steps.filter((s) => s.actor === "human").length;
  const agentSteps = guide.steps.filter((s) => s.actor !== "human").length;
  const cost = guide.rubric.costUsd.value;

  return (
    <Link
      href={`/guide/${guide.slug}`}
      className="card group flex flex-col gap-3 p-4 transition-shadow hover:shadow-[0_2px_10px_var(--soft-shadow)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight">
            {guide.appName}
          </h3>
          <p className="mono mt-0.5 truncate text-[11px] text-muted">
            {guide.composioToolkitSlug ?? guide.slug}
          </p>
        </div>
        {noOAuth ? (
          <NoOAuthBadge size="sm" />
        ) : ungrounded ? (
          <UngroundedBadge size="sm" />
        ) : (
          <TierBadge tier={guide.tier} size="sm" />
        )}
      </div>

      <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
        {guide.summary ||
          (ungrounded
            ? "This provider's documentation could not be read, so nothing about its setup was established."
            : TIER_META[guide.tier].blurb)}
      </p>

      <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
        <span>{setupLabel(guide)}</span>
        <span aria-hidden>·</span>
        <span>{waitLabel(guide)}</span>
        {cost && cost.amount > 0 && (
          <>
            <span aria-hidden>·</span>
            <span style={{ color: "var(--tier-3)" }}>${cost.amount}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>
          {agentSteps} agent / {humanSteps} you
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t hairline pt-3">
        <ConfidenceBadge confidence={guide.confidence} />
        <ManagedAuthBadge managed={guide.composioManagedOAuth} />
      </div>
    </Link>
  );
}

export function Library({
  guides,
  remainingCount,
}: {
  guides: Guide[];
  remainingCount: number;
}) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [byoOnly, setByoOnly] = useState(false);

  const counts = useMemo(() => {
    const c = new Map<Tier, number>();
    for (const g of guides) {
      if (isUngrounded(g.rubric)) continue;
      c.set(g.tier, (c.get(g.tier) ?? 0) + 1);
    }
    return c;
  }, [guides]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return guides
      .slice()
      // Guides with no evidence sink to the bottom: they are a record of a
      // failed investigation, not a recommendation.
      .sort((a, b) => Number(isUngrounded(a.rubric)) - Number(isUngrounded(b.rubric)))
      .filter((g) => {
      if (tier !== "all" && (g.tier !== tier || isUngrounded(g.rubric))) return false;
      if (byoOnly && g.composioManagedOAuth !== false) return false;
      if (!needle) return true;
      return (
        g.appName.toLowerCase().includes(needle) ||
        g.providerName.toLowerCase().includes(needle) ||
        (g.composioToolkitSlug ?? "").toLowerCase().includes(needle)
      );
    });
  }, [guides, q, tier, byoOnly]);

  return (
    <section>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter the library…"
          aria-label="Filter guides"
          className="card w-full max-w-xs px-3 py-2 text-[13px] outline-none sm:w-auto"
          style={{ background: "var(--card)" }}
        />

        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setTier("all")}
            className={`mono rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
              tier === "all" ? "text-foreground" : "text-muted"
            }`}
            style={{
              borderColor: tier === "all" ? "var(--brand)" : "var(--border)",
              background: tier === "all" ? "var(--brand-wash)" : "transparent",
            }}
          >
            all {guides.length}
          </button>
          {TIERS.filter((t) => counts.get(t)).map((t) => (
            <button
              key={t}
              onClick={() => setTier(tier === t ? "all" : t)}
              className="mono rounded-md border px-2.5 py-1.5 text-[11px] transition-colors"
              style={{
                borderColor: tier === t ? "var(--brand)" : "var(--border)",
                background: tier === t ? "var(--brand-wash)" : "transparent",
                color: tier === t ? "var(--foreground)" : "var(--muted)",
              }}
            >
              {TIER_META[t].label.toLowerCase()} {counts.get(t)}
            </button>
          ))}
        </div>

        <label className="mono ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={byoOnly}
            onChange={(e) => setByoOnly(e.target.checked)}
            className="accent-[var(--brand)]"
          />
          bring-your-own only
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[14px] font-medium">Nothing in the library matches.</p>
          <p className="mt-1 text-[13px] text-muted">
            {remainingCount} bring-your-own toolkits still have no guide. You can
            generate one now.
          </p>
          <Link
            href={`/generate${q.trim() ? `?app=${encodeURIComponent(q.trim())}` : ""}`}
            className="btn btn-primary mt-4"
          >
            {q.trim() ? `Investigate “${q.trim()}”` : "Generate a guide"}
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </div>
      )}

      {filtered.length > 1 && (
        <div className="mt-8 card p-4">
          <h4 className="text-[13px] font-semibold">Difficulty at a glance</h4>
          <p className="mt-1 text-[12.5px] text-muted">
            Position on the ladder is the tier. Height is the same scale for
            every app, so the comparison is honest.
          </p>
          <ul className="mt-3 space-y-2">
            {filtered.map((g) => (
              <li key={g.slug} className="flex items-center gap-3 text-[12.5px]">
                {isUngrounded(g.rubric) ? (
                  <span className="mono w-[115px] shrink-0 text-[10.5px]" style={{ color: "var(--ev-unknown)" }}>
                    not established
                  </span>
                ) : (
                  <TierLadder tier={g.tier} />
                )}
                <Link href={`/guide/${g.slug}`} className="brand-link truncate">
                  {g.appName}
                </Link>
                <span className="mono ml-auto shrink-0 text-[11px] text-muted">
                  {waitLabel(g)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

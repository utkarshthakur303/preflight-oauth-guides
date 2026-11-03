import type { Confidence, EvidenceLevel, Tier } from "@/lib/schema";
import { CONFIDENCE_META, TIER_META } from "@/lib/rubric";

/**
 * The visual vocabulary for the two things this product is trying to keep
 * separate in a reader's head: how hard setup is (tier) and how much we
 * actually know (evidence, confidence). They get different shapes as well as
 * different colours, because a reader skimming a page should not have to recall
 * which hue meant which axis.
 */

const TIER_COLOR: Record<Tier, string> = {
  instant: "var(--tier-0)",
  same_day: "var(--tier-1)",
  days: "var(--tier-2)",
  weeks: "var(--tier-3)",
  enterprise: "var(--tier-4)",
};

export function TierBadge({
  tier,
  size = "md",
}: {
  tier: Tier;
  size?: "sm" | "md" | "lg";
}) {
  const color = TIER_COLOR[tier];
  const pad =
    size === "lg" ? "px-3 py-1.5 text-sm" : size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-full font-medium ${pad}`}
      style={{ color, background: `color-mix(in oklab, ${color} 12%, transparent)` }}
      title={TIER_META[tier].blurb}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {TIER_META[tier].label}
    </span>
  );
}

/** A five-rung ladder showing where this tier sits. Position carries the meaning. */
export function TierLadder({ tier }: { tier: Tier }) {
  const order = TIER_META[tier].order;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="inline-block w-5 rounded-sm"
          style={{
            height: 4 + i * 2,
            background:
              i <= order
                ? TIER_COLOR[tier]
                : "color-mix(in oklab, var(--muted) 25%, transparent)",
          }}
        />
      ))}
    </span>
  );
}

const EV_META: Record<
  EvidenceLevel,
  { label: string; color: string; glyph: string; blurb: string }
> = {
  verified: {
    label: "verified",
    color: "var(--ev-verified)",
    glyph: "✓",
    blurb: "Checked against the provider's real console by hand.",
  },
  cited: {
    label: "cited",
    color: "var(--ev-cited)",
    glyph: "❝",
    blurb: "Quoted from a document we fetched. The quote was re-checked against that page.",
  },
  inferred: {
    label: "inferred",
    color: "var(--ev-inferred)",
    glyph: "≈",
    blurb: "Not stated in any source we found. Reasoned from adjacent facts.",
  },
  unknown: {
    label: "unknown",
    color: "var(--ev-unknown)",
    glyph: "?",
    blurb: "We looked and could not establish this. Treat it as a gap, not a zero.",
  },
};

export function EvidenceBadge({
  level,
  compact = false,
}: {
  level: EvidenceLevel;
  compact?: boolean;
}) {
  const m = EV_META[level];
  return (
    <span
      className={`mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide ${
        compact ? "" : "font-medium"
      }`}
      style={{
        color: m.color,
        borderColor: `color-mix(in oklab, ${m.color} 35%, transparent)`,
        background: `color-mix(in oklab, ${m.color} 8%, transparent)`,
      }}
      title={m.blurb}
    >
      <span aria-hidden>{m.glyph}</span>
      {m.label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const color =
    confidence === "high"
      ? "var(--ev-verified)"
      : confidence === "medium"
        ? "var(--ev-inferred)"
        : "var(--ev-unknown)";
  const filled = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;

  return (
    <span
      className="mono inline-flex items-center gap-1.5 text-[11px]"
      style={{ color }}
      title={CONFIDENCE_META[confidence].blurb}
    >
      <span aria-hidden className="inline-flex items-center gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2.5 w-[3px] rounded-sm"
            style={{
              background:
                i < filled ? color : "color-mix(in oklab, var(--muted) 25%, transparent)",
            }}
          />
        ))}
      </span>
      {CONFIDENCE_META[confidence].label.replace(" confidence", "")} confidence
    </span>
  );
}

export function ActorBadge({
  actor,
  reason,
}: {
  actor: "agent" | "human" | "either";
  reason?: string;
}) {
  const meta = {
    agent: {
      label: "agent",
      color: "var(--brand)",
      blurb: "An agent with a browser can complete this step.",
    },
    either: {
      label: "agent or you",
      color: "var(--muted)",
      blurb: "An agent can do this, but you may prefer to.",
    },
    human: {
      label: "you",
      color: "var(--tier-3)",
      blurb: reason
        ? `Only a person can do this: ${reason.replace(/_/g, " ")}.`
        : "Only a person can do this.",
    },
  }[actor];

  return (
    <span
      className="mono inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide"
      style={{
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
      }}
      title={meta.blurb}
    >
      {meta.label}
    </span>
  );
}

export function ManagedAuthBadge({ managed }: { managed: boolean | null }) {
  if (managed === null) {
    return (
      <span className="mono text-[11px] text-muted" title="Not listed in Composio's toolkit catalog.">
        not in Composio catalog
      </span>
    );
  }
  return managed ? (
    <span
      className="mono rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide"
      style={{ color: "var(--tier-0)", background: "color-mix(in oklab, var(--tier-0) 10%, transparent)" }}
      title="Composio provides an OAuth app for this toolkit, so you can skip registration — until you need your own branding, scopes, or rate limits."
    >
      Composio-managed
    </span>
  ) : (
    <span
      className="mono rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide"
      style={{ color: "var(--tier-3)", background: "color-mix(in oklab, var(--tier-3) 10%, transparent)" }}
      title="Composio has no managed OAuth app for this toolkit. You must register your own."
    >
      bring your own
    </span>
  );
}

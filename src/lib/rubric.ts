import type {
  Confidence,
  Guide,
  HumanOnlyReason,
  PrerequisiteArtifact,
  Rubric,
  Tier,
} from "./schema";

/**
 * Turning the five rubric dimensions into one tier, deterministically.
 *
 * The rule is a ladder, not a weighted score. Each dimension independently sets
 * a *floor* on how hard setup can be, and the tier is the highest floor any
 * dimension demands. A weighted average would let four easy dimensions hide one
 * disqualifying requirement — and "you need a SOC 2 report" is not something a
 * good score elsewhere makes up for. The worst thing about your integration is
 * the thing that decides when you ship.
 *
 * Because it's a pure function of the rubric, two guides are comparable, a
 * reader can check the arithmetic, and the tier can't drift when a model has an
 * opinion about how hard something feels.
 */

const LADDER: Tier[] = ["instant", "same_day", "days", "weeks", "enterprise"];

const rank = (t: Tier) => LADDER.indexOf(t);
const worse = (a: Tier, b: Tier) => (rank(a) >= rank(b) ? a : b);

export const TIER_META: Record<
  Tier,
  { label: string; blurb: string; order: number }
> = {
  instant: {
    label: "Instant",
    blurb: "Fill in a form, get credentials. Nobody reviews you.",
    order: 0,
  },
  same_day: {
    label: "Same day",
    blurb: "Self-serve, but more than a few minutes of setup.",
    order: 1,
  },
  days: {
    label: "Days",
    blurb: "A short review, or an artifact you have to produce first.",
    order: 2,
  },
  weeks: {
    label: "Weeks",
    blurb: "A real approval process. Start it before you need it.",
    order: 3,
  },
  enterprise: {
    label: "Enterprise-gated",
    blurb: "Security review, a company, or money. Plan in quarters.",
    order: 4,
  },
};

// --- per-dimension floors ---------------------------------------------------

function floorForSelfServe(minutes: number): Tier {
  if (minutes <= 15) return "instant";
  if (minutes <= 60) return "same_day";
  if (minutes <= 240) return "days";
  return "weeks";
}

function floorForReviewWait(max: number): Tier {
  if (max <= 0) return "instant";
  if (max <= 2) return "days";
  if (max <= 10) return "weeks";
  return "enterprise";
}

/**
 * Human-only steps are graded by how long the human is likely to be the
 * bottleneck, not by how annoying they are. Clicking a consent checkbox is a
 * human-only step that costs five seconds; proving your legal identity is a
 * human-only step that costs a fortnight.
 */
const BLOCKER_FLOOR: Record<HumanOnlyReason, Tier> = {
  captcha: "instant",
  mfa: "instant",
  email_verification: "instant",
  phone_verification: "instant",
  legal_signature: "instant",
  payment: "same_day",
  account_ownership: "same_day",
  domain_control: "days",
  video_recording: "days",
  human_review_response: "days",
  identity_verification: "weeks",
};

const ARTIFACT_FLOOR: Record<PrerequisiteArtifact, Tier> = {
  support_contact: "instant",
  logo_assets: "instant",
  privacy_policy_url: "same_day",
  terms_url: "same_day",
  paid_plan: "days",
  verified_domain: "days",
  demo_video: "days",
  public_app_listing: "weeks",
  business_entity: "weeks",
  security_questionnaire: "enterprise",
};

function floorForCost(amount: number): Tier {
  if (amount <= 0) return "instant";
  if (amount < 500) return "days"; // someone has to approve a card charge
  if (amount < 2000) return "weeks";
  return "enterprise";
}

// --- tier -------------------------------------------------------------------

/**
 * True when not one of the five dimensions could be established.
 *
 * Such a guide has no business displaying a tier. `deriveTier` returns
 * "instant" for it — correctly, since nothing known demands a higher floor —
 * and that renders as a confident green badge saying setup is trivial, which is
 * the exact opposite of what we know. Callers must check this before showing a
 * tier anywhere.
 */
export function isUngrounded(r: Rubric): boolean {
  return (
    r.selfServeMinutes.value === null &&
    r.reviewWaitBusinessDays.value === null &&
    r.humanOnlyBlockers.value === null &&
    r.costUsd.value === null &&
    r.prerequisiteArtifacts.value === null
  );
}

export type TierResult = {
  tier: Tier;
  rationale: string[];
  /** Dimensions we could not establish. The tier is blind to these. */
  unknownDimensions: string[];
};

export function deriveTier(r: Rubric): TierResult {
  const contributions: { tier: Tier; because: string }[] = [];
  const unknownDimensions: string[] = [];

  const minutes = r.selfServeMinutes.value;
  if (minutes === null) unknownDimensions.push("setup time");
  else
    contributions.push({
      tier: floorForSelfServe(minutes),
      because: `${minutes} min of hands-on setup`,
    });

  const wait = r.reviewWaitBusinessDays.value;
  if (wait === null) unknownDimensions.push("review wait");
  else
    contributions.push({
      tier: floorForReviewWait(wait.max),
      because:
        wait.max <= 0
          ? "no provider review"
          : `provider review of ${wait.min}–${wait.max} business days`,
    });

  if (r.humanOnlyBlockers.value === null) {
    unknownDimensions.push("human-only steps");
  } else {
    for (const b of r.humanOnlyBlockers.value) {
      contributions.push({
        tier: BLOCKER_FLOOR[b.reason],
        because: `human-only step (${b.reason.replace(/_/g, " ")}): ${b.detail}`,
      });
    }
  }

  const cost = r.costUsd.value;
  if (cost === null) unknownDimensions.push("cost");
  else if (cost.amount > 0) {
    contributions.push({
      tier: floorForCost(cost.amount),
      because: `$${cost.amount}${
        cost.recurrence === "none" ? "" : `/${cost.recurrence.replace("_", " ")}`
      } required${cost.what ? ` — ${cost.what}` : ""}`,
    });
  }

  if (r.prerequisiteArtifacts.value === null) {
    unknownDimensions.push("prerequisites");
  } else {
    for (const a of r.prerequisiteArtifacts.value) {
      contributions.push({
        tier: ARTIFACT_FLOOR[a],
        because: `requires ${a.replace(/_/g, " ")}`,
      });
    }
  }

  const tier = contributions.reduce<Tier>(
    (acc, c) => worse(acc, c.tier),
    "instant",
  );

  // Only explain what actually set the tier. Listing every dimension would bury
  // the one that matters.
  const rationale = contributions
    .filter((c) => c.tier === tier)
    .map((c) => c.because);

  if (!rationale.length) {
    rationale.push(
      unknownDimensions.length === 5
        ? "nothing could be established — treat this tier as meaningless"
        : "nothing we found blocks setup",
    );
  }
  if (unknownDimensions.length) {
    rationale.push(
      `tier is blind to ${unknownDimensions.length} unestablished dimension${
        unknownDimensions.length === 1 ? "" : "s"
      }: ${unknownDimensions.join(", ")}`,
    );
  }

  return { tier, rationale, unknownDimensions };
}

// --- confidence -------------------------------------------------------------

/**
 * Confidence is about *us*, not about the provider, and it is computed only
 * from the evidence behind the five dimensions that set the tier. Prose
 * elsewhere in a guide being well-sourced doesn't make the timeline reliable.
 *
 * Deliberately pessimistic: one unknown dimension drags the whole guide to low,
 * because a developer planning a launch around a number we invented is exactly
 * the failure this project exists to prevent.
 */
export function confidenceFor(
  r: Rubric,
  opts: { unresolvedConflicts?: number } = {},
): { confidence: Confidence; why: string } {
  // A dimension counts as unknown if it says so *or* if it has no value —
  // a null with a "cited" label is a bookkeeping error, not a finding.
  const dims: [string, string][] = [
    ["setup time", r.selfServeMinutes.value === null ? "unknown" : r.selfServeMinutes.evidence],
    ["review wait", r.reviewWaitBusinessDays.value === null ? "unknown" : r.reviewWaitBusinessDays.evidence],
    ["human-only steps", r.humanOnlyBlockers.value === null ? "unknown" : r.humanOnlyBlockers.evidence],
    ["cost", r.costUsd.value === null ? "unknown" : r.costUsd.evidence],
    ["prerequisites", r.prerequisiteArtifacts.value === null ? "unknown" : r.prerequisiteArtifacts.evidence],
  ];

  const unknown = dims.filter(([, e]) => e === "unknown").map(([n]) => n);
  if (unknown.length) {
    return {
      confidence: "low",
      why: `could not establish ${unknown.join(", ")}`,
    };
  }

  const inferred = dims.filter(([, e]) => e === "inferred").map(([n]) => n);
  if (inferred.length) {
    return {
      confidence: "medium",
      why: `${inferred.join(", ")} ${
        inferred.length === 1 ? "is" : "are"
      } inferred, not sourced`,
    };
  }

  if (opts.unresolvedConflicts && opts.unresolvedConflicts > 0) {
    return {
      confidence: "medium",
      why: `${opts.unresolvedConflicts} unresolved conflict${
        opts.unresolvedConflicts === 1 ? "" : "s"
      } between sources`,
    };
  }

  const verified = dims.filter(([, e]) => e === "verified").length;
  return {
    confidence: "high",
    why:
      verified > 0
        ? `every dimension sourced; ${verified} of 5 checked against the real console`
        : "every dimension sourced to provider documentation",
  };
}

export const CONFIDENCE_META: Record<
  Confidence,
  { label: string; blurb: string }
> = {
  high: {
    label: "High confidence",
    blurb: "Every number behind the tier is sourced or was checked by hand.",
  },
  medium: {
    label: "Medium confidence",
    blurb: "At least one number is inferred, or sources disagree. Verify before you commit to a date.",
  },
  low: {
    label: "Low confidence",
    blurb: "At least one number we could not establish. Treat the timeline as a guess.",
  },
};

// --- the stack planner ------------------------------------------------------

/**
 * A developer wiring up an agent integrates eight apps, not one, so the useful
 * question is not "how hard is Shopify" but "when can we launch, and what's the
 * long pole".
 *
 * The model: approvals queue in parallel (you submit them all on day one), but
 * your own keyboard work is serial, because it's one developer doing it. So the
 * launch date is whichever is larger — the longest single review, or the time
 * it takes you to work through every setup yourself.
 *
 * This is an estimate built on estimates, which is why it reports its own worst
 * confidence alongside the number.
 */
export type StackPlan = {
  apps: {
    slug: string;
    appName: string;
    tier: Tier;
    confidence: Confidence;
    selfServeMinutes: number;
    reviewWaitMax: number;
    humanOnlySteps: number;
    isLongPole: boolean;
  }[];
  /** Business days until everything is connected, optimistic and pessimistic. */
  businessDays: { optimistic: number; pessimistic: number };
  /** The app that sets the date. */
  longPole: { slug: string; appName: string; reason: string } | null;
  totalSelfServeMinutes: number;
  totalHumanOnlySteps: number;
  totalCostUsd: number;
  /** The lowest confidence in the stack — the plan is only as good as this. */
  weakestConfidence: Confidence;
  notes: string[];
};

const WORKDAY_MINUTES = 6 * 60; // 6 focused hours, not 8

export function planStack(guides: Guide[]): StackPlan {
  if (!guides.length) {
    return {
      apps: [],
      businessDays: { optimistic: 0, pessimistic: 0 },
      longPole: null,
      totalSelfServeMinutes: 0,
      totalHumanOnlySteps: 0,
      totalCostUsd: 0,
      weakestConfidence: "high",
      notes: [],
    };
  }

  // Unknown dimensions are treated as zero here, which makes the plan
  // optimistic rather than alarmist. `weakestConfidence` and the notes are what
  // tell the reader how much to trust it.
  const reviewMax = (g: Guide) => g.rubric.reviewWaitBusinessDays.value?.max ?? 0;
  const reviewMin = (g: Guide) => g.rubric.reviewWaitBusinessDays.value?.min ?? 0;
  const setupMins = (g: Guide) => g.rubric.selfServeMinutes.value ?? 0;

  const longestReview = Math.max(...guides.map(reviewMax));
  const longPoleGuide = guides.find((g) => reviewMax(g) === longestReview) ?? null;

  const totalSelfServeMinutes = guides.reduce((n, g) => n + setupMins(g), 0);
  const ownWorkDays = Math.ceil(totalSelfServeMinutes / WORKDAY_MINUTES);

  const shortestPathIfParallel = Math.max(...guides.map(reviewMin));

  const confidenceRank: Confidence[] = ["high", "medium", "low"];
  const weakestConfidence = guides.reduce<Confidence>(
    (acc, g) =>
      confidenceRank.indexOf(g.confidence) > confidenceRank.indexOf(acc)
        ? g.confidence
        : acc,
    "high",
  );

  const notes: string[] = [];
  if (ownWorkDays > longestReview && longestReview > 0) {
    notes.push(
      `Your own setup work (${ownWorkDays} day${
        ownWorkDays === 1 ? "" : "s"
      }) outlasts the longest review. The bottleneck is you, not the providers.`,
    );
  }
  const gated = guides.filter((g) => g.tier === "enterprise");
  if (gated.length) {
    notes.push(
      `${gated.length} app${gated.length === 1 ? "" : "s"} need${
        gated.length === 1 ? "s" : ""
      } a security review, a registered company, or money: ${gated
        .map((g) => g.appName)
        .join(", ")}. Start ${gated.length === 1 ? "it" : "those"} first.`,
    );
  }
  if (weakestConfidence !== "high") {
    notes.push(
      `This date inherits the weakest guide in the stack (${weakestConfidence} confidence). Treat it as a planning figure, not a commitment.`,
    );
  }

  return {
    apps: guides.map((g) => ({
      slug: g.slug,
      appName: g.appName,
      tier: g.tier,
      confidence: g.confidence,
      selfServeMinutes: setupMins(g),
      reviewWaitMax: reviewMax(g),
      humanOnlySteps: g.steps.filter((s) => s.actor === "human").length,
      isLongPole: g.slug === longPoleGuide?.slug && longestReview > 0,
    })),
    businessDays: {
      optimistic: Math.max(shortestPathIfParallel, ownWorkDays),
      pessimistic: Math.max(longestReview, ownWorkDays),
    },
    longPole:
      longPoleGuide && longestReview > 0
        ? {
            slug: longPoleGuide.slug,
            appName: longPoleGuide.appName,
            reason: `${longestReview} business day review`,
          }
        : null,
    totalSelfServeMinutes,
    totalHumanOnlySteps: guides.reduce(
      (n, g) => n + g.steps.filter((s) => s.actor === "human").length,
      0,
    ),
    totalCostUsd: guides.reduce((n, g) => n + (g.rubric.costUsd.value?.amount ?? 0), 0),
    weakestConfidence,
    notes,
  };
}

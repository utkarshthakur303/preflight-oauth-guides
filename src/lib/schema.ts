import { z } from "zod";

/**
 * The guide schema.
 *
 * Everything in Preflight renders off this one shape: the seeded library, the
 * live-generated guides, the difficulty tier, the stack planner, and the JSON
 * an agent consumes. Two design rules drive it:
 *
 *  1. Difficulty is *computed*, never asserted. A model never writes "this is
 *     hard" — it fills in five measurable dimensions and `deriveTier()` in
 *     rubric.ts turns those into a tier. So the tier is auditable and
 *     comparable across providers.
 *
 *  2. Every claim that feeds the tier carries its own evidence level. Confidence
 *     is computed from those levels and is kept strictly separate from
 *     difficulty — "GitHub is easy and we're sure" and "Workday is hard and
 *     we're guessing" are different statements, and collapsing them into one
 *     number is how guidance like this becomes untrustworthy.
 */

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * How we know a thing. Ordered weakest-last on purpose; `confidenceFor()` in
 * rubric.ts relies on the ordering.
 */
export const EvidenceLevel = z.enum([
  // Someone drove the provider's real console and observed this. The strongest
  // claim we can make, and the rarest — see `verifiedBy` for who did it and when.
  "verified",
  // Stated in a document we fetched. Carries the quote, the URL and the date,
  // so a reader can check it without trusting us.
  "cited",
  // Not stated anywhere we found; reasoned from adjacent facts. Shown to the
  // reader as an inference, never as a finding.
  "inferred",
  // We looked and could not establish it. Kept in the guide deliberately —
  // a visible gap is more useful than a confident guess.
  "unknown",
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;

export const Citation = z.object({
  url: z.string().url(),
  /** Verbatim supporting sentence from the source. Never paraphrased. */
  quote: z.string().min(1).max(1200),
  title: z.string().optional(),
  /** When we fetched it. Provider docs go stale; a claim without a date is a rumour. */
  fetchedAt: z.string(),
});
export type Citation = z.infer<typeof Citation>;

/**
 * A single assertion plus how we know it. The generic wrapper around every
 * value in the guide that a developer might act on.
 */
export const Evidenced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value,
    evidence: EvidenceLevel,
    citations: z.array(Citation).default([]),
    /** Required when evidence is "verified": who checked, and when. */
    verifiedBy: z
      .object({
        method: z.enum(["manual-console-walkthrough", "browser-agent", "api-call"]),
        at: z.string(),
        note: z.string().optional(),
        /** Repo-relative path to a screenshot or transcript, if one was captured. */
        artifact: z.string().optional(),
      })
      .optional(),
    /** Why we landed here — shown in the UI when evidence is "inferred" or "unknown". */
    reasoning: z.string().optional(),
  });

// ---------------------------------------------------------------------------
// The five rubric dimensions
// ---------------------------------------------------------------------------

/**
 * Reasons a step cannot be handed to an agent. The brief asks what an agent can
 * do and where the developer has to take over; this enum is that answer, made
 * machine-readable instead of prose.
 */
export const HumanOnlyReason = z.enum([
  "payment",                // a card has to be entered
  // Government ID, a selfie, or business registration documents — the kind of
  // check that takes a provider days to clear. NOT confirming an email address
  // or a phone number, which are a click and a code. Getting that wrong once
  // floored GitHub at "weeks" over a verification email.
  "identity_verification",
  "legal_signature",        // someone must accept an agreement as a person
  "captcha",
  "email_verification",     // click a link in a confirmation email
  "phone_verification",     // enter a code sent by SMS
  "mfa",                    // a one-time code to a device we don't hold
  "account_ownership",      // must be done by an org owner / admin
  "human_review_response",  // answering a reviewer's questions mid-review
  "video_recording",        // a demo video of your app
  "domain_control",         // DNS records, file upload to a verified domain
]);
export type HumanOnlyReason = z.infer<typeof HumanOnlyReason>;

/** Things you must already possess before setup can finish. */
export const PrerequisiteArtifact = z.enum([
  "privacy_policy_url",
  "terms_url",
  "verified_domain",
  "business_entity",        // a registered company, not an individual
  "paid_plan",              // a paid tier on the provider
  "public_app_listing",     // a marketplace/directory listing
  "demo_video",
  "security_questionnaire", // CASA, Salesforce security review, SOC2 evidence
  "support_contact",
  "logo_assets",
]);
export type PrerequisiteArtifact = z.infer<typeof PrerequisiteArtifact>;

/**
 * Every dimension is nullable, and null means exactly one thing: we looked and
 * could not establish it. That is different from zero, and conflating the two
 * is how a guide ends up promising "no review required" about a provider whose
 * review process we simply never found. A null dimension contributes nothing to
 * the tier and drags confidence to low — see rubric.ts.
 */
export const Rubric = z.object({
  /**
   * 1. Hands-on-keyboard minutes to get a client ID and secret, assuming you
   *    already have an account and the prerequisites. Excludes all waiting.
   */
  selfServeMinutes: Evidenced(z.number().int().min(0).max(2400).nullable()),

  /**
   * 2. Calendar wait for provider review or approval, in business days. A range,
   *    because providers vary wildly and a single number would be a lie.
   *    { min: 0, max: 0 } means nobody reviews you — ship today.
   */
  reviewWaitBusinessDays: Evidenced(
    z
      .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
      .nullable(),
  ),

  /** 3. Steps no agent can complete, with the reason each one is human-only. */
  humanOnlyBlockers: Evidenced(
    z
      .array(z.object({ reason: HumanOnlyReason, detail: z.string() }))
      .nullable(),
  ),

  /** 4. Money that must change hands before you can ship. */
  costUsd: Evidenced(
    z
      .object({
        amount: z.number().min(0),
        recurrence: z.enum(["none", "one_time", "annual", "monthly"]),
        what: z.string().optional(),
      })
      .nullable(),
  ),

  /** 5. Artifacts you must already have. The usual hidden blocker. */
  prerequisiteArtifacts: Evidenced(z.array(PrerequisiteArtifact).nullable()),
});
export type Rubric = z.infer<typeof Rubric>;

// ---------------------------------------------------------------------------
// Tier + confidence
// ---------------------------------------------------------------------------

/** Derived from the rubric by `deriveTier()`. Never written by a model. */
export const Tier = z.enum(["instant", "same_day", "days", "weeks", "enterprise"]);
export type Tier = z.infer<typeof Tier>;

/** Derived from evidence levels by `confidenceFor()`. Orthogonal to Tier. */
export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const Step = z.object({
  title: z.string(),
  detail: z.string(),
  /**
   * Who does this. "either" means an agent can do it but a human may prefer to
   * — e.g. pasting a redirect URI. The stack planner only ever counts "human".
   */
  actor: z.enum(["agent", "human", "either"]),
  /** Set when actor is "human". Explains *why* it can't be automated. */
  humanOnlyReason: HumanOnlyReason.optional(),
  /** Where this happens, e.g. "Shopify Partner Dashboard → Apps → Create app". */
  where: z.string().optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  /** True when this step starts a wait rather than finishing work. */
  startsReviewWait: z.boolean().default(false),
  evidence: EvidenceLevel,
  citations: z.array(Citation).default([]),
});
export type Step = z.infer<typeof Step>;

// ---------------------------------------------------------------------------
// Honest reporting of disagreement and gaps
// ---------------------------------------------------------------------------

/**
 * Two sources that disagree. Recorded rather than averaged — a reader who knows
 * the docs contradict each other is better informed than one handed a
 * confident midpoint.
 */
export const Conflict = z.object({
  about: z.string(),
  positions: z
    .array(z.object({ claim: z.string(), citation: Citation }))
    .min(2),
  /** How we resolved it for the rubric, and why. May be "left unresolved". */
  resolution: z.string(),
});
export type Conflict = z.infer<typeof Conflict>;

export const OpenQuestion = z.object({
  question: z.string(),
  whyItMatters: z.string(),
  /** The concrete thing that would settle it. */
  howToResolve: z.string(),
});
export type OpenQuestion = z.infer<typeof OpenQuestion>;

// ---------------------------------------------------------------------------
// The guide
// ---------------------------------------------------------------------------

export const Guide = z.object({
  schemaVersion: z.literal(1),

  /** URL-safe id, e.g. "shopify". */
  slug: z.string().regex(/^[a-z0-9-]+$/),
  appName: z.string(),
  /** The Composio toolkit slug when this app is in their catalog, e.g. "SHOPIFY". */
  composioToolkitSlug: z.string().nullable(),
  /**
   * Whether Composio already provides an OAuth app. Guides still matter when
   * true — their own docs list branding, extra scopes, shared rate limits and
   * the 2-minute trigger-polling floor as reasons to bring your own.
   */
  composioManagedOAuth: z.boolean().nullable(),

  providerName: z.string(),
  /** Where you actually register the app. Null when we could not establish it. */
  developerConsoleUrl: Evidenced(z.string().nullable()),
  docsRootUrl: z.string().nullable(),

  /** One paragraph a developer could paste to their manager. */
  summary: z.string(),

  rubric: Rubric,
  /** Computed, stored so the UI and the JSON API agree without recomputing. */
  tier: Tier,
  confidence: Confidence,
  /** Human-readable account of which dimension forced the tier. */
  tierRationale: z.array(z.string()),

  steps: z.array(Step),

  /** Provider-specific traps. The part a developer can't get from a step list. */
  nuances: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.enum(["blocker", "gotcha", "note"]),
      evidence: EvidenceLevel,
      citations: z.array(Citation).default([]),
    }),
  ),

  /** What to do when you're stuck. The brief asks for this explicitly. */
  whenBlocked: z.array(
    z.object({
      situation: z.string(),
      action: z.string(),
      contact: z.string().optional(),
    }),
  ),

  conflicts: z.array(Conflict).default([]),
  openQuestions: z.array(OpenQuestion).default([]),

  /** Every source consulted, including ones that turned out to be useless. */
  sources: z.array(Citation).default([]),

  generation: z.object({
    generatedAt: z.string(),
    /** "seeded" guides were generated then reviewed by hand; "live" were not. */
    origin: z.enum(["seeded", "live"]),
    /** Per-model token counts, so the efficiency claim is measurable, not rhetoric. */
    models: z.array(
      z.object({
        model: z.string(),
        role: z.enum(["triage", "extract", "adjudicate"]),
        calls: z.number().int(),
        inputTokens: z.number().int(),
        outputTokens: z.number().int(),
      }),
    ),
    docPagesDiscovered: z.number().int(),
    docPagesRead: z.number().int(),
    durationMs: z.number().int(),
    /** Set when a human corrected the generated output. */
    reviewNote: z.string().optional(),
  }),
});
export type Guide = z.infer<typeof Guide>;

/**
 * What the adjudicating model is asked to return. Deliberately narrower than
 * `Guide`: the model never supplies `tier`, `confidence`, `tierRationale` or
 * `generation` — those are computed from its output, not trusted from it.
 */
export const GuideDraft = Guide.omit({
  schemaVersion: true,
  tier: true,
  confidence: true,
  tierRationale: true,
  generation: true,
  slug: true,
  composioToolkitSlug: true,
  composioManagedOAuth: true,
});
export type GuideDraft = z.infer<typeof GuideDraft>;

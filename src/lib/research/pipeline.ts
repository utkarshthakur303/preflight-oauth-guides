import { CHEAP_FALLBACKS, MODELS, TokenLedger, chatJson, chatJsonWithFallback } from "../groq";
import {
  Guide,
  GuideDraft,
  type Citation,
  type EvidenceLevel,
} from "../schema";
import { confidenceFor, deriveTier } from "../rubric";
import {
  alternateInterpretations,
  discoverDocUrls,
  fetchDocPage,
  hypothesiseProvider,
  type FetchedPage,
} from "./sources";
import { diversify, shortlist, topicOf } from "./relevance";
import catalog from "@/data/catalog.json";

/**
 * The investigation pipeline.
 *
 * Shape is map-reduce, for a reason that is as much about honesty as cost:
 *
 *   discover  → every doc URL the provider publishes            (no model)
 *   shortlist → keyword prefilter on URL paths                  (no model)
 *   triage    → which handful actually discuss OAuth setup      (gpt-oss-20b)
 *   extract   → per page, claims with verbatim quotes           (gpt-oss-20b)
 *   adjudicate→ one guide from those claims                     (gpt-oss-120b)
 *   verify    → every citation checked against the fetched text (no model)
 *
 * The big model never sees a raw documentation page. It only ever sees short
 * claims that each carry a quote, which keeps its input around 3k tokens
 * instead of 40k — the difference between running comfortably on a free tier
 * and not running at all.
 *
 * The verify stage is the part that matters most. A model asked for citations
 * will sometimes produce a plausible URL and a plausible quote for a claim it
 * actually inferred. So after generation we re-check every quote against the
 * text we really fetched, and any claim whose quote isn't there loses its
 * citation and is downgraded to "inferred". Nothing reaches a reader labelled
 * "cited" unless the sentence is genuinely in the document.
 */

// ---------------------------------------------------------------------------
// Events, so the UI can show the investigation rather than a spinner
// ---------------------------------------------------------------------------

export type PipelineEvent =
  | { type: "stage"; key: StageKey; label: string; status: "running" | "done"; detail?: string }
  | { type: "log"; message: string }
  | { type: "source"; url: string; verdict: "read" | "skipped"; why?: string }
  | { type: "counts"; discovered: number; shortlisted: number; triaged: number; read: number }
  | { type: "usage"; calls: number; inputTokens: number; outputTokens: number }
  | { type: "downgrade"; about: string; from: EvidenceLevel; to: EvidenceLevel; why: string }
  | { type: "done"; guide: Guide }
  | { type: "error"; message: string };

export type StageKey =
  | "locate"
  | "discover"
  | "triage"
  | "read"
  | "adjudicate"
  | "verify";

type Emit = (e: PipelineEvent) => void;

// ---------------------------------------------------------------------------
// Stage 2: keyword shortlist (free)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stage 3: triage with the cheap model
// ---------------------------------------------------------------------------

type TriageVerdict = { url: string; relevance: number; topic: string };

async function triage(
  urls: string[],
  appName: string,
  ledger: TokenLedger,
  emit: Emit,
  needed: number,
  signal?: AbortSignal,
): Promise<TriageVerdict[]> {
  const BATCH = 45;
  // One batch, not five.
  //
  // On a free tier a single gpt-oss-20b call takes twenty to forty seconds,
  // almost all of it queueing, so the number of triage calls — not their size —
  // is what decides how long a run feels. Five batches spent two and a half
  // minutes ranking candidates that were never going to be opened.
  //
  // The keyword prefilter has already ranked these, and `diversify` below
  // guarantees the single batch spans registering, approval, requirements and
  // scopes rather than forty variations on one topic. The model's job is to
  // re-rank a balanced shortlist, which one call does well.
  const MAX_BATCHES = 1;
  const candidates = diversify(urls, (u) => u, BATCH * MAX_BATCHES);

  const out: TriageVerdict[] = [];
  let failures = 0;
  const batches = Math.ceil(candidates.length / BATCH);

  for (let i = 0; i < candidates.length; i += BATCH) {
    if (signal?.aborted) break;

    const n = i / BATCH + 1;
    emit({
      type: "stage",
      key: "triage",
      label: "Triaging pages with gpt-oss-20b",
      status: "running",
      detail: `batch ${n} of ${batches} · ${out.length} relevant so far`,
    });

    const batch = candidates.slice(i, i + BATCH);
    try {
      const res = await chatJsonWithFallback<{ picks: { i: number; relevance: number; topic: string }[] }>({
        fallbacks: CHEAP_FALLBACKS,
        onFallback: (from, to) =>
          emit({ type: "log", message: `${from} daily budget spent — switching to ${to}` }),
        model: MODELS.cheap,
        role: "triage",
        ledger,
        signal,
        maxTokens: 800,
        system: [
          "You rank documentation URLs by how likely the page explains how a THIRD-PARTY DEVELOPER",
          "registers their own OAuth application with this provider and gets it approved.",
          "",
          'Return JSON only: {"picks": [{"i": <index>, "relevance": 0-10, "topic": "<3-6 words>"}]}',
          "",
          "Score 8-10: creating an OAuth app, client ID/secret, redirect URIs, requesting scopes,",
          "            app review/verification/approval, publishing or listing requirements.",
          "Score 6-8:  how developers authenticate at all — API keys, bearer tokens, personal",
          "            access tokens, 'authentication' overviews. Establishing that a provider",
          "            uses API keys INSTEAD of OAuth is a valuable answer, not an irrelevant",
          "            page: it tells the developer there is nothing to register.",
          "Score 4-5:  developer-account setup, rate limits, security policy.",
          "Score 0-3:  end-user help, API endpoint reference, SDK usage, anything unrelated.",
          "",
          "Include only entries scoring 4 or above. Judge from the URL path alone. Be selective.",
          "",
          "Score 0-3 as well for pages about a DIFFERENT product line than the provider's main",
          "platform app — separate app surfaces, storefront widgets, mini-apps, embedded",
          "marketplaces. Their requirements differ from the main OAuth app and mixing them in",
          "produces a guide that is confidently wrong.",
        ].join("\n"),
        user: `Provider: ${appName}\n\nURLs:\n${batch
          .map((u, j) => `${j}. ${u}`)
          .join("\n")}`,
      });

      for (const p of res.picks ?? []) {
        const url = batch[p.i];
        if (url && p.relevance >= 4) {
          out.push({ url, relevance: p.relevance, topic: p.topic ?? "" });
        }
      }
    } catch (err) {
      // One bad batch shouldn't sink the run; the others still carry signal.
      failures++;
      emit({
        type: "log",
        message: `triage batch ${n} of ${batches} failed, continuing: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }

    // Stop once there is comfortably more than we can read. Every further
    // batch is a model call against a tight per-minute budget buying candidates
    // that will never be opened.
    const strong = out.filter((v) => v.relevance >= 7).length;
    if (strong >= needed * 2 && out.length >= needed * 2) {
      emit({
        type: "log",
        message: `stopping triage after batch ${n}: ${strong} strong candidates for ${needed} slots`,
      });
      break;
    }
  }

  if (!out.length && failures > 0) {
    emit({
      type: "log",
      message: `every triage batch failed (${failures}) — falling back to the free keyword ranking`,
    });
    // Better to read the top keyword-ranked pages than to give up entirely.
    return candidates.slice(0, 12).map((url) => ({ url, relevance: 5, topic: "keyword-ranked" }));
  }

  return out.sort((a, b) => b.relevance - a.relevance);
}

// ---------------------------------------------------------------------------
// Stage 4+5: extract claims per page, then adjudicate
// ---------------------------------------------------------------------------

type Finding = {
  claim: string;
  quote: string;
  field: string;
  sourceUrl: string;
  sourceTitle: string;
  fetchedAt: string;
};

const FIELD_TAGS = [
  "authMethod",
  "selfServeMinutes",
  "reviewWait",
  "cost",
  "prerequisites",
  "humanOnly",
  "step",
  "nuance",
  "console",
  "blocked",
  "other",
] as const;

async function extractFromPage(
  page: FetchedPage,
  appName: string,
  ledger: TokenLedger,
  signal?: AbortSignal,
): Promise<Finding[]> {
  const res = await chatJsonWithFallback<{
    findings: { claim: string; quote: string; field: string }[];
  }>({
    fallbacks: CHEAP_FALLBACKS,
    model: MODELS.cheap,
    role: "extract",
    ledger,
    signal,
    maxTokens: 900,
    system: [
      "You extract facts about how a third-party developer authenticates with a provider,",
      "and about registering an OAuth app where one exists.",
      "",
      "IMPORTANT: a provider that uses API keys and has no OAuth app is a normal, useful",
      "answer, not a blank. If the page shows developers authenticating with an API key,",
      'a bearer token or a personal access token, record an "authMethod" finding with the',
      "quote that shows it. That single fact tells a developer there is nothing to register.",
      "",
      'Return JSON only: {"findings": [{"claim": "...", "quote": "...", "field": "..."}]}',
      "",
      `field must be one of: ${FIELD_TAGS.join(", ")}`,
      "  selfServeMinutes - how long hands-on setup takes",
      "  reviewWait       - any review/approval wait, and its length",
      "  cost             - money required (fees, assessments, paid plans)",
      "  prerequisites    - privacy policy, verified domain, company, demo video, questionnaire",
      "  humanOnly        - steps needing a person (payment, ID checks, signatures, DNS, video)",
      "  step             - a concrete setup action, in order",
      "  nuance           - a trap, limitation or surprising requirement",
      "  console          - the URL or name of the place you register the app",
      "  authMethod       - how developers authenticate: API key, bearer token, OAuth, etc.",
      "  blocked          - what to do when stuck, support routes, contact paths",
      "",
      "CRITICAL RULES:",
      "- `quote` MUST be copied verbatim from the page, character for character.",
      "- Never write a quote that is not literally present in the text given to you.",
      "- If the page does not state something, do not produce a finding for it.",
      "- But do not return an empty array just because the page is not about OAuth. If it",
      "  shows how authentication works at all, that is a finding worth recording.",
      "- Extract at most 5 findings. Prefer specific, numeric, actionable facts.",
      "- Keep each quote under 180 characters. Trim to the sentence that carries the fact.",
      "- An empty findings array is a correct answer for an irrelevant page.",
    ].join("\n"),
    user: [
      `Provider: ${appName}`,
      `Page title: ${page.title}`,
      `Page URL: ${page.url}`,
      "",
      "PAGE TEXT:",
      page.text.slice(0, 6_000),
    ].join("\n"),
  });

  return (res.findings ?? [])
    .filter((f) => f.claim && f.quote)
    .map((f) => ({
      claim: f.claim,
      quote: f.quote,
      field: FIELD_TAGS.includes(f.field as (typeof FIELD_TAGS)[number])
        ? f.field
        : "other",
      sourceUrl: page.url,
      sourceTitle: page.title,
      fetchedAt: page.fetchedAt,
    }));
}

/**
 * Adjudication is split across two calls, and the reason is a hard constraint
 * rather than a preference: Groq's free tier allows 8,000 tokens per minute per
 * model, and `max_completion_tokens` is reserved against that budget up front.
 * A single call big enough to emit a whole guide could therefore never succeed.
 *
 * It turned out to be the better design anyway. The first call does nothing but
 * the evidence-critical judgement — the five rubric dimensions, where sources
 * disagree, and what remains unknown — with the full evidence-discipline
 * instruction and no competing concerns. The second writes the procedure. Each
 * gets a focused brief instead of one prompt trying to do both.
 */

const EVIDENCE_RULES = [
  "EVIDENCE DISCIPLINE — this is the whole point of the document:",
  '- "cited" requires a citation whose `quote` is copied verbatim from the findings below,',
  "  with that finding's exact url and fetchedAt. Never alter a quote. Never pair a quote",
  "  with a url it did not come from. Quotes are checked against the fetched pages afterwards",
  "  and a quote that is not really there is removed, so inventing one gains you nothing.",
  '- "inferred" is correct and expected when the findings do not state something. Say why in',
  "  `reasoning`. An honest inference is worth far more than a fabricated citation.",
  '- "unknown" when you genuinely cannot tell. Set that dimension\'s value to null and add an',
  "  entry to openQuestions saying what would settle it. Never put 0 where you mean null:",
  '  {"min":0,"max":0} asserts "nobody reviews this app", which is a strong claim, not a shrug.',
  "- If two findings disagree, record a `conflicts` entry rather than averaging them.",
].join("\n");

const C_SHAPE = 'C = { "url": string, "quote": string, "title": string?, "fetchedAt": string }';
const E_SHAPE = 'E = "cited" | "inferred" | "unknown"';
const R_SHAPE =
  "R = payment | identity_verification | legal_signature | captcha | email_verification | phone_verification | mfa | account_ownership | human_review_response | video_recording | domain_control";
const P_SHAPE =
  "P = privacy_policy_url | terms_url | verified_domain | business_entity | paid_plan | public_app_listing | demo_video | security_questionnaire | support_contact | logo_assets";

const ASSESS_SPEC = `
Return JSON only, exactly this shape:

{
  "appName": string,
  "providerName": string,
  "oauthSupported": { "value": true|false|null, "evidence": E, "citations": [C], "reasoning": string? },
  "developerConsoleUrl": { "value": string|null, "evidence": E, "citations": [C], "reasoning": string? },
  "summary": string,
  "rubric": {
    "selfServeMinutes":       { "value": int|null, "evidence": E, "citations": [C], "reasoning": string? },
    "reviewWaitBusinessDays": { "value": {"min": int, "max": int}|null, "evidence": E, "citations": [C], "reasoning": string? },
    "humanOnlyBlockers":      { "value": [{"reason": R, "detail": string}]|null, "evidence": E, "citations": [C], "reasoning": string? },
    "costUsd":                { "value": {"amount": number, "recurrence": "none"|"one_time"|"annual"|"monthly", "what": string?}|null, "evidence": E, "citations": [C], "reasoning": string? },
    "prerequisiteArtifacts":  { "value": [P]|null, "evidence": E, "citations": [C], "reasoning": string? }
  },
  "conflicts": [{ "about": string, "positions": [{"claim": string, "citation": C}], "resolution": string }],
  "openQuestions": [{ "question": string, "whyItMatters": string, "howToResolve": string }],
  "sources": [C]
}

${E_SHAPE}
${C_SHAPE}
${R_SHAPE}
${P_SHAPE}
`.trim();

const PROCEDURE_SPEC = `
Return JSON only, exactly this shape:

{
  "steps": [{ "title": string, "detail": string, "actor": "agent"|"human"|"either",
              "humanOnlyReason": R?, "where": string?, "estimatedMinutes": int?,
              "startsReviewWait": boolean, "evidence": E, "citations": [C] }],
  "nuances": [{ "title": string, "detail": string, "severity": "blocker"|"gotcha"|"note", "evidence": E, "citations": [C] }],
  "whenBlocked": [{ "situation": string, "action": string, "contact": string? }]
}

${E_SHAPE}
${C_SHAPE}
${R_SHAPE}
`.trim();

/** Group findings by field tag so the model sees the evidence organised. */
function formatFindings(findings: Finding[]): string {
  return FIELD_TAGS.map((tag) => {
    const items = findings.filter((f) => f.field === tag);
    if (!items.length) return null;
    return [
      `## ${tag}`,
      ...items.map(
        (f, i) =>
          `${i + 1}. ${f.claim}\n   quote: "${f.quote}"\n   url: ${f.sourceUrl}\n   fetchedAt: ${f.fetchedAt}`,
      ),
    ].join("\n");
  })
    .filter(Boolean)
    .join("\n\n");
}

type AdjudicateCtx = {
  appName: string;
  providerName: string;
  docsRoot: string | null;
  consoleGuess: string | null;
  findings: Finding[];
  ledger: TokenLedger;
  signal?: AbortSignal;
  /** Set when pages were found but none could be read. */
  readFailure?: string | null;
};

async function adjudicateAssessment(ctx: AdjudicateCtx) {
  const { appName, providerName, docsRoot, consoleGuess, findings, ledger, signal } = ctx;

  return chatJson<Record<string, unknown>>({
    model: MODELS.smart,
    role: "adjudicate",
    ledger,
    signal,
    maxTokens: 3600,
    reasoningEffort: "medium",
    system: [
      "You assess how hard it is for a developer to register their own OAuth app with a provider,",
      "so that their AI agent's users can connect that app.",
      "",
      ASSESS_SPEC,
      "",
      EVIDENCE_RULES,
      "",
      "WHAT YOU ARE MEASURING — read this twice:",
      "The developer's goal is working OAuth credentials so their users can connect their own",
      "accounts to an agent. That is NOT the same event as getting listed in the provider's public",
      "marketplace, and the two have completely different timelines. Most providers issue a client",
      "ID and secret instantly and review you only if you want a public listing.",
      "- The rubric measures the path to working credentials. If registration is self-serve and only",
      "  public listing is reviewed, reviewWaitBusinessDays is {min:0,max:0}, and the listing review",
      "  belongs in `nuances` as the separate, optional thing it is.",
      "- Only count a review that stands between the developer and authorised API calls for their",
      "  users: app verification, scope approval, production-access promotion, security review.",
      "- Requirements for a badge, tier or partner programme (install counts, ratings, revenue",
      "  thresholds) are not prerequisites for registering an app. Leave them out of the rubric.",
      "",
      "JUDGEMENT:",
      "- oauthSupported FIRST. Many APIs have no OAuth app at all: they authenticate with a",
      "  bearer API key you generate in a dashboard, with no consent screen, no client ID and",
      "  nothing to review. Inference, database and infrastructure APIs are usually like this.",
      "  If the findings describe API-key or bearer authentication and show no sign of an OAuth",
      '  app registration, set oauthSupported false. That is a FINDING, not a failure: say so in',
      "  the summary, set the rubric to zero effort where that follows, and do not report the",
      "  dimensions as unknown. Set it true when there is clearly an OAuth app to register, and",
      "  null only when you genuinely cannot tell.",
      "- selfServeMinutes is keyboard time only. Never fold waiting into it.",
      "- reviewWaitBusinessDays is how long the PROVIDER takes to come back to you. A deadline",
      "  imposed on the developer -- \"you have 30 days to respond\", \"respond within 7 days or the",
      "  app is demoted\" -- is not a review duration. Do not use one as if it were.",
      "- reviewWaitBusinessDays is {min:0,max:0} only when you have grounds to say nobody reviews",
      "  the app. If you simply did not find a review process, that is null, not zero.",
      "- humanOnlyBlockers: a step is human-only when an agent genuinely cannot do it. Filling a",
      "  web form is agent work. Entering a card, passing an ID check, signing an agreement,",
      "  recording a demo video or changing DNS is not.",
      '- Use "identity_verification" ONLY for government ID, a selfie, or business registration',
      "  documents. Confirming an email address is \"email_verification\" and a texted code is",
      '  "phone_verification". These are minutes; an identity check is weeks, and the tier',
      "  treats them very differently.",
      "- summary: one paragraph, plain, specific to this provider, no marketing tone.",
      "- Do not pad. A short accurate assessment beats a long speculative one.",
    ].join("\n"),
    user: [
      `App: ${appName}`,
      `Provider: ${providerName}`,
      `Docs root: ${docsRoot ?? "unknown"}`,
      `Suspected developer console (unverified hint only): ${consoleGuess ?? "unknown"}`,
      "",
      findings.length
        ? `FINDINGS extracted from pages that were actually fetched:\n\n${formatFindings(findings)}`
        : [
            "NO FINDINGS.",
            ctx.readFailure
              ? `Reason: ${ctx.readFailure}.`
              : "Reason: no relevant documentation pages could be located.",
            'Set every rubric value to null with evidence "unknown". Do not guess.',
            "In summary, state plainly that this guide could not be grounded in the provider's",
            "documentation and say why, so a reader knows this is a gap rather than a finding.",
            "Fill openQuestions with the specific things a developer should check by hand.",
          ].join(" "),
    ].join("\n"),
  });
}

async function adjudicateProcedure(ctx: AdjudicateCtx) {
  const { appName, providerName, consoleGuess, ledger, signal } = ctx;

  const relevant = ctx.findings.filter((f) =>
    ["step", "console", "nuance", "blocked", "humanOnly", "prerequisites", "authMethod"].includes(
      f.field,
    ),
  );

  return chatJson<Record<string, unknown>>({
    model: MODELS.smart,
    role: "adjudicate",
    ledger,
    signal,
    maxTokens: 4200,
    reasoningEffort: "medium",
    system: [
      "You write the procedure a developer follows to register their own OAuth app with a provider.",
      "",
      PROCEDURE_SPEC,
      "",
      EVIDENCE_RULES,
      "",
      "JUDGEMENT:",
      "- The goal is working OAuth credentials for a developer's own users, not a public marketplace",
      "  listing. Cover registration, redirect URIs, scopes and whatever gates production access.",
      "  Marketplace submission is a separate, optional path: mention it as a nuance, not as a step.",
      "- Steps must be specific enough to follow: name the console, the menu path, the field.",
      "- Order them. Set startsReviewWait true on the step that submits for review, if there is one.",
      "- actor: be strict. An agent with a browser can navigate a dashboard, fill a form, paste a",
      "  redirect URI, copy a client ID and submit for review. Those are \"agent\" or \"either\",",
      "  never \"human\". Reserve \"human\" for what an agent truly cannot do, and then a",
      "  humanOnlyReason is mandatory. A guide where every step is human-only is wrong and",
      "  useless: the brief it answers is specifically about which steps can be delegated.",
      "- nuances are the traps a step list cannot carry: shared rate limits, scope approval",
      "  surprises, redirect URI rules, sandbox-versus-production differences.",
      "- whenBlocked: concrete recovery routes — which form, which support address, which forum.",
      "- 4 to 9 steps. Do not invent steps you have no basis for.",
    ].join("\n"),
    user: [
      `App: ${appName}`,
      `Provider: ${providerName}`,
      `Suspected developer console (unverified hint only): ${consoleGuess ?? "unknown"}`,
      "",
      relevant.length
        ? `FINDINGS from pages that were actually fetched:\n\n${formatFindings(relevant)}`
        : `No procedural findings were extracted. Return at most 3 steps, each with evidence "inferred", describing the generic OAuth registration path, and say so in the detail.`,
    ].join("\n"),
  });
}

async function adjudicate(ctx: AdjudicateCtx): Promise<unknown> {
  // Sequential, not parallel: two concurrent calls would reserve ~8k tokens
  // between them and trip the per-minute cap for this model immediately.
  const assessment = await adjudicateAssessment(ctx);
  const procedure = await adjudicateProcedure(ctx);
  return { ...assessment, ...procedure };
}

// ---------------------------------------------------------------------------
// Stage 6: verify every citation against the text we really fetched
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s.toLowerCase().replace(/[\s ]+/g, " ").replace(/[“”„‟]/g, '"').replace(/[‘’]/g, "'").trim();

/**
 * Is this quote really in that page?
 *
 * Exact-after-normalisation first. Failing that, a long distinctive run of the
 * quote has to appear — models sometimes elide a clause with "..." or join two
 * adjacent sentences, which is sloppy but not dishonest. Anything looser than
 * this would defeat the purpose of checking.
 */
function quoteIsPresent(quote: string, pageText: string): boolean {
  const q = norm(quote);
  const t = norm(pageText);
  if (q.length < 12) return false;
  if (t.includes(q)) return true;

  const words = q.split(" ");
  if (words.length >= 8) {
    for (const len of [12, 9, 7]) {
      if (words.length < len) continue;
      for (let i = 0; i + len <= words.length; i++) {
        if (t.includes(words.slice(i, i + len).join(" "))) return true;
      }
    }
  }
  return false;
}

/**
 * Coerce a model's JSON into the shape the schema expects.
 *
 * These models get the structure broadly right and the edges wrong in
 * predictable ways: a missing array, a number as a string, an evidence label
 * the prompt never offered, `{}` where a nullable object belongs. Normalising
 * those is mechanical and safe.
 *
 * What it deliberately does *not* do is invent content. A missing rubric
 * dimension becomes an explicit `unknown` with a null value — never a zero —
 * because the whole contract of this project is that "we don't know" and
 * "nothing required" are different answers.
 *
 * Its input is whatever JSON a model emitted, so the loose type below is the
 * honest one: every property access is guarded, and the result is validated
 * against the Zod schema before it becomes a Guide.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawJson = any;
function normalizeDraft(raw: unknown): GuideDraft {
  const d = (raw ?? {}) as Record<string, RawJson>;


  const EV = new Set(["verified", "cited", "inferred", "unknown"]);
  const level = (v: unknown): EvidenceLevel =>
    typeof v === "string" && EV.has(v) ? (v as EvidenceLevel) : "inferred";

  const citations = (v: unknown): Citation[] =>
    (Array.isArray(v) ? v : [])
      .filter((c) => c && typeof c.url === "string" && typeof c.quote === "string")
      .map((c) => ({
        url: c.url,
        quote: String(c.quote),
        title: typeof c.title === "string" ? c.title : undefined,
        fetchedAt:
          typeof c.fetchedAt === "string" ? c.fetchedAt : new Date().toISOString(),
      }));

  /** Wrap a possibly-missing evidenced node, mapping absence to `unknown`. */
  const node = (v: RawJson, coerce: (x: unknown) => unknown) => {
    const hasShape = v && typeof v === "object" && "value" in v;
    const value = coerce(hasShape ? v.value : v);
    return {
      value,
      evidence: value === null ? "unknown" : level(hasShape ? v.evidence : undefined),
      citations: citations(hasShape ? v.citations : undefined),
      reasoning:
        hasShape && typeof v.reasoning === "string" ? v.reasoning : undefined,
      verifiedBy: hasShape && v.verifiedBy ? v.verifiedBy : undefined,
    };
  };

  const asInt = (x: unknown) => {
    const n = typeof x === "string" ? Number(x.replace(/[^\d.-]/g, "")) : x;
    return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
  };

  const asRange = (x: unknown) => {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const min = asInt(o.min);
      const max = asInt(o.max);
      if (min !== null || max !== null)
        return { min: min ?? max ?? 0, max: max ?? min ?? 0 };
    }
    const flat = asInt(x);
    return flat === null ? null : { min: flat, max: flat };
  };

  const asCost = (x: unknown) => {
    if (x === null || x === undefined) return null;
    if (typeof x === "number") return { amount: x, recurrence: "none" as const };
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      const amount = asInt(o.amount);
      if (amount === null) return null;
      const rec = ["none", "one_time", "annual", "monthly"].includes(
        String(o.recurrence),
      )
        ? (o.recurrence as "none" | "one_time" | "annual" | "monthly")
        : ("none" as const);
      return {
        amount,
        recurrence: rec,
        what: typeof o.what === "string" ? o.what : undefined,
      };
    }
    return null;
  };

  const arr = <T,>(x: unknown, keep: (v: RawJson) => T | null): T[] =>
    (Array.isArray(x) ? x : []).map(keep).filter((v): v is T => v !== null);

  const REASONS = new Set([
    "payment", "identity_verification", "legal_signature", "captcha",
    "email_verification", "phone_verification", "mfa", "account_ownership",
    "human_review_response", "video_recording", "domain_control",
  ]);
  const ARTIFACTS = new Set([
    "privacy_policy_url", "terms_url", "verified_domain", "business_entity",
    "paid_plan", "public_app_listing", "demo_video", "security_questionnaire",
    "support_contact", "logo_assets",
  ]);

  const rb = (d.rubric ?? {}) as Record<string, RawJson>;

  return {
    appName: String(d.appName ?? ""),
    providerName: String(d.providerName ?? d.appName ?? ""),
    oauthSupported: node(d.oauthSupported, (x) =>
      typeof x === "boolean" ? x : null,
    ) as GuideDraft["oauthSupported"],
    developerConsoleUrl: node(d.developerConsoleUrl, (x) =>
      typeof x === "string" && x.trim() ? x.trim() : null,
    ) as GuideDraft["developerConsoleUrl"],
    docsRootUrl: typeof d.docsRootUrl === "string" ? d.docsRootUrl : null,
    summary: String(d.summary ?? ""),
    rubric: {
      selfServeMinutes: node(rb.selfServeMinutes, asInt),
      reviewWaitBusinessDays: node(rb.reviewWaitBusinessDays, asRange),
      humanOnlyBlockers: node(rb.humanOnlyBlockers, (x) =>
        x === null || x === undefined
          ? null
          : arr(x, (b) =>
              b && REASONS.has(b.reason)
                ? { reason: b.reason, detail: String(b.detail ?? "") }
                : null,
            ),
      ),
      costUsd: node(rb.costUsd, asCost),
      prerequisiteArtifacts: node(rb.prerequisiteArtifacts, (x) =>
        x === null || x === undefined
          ? null
          : arr(x, (a) => (typeof a === "string" && ARTIFACTS.has(a) ? a : null)),
      ),
    } as GuideDraft["rubric"],
    steps: arr(d.steps, (s) =>
      s && s.title
        ? {
            title: String(s.title),
            detail: String(s.detail ?? ""),
            actor: ["agent", "human", "either"].includes(s.actor) ? s.actor : "either",
            humanOnlyReason: REASONS.has(s.humanOnlyReason) ? s.humanOnlyReason : undefined,
            where: typeof s.where === "string" ? s.where : undefined,
            estimatedMinutes: asInt(s.estimatedMinutes) ?? undefined,
            startsReviewWait: Boolean(s.startsReviewWait),
            evidence: level(s.evidence),
            citations: citations(s.citations),
          }
        : null,
    ) as GuideDraft["steps"],
    nuances: arr(d.nuances, (n) =>
      n && n.title
        ? {
            title: String(n.title),
            detail: String(n.detail ?? ""),
            severity: ["blocker", "gotcha", "note"].includes(n.severity)
              ? n.severity
              : "note",
            evidence: level(n.evidence),
            citations: citations(n.citations),
          }
        : null,
    ) as GuideDraft["nuances"],
    whenBlocked: arr(d.whenBlocked, (w) =>
      w && w.situation
        ? {
            situation: String(w.situation),
            action: String(w.action ?? ""),
            contact: typeof w.contact === "string" ? w.contact : undefined,
          }
        : null,
    ),
    conflicts: arr(d.conflicts, (c) => {
      const positions = citations(
        (Array.isArray(c?.positions) ? c.positions : []).map((p: RawJson) => p?.citation),
      );
      if (!c?.about || positions.length < 2) return null;
      return {
        about: String(c.about),
        positions: (c.positions as RawJson[])
          .filter((p) => p?.citation?.url && p?.citation?.quote)
          .map((p) => ({
            claim: String(p.claim ?? ""),
            citation: citations([p.citation])[0],
          })),
        resolution: String(c.resolution ?? "left unresolved"),
      };
    }),
    openQuestions: arr(d.openQuestions, (q) =>
      q && q.question
        ? {
            question: String(q.question),
            whyItMatters: String(q.whyItMatters ?? ""),
            howToResolve: String(q.howToResolve ?? ""),
          }
        : null,
    ),
    sources: citations(d.sources),
  } as GuideDraft;
}

type Verification = { kept: number; dropped: number; downgrades: PipelineEvent[] };

function verifyCitations(
  draft: GuideDraft,
  pages: FetchedPage[],
  emit: Emit,
): Verification {
  const byUrl = new Map(pages.map((p) => [p.url, p.text]));
  // Also index without a trailing slash, since models normalise URLs freely.
  for (const p of pages) byUrl.set(p.url.replace(/\/$/, ""), p.text);

  let kept = 0;
  let dropped = 0;
  const downgrades: PipelineEvent[] = [];

  const checkList = (cits: Citation[] | undefined): Citation[] => {
    if (!cits?.length) return [];
    return cits.filter((c) => {
      const text = byUrl.get(c.url) ?? byUrl.get(c.url?.replace(/\/$/, ""));
      if (!text) {
        dropped++;
        return false;
      }
      if (!quoteIsPresent(c.quote ?? "", text)) {
        dropped++;
        return false;
      }
      kept++;
      return true;
    });
  };

  /** A claim that loses every citation can no longer call itself "cited". */
  const checkEvidenced = (
    node: { evidence: EvidenceLevel; citations?: Citation[]; reasoning?: string } | undefined,
    about: string,
  ) => {
    if (!node) return;
    node.citations = checkList(node.citations);
    if (node.evidence === "cited" && node.citations.length === 0) {
      downgrades.push({
        type: "downgrade",
        about,
        from: "cited",
        to: "inferred",
        why: "quote not found in any page we fetched",
      });
      node.evidence = "inferred";
      node.reasoning =
        (node.reasoning ? node.reasoning + " " : "") +
        "(Citation removed during verification: the quoted sentence was not present in the fetched source.)";
    }
  };

  checkEvidenced(draft.developerConsoleUrl, "developer console URL");
  checkEvidenced(draft.rubric?.selfServeMinutes, "setup time");
  checkEvidenced(draft.rubric?.reviewWaitBusinessDays, "review wait");
  checkEvidenced(draft.rubric?.humanOnlyBlockers, "human-only steps");
  checkEvidenced(draft.rubric?.costUsd, "cost");
  checkEvidenced(draft.rubric?.prerequisiteArtifacts, "prerequisites");

  for (const s of draft.steps ?? []) checkEvidenced(s, `step: ${s.title}`);
  for (const n of draft.nuances ?? []) checkEvidenced(n, `nuance: ${n.title}`);

  draft.sources = checkList(draft.sources);
  draft.conflicts = (draft.conflicts ?? []).filter((c) =>
    (c.positions ?? []).every((p) => {
      const text = byUrl.get(p.citation?.url);
      return text ? quoteIsPresent(p.citation.quote ?? "", text) : false;
    }),
  );

  for (const d of downgrades) emit(d);
  return { kept, dropped, downgrades };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type RunOptions = {
  appNameOrUrl: string;
  origin: "seeded" | "live";
  maxPagesToRead?: number;
  emit?: Emit;
  signal?: AbortSignal;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "app";
}

type CatalogEntry = {
  slug: string;
  name: string;
  managedOAuth: boolean;
  composioDocUrl: string;
};

/** Match free-text input against the Composio toolkit catalog. */
export function matchCatalog(input: string): CatalogEntry | null {
  const t = (catalog as { toolkits: CatalogEntry[] }).toolkits;
  const q = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!q) return null;
  return (
    t.find((x) => x.name.toLowerCase().replace(/[^a-z0-9]/g, "") === q) ??
    t.find((x) => x.slug.toLowerCase().replace(/[^a-z0-9]/g, "") === q) ??
    t.find((x) => {
      const n = x.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return n.length > 3 && (n.startsWith(q) || q.startsWith(n));
    }) ??
    null
  );
}

export async function runPipeline(opts: RunOptions): Promise<Guide> {
  const { appNameOrUrl, origin, maxPagesToRead = 6, signal } = opts;
  const emit: Emit = opts.emit ?? (() => {});
  const ledger = new TokenLedger();
  const startedAt = Date.now();

  const pushUsage = () => emit({ type: "usage", ...ledger.totals() });

  // --- locate -------------------------------------------------------------
  emit({ type: "stage", key: "locate", label: "Locating the provider's documentation", status: "running" });
  const catalogEntry = matchCatalog(appNameOrUrl);
  if (catalogEntry) {
    emit({
      type: "log",
      message: `Found in Composio's catalog as ${catalogEntry.slug} — ${
        catalogEntry.managedOAuth
          ? "Composio provides a managed OAuth app, so this guide covers bringing your own"
          : "bring-your-own OAuth app required"
      }.`,
    });
  }

  const hypothesis = await hypothesiseProvider(appNameOrUrl, ledger);
  pushUsage();
  emit({
    type: "stage",
    key: "locate",
    label: "Locating the provider's documentation",
    status: "done",
    detail: hypothesis.docsRoots.join(", ") || "no candidates",
  });

  // --- discover -----------------------------------------------------------
  emit({ type: "stage", key: "discover", label: "Enumerating published docs", status: "running" });
  let discovered = await discoverDocUrls(hypothesis.docsRoots);
  let resolvedName = hypothesis.providerName;

  let allUrls = discovered?.urls ?? [];
  emit({
    type: "stage",
    key: "discover",
    label: "Enumerating published docs",
    status: "done",
    detail: discovered
      ? `${allUrls.length} pages via ${discovered.methods.join(" + ")}`
      : "no llms.txt, sitemap or crawlable index",
  });

  let shortlisted = shortlist(allUrls);

  // --- triage -------------------------------------------------------------
  emit({ type: "stage", key: "triage", label: "Triaging pages with gpt-oss-20b", status: "running" });
  let verdicts = shortlisted.length
    ? await triage(
        shortlisted,
        resolvedName,
        ledger,
        emit,
        maxPagesToRead,
        signal,
      )
    : [];
  pushUsage();
  emit({
    type: "stage",
    key: "triage",
    label: "Triaging pages with gpt-oss-20b",
    status: "done",
    detail: `${verdicts.length} of ${shortlisted.length} shortlisted pages look relevant`,
  });
  // A provider whose docs we can enumerate but where nothing discusses OAuth
  // registration is usually the wrong provider. Asked for "Gemini" the locate
  // step proposes Google's AI docs and finds 2,017 pages, none of them about
  // registering an app — while docs.gemini.com, the exchange, publishes a
  // readable index. Zero relevant pages is the signal to reconsider the name,
  // and it is a better signal than zero pages found.
  if (!verdicts.length && !catalogEntry && !signal?.aborted) {
    emit({
      type: "log",
      message: `nothing under ${resolvedName} discusses OAuth registration — checking whether "${appNameOrUrl}" means a different company`,
    });
    try {
      const alts = await alternateInterpretations(
        appNameOrUrl,
        [...hypothesis.docsRoots, ...(discovered ? [discovered.docsRoot] : [])],
        ledger,
      );
      for (const alt of alts) {
        if (signal?.aborted) break;
        const found = await discoverDocUrls(alt.docsRoots);
        if (!found?.urls.length) continue;

        const altShortlist = shortlist(found.urls);
        const altVerdicts = altShortlist.length
          ? await triage(altShortlist, alt.providerName, ledger, emit, maxPagesToRead, signal)
          : [];

        if (altVerdicts.length) {
          emit({
            type: "log",
            message: `resolved to ${alt.providerName} (${found.docsRoot}) — ${altVerdicts.length} relevant pages`,
          });
          discovered = found;
          allUrls = found.urls;
          shortlisted = altShortlist;
          verdicts = altVerdicts;
          resolvedName = alt.providerName;
          hypothesis.developerConsoleUrl ??= alt.developerConsoleUrl;
          break;
        }
      }
    } catch {
      /* the original dead end stands */
    }
    pushUsage();
  }

  emit({
    type: "counts",
    discovered: allUrls.length,
    shortlisted: shortlisted.length,
    triaged: verdicts.length,
    read: 0,
  });

  // --- read + extract -----------------------------------------------------
  emit({ type: "stage", key: "read", label: "Reading the top pages", status: "running" });
  const pages: FetchedPage[] = [];
  const findings: Finding[] = [];
  // Counted, not swallowed. Three seeded providers produced empty guides
  // before this existed, and the run logs gave no hint why: their docs are
  // client-rendered single-page apps whose served HTML carries no prose.
  let unreadable = 0;

  // Read across topics rather than straight down the relevance ranking. Take a
  // generous candidate list so skipped fetches don't eat into the budget.
  const toRead = diversify(verdicts, (v) => v.url, maxPagesToRead * 3);

  for (const v of toRead) {
    if (pages.length >= maxPagesToRead) break;
    if (signal?.aborted) break;

    const page = await fetchDocPage(v.url);
    if (!page) {
      unreadable++;
      emit({
        type: "source",
        url: v.url,
        verdict: "skipped",
        why: "no readable text — client-rendered page or fetch failed",
      });
      continue;
    }
    pages.push(page);
    emit({
      type: "source",
      url: page.url,
      verdict: "read",
      why: `${topicOf(page.url)} · ${v.topic || "relevant"} · read as ${page.readFrom.endsWith(".md") ? "markdown" : "html"}`,
    });

    try {
      const f = await extractFromPage(page, resolvedName, ledger, signal);
      findings.push(...f);
      emit({ type: "log", message: `${f.length} claims extracted from ${page.title || page.url}` });
    } catch (err) {
      emit({
        type: "log",
        message: `extraction failed for ${page.url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
    pushUsage();
  }

  emit({
    type: "stage",
    key: "read",
    label: "Reading the top pages",
    status: "done",
    detail:
      `${pages.length} pages read, ${findings.length} claims extracted` +
      (unreadable ? `, ${unreadable} unreadable` : ""),
  });

  if (!pages.length && unreadable > 0) {
    emit({
      type: "log",
      message:
        `None of the ${unreadable} candidate pages served readable text. This provider's ` +
        `documentation is almost certainly rendered client-side, which this pipeline cannot read.`,
    });
  }
  emit({
    type: "counts",
    discovered: allUrls.length,
    shortlisted: shortlisted.length,
    triaged: verdicts.length,
    read: pages.length,
  });

  // --- adjudicate ---------------------------------------------------------
  emit({ type: "stage", key: "adjudicate", label: "Writing the guide with gpt-oss-120b", status: "running" });
  const draftRaw = await adjudicate({
    appName: catalogEntry?.name ?? resolvedName,
    providerName: resolvedName,
    docsRoot: discovered?.docsRoot ?? null,
    consoleGuess: hypothesis.developerConsoleUrl,
    findings,
    ledger,
    signal,
    readFailure: pages.length
      ? null
      : unreadable > 0
        ? `${unreadable} relevant pages were located but none served readable text`
        : allUrls.length === 0
          ? "no documentation index could be found for this provider at all"
          : `${allUrls.length} pages were published but none looked relevant to OAuth app registration`,
  });
  pushUsage();
  emit({ type: "stage", key: "adjudicate", label: "Writing the guide with gpt-oss-120b", status: "done" });

  // --- verify -------------------------------------------------------------
  emit({ type: "stage", key: "verify", label: "Verifying every citation", status: "running" });
  const draft = normalizeDraft(draftRaw);
  const verification = verifyCitations(draft, pages, emit);
  emit({
    type: "stage",
    key: "verify",
    label: "Verifying every citation",
    status: "done",
    detail: `${verification.kept} quotes confirmed, ${verification.dropped} rejected, ${verification.downgrades.length} claims downgraded`,
  });

  // --- assemble -----------------------------------------------------------
  const { tier, rationale } = deriveTier(draft.rubric);
  const unresolved = (draft.conflicts ?? []).filter((c) =>
    /unresolved|cannot|could not|unclear/i.test(c.resolution ?? ""),
  ).length;
  const { confidence } = confidenceFor(draft.rubric, { unresolvedConflicts: unresolved });

  const guide: Guide = Guide.parse({
    ...draft,
    schemaVersion: 1,
    // Composio toolkit slugs are SCREAMING_SNAKE ("SALESFORCE_SERVICE_CLOUD"),
    // which is not a URL slug. The original is kept in composioToolkitSlug.
    slug: slugify(catalogEntry?.slug ?? appNameOrUrl),
    appName: draft.appName || catalogEntry?.name || appNameOrUrl,
    composioToolkitSlug: catalogEntry?.slug ?? null,
    composioManagedOAuth: catalogEntry ? catalogEntry.managedOAuth : null,
    docsRootUrl: discovered?.docsRoot ?? draft.docsRootUrl ?? null,
    tier,
    confidence,
    tierRationale: rationale,
    conflicts: draft.conflicts ?? [],
    openQuestions: draft.openQuestions ?? [],
    sources: draft.sources ?? [],
    generation: {
      generatedAt: new Date().toISOString(),
      origin,
      models: ledger.toArray(),
      docPagesDiscovered: allUrls.length,
      docPagesRead: pages.length,
      durationMs: Date.now() - startedAt,
    },
  });

  emit({ type: "done", guide });
  return guide;
}

/**
 * The model layer.
 *
 * Two models, both free on Groq, used for deliberately different jobs:
 *
 *   gpt-oss-20b  (cheap tier)  — reads hundreds of doc URLs and decides which
 *                                five matter. High volume, narrow judgement.
 *   gpt-oss-120b (smart tier)  — reads those five pages and writes the guide.
 *                                Low volume, hard judgement.
 *
 * The split is the point. Asking the small model to write a guide would produce
 * confident nonsense about approval timelines, which is the exact failure this
 * project exists to avoid. Asking the big model to sift 300 URLs would burn
 * most of the token budget on reading sitemaps. So the small model does breadth
 * and the big model does depth, and `TokenLedger` records what each one cost so
 * the efficiency claim is a measurement rather than a boast.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const MODELS = {
  /**
   * Breadth. URL triage and per-page claim extraction — the high-volume tier.
   *
   * Groq meters tokens per day *per model* (200,000 on the free tier), so the
   * choice here is partly about which bucket the volume lands in. Keeping the
   * cheap tier on a different model from the smart one means exhausting one
   * does not take the other down with it.
   */
  cheap: "openai/gpt-oss-20b",
  /** Depth. Synthesis, conflict resolution, writing the guide. */
  smart: "openai/gpt-oss-120b",
} as const;

/**
 * Fallbacks, tried in order when a model's daily budget is spent.
 *
 * Groq meters tokens per day per model, so an exhausted model is recovered
 * from by using a different one — the budgets are independent. Each tier falls
 * back towards the other tier first, since a bigger or smaller model doing the
 * job imperfectly beats no guide at all.
 */
export const CHEAP_FALLBACKS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"];
export const SMART_FALLBACKS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

/**
 * Why gpt-oss-20b and not a model with an untouched daily budget: the
 * alternatives are worse in ways that only show up under load. qwen3.8-27b
 * caps *output* tokens per minute at 1,000 and rejects any request asking for
 * more outright, and being a reasoning model it then spends that small budget
 * thinking and returns an empty completion. gpt-oss-20b is the one free model
 * here that reliably emits structured output at the sizes this pipeline needs.
 * Its daily cap is handled by failing fast and moving down this chain.
 */

export type ModelRole = "triage" | "extract" | "adjudicate";

export type LedgerEntry = {
  model: string;
  role: ModelRole;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

/** Accumulates per-model usage across a pipeline run. */
export class TokenLedger {
  private entries = new Map<string, LedgerEntry>();

  record(
    model: string,
    role: ModelRole,
    usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  ) {
    const key = `${model}:${role}`;
    const e =
      this.entries.get(key) ??
      { model, role, calls: 0, inputTokens: 0, outputTokens: 0 };
    e.calls += 1;
    e.inputTokens += usage?.prompt_tokens ?? 0;
    e.outputTokens += usage?.completion_tokens ?? 0;
    this.entries.set(key, e);
  }

  toArray(): LedgerEntry[] {
    return [...this.entries.values()];
  }

  totals() {
    return this.toArray().reduce(
      (acc, e) => ({
        calls: acc.calls + e.calls,
        inputTokens: acc.inputTokens + e.inputTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
      }),
      { calls: 0, inputTokens: 0, outputTokens: 0 },
    );
  }
}

/**
 * Rate-limit governor.
 *
 * Groq's free tier caps *tokens per minute* per model — 8,000 on
 * gpt-oss-20b — which is the binding constraint on this pipeline, far more than
 * requests per minute. Rather than guess at the budget, we read what the server
 * tells us on every response (`x-ratelimit-remaining-tokens`,
 * `x-ratelimit-reset-tokens`) and wait when the next call wouldn't fit.
 *
 * This turns the common failure — a burst of calls, three of them 429ing, a
 * half-populated guide — into a slightly slower run that completes. Reacting to
 * real server state also means it keeps working if Groq changes the limits.
 */
type RateState = {
  remaining: number;
  limit: number;
  resetAtMs: number;
  seenAtMs: number;
};
const rateByModel = new Map<string, RateState>();

/** Rough token estimate for a request, used only to decide whether to wait. */
function estimateTokens(system: string, user: string, maxTokens: number): number {
  const input = Math.ceil((system.length + user.length) / 4);
  // Completions rarely reach the ceiling; assume a third for pacing purposes.
  return input + Math.ceil(maxTokens * 0.33);
}

function parseDuration(raw: string | null): number {
  if (!raw) return 0;
  const m = raw.match(
    /(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s(?!\w))?(?:(\d+(?:\.\d+)?)ms)?/,
  );
  if (!m) return 0;
  return (
    (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 1000 + Number(m[3] ?? 0)
  );
}

function readRateHeaders(model: string, headers: Headers) {
  const remaining = Number(headers.get("x-ratelimit-remaining-tokens"));
  const limit = Number(headers.get("x-ratelimit-limit-tokens"));
  if (!Number.isFinite(remaining)) return;

  rateByModel.set(model, {
    remaining,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 8000,
    resetAtMs: Date.now() + (parseDuration(headers.get("x-ratelimit-reset-tokens")) || 1000),
    seenAtMs: Date.now(),
  });
}

/**
 * Wait only as long as the bucket needs to refill the shortfall.
 *
 * The first version of this waited for the full reset window whenever the
 * budget was short, capped at 65 seconds. That was wrong about how the limit
 * works and it cost minutes: triage issues five calls, each one found the
 * budget short, each one slept, and a guide spent ~350 seconds sitting in a
 * stage that should take twenty.
 *
 * Groq's token allowance refills continuously at roughly limit/60 per second,
 * so needing 2,500 tokens with 1,200 left is a ten-second wait, not a minute.
 * We compute the shortfall against that rate, credit whatever has already
 * refilled since the last response, and cap the result so a bad reading can
 * never strand a run.
 */
const MAX_BUDGET_WAIT_MS = 20_000;

async function waitForBudget(model: string, need: number) {
  const state = rateByModel.get(model);
  if (!state) return;

  const perSecond = state.limit / 60;
  const elapsedSec = (Date.now() - state.seenAtMs) / 1000;
  // Credit the refill that has happened since we last heard from the server.
  const available = Math.min(
    state.limit,
    state.remaining + elapsedSec * perSecond,
  );

  if (available >= need) return;

  const shortfall = need - available;
  const waitMs = Math.min(
    Math.ceil((shortfall / perSecond) * 1000) + 250,
    MAX_BUDGET_WAIT_MS,
  );

  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  // Force the next call to rely on a fresh reading rather than this stale one.
  rateByModel.delete(model);
}

/** Seconds Groq suggests waiting, parsed out of its 429 body. */
function retryAfterFromBody(body: string): number | undefined {
  const m = body.match(/try again in ([\d.]+)s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) + 250 : undefined;
}

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
    /** True when the model's daily token budget is spent. */
    readonly dailyBudgetSpent = false,
  ) {
    super(message);
    this.name = "GroqError";
  }
}

type ChatOpts = {
  model: string;
  role: ModelRole;
  system: string;
  user: string;
  ledger?: TokenLedger;
  /** Ask for a JSON object back. */
  json?: boolean;
  maxTokens?: number;
  /** Groq's free tier is ~30 req/min, so transient 429s are expected. */
  retries?: number;
  /**
   * gpt-oss models spend output budget on an internal reasoning channel before
   * emitting content. Left high, a structured-extraction call can burn its whole
   * ceiling thinking and return an empty completion, or truncate mid-JSON. These
   * are narrow extraction tasks, so "low" is both cheaper and more reliable.
   */
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

function apiKey(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k) {
    throw new GroqError(
      "GROQ_API_KEY is not set. Copy .env.example to .env.local and add a free key from https://console.groq.com",
    );
  }
  return k;
}

export async function chat(opts: ChatOpts): Promise<string> {
  const {
    model,
    role,
    system,
    user,
    ledger,
    json = false,
    maxTokens = 8000,
    retries = 3,
    reasoningEffort = "low",
    signal,
  } = opts;

  let lastErr: unknown;
  // Groq's strict JSON mode occasionally rejects these models' own output with
  // `json_validate_failed` and returns nothing at all. When that happens, asking
  // again in plain text and parsing it ourselves recovers the call — `parseJson`
  // already tolerates fences and preamble. Degrading beats failing a run a user
  // is watching.
  let wantJson = json;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Per-minute 429s clear in seconds; back off and keep going. The cap
      // matters: Groq answers a per-day 429 with "try again in 4m29s", and
      // honouring that makes the pipeline look hung.
      const suggested =
        lastErr instanceof GroqError && lastErr.retryAfterMs
          ? lastErr.retryAfterMs
          : Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((r) => setTimeout(r, Math.min(suggested, 20_000)));
    }

    try {
      await waitForBudget(model, estimateTokens(system, user, maxTokens));

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_completion_tokens: maxTokens,
          temperature: 0.2,
          reasoning_effort: reasoningEffort,
          ...(wantJson ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      readRateHeaders(model, res.headers);

      if (!res.ok) {
        const body = await res.text();
        const retryAfter = Number(res.headers.get("retry-after"));

        if (wantJson && body.includes("json_validate_failed")) {
          wantJson = false;
          lastErr = new GroqError(
            `Groq rejected its own JSON for ${model}; retrying in text mode`,
            res.status,
            0,
          );
          continue;
        }

        // Per-day exhaustion is not transient: the suggested wait can be
        // hours, and sleeping on it is why a run once sat in "triage" for six
        // minutes. Surface it immediately so the caller can switch models.
        const perDay = /tokens per day|TPD|requests per day|RPD/i.test(body);

        throw new GroqError(
          `Groq ${res.status} for ${model}: ${body.slice(0, 400)}`,
          res.status,
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : retryAfterFromBody(body),
          perDay,
        );
      }

      const data = await res.json();
      ledger?.record(model, role, data.usage);

      const content: string = data.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new GroqError(`Empty completion from ${model}`);
      return content;
    } catch (err) {
      lastErr = err;
      // A 4xx that isn't rate limiting won't fix itself.
      if (err instanceof GroqError && err.dailyBudgetSpent) throw err;
      if (
        err instanceof GroqError &&
        err.status &&
        err.status !== 429 &&
        err.status < 500
      ) {
        throw err;
      }
      if (attempt === retries) throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new GroqError(String(lastErr));
}

/**
 * Parse a model's JSON reply.
 *
 * Even in JSON mode these models occasionally wrap the object in a fence or add
 * a sentence of preamble, so recover from both rather than failing a run the
 * user is watching. Validation against the real schema happens at the call
 * site — this only gets us to an object.
 */
export function parseJson<T = unknown>(raw: string): T {
  const attempts: string[] = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1].trim());

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const a of attempts) {
    try {
      return JSON.parse(a) as T;
    } catch {
      /* try the next shape */
    }
  }

  throw new GroqError(
    `Could not parse JSON from model output: ${raw.slice(0, 300)}`,
  );
}

/**
 * Ask for JSON and parse it ourselves.
 *
 * Note what this does *not* do: set `response_format: {type: "json_object"}`.
 * Groq's constrained decoding for these models is pathologically slow — a
 * triage call emitting 207 tokens took 122 seconds with it on and under a
 * second with it off. That one flag was the entire reason a guide took three
 * minutes to generate.
 *
 * The prompts already specify the exact shape, `parseJson` tolerates fences
 * and stray preamble, and every result is validated against a Zod schema
 * afterwards, so strict mode was buying reliability we already had.
 */
export async function chatJson<T = unknown>(opts: ChatOpts): Promise<T> {
  return parseJson<T>(await chat({ ...opts, json: false }));
}

/**
 * Run a call, moving to another model if this one's daily budget is spent.
 *
 * Daily exhaustion is the one failure that cannot be waited out inside a
 * request, and it is invisible until it happens — the per-minute headers look
 * healthy right up to the moment the per-day counter runs out. Since each model
 * is metered separately, the recovery is simply to use a different one and say
 * so, rather than returning an empty guide because the budget ran out
 * mid-investigation.
 */
export async function chatJsonWithFallback<T = unknown>(
  opts: ChatOpts & { fallbacks?: string[]; onFallback?: (from: string, to: string) => void },
): Promise<T> {
  const chain = [opts.model, ...(opts.fallbacks ?? [])];
  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {
    try {
      return await chatJson<T>({ ...opts, model: chain[i] });
    } catch (err) {
      lastErr = err;
      const spent = err instanceof GroqError && err.dailyBudgetSpent;
      if (!spent) throw err;
      if (i < chain.length - 1) {
        opts.onFallback?.(chain[i], chain[i + 1]);
        continue;
      }

      // Every model in the chain is out of daily budget. The cap is a rolling
      // window rather than a midnight reset, so a little capacity frees up
      // continuously — one short wait and a retry on the original model
      // recovers the common case instead of abandoning the run.
      opts.onFallback?.(chain[i], `${chain[0]} (after a short wait)`);
      await new Promise((r) => setTimeout(r, 20_000));
      return await chatJson<T>({ ...opts, model: chain[0] });
    }
  }

  throw lastErr instanceof Error ? lastErr : new GroqError(String(lastErr));
}

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
  /** Breadth. URL triage, claim extraction from a single page. */
  cheap: "openai/gpt-oss-20b",
  /** Depth. Synthesis, conflict resolution, writing the guide. */
  smart: "openai/gpt-oss-120b",
} as const;

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
type RateState = { remaining: number; resetAtMs: number };
const rateByModel = new Map<string, RateState>();

/** Rough token estimate for a request, used only to decide whether to wait. */
function estimateTokens(system: string, user: string, maxTokens: number): number {
  const input = Math.ceil((system.length + user.length) / 4);
  // Completions rarely reach the ceiling; assume a third for pacing purposes.
  return input + Math.ceil(maxTokens * 0.33);
}

function readRateHeaders(model: string, headers: Headers) {
  const remaining = Number(headers.get("x-ratelimit-remaining-tokens"));
  const resetRaw = headers.get("x-ratelimit-reset-tokens");
  if (!Number.isFinite(remaining)) return;

  // Groq formats the reset as a duration: "6.6525s", "1m30s", "250ms".
  let resetMs = 0;
  if (resetRaw) {
    const m = resetRaw.match(/(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?/);
    if (m) {
      resetMs =
        (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 1000 + Number(m[3] ?? 0);
    }
  }
  rateByModel.set(model, {
    remaining,
    resetAtMs: Date.now() + (resetMs || 60_000),
  });
}

async function waitForBudget(model: string, need: number) {
  const state = rateByModel.get(model);
  if (!state) return;
  if (Date.now() >= state.resetAtMs) {
    rateByModel.delete(model);
    return;
  }
  if (state.remaining >= need) return;

  const waitMs = Math.min(state.resetAtMs - Date.now() + 250, 65_000);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
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
      // Free-tier 429s clear quickly; back off and keep going rather than
      // failing a generation the user is watching.
      const waitMs =
        lastErr instanceof GroqError && lastErr.retryAfterMs
          ? lastErr.retryAfterMs
          : Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((r) => setTimeout(r, waitMs));
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

        throw new GroqError(
          `Groq ${res.status} for ${model}: ${body.slice(0, 400)}`,
          res.status,
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : retryAfterFromBody(body),
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

export async function chatJson<T = unknown>(opts: ChatOpts): Promise<T> {
  return parseJson<T>(await chat({ ...opts, json: true }));
}

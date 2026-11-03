"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Guide } from "@/lib/schema";
import type { PipelineEvent, StageKey } from "@/lib/research/pipeline";
import { GuideView } from "./guide-view";

/**
 * Live generation, shown as an investigation rather than a wait.
 *
 * Three minutes of spinner reads as a broken page. Three minutes of watching
 * 19,000 discovered pages narrow to six, then seeing a claim get downgraded
 * because its quote wasn't really in the source, reads as diligence — and it
 * lets someone judge the evidence instead of taking the output on trust.
 *
 * The downgrade events are the ones to watch. Each is a moment the system
 * caught its own model inventing a citation and refused to publish it as one.
 */

const STAGE_ORDER: { key: StageKey; label: string; hint: string }[] = [
  { key: "locate", label: "Locate", hint: "find the provider's developer docs" },
  { key: "discover", label: "Discover", hint: "llms.txt, robots.txt, sitemaps" },
  { key: "triage", label: "Triage", hint: "gpt-oss-20b ranks the candidates" },
  { key: "read", label: "Read", hint: "fetch markdown, extract claims" },
  { key: "adjudicate", label: "Write", hint: "gpt-oss-120b writes the guide" },
  { key: "verify", label: "Verify", hint: "re-check every quote against the page" },
];

type StageState = { status: "pending" | "running" | "done"; detail?: string };

type Counts = { discovered: number; shortlisted: number; triaged: number; read: number };
type Usage = { calls: number; inputTokens: number; outputTokens: number };
type SourceRow = { url: string; verdict: "read" | "skipped"; why?: string };
type Downgrade = { about: string; why: string };

export function Generator({
  suggestions,
  initialApp = "",
}: {
  suggestions: { name: string; slug: string; managedOAuth: boolean }[];
  initialApp?: string;
}) {
  const [app, setApp] = useState(initialApp);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [downgrades, setDowngrades] = useState<Downgrade[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const startedAt = useRef<number>(0);
  const logEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [logs, sources]);

  useEffect(() => () => esRef.current?.close(), []);

  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q || running) return;

      esRef.current?.close();
      setRunning(true);
      setStages({});
      setLogs([]);
      setSources([]);
      setDowngrades([]);
      setCounts(null);
      setUsage(null);
      setGuide(null);
      setError(null);
      setElapsed(0);
      startedAt.current = Date.now();

      const es = new EventSource(`/api/generate?app=${encodeURIComponent(q)}`);
      esRef.current = es;

      es.onmessage = (ev) => {
        let e: PipelineEvent | { type: "ping" };
        try {
          e = JSON.parse(ev.data);
        } catch {
          return;
        }

        switch (e.type) {
          case "ping":
            break;
          case "stage":
            setStages((s) => ({
              ...s,
              [e.key]: { status: e.status === "done" ? "done" : "running", detail: e.detail },
            }));
            break;
          case "log":
            setLogs((l) => [...l.slice(-60), e.message]);
            break;
          case "source":
            setSources((s) => [...s, { url: e.url, verdict: e.verdict, why: e.why }]);
            break;
          case "counts":
            setCounts({
              discovered: e.discovered,
              shortlisted: e.shortlisted,
              triaged: e.triaged,
              read: e.read,
            });
            break;
          case "usage":
            setUsage({
              calls: e.calls,
              inputTokens: e.inputTokens,
              outputTokens: e.outputTokens,
            });
            break;
          case "downgrade":
            setDowngrades((d) => [...d, { about: e.about, why: e.why }]);
            break;
          case "done":
            setGuide(e.guide);
            stop();
            break;
          case "error":
            setError(e.message);
            stop();
            break;
        }
      };

      es.onerror = () => {
        // EventSource fires this on a clean server close too, so only treat it
        // as a failure when no guide arrived.
        setGuide((g) => {
          if (!g) {
            setError((prev) =>
              prev ??
              "The connection closed before the guide finished. On a hosted deployment this usually means the platform's function timeout was reached — the CLI (pnpm guide <app>) has no such limit.",
            );
          }
          return g;
        });
        stop();
      };
    },
    [running, stop],
  );

  // Deep link: /generate?app=Xero starts immediately.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (initialApp && !autoStarted.current) {
      autoStarted.current = true;
      start(initialApp);
    }
  }, [initialApp, start]);

  const matches =
    app.trim().length >= 2 && !running && !guide
      ? suggestions
          .filter((s) => s.name.toLowerCase().includes(app.trim().toLowerCase()))
          .slice(0, 6)
      : [];

  return (
    <div>
      <form
        className="no-print"
        onSubmit={(e) => {
          e.preventDefault();
          start(app);
        }}
      >
        <label htmlFor="app" className="block text-[13px] font-medium">
          App name or website
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            id="app"
            value={app}
            onChange={(e) => setApp(e.target.value)}
            placeholder="Xero, linear.app, Smartsheet…"
            autoComplete="off"
            disabled={running}
            className="card min-w-0 flex-1 px-3 py-2.5 text-[14px] outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={running || !app.trim()}
            className="mono rounded-md px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {running ? "investigating…" : "Investigate"}
          </button>
          {running && (
            <button
              type="button"
              onClick={stop}
              className="mono rounded-md border px-3 py-2.5 text-[13px] text-muted"
              style={{ borderColor: "var(--border)" }}
            >
              stop
            </button>
          )}
        </div>

        {matches.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matches.map((m) => (
              <button
                key={m.slug}
                type="button"
                onClick={() => {
                  setApp(m.name);
                  start(m.name);
                }}
                className="mono rounded-md border px-2 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
                style={{ borderColor: "var(--border)" }}
              >
                {m.name}
                <span
                  className="ml-1.5"
                  style={{ color: m.managedOAuth ? "var(--tier-0)" : "var(--tier-3)" }}
                >
                  {m.managedOAuth ? "managed" : "byo"}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      {(running || guide || error) && (
        <section className="mt-6">
          {/* Stage rail */}
          <ol className="card grid gap-0 divide-y hairline sm:grid-cols-6 sm:divide-x sm:divide-y-0">
            {STAGE_ORDER.map((s) => {
              const st = stages[s.key]?.status ?? "pending";
              const color =
                st === "done" ? "var(--ev-verified)" : st === "running" ? "var(--brand)" : "var(--muted)";
              return (
                <li key={s.key} className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`inline-block h-1.5 w-1.5 rounded-full ${st === "running" ? "pulse" : ""}`}
                      style={{
                        background:
                          st === "pending" ? "color-mix(in oklab, var(--muted) 35%, transparent)" : color,
                      }}
                    />
                    <span className="mono text-[11px] font-medium" style={{ color }}>
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted">
                    {stages[s.key]?.detail ?? s.hint}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* The funnel — the efficiency claim as a number, not an adjective. */}
          {counts && (
            <div className="card mt-3 p-4">
              <div className="mono flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                <span className="font-semibold">{counts.discovered.toLocaleString()}</span>
                <span className="text-muted">pages published</span>
                <span aria-hidden className="text-muted">→</span>
                <span className="font-semibold">{counts.shortlisted}</span>
                <span className="text-muted">shortlisted free</span>
                <span aria-hidden className="text-muted">→</span>
                <span className="font-semibold" style={{ color: "var(--brand)" }}>
                  {counts.triaged}
                </span>
                <span className="text-muted">judged relevant</span>
                <span aria-hidden className="text-muted">→</span>
                <span className="font-semibold" style={{ color: "var(--ev-verified)" }}>
                  {counts.read}
                </span>
                <span className="text-muted">actually read</span>
              </div>
              {counts.discovered > 0 && (
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "color-mix(in oklab, var(--muted) 15%, transparent)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0.4, (counts.shortlisted / counts.discovered) * 100)}%`,
                      background: "var(--brand)",
                    }}
                  />
                </div>
              )}
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                The first narrowing costs nothing — it is pattern matching on URL
                paths. Only the last two steps spend tokens, which is what keeps
                this inside a free tier&rsquo;s budget.
              </p>
            </div>
          )}

          {/* Usage + clock */}
          <div className="mono mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-muted">
            <span>
              elapsed <span className="text-foreground">{(elapsed / 1000).toFixed(1)}s</span>
            </span>
            {usage && (
              <>
                <span>
                  calls <span className="text-foreground">{usage.calls}</span>
                </span>
                <span>
                  tokens{" "}
                  <span className="text-foreground">
                    {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out
                  </span>
                </span>
                <span>
                  cost <span className="text-foreground">$0.00</span> (free tier)
                </span>
              </>
            )}
          </div>

          {/* Downgrades — the honesty mechanism firing in public. */}
          {downgrades.length > 0 && (
            <div
              className="mt-3 rounded-lg border p-3"
              style={{
                borderColor: "color-mix(in oklab, var(--ev-unknown) 35%, transparent)",
                background: "color-mix(in oklab, var(--ev-unknown) 7%, transparent)",
              }}
            >
              <p
                className="mono text-[10.5px] uppercase tracking-wide"
                style={{ color: "var(--ev-unknown)" }}
              >
                {downgrades.length} claim{downgrades.length === 1 ? "" : "s"} demoted during verification
              </p>
              <ul className="mt-1.5 space-y-1 text-[12px]">
                {downgrades.map((d, i) => (
                  <li key={i} className="fade-in">
                    <span className="font-medium">{d.about}</span>
                    <span className="text-muted"> — {d.why}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                The model offered a citation for each of these. The quote was not
                in the page, so the citation was removed and the claim is now
                labelled inferred.
              </p>
            </div>
          )}

          {/* Sources + log */}
          {(sources.length > 0 || logs.length > 0) && (
            <div className="card mt-3 max-h-72 overflow-y-auto p-3">
              <ul className="space-y-1.5">
                {sources.map((s, i) => (
                  <li key={i} className="mono fade-in flex flex-wrap items-baseline gap-2 text-[11px]">
                    <span
                      className="shrink-0"
                      style={{ color: s.verdict === "read" ? "var(--ev-verified)" : "var(--muted)" }}
                    >
                      {s.verdict === "read" ? "read" : "skip"}
                    </span>
                    <a
                      className="brand-link break-all"
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.url.replace(/^https?:\/\//, "")}
                    </a>
                    {s.why && <span className="text-muted">{s.why}</span>}
                  </li>
                ))}
                {logs.map((l, i) => (
                  <li key={`l${i}`} className="mono fade-in text-[11px] text-muted">
                    {l}
                  </li>
                ))}
              </ul>
              <div ref={logEnd} />
            </div>
          )}

          {error && (
            <div
              className="mt-3 rounded-lg border p-3 text-[12.5px] leading-relaxed"
              style={{
                borderColor: "color-mix(in oklab, var(--ev-unknown) 40%, transparent)",
                background: "color-mix(in oklab, var(--ev-unknown) 7%, transparent)",
              }}
            >
              {error}
            </div>
          )}
        </section>
      )}

      {guide && (
        <div className="mt-10 border-t hairline pt-8">
          <GuideView g={guide} showBackLink={false} />
        </div>
      )}
    </div>
  );
}

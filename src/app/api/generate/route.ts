import { runPipeline, type PipelineEvent } from "@/lib/research/pipeline";

/**
 * Live guide generation, streamed as server-sent events.
 *
 * The stream is not decoration. On Groq's free tier a guide takes two to three
 * minutes, because the 8,000-tokens-per-minute cap forces the pipeline to pace
 * itself. A spinner for three minutes reads as broken; the same three minutes
 * spent watching pages get discovered, triaged, read and then fact-checked reads
 * as work being done — and it lets a reader judge the evidence for themselves
 * rather than taking the finished guide on trust.
 */

export const runtime = "nodejs";
// Generation routinely exceeds a minute. Vercel caps this per plan, and if the
// platform cuts the function off the client reports how far it got rather than
// silently showing a half-written guide.
export const maxDuration = 300;

const encoder = new TextEncoder();

function sse(event: PipelineEvent | { type: "ping" }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const app = (url.searchParams.get("app") ?? "").trim();
  const pages = Math.min(
    Math.max(Number(url.searchParams.get("pages")) || 6, 3),
    10,
  );

  if (!app || app.length > 120) {
    return new Response(
      JSON.stringify({ error: "Pass ?app= with an app name or website." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "GROQ_API_KEY is not configured on the server. Copy .env.example to .env.local and add a free key from console.groq.com.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const controller = new AbortController();
  // If the reader closes the tab, stop spending the token budget on them.
  req.signal.addEventListener("abort", () => controller.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let closed = false;
      const send = (e: PipelineEvent | { type: "ping" }) => {
        if (closed) return;
        try {
          ctrl.enqueue(sse(e));
        } catch {
          closed = true;
        }
      };

      // Proxies and load balancers will drop a connection that goes quiet, and
      // the gaps between stages here are long enough to matter.
      const keepAlive = setInterval(() => send({ type: "ping" }), 15_000);

      try {
        await runPipeline({
          appNameOrUrl: app,
          origin: "live",
          maxPagesToRead: pages,
          emit: send,
          signal: controller.signal,
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearInterval(keepAlive);
        closed = true;
        try {
          ctrl.close();
        } catch {
          /* already closed by the client */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and similar buffer streamed responses unless told not to.
      "x-accel-buffering": "no",
    },
  });
}

import Link from "next/link";
import { Library } from "@/components/library";
import { CATALOG, allGuides, coverage } from "@/lib/guides";

export default function Home() {
  const guides = allGuides();
  const cov = coverage();
  const { counts } = CATALOG;

  return (
    <>
      {/* Hero, in their idiom: a dark band, a headline whose real claim sits in
          a solid blue block, and uppercase monospace actions. */}
      <section className="band-dark mb-6 overflow-hidden px-6 py-12 sm:px-10 sm:py-16">
        <p className="eyebrow" style={{ color: "#8f8f96" }}>
          For developers wiring agents to third-party apps
        </p>

        <h1 className="mt-4 max-w-3xl text-[30px] font-semibold leading-[1.12] tracking-tight sm:text-[42px]">
          Will your integration ship this week, or{" "}
          <span className="mark">next quarter?</span>
        </h1>

        <p className="muted-on-dark mt-5 max-w-2xl text-[14.5px] leading-relaxed">
          Registering your own OAuth app with a provider takes anywhere from two
          minutes to two months, and the documentation rarely says which.
          Preflight reads the provider&rsquo;s own docs and reports the timeline,
          the cost, the blockers, and which steps an agent can take off your
          hands — with every claim labelled by how it is known.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          <Link href="/generate" className="btn btn-primary">
            Investigate an app
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/plan"
            className="btn"
            style={{ background: "transparent", borderColor: "#3a3a40", color: "#f3f3f3" }}
          >
            <span aria-hidden>◷</span>
            Plan a launch
          </Link>
        </div>

        <div className="mt-10 border-t pt-5" style={{ borderColor: "#26262b" }}>
          <p className="eyebrow" style={{ color: "#8f8f96" }}>
            Scoped from Composio&rsquo;s catalog →
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="mono text-[30px] font-semibold leading-none">
                {counts.managedOAuth}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium">
                toolkits Composio already covers
              </p>
              <p className="muted-on-dark mt-1 text-[12px] leading-relaxed">
                A managed OAuth app exists — until you need your own branding,
                extra scopes, or your own rate limit.
              </p>
            </div>
            <div>
              <p
                className="mono text-[30px] font-semibold leading-none"
                style={{ color: "#6f78ff" }}
              >
                {counts.bringYourOwn}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium">
                toolkits where you bring your own
              </p>
              <p className="muted-on-dark mt-1 text-[12px] leading-relaxed">
                No managed app. Today that developer gets a link to the
                provider&rsquo;s docs and good luck.{" "}
                <span className="mono" style={{ color: "#f3f3f3" }}>
                  {counts.bringYourOwnExcludingMcp}
                </span>{" "}
                are first-party apps rather than vendor MCP servers — the library
                is scoped to those.
              </p>
            </div>
            <div>
              <p className="mono text-[30px] font-semibold leading-none">
                {cov.covered}
                <span className="text-[17px]" style={{ color: "#8f8f96" }}>
                  /{cov.target}
                </span>
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium">guides written so far</p>
              <p className="muted-on-dark mt-1 text-[12px] leading-relaxed">
                The rest generate on demand in about three minutes. None are
                hand-written —{" "}
                <Link href="/method" className="underline underline-offset-2" style={{ color: "#8fa6ff" }}>
                  see the method
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <p className="mono mb-8 text-[11px] text-muted">
        source:{" "}
        <a className="brand-link" href={CATALOG.source.url} target="_blank" rel="noreferrer">
          {CATALOG.source.url.replace("https://", "")}
        </a>{" "}
        · fetched {CATALOG.source.fetchedAt.slice(0, 10)} · parsed at build time,
        counts checked against the page&rsquo;s own totals
      </p>

      {guides.length > 0 ? (
        <Library guides={guides} remainingCount={cov.remaining.length} />
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[14px] font-medium">The library is empty.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
            Run <span className="mono">pnpm seed</span> to generate the seeded
            guides, or investigate any app right now.
          </p>
          <Link
            href="/generate"
            className="btn btn-primary mt-4"
          >
            Generate a guide
          </Link>
        </div>
      )}
    </>
  );
}

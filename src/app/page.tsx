import Link from "next/link";
import { Library } from "@/components/library";
import { CATALOG, allGuides, coverage } from "@/lib/guides";

export default function Home() {
  const guides = allGuides();
  const cov = coverage();
  const { counts } = CATALOG;

  return (
    <>
      <section className="mb-10">
        <p
          className="mono mb-3 inline-block rounded-full px-2.5 py-1 text-[11px]"
          style={{ background: "var(--brand-wash)", color: "var(--brand)" }}
        >
          for developers wiring agents to third-party apps
        </p>

        <h1 className="max-w-3xl text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[34px]">
          Find out whether your integration ships this week or next quarter —
          before you start building it.
        </h1>

        <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-muted">
          Registering your own OAuth app with a provider takes anywhere from two
          minutes to two months, and the documentation rarely says which. Preflight
          investigates the provider&rsquo;s own docs and reports the timeline, the
          cost, the blockers, and which steps an agent can take off your hands —
          with every claim labelled by how we know it.
        </p>

        {/* The scope argument, read straight off Composio's catalog rather than
            asserted. This is the whole reason the project is pointed where it is. */}
        <div className="card mt-7 overflow-hidden">
          <div className="grid divide-y hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-4">
              <p className="mono text-[26px] font-semibold leading-none">
                {counts.managedOAuth}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium">
                toolkits Composio already covers
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                A managed OAuth app exists, so you can skip registration — until
                you need your own branding, extra scopes, or your own rate limit.
              </p>
            </div>
            <div className="p-4" style={{ background: "var(--brand-wash)" }}>
              <p
                className="mono text-[26px] font-semibold leading-none"
                style={{ color: "var(--brand)" }}
              >
                {counts.bringYourOwn}
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium">
                toolkits where you must bring your own
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                No managed app exists. Today the developer gets a link to the
                provider&rsquo;s docs and a good luck.{" "}
                <span className="mono">
                  {counts.bringYourOwnExcludingMcp}
                </span>{" "}
                of those are first-party apps rather than vendor MCP servers —
                that is the library this is scoped to.
              </p>
            </div>
            <div className="p-4">
              <p className="mono text-[26px] font-semibold leading-none">
                {cov.covered}
                <span className="text-[16px] text-muted">/{cov.target}</span>
              </p>
              <p className="mt-1.5 text-[12.5px] font-medium">guides written so far</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                The rest generate on demand in about three minutes. Nothing is
                pre-written by hand —{" "}
                <Link href="/method" className="brand-link">
                  see the method
                </Link>
                .
              </p>
            </div>
          </div>
          <div
            className="mono border-t hairline px-4 py-2 text-[11px] text-muted"
            style={{ background: "color-mix(in oklab, var(--muted) 4%, transparent)" }}
          >
            source:{" "}
            <a
              className="brand-link"
              href={CATALOG.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {CATALOG.source.url.replace("https://", "")}
            </a>{" "}
            · fetched {CATALOG.source.fetchedAt.slice(0, 10)} · parsed at build
            time, counts checked against the page&rsquo;s own totals
          </div>
        </div>
      </section>

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
            className="mono mt-4 inline-block rounded-md px-3 py-2 text-[12px] font-medium text-white"
            style={{ background: "var(--brand)" }}
          >
            Generate a guide
          </Link>
        </div>
      )}
    </>
  );
}

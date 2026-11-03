"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Header, built to Composio's control language: uppercase monospace in
 * hard-edged boxes, with the primary action filled in brand blue and the
 * secondary one boxed and tinted rather than left as plain text.
 *
 * Launch plan is deliberately a button and not a nav word. It is the page that
 * answers the question a developer actually arrives with — "when can we ship"
 * — and as plain text between two other links it read as a minor section.
 */

const LINKS = [
  { href: "/", label: "Library" },
  { href: "/method", label: "Method" },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/guide") : pathname.startsWith(href);

  return (
    <>
      {/* Their announcement strip: full-bleed brand blue, one sentence, one link. */}
      <div
        className="no-print w-full text-center"
        style={{ background: "var(--brand)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-1.5">
          <span
            className="mono rounded-[3px] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.12em]"
            style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}
          >
            Scope
          </span>
          <span className="mono text-[11px] text-white/90">
            262 of Composio&rsquo;s 387 OAuth toolkits need your own app.
          </span>
          <Link
            href="/method"
            className="mono text-[11px] font-medium text-white underline-offset-2 hover:underline"
          >
            Why that is the library →
          </Link>
        </div>
      </div>

      <header className="no-print sticky top-0 z-20 border-b hairline bg-[color-mix(in_oklab,var(--background)_90%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <Link href="/" className="mr-2 flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-[6px] text-[12px] font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              ⏱
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Preflight</span>
          </Link>

          <nav className="flex items-center gap-0.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-active={isActive(l.href)}
                className="navlink hidden sm:inline-flex"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/plan"
              className="btn btn-accent"
              data-active={isActive("/plan")}
              style={
                isActive("/plan")
                  ? { borderColor: "var(--brand)", background: "color-mix(in oklab, var(--brand) 16%, transparent)" }
                  : undefined
              }
            >
              <span aria-hidden>◷</span>
              Launch plan
            </Link>
            <Link href="/generate" className="btn btn-primary">
              Generate a guide
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

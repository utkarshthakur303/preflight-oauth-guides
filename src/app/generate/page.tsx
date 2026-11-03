import type { Metadata } from "next";
import { Generator } from "@/components/generator";
import { CATALOG, allGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Generate a guide — Preflight",
  description:
    "Submit any app. An agent reads the provider's own documentation and produces a shareable OAuth setup guide, with every claim labelled by how it knows.",
};

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  const have = new Set(allGuides().map((g) => g.composioToolkitSlug));

  // Suggest toolkits with no guide yet, bring-your-own first: that is the gap.
  const suggestions = CATALOG.toolkits
    .filter((t) => !t.isMcpToolkit)
    .sort(
      (a, b) =>
        (have.has(b.slug) ? 0 : 1) - (have.has(a.slug) ? 0 : 1) ||
        Number(a.managedOAuth) - Number(b.managedOAuth) ||
        a.name.localeCompare(b.name),
    )
    .map((t) => ({ name: t.name, slug: t.slug, managedOAuth: t.managedOAuth }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">
        Investigate any app
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
        Works for anything, in or out of Composio&rsquo;s catalog. The agent finds
        the provider&rsquo;s documentation, decides which pages matter, reads them,
        writes a guide, and then checks its own citations against the pages it
        fetched. Expect two to three minutes — the whole run fits inside a free
        model tier&rsquo;s 8,000-tokens-per-minute budget, so it paces itself.
      </p>

      <div className="mt-6">
        <Generator suggestions={suggestions} initialApp={app ?? ""} />
      </div>
    </div>
  );
}

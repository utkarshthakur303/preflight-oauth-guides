import { allGuides, coverage } from "@/lib/guides";

/**
 * The library as machine-readable data.
 *
 * The brief asks what an agent can do and where the developer takes over, so
 * the answer should be consumable by an agent rather than only legible to a
 * person. Each entry carries the step split and the raw rubric, which is enough
 * for a caller to plan around without scraping a page.
 */
export const dynamic = "force-static";

export async function GET() {
  const guides = allGuides();
  const cov = coverage();

  return Response.json(
    {
      schemaVersion: 1,
      coverage: { written: cov.covered, target: cov.target },
      guides: guides.map((g) => ({
        slug: g.slug,
        appName: g.appName,
        composioToolkitSlug: g.composioToolkitSlug,
        composioManagedOAuth: g.composioManagedOAuth,
        tier: g.tier,
        confidence: g.confidence,
        selfServeMinutes: g.rubric.selfServeMinutes.value,
        reviewWaitBusinessDays: g.rubric.reviewWaitBusinessDays.value,
        costUsd: g.rubric.costUsd.value,
        prerequisiteArtifacts: g.rubric.prerequisiteArtifacts.value,
        steps: { agent: g.steps.filter((s) => s.actor !== "human").length, human: g.steps.filter((s) => s.actor === "human").length },
        url: `/guide/${g.slug}`,
        json: `/api/guides/${g.slug}`,
      })),
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}

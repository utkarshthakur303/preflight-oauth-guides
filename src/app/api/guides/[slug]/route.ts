import { allGuides, getGuide } from "@/lib/guides";

/**
 * One full guide, schema and all.
 *
 * `agentPlan` is a projection for callers that want to execute rather than
 * read: the steps an agent can attempt, and the ones it must hand back with the
 * reason why. That split is the machine-readable form of the handoff the brief
 * asks about.
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  return allGuides().map((g) => ({ slug: g.slug }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    return Response.json(
      { error: `No guide for "${slug}".`, available: allGuides().map((g) => g.slug) },
      { status: 404 },
    );
  }

  return Response.json(
    {
      ...guide,
      agentPlan: {
        canAttempt: guide.steps
          .filter((s) => s.actor !== "human")
          .map((s) => ({ title: s.title, where: s.where, detail: s.detail })),
        mustHandOff: guide.steps
          .filter((s) => s.actor === "human")
          .map((s) => ({ title: s.title, reason: s.humanOnlyReason ?? "unspecified", detail: s.detail })),
        blockedUntil:
          guide.rubric.reviewWaitBusinessDays.value?.max
            ? `provider review: ${guide.rubric.reviewWaitBusinessDays.value.min}-${guide.rubric.reviewWaitBusinessDays.value.max} business days`
            : null,
      },
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}

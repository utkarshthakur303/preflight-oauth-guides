import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { allGuides, getGuide } from "@/lib/guides";
import { TIER_META } from "@/lib/rubric";
import { GuideView } from "@/components/guide-view";

export async function generateStaticParams() {
  return allGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: "Guide not found \u2014 Preflight" };

  const w = g.rubric.reviewWaitBusinessDays.value;
  const wait =
    w === null
      ? "review wait unknown"
      : w.max === 0
        ? "no review"
        : `${w.min}\u2013${w.max} day review`;

  return {
    title: `${g.appName} OAuth setup \u2014 ${TIER_META[g.tier].label} \u2014 Preflight`,
    description: `${TIER_META[g.tier].label}: ${wait}. ${g.summary.slice(0, 160)}`,
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();

  return <GuideView g={g} />;
}

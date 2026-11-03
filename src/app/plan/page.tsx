import type { Metadata } from "next";
import Link from "next/link";
import { Planner } from "@/components/planner";
import { allGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Launch plan — Preflight",
  description:
    "Pick the apps your agent needs and get a realistic launch date, plus which provider approval is the long pole.",
};

export default function PlanPage() {
  const guides = allGuides();

  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">
        When can you launch?
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
        Nobody integrates one app. Pick everything your agent needs to connect
        and this works out the date, on the assumption that provider reviews
        overlap but your own setup work does not — then tells you which single
        approval is setting the date.
      </p>

      {guides.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-[14px] font-medium">No guides to plan with yet.</p>
          <Link
            href="/generate"
            className="mono mt-3 inline-block rounded-md px-3 py-2 text-[12px] font-medium text-white"
            style={{ background: "var(--brand)" }}
          >
            Generate one
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <Planner guides={guides} />
        </div>
      )}
    </div>
  );
}

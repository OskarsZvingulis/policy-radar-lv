import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export const metadata = {
  title: "Methodology — Policy Radar LV",
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 text-sm leading-relaxed">
      <div>
        <Link href="/" className="text-sm underline underline-offset-4">
          ← Back to digest
        </Link>
      </div>

      <div>
        <h1 className="font-heading text-2xl font-semibold">What counts as &ldquo;startup-relevant&rdquo;</h1>
        <p className="mt-3 text-base">
          <strong>
            An item is startup-relevant if it plausibly changes the cost, legality, funding, or
            market access of building and scaling a young technology company in Latvia.
          </strong>
        </p>
      </div>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Three axes — qualifying on any one is enough</h2>
        <div>
          <h3 className="font-medium">1. Cost &amp; burden of operating</h3>
          <p className="text-muted-foreground">
            Company law, taxation (especially employee share options), payroll, accounting and
            reporting, insolvency, licensing, permits, administrative burden.
          </p>
        </div>
        <div>
          <h3 className="font-medium">2. Access to capital &amp; talent</h3>
          <p className="text-muted-foreground">
            Venture capital, crowdfunding, Altum/LIAA instruments, state aid, EU funds, grants,
            innovation support, immigration/work permits/startup visa, employment law.
          </p>
        </div>
        <div>
          <h3 className="font-medium">3. Market &amp; regulatory access for tech business models</h3>
          <p className="text-muted-foreground">
            Digital services, AI, data, fintech/payments, e-commerce, platform rules,
            cybersecurity, IP, public procurement, regulatory sandboxes, and energy/mobility/
            health-tech where regulation gates the business model.
          </p>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Signal boosters</h2>
        <p className="text-muted-foreground">
          Raise an item&apos;s score: the Jaunuzņēmumu darbības atbalsta likums (Startup Law) is
          named; the TAP policy area is on the allowlist; the responsible institution is EM, FM,
          VARAM or KEM; a public-consultation window is currently open; the bill is at a 2nd/3rd
          Saeima reading (near-final — last real chance to weigh in); or an ecosystem stakeholder
          (LIAA, Altum, FinTech Latvija, LTRK, LDDK, Startin.LV) is invited to the committee
          discussion.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Exclusions</h2>
        <p className="text-muted-foreground">
          Suppressed regardless of keyword match: routine EU position papers, appointments and
          ceremonial items, defence procurement with no tech angle, agriculture/fisheries unless
          it&apos;s a funding instrument, purely municipal matters.
        </p>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Output tiers</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">🔴 Act now</strong> — a consultation deadline is
            open, or a vote/adoption is imminent. Has a date attached.
          </li>
          <li>
            <strong className="text-foreground">🟡 Watch</strong> — moving through
            inter-ministry coordination; will land eventually but isn&apos;t actionable yet.
          </li>
          <li>
            <strong className="text-foreground">⚪ FYI</strong> — useful context, no action
            needed this week.
          </li>
        </ul>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">How scoring actually works</h2>
        <p className="text-muted-foreground">
          Every scanned item first runs through a deterministic Latvian keyword/taxonomy engine —
          the three axes above, each with its own weighted patterns, plus the boosters and
          exclusions. This alone decides the tier and is all that runs if no LLM key is
          configured, so the digest always produces a result. When an AI Gateway key is present,
          the highest-scoring ~25 items are additionally sent to an LLM which writes the
          &ldquo;why it matters&rdquo; line and can adjust the tier if it disagrees with the rules
          — it never sees the full weekly volume, only the shortlist the rules already narrowed
          down, which keeps cost and latency bounded regardless of how busy a given week is.
        </p>
      </section>
    </div>
  );
}

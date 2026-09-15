import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export const metadata = {
  title: "Methodology | Policy Radar LV",
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
            An item is startup-relevant if it plausibly affects the funding, operating costs,
            obligations, hiring, or market access of startups in Latvia, including support
            programmes they can apply to.
          </strong>
        </p>
      </div>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Three axes, qualifying on any one is enough</h2>
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
          Raise an item&apos;s relevance score: the Jaunuzņēmumu darbības atbalsta likums (Startup
          Law) is named; the TAP policy area is on the allowlist; the responsible institution is
          EM, FM, VARAM or KEM; an incubator/accelerator programme or open application round is
          named; the bill is at a 2nd/3rd Saeima reading (context; see below on why this doesn&apos;t
          imply an action); or an ecosystem stakeholder (LIAA, Altum, FinTech Latvija, LTRK, LDDK,
          Startin.LV) is invited to the committee discussion.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Exclusions</h2>
        <p className="text-muted-foreground">
          Suppressed regardless of keyword match: routine EU position papers, appointments and
          ceremonial items, defence procurement with no tech angle, agriculture/fisheries unless
          it&apos;s a funding instrument, purely municipal matters, and any item that only matched
          on timing (an open deadline, a near-final reading) with no substantive topical signal.
          Urgency is not relevance.
        </p>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">One ranked list, not urgency tiers</h2>
        <p className="text-muted-foreground">
          Results are a single list ordered by relevance score, not bucketed into &ldquo;Act
          now / Watch / FYI&rdquo; tiers. An earlier version of this tool did that, using language
          like &ldquo;Act now&rdquo; for a bill approaching a vote. That was a mistake: a founder
          has no vote and cannot influence most of these processes, so implying an action they
          could take was misleading. The actual brief only asks whether something is relevant, not
          how urgent it is to act on.
        </p>
        <p className="text-muted-foreground">
          <strong className="text-foreground">Action language is used only where it&apos;s literally
          true</strong>, meaning a real, open submission window. Those items are grouped under
          &ldquo;You can still submit on these&rdquo; and show a countdown
          (&ldquo;closes today&rdquo;, &ldquo;3 days left&rdquo;) computed from the source&apos;s
          own listed deadline, compared by calendar day so the closing day itself still counts as
          open. Everything else, such as a committee sitting, a reading, or a published article,
          goes under &ldquo;Worth knowing about&rdquo; with a plain, non-action date: useful to
          know, nothing to submit.
        </p>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">How scoring actually works</h2>
        <p className="text-muted-foreground">
          Every scanned item runs through a deterministic Latvian keyword/taxonomy engine: the
          three axes above, each with its own weighted patterns, plus the boosters and exclusions,
          producing the relevance score and the ranked list. This alone decides what surfaces
          and is all that runs if no LLM key is configured, so the digest always produces a
          result. When an AI Gateway key is present, the highest-scoring ~25 items are
          additionally sent to an LLM which writes the &ldquo;why it matters&rdquo; line. It
          never decides relevance, ranking, or whether something has a real deadline, only
          explains in plain language why an already-surfaced item matters, and it never sees the
          full weekly volume, only the shortlist the rules already narrowed down.
        </p>
      </section>
    </div>
  );
}

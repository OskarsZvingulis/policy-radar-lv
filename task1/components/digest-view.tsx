"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ItemCard } from "@/components/item-card";
import { SourceStatusRow, type LiveSourceState } from "@/components/source-status";
import { displayTitle } from "@/lib/display-title";
import { absoluteDay, deadlinePhrase } from "@/lib/relative-date";
import type { DigestResult, ScoredItem, SourceId } from "@/lib/types";

// Must mirror the SOURCES list in lib/digest/run.ts — used only to render
// pending placeholders before the first live event for that source arrives.
const SOURCE_PLACEHOLDERS: { source: SourceId; label: string }[] = [
  { source: "tap_legal_acts", label: "TAP portāls — Tiesību aktu projekti" },
  { source: "tap_consultations", label: "TAP portāls — Sabiedrības līdzdalība" },
  { source: "tap_vss", label: "Valsts sekretāru sanāksme" },
  { source: "tap_mk", label: "Ministru kabineta sēdes" },
  { source: "saeima_committees", label: "Saeima — komisiju sēdes" },
  { source: "em_news", label: "Ekonomikas ministrija" },
  { source: "liaa_news", label: "LIAA" },
  { source: "altum_news", label: "Altum" },
];

function toLiveSources(digest: DigestResult): LiveSourceState[] {
  return digest.sources.map((s) => ({
    source: s.source,
    label: s.label,
    status: s.status,
    count: s.count,
    durationMs: s.durationMs,
    error: s.error,
  }));
}

export function DigestView({ initialData }: { initialData: DigestResult | null }) {
  const [digest, setDigest] = useState<DigestResult | null>(initialData);
  const [liveSources, setLiveSources] = useState<LiveSourceState[]>(
    initialData
      ? toLiveSources(initialData)
      : SOURCE_PLACEHOLDERS.map((s) => ({ ...s, status: "pending" as const })),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const started = useRef(false);

  function handleRefresh() {
    setRefreshing(true);
    setRunError(null);
    setLiveSources(SOURCE_PLACEHOLDERS.map((s) => ({ ...s, status: "pending" as const })));

    const es = new EventSource("/api/digest/stream");

    es.addEventListener("source", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data);
      setLiveSources((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.source === data.source);
        const updated: LiveSourceState = {
          source: data.source,
          label: data.label,
          status: data.status,
          count: data.count,
          durationMs: data.durationMs,
          error: data.error,
        };
        if (idx >= 0) next[idx] = updated;
        else next.push(updated);
        return next;
      });
    });

    es.addEventListener("done", (ev) => {
      const data: DigestResult = JSON.parse((ev as MessageEvent).data);
      setDigest(data);
      setLiveSources(toLiveSources(data));
      setRefreshing(false);
      setRunError(null);
      es.close();
    });

    // A failed or dropped stream previously just closed the connection: with no
    // digest yet, the page went on claiming it was scanning, pending dots still
    // pulsing, with nothing actually running. Surface it and stop pretending.
    es.addEventListener("error", () => {
      setRefreshing(false);
      es.close();
      setRunError(
        "The scan stopped before it finished — the connection dropped or a source hung. Nothing is running now.",
      );
      setLiveSources((prev) =>
        prev.map((s) => (s.status === "pending" ? { ...s, status: "error" as const } : s)),
      );
    });
  }

  // Cold cache (nothing generated yet this week) → auto-run the same live
  // stream a manual "Refresh" click would, instead of showing a dead page.
  useEffect(() => {
    if (!initialData && !started.current) {
      started.current = true;
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceOptions = useMemo(
    () => (digest ? digest.sources.map((s) => ({ id: s.source, label: s.label })) : []),
    [digest],
  );

  const visibleItems: ScoredItem[] = useMemo(() => {
    if (!digest) return [];
    if (sourceFilter === "all") return digest.scored;
    return digest.scored.filter((i) => i.source === sourceFilter);
  }, [digest, sourceFilter]);

  /**
   * The one split that survives: an item either has an open window you can
   * submit into, or it does not. That is a fact about the source, unlike the
   * urgency tiers this replaced, which asked the reader to act on votes they
   * have no part in. Items you can act on sort by deadline (soonest first,
   * because that is the decision); the rest sort by relevance.
   */
  const { openItems, awarenessItems } = useMemo(() => {
    const open = visibleItems
      .filter((i) => i.actionable && i.deadline)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    const rest = visibleItems.filter((i) => !(i.actionable && i.deadline));
    return { openItems: open, awarenessItems: rest };
  }, [visibleItems]);

  const actionableCount = digest?.scored.filter((i) => i.actionable).length ?? 0;

  // The 30-second version for a reader who will not scroll: whatever closes
  // soonest, which is the only thing with a clock on it.
  const closingSoonest: ScoredItem[] = useMemo(() => {
    if (!digest) return [];
    return digest.scored
      .filter((i) => i.actionable && i.deadline)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      .slice(0, 5);
  }, [digest]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">Policy Radar LV</h1>
            <p className="text-sm text-muted-foreground">
              Weekly startup-relevance digest across 7 Latvian policy sources.
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Scanning…" : "Refresh"}
          </Button>
        </div>

        <SourceStatusRow sources={liveSources} />

        {digest ? (
          <p className="text-sm">
            Scanned <strong className="tabular-nums">{digest.totalScanned}</strong> items across{" "}
            {digest.sources.length} sources → surfaced{" "}
            <strong className="tabular-nums">{digest.totalSurfaced}</strong> as startup-relevant
            {actionableCount > 0 && (
              <>
                {" "}
                (<strong className="tabular-nums">{actionableCount}</strong> with an open
                submission window)
              </>
            )}
            . That&apos;s minutes of reading instead of the ~5 hours this used to take manually.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {runError
              ? "No digest to show — the scan above did not complete."
              : "Running the first scan of the week against the live sources…"}
          </p>
        )}

        {runError && (
          <Alert variant="destructive">
            <AlertTitle>Scan did not complete</AlertTitle>
            <AlertDescription>
              {runError}{" "}
              <button onClick={handleRefresh} className="underline underline-offset-4">
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {digest && !digest.llmAvailable && (
          <Alert>
            <AlertTitle>Running rules-only</AlertTitle>
            <AlertDescription>
              No AI Gateway key configured — matches below come from the deterministic
              keyword/taxonomy engine only, no LLM-written explanations.{" "}
              <Link href="/methodology" className="underline">
                See the definition
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <Link href="/methodology" className="underline underline-offset-4">
            Methodology
          </Link>
          <span className="opacity-40">·</span>
          <a href="/api/digest/markdown" className="underline underline-offset-4" target="_blank">
            Export as Markdown
          </a>
        </div>
      </header>

      <Separator />

      {digest && closingSoonest.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h2 className="mb-2 text-sm font-semibold">Closing soonest</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {closingSoonest.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {displayTitle(item.title).text}
                </a>
                <span className="text-muted-foreground"> — {item.sourceLabel}</span>
                <span className="text-red-700 dark:text-red-400">
                  {" "}
                  · {deadlinePhrase(item.deadline!)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {digest && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={sourceFilter === "all" ? "secondary" : "ghost"}
              onClick={() => setSourceFilter("all")}
            >
              All sources
            </Button>
            {sourceOptions.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={sourceFilter === s.id ? "secondary" : "ghost"}
                onClick={() => setSourceFilter(s.id)}
              >
                {s.label}
              </Button>
            ))}
          </div>

          {visibleItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No startup-relevant items from this source this week.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {openItems.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">
                    You can still submit on these{" "}
                    <span className="font-normal text-muted-foreground">({openItems.length})</span>
                  </h2>
                  {openItems.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </section>
              )}

              {awarenessItems.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">
                    Worth knowing about{" "}
                    <span className="font-normal text-muted-foreground">
                      ({awarenessItems.length})
                    </span>
                  </h2>
                  <p className="-mt-2 text-xs text-muted-foreground">
                    No open submission window — these are moving through the process or already
                    decided.
                  </p>
                  {awarenessItems.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </section>
              )}
            </div>
          )}

          <Separator />
          <footer className="flex flex-col gap-1 pb-6 text-xs text-muted-foreground">
            <span>
              Digest generated{" "}
              {new Date(digest.generatedAt).toLocaleString("en-GB", { timeZone: "Europe/Riga" })}{" "}
              (Europe/Riga) · week of {absoluteDay(digest.weekStart)}
            </span>
            <span>
              Run <code className="rounded bg-muted px-1 py-0.5">{digest.runId}</code>
              {digest.llmUsage ? (
                <>
                  {" "}
                  · LLM: {digest.llmUsage.model} · cost this run: $
                  {digest.llmUsage.estimatedCostUsd.toFixed(4)} ({digest.llmUsage.inputTokens}+
                  {digest.llmUsage.outputTokens} tokens)
                </>
              ) : (
                " · rules-only, $0.00"
              )}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}

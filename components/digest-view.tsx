"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ItemCard } from "@/components/item-card";
import { SourceStatusRow, type LiveSourceState } from "@/components/source-status";
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

  // A single list ranked by relevance — no urgency tiers. Buckets like
  // "Act now" implied a reader could influence a vote or reading they have
  // no part in; the only thing genuinely actionable is a real, open
  // submission window, which each item states for itself (see actionableCount
  // and the per-item date badges) rather than a whole category implying it.
  const visibleItems: ScoredItem[] = useMemo(() => {
    if (!digest) return [];
    if (sourceFilter === "all") return digest.scored;
    return digest.scored.filter((i) => i.source === sourceFilter);
  }, [digest, sourceFilter]);

  const actionableCount = digest?.scored.filter((i) => i.actionable).length ?? 0;

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
                (<strong className="text-red-600 dark:text-red-400">{actionableCount}</strong>{" "}
                with an open feedback window)
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

          <div className="flex flex-col gap-4">
            {visibleItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No startup-relevant items from this source this week.
              </p>
            ) : (
              visibleItems.map((item) => <ItemCard key={item.id} item={item} />)
            )}
          </div>

          <Separator />
          <footer className="pb-6 text-xs text-muted-foreground">
            Digest generated{" "}
            {new Date(digest.generatedAt).toLocaleString("en-GB", { timeZone: "Europe/Riga" })}{" "}
            (Europe/Riga) · week of {new Date(digest.weekStart).toISOString().slice(0, 10)}
          </footer>
        </>
      )}
    </div>
  );
}

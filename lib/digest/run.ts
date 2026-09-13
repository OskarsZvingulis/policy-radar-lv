/**
 * Orchestrator: runs all 7 collectors in parallel (bounded by a per-source
 * timeout so one slow gov.lv server can't sink the whole digest), scores
 * every item deterministically, hands the top slice to the LLM for a
 * "why it matters" line, and assembles the final DigestResult.
 */
import type { DigestResult, Item, ScoredItem, SourceId, SourceResult } from "../types";
import { collectTapLegalActs } from "../sources/tap";
import { collectTapConsultations } from "../sources/tap-consultations";
import { collectTapMeetings } from "../sources/tap-meetings";
import { collectSaeimaCommittees } from "../sources/saeima";
import { collectEmNews, collectLiaaNews, collectAltumNews } from "../sources/rss";
import { scoreItems } from "../relevance/score";
import { scoreWithLlm, type LlmShortlistItem } from "../relevance/llm";
import { weekBounds } from "./week";

const PER_SOURCE_TIMEOUT_MS = 20_000;
const LLM_SHORTLIST_SIZE = 25;
const RECENCY_WINDOW_DAYS = 7;

interface SourceDef {
  id: SourceId;
  label: string;
  run: () => Promise<Item[]>;
}

const SOURCES: SourceDef[] = [
  { id: "tap_legal_acts", label: "TAP portāls — Tiesību aktu projekti", run: collectTapLegalActs },
  { id: "tap_consultations", label: "TAP portāls — Sabiedrības līdzdalība", run: collectTapConsultations },
  { id: "tap_vss", label: "Valsts sekretāru sanāksme", run: () => collectTapMeetings("state_secretaries") },
  { id: "tap_mk", label: "Ministru kabineta sēdes", run: () => collectTapMeetings("cabinet_ministers") },
  { id: "saeima_committees", label: "Saeima — komisiju sēdes", run: collectSaeimaCommittees },
  { id: "em_news", label: "Ekonomikas ministrija", run: collectEmNews },
  { id: "liaa_news", label: "LIAA", run: collectLiaaNews },
  { id: "altum_news", label: "Altum", run: collectAltumNews },
];

/**
 * Only the Saeima collector self-limits to a trailing date window. Every
 * other source (RSS feeds especially) returns whatever is most recent in
 * its own feed/listing, with no guarantee that is actually "new this week"
 * — a low-traffic feed (Altum posts roughly weekly) can still have a
 * 2-month-old item sitting inside its "10 most recent" window. Confirmed
 * live: an Altum RSS item published 06 Jul 2026 was still surfacing in a
 * mid-September digest run. This is the one place that enforces "this is a
 * WEEKLY digest" for every source, with one deliberate exception: an item
 * whose action deadline is still open stays visible even if it was
 * originally published outside the window — staying actionable until its
 * deadline is the entire point of a consultation window.
 *
 * Note: tap_legal_acts stamps `date` as scrape time, not a true submission
 * date (see sources/tap.ts) — this filter is a structural no-op for that
 * source specifically; it always passes. That is a pre-existing, documented
 * limitation of that collector, not something this filter fixes.
 */
function isWithinRecencyWindow(item: Item): boolean {
  const cutoff = Date.now() - RECENCY_WINDOW_DAYS * 86_400_000;
  if (new Date(item.date).getTime() >= cutoff) return true;
  if (item.deadline && new Date(item.deadline).getTime() >= Date.now()) return true;
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch((e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function runSource(def: SourceDef): Promise<SourceResult> {
  const start = Date.now();
  try {
    const items = await withTimeout(def.run(), PER_SOURCE_TIMEOUT_MS);
    return {
      source: def.id,
      label: def.label,
      status: "ok",
      count: items.length,
      durationMs: Date.now() - start,
      items,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.message.startsWith("timed out");
    return {
      source: def.id,
      label: def.label,
      status: timedOut ? "timeout" : "error",
      count: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      items: [],
    };
  }
}

/**
 * Runs the full digest. `onSource` fires as each collector settles — the
 * live "Refresh" view uses this to stream real per-source progress instead
 * of showing a static spinner, which is what makes a screen recording
 * credible as "running on real data" rather than a canned demo.
 */
export async function runDigest(onSource?: (r: SourceResult) => void): Promise<DigestResult> {
  const sources: SourceResult[] = [];

  await Promise.all(
    SOURCES.map(async (def) => {
      const result = await runSource(def);
      sources.push(result);
      onSource?.(result);
    }),
  );

  const allItems = sources.flatMap((s) => s.items);
  const totalScanned = allItems.length;

  const freshItems = allItems.filter(isWithinRecencyWindow);

  const ruleScored = scoreItems(freshItems);
  const surfaced = ruleScored.filter((i) => i.tier !== "excluded");

  const shortlist: LlmShortlistItem[] = [...surfaced]
    .sort((a, b) => b.score - a.score)
    .slice(0, LLM_SHORTLIST_SIZE)
    .map((i) => ({
      id: i.id,
      title: i.title,
      text: i.text,
      stage: i.stage,
      institution: i.institution,
      deadline: i.deadline,
      sourceLabel: i.sourceLabel,
      tier: i.tier,
    }));

  const { scores: llmResults, ok: llmOk } = await scoreWithLlm(shortlist);

  const scored: ScoredItem[] = surfaced
    .map((i): ScoredItem => {
      const llm = llmResults.get(i.id);
      return {
        ...i,
        tier: llm?.tier ?? i.tier,
        whyItMatters: llm?.whyItMatters,
        llmScored: Boolean(llm),
      };
    })
    .sort((a, b) => {
      const tierOrder: Record<string, number> = { act_now: 0, watch: 1, fyi: 2, excluded: 3 };
      if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
      return b.score - a.score;
    });

  const { start, end } = weekBounds();

  return {
    generatedAt: new Date().toISOString(),
    weekStart: start,
    weekEnd: end,
    sources,
    scored,
    totalScanned,
    totalSurfaced: scored.length,
    llmAvailable: llmOk,
  };
}

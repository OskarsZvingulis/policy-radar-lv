import type { DigestResult, ScoredItem } from "../types";
import { describeItemDates } from "../dates";

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function renderItem(item: ScoredItem): string {
  const lines: string[] = [`### ${item.title}`, ""];
  const meta: string[] = [`**Source:** ${item.sourceLabel}`];
  if (item.institution) meta.push(`**Institution:** ${item.institution}`);
  if (item.stage) meta.push(`**Stage:** ${item.stage}`);
  for (const d of describeItemDates(item)) {
    meta.push(`**${d.label}:** ${fmtDate(d.iso)}`);
  }
  meta.push(`**Relevance:** ${item.score}/100`);
  lines.push(meta.join(" · "), "");
  if (item.whyItMatters) {
    lines.push(`> ${item.whyItMatters}`, "");
  } else if (item.matchedRules.length) {
    lines.push(`_Matched:_ ${item.matchedRules.join(", ")}`, "");
  }
  lines.push(`[Open source →](${item.url})`, "");
  return lines.join("\n");
}

export function renderDigestMarkdown(digest: DigestResult): string {
  const lines: string[] = [];
  lines.push("# Policy Radar LV — Weekly Digest");
  lines.push("");
  lines.push(`Week of ${fmtDate(digest.weekStart)} – ${fmtDate(digest.weekEnd)}`);
  lines.push(`Generated ${new Date(digest.generatedAt).toISOString()}`);
  lines.push("");

  const actionableCount = digest.scored.filter((i) => i.actionable).length;
  lines.push(
    `Scanned **${digest.totalScanned}** items across ${digest.sources.length} sources → surfaced ` +
      `**${digest.totalSurfaced}** as startup-relevant` +
      (actionableCount > 0 ? ` (**${actionableCount}** with an open feedback window)` : "") +
      "." +
      (digest.llmAvailable ? "" : " _(rules-only mode — no LLM key configured)_"),
  );
  lines.push("");

  // A single list, ranked by relevance — not bucketed into urgency tiers.
  // "Act now" style buckets implied a reader could influence outcomes (a
  // vote, a reading) that a startup founder has no part in; the only thing
  // genuinely actionable is a real, open submission window, which each
  // item states for itself via its date labels rather than a category.
  if (digest.scored.length > 0) {
    lines.push(`## Startup-relevant items (${digest.scored.length})`, "");
    for (const item of digest.scored) lines.push(renderItem(item), "");
  }

  lines.push("## Sources scanned", "");
  lines.push("| Source | Status | Items | Time |", "|---|---|---|---|");
  for (const s of digest.sources) {
    lines.push(`| ${s.label} | ${s.status} | ${s.count} | ${(s.durationMs / 1000).toFixed(1)}s |`);
  }
  lines.push("");

  return lines.join("\n");
}

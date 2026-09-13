import type { DigestResult, ScoredItem, Tier } from "../types";

const TIER_LABEL: Record<Tier, string> = {
  act_now: "🔴 Act now",
  watch: "🟡 Watch",
  fyi: "⚪ FYI",
  excluded: "Excluded",
};

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function renderItem(item: ScoredItem): string {
  const lines: string[] = [`### ${item.title}`, ""];
  const meta: string[] = [`**Source:** ${item.sourceLabel}`];
  if (item.institution) meta.push(`**Institution:** ${item.institution}`);
  if (item.stage) meta.push(`**Stage:** ${item.stage}`);
  if (item.deadline) meta.push(`**Deadline:** ${fmtDate(item.deadline)}`);
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
  lines.push(
    `Scanned **${digest.totalScanned}** items across ${digest.sources.length} sources → surfaced **${digest.totalSurfaced}** as startup-relevant.` +
      (digest.llmAvailable ? "" : " _(rules-only mode — no LLM key configured)_"),
  );
  lines.push("");

  const tiers: Tier[] = ["act_now", "watch", "fyi"];
  for (const tier of tiers) {
    const items = digest.scored.filter((i) => i.tier === tier);
    if (items.length === 0) continue;
    lines.push(`## ${TIER_LABEL[tier]} (${items.length})`, "");
    for (const item of items) lines.push(renderItem(item), "");
  }

  lines.push("## Sources scanned", "");
  lines.push("| Source | Status | Items | Time |", "|---|---|---|---|");
  for (const s of digest.sources) {
    lines.push(`| ${s.label} | ${s.status} | ${s.count} | ${(s.durationMs / 1000).toFixed(1)}s |`);
  }
  lines.push("");

  return lines.join("\n");
}

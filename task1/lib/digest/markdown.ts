import type { DigestResult, ScoredItem } from "../types";
import { describeItemDates } from "../dates";
import { displayTitle } from "../display-title";

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

/** Top of the digest for a reader with 30 seconds: only items with an open
 * submission window, soonest closing first. Nothing else has a clock on it,
 * so nothing else belongs in a block the reader will treat as a to-do list. */
function renderTldr(digest: DigestResult): string[] {
  const bullets = digest.scored
    .filter((i) => i.actionable && i.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5);
  if (bullets.length === 0) return [];

  const lines = [`## Closing soonest`, ""];
  for (const item of bullets) {
    lines.push(
      `- **${displayTitle(item.title).text}** — closes ${fmtDate(item.deadline!)} (${item.sourceLabel})`,
    );
  }
  lines.push("");
  return lines;
}

function renderFooter(digest: DigestResult): string[] {
  const lines = ["## Run details", ""];
  lines.push(`- Run id: \`${digest.runId}\``);
  lines.push(
    `- LLM: ${digest.llmAvailable && digest.llmUsage ? digest.llmUsage.model : "not used (rules-only)"}` +
      (digest.llmUsage ? `, prompt version \`${digest.llmUsage.promptVersion}\`` : ""),
  );
  if (digest.llmUsage) {
    lines.push(
      `- LLM cost this run: **$${digest.llmUsage.estimatedCostUsd.toFixed(4)}** ` +
        `(${digest.llmUsage.itemsSent} items sent, ${digest.llmUsage.inputTokens} input + ` +
        `${digest.llmUsage.outputTokens} output tokens)`,
    );
  } else {
    lines.push(`- LLM cost this run: $0.00 (rules-only)`);
  }
  const failed = digest.sources.filter((s) => s.status !== "ok");
  if (failed.length > 0) {
    lines.push(`- Sources not ok: ${failed.map((s) => `${s.label} (${s.status})`).join(", ")}`);
  }
  lines.push("");
  return lines;
}

export function renderDigestMarkdown(digest: DigestResult): string {
  const lines: string[] = [];
  lines.push("# Policy Radar LV — Weekly Digest");
  lines.push("");
  lines.push(`Week of ${fmtDate(digest.weekStart)} – ${fmtDate(digest.weekEnd)}`);
  lines.push(`Generated ${new Date(digest.generatedAt).toISOString()}`);
  lines.push("");

  const actionableCount = digest.scored.filter((i) => i.actionable).length;
  // Never a blank file, even at zero relevant items — the count line always
  // states scanned/surfaced/sources explicitly rather than silently omitting
  // sections, since an empty digest and a broken run must not look the same.
  lines.push(
    `Scanned **${digest.totalScanned}** items across ${digest.sources.length} sources → surfaced ` +
      `**${digest.totalSurfaced}** as startup-relevant` +
      (actionableCount > 0 ? ` (**${actionableCount}** with an open feedback window)` : "") +
      "." +
      (digest.llmAvailable ? "" : " _(rules-only mode — no LLM key configured)_"),
  );
  lines.push("");

  lines.push(...renderTldr(digest));

  // A single list, ranked by relevance — not bucketed into urgency tiers.
  // "Act now" style buckets implied a reader could influence outcomes (a
  // vote, a reading) that a startup founder has no part in; the only thing
  // genuinely actionable is a real, open submission window, which each
  // item states for itself via its date labels rather than a category.
  if (digest.scored.length > 0) {
    lines.push(`## All startup-relevant items (${digest.scored.length})`, "");
    for (const item of digest.scored) lines.push(renderItem(item), "");
  }

  lines.push("## Sources scanned", "");
  lines.push("| Source | Status | Items | Time |", "|---|---|---|---|");
  for (const s of digest.sources) {
    lines.push(`| ${s.label} | ${s.status} | ${s.count} | ${(s.durationMs / 1000).toFixed(1)}s |`);
  }
  lines.push("");

  lines.push(...renderFooter(digest));

  return lines.join("\n");
}

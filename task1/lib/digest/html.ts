import type { DigestResult, ScoredItem } from "../types";
import { describeItemDates } from "../dates";

/**
 * Standalone static HTML export — for the sample committed to samples/ and
 * for anyone who wants to open the digest without running the app. The live
 * app (React, auto-escaping) is the primary HTML surface; this is a second,
 * simpler renderer, so everything interpolated here — titles, summaries,
 * institution names — is untrusted scraped/LLM text and must be escaped by
 * hand exactly like Jinja2 autoescaping would.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links are ever rendered as hrefs — anything else (a stray
 * `javascript:` scheme smuggled through scraped markup) becomes plain text. */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function renderItemHtml(item: ScoredItem): string {
  const href = safeHref(item.url);
  const titleHtml = escapeHtml(item.title);
  const meta: string[] = [`<span class="tag">${escapeHtml(item.sourceLabel)}</span>`];
  if (item.institution) meta.push(`<span class="tag">${escapeHtml(item.institution)}</span>`);
  if (item.stage) meta.push(`<span class="tag">${escapeHtml(item.stage)}</span>`);
  for (const d of describeItemDates(item)) {
    meta.push(
      `<span class="tag${d.isDeadline ? " deadline" : ""}">${d.isDeadline ? "⏰ " : ""}${escapeHtml(d.label)}: ${fmtDate(d.iso)}</span>`,
    );
  }
  meta.push(`<span class="score">relevance ${item.score}</span>`);

  const body = item.whyItMatters
    ? `<p class="why">${escapeHtml(item.whyItMatters)}</p>`
    : item.matchedRules.length
      ? `<p class="matched">Matched: ${escapeHtml(item.matchedRules.join(", "))}</p>`
      : "";

  return `
    <article class="item">
      <h3>${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${titleHtml}</a>` : titleHtml}</h3>
      <div class="meta">${meta.join(" ")}</div>
      ${body}
    </article>`;
}

/** Same ordering as the Markdown/UI "read this first" block: open deadlines
 * soonest-first, then whatever's left by relevance — kept in sync by hand
 * across the three renderers since none of them share a template engine. */
function renderReadFirstHtml(digest: DigestResult): string {
  const withDeadline = digest.scored
    .filter((i) => i.actionable && i.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
  const rest = digest.scored.filter((i) => !(i.actionable && i.deadline));
  const bullets = [...withDeadline, ...rest].slice(0, 5);
  if (bullets.length === 0) return "";

  const rows = bullets
    .map((item) => {
      const href = safeHref(item.url);
      const titleHtml = escapeHtml(item.title);
      const deadlineNote =
        item.actionable && item.deadline ? ` — deadline ${fmtDate(item.deadline)}` : "";
      return `<li>${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${titleHtml}</a>` : titleHtml} <span class="score">(${escapeHtml(item.sourceLabel)}, ${item.score}/100${deadlineNote})</span></li>`;
    })
    .join("\n");

  return `
  <section class="read-first">
    <h2>Read this first — the 5 most important items</h2>
    <ul>${rows}</ul>
  </section>`;
}

export function renderDigestHtml(digest: DigestResult): string {
  const actionableCount = digest.scored.filter((i) => i.actionable).length;
  const readFirst = renderReadFirstHtml(digest);
  const items = digest.scored.map(renderItemHtml).join("\n");
  const sourceRows = digest.sources
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.label)}</td><td>${escapeHtml(s.status)}</td><td>${s.count}</td><td>${(s.durationMs / 1000).toFixed(1)}s</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Policy Radar LV — Weekly Digest</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  .item { border: 1px solid #ddd; border-radius: 8px; padding: 0.8rem 1rem; margin-bottom: 0.8rem; }
  .item h3 { margin: 0 0 0.4rem; font-size: 1rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.75rem; color: #555; margin-bottom: 0.4rem; }
  .tag { border: 1px solid #ccc; border-radius: 4px; padding: 0.1rem 0.4rem; }
  .tag.deadline { border-color: #c00; color: #c00; }
  .score { margin-left: auto; opacity: 0.6; }
  .read-first { border: 1px solid #ddd; border-radius: 8px; padding: 0.8rem 1rem; margin-bottom: 1.2rem; background: #fafafa; }
  .read-first h2 { margin: 0 0 0.5rem; font-size: 0.95rem; }
  .read-first ul { margin: 0; padding-left: 1.2rem; font-size: 0.9rem; }
  .read-first li { margin-bottom: 0.3rem; }
  .read-first .score { margin-left: 0; opacity: 0.65; font-size: 0.85rem; }
  .why { font-size: 0.9rem; }
  .matched { font-size: 0.85rem; color: #666; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  td, th { border: 1px solid #ddd; padding: 0.3rem 0.5rem; text-align: left; }
  footer { font-size: 0.75rem; color: #777; margin-top: 1.5rem; }
</style>
</head>
<body>
  <h1>Policy Radar LV — Weekly Digest</h1>
  <p>Week of ${fmtDate(digest.weekStart)} – ${fmtDate(digest.weekEnd)} · generated ${escapeHtml(new Date(digest.generatedAt).toISOString())}</p>
  <p>Scanned <strong>${digest.totalScanned}</strong> items across ${digest.sources.length} sources → surfaced
    <strong>${digest.totalSurfaced}</strong> as startup-relevant${actionableCount > 0 ? ` (<strong>${actionableCount}</strong> with an open feedback window)` : ""}.
    ${digest.llmAvailable ? "" : "<em>(rules-only mode — no LLM key configured)</em>"}</p>
  ${readFirst}
  <h2>All startup-relevant items (${digest.scored.length})</h2>
  ${items}

  <h2>Sources scanned</h2>
  <table>
    <thead><tr><th>Source</th><th>Status</th><th>Items</th><th>Time</th></tr></thead>
    <tbody>${sourceRows}</tbody>
  </table>

  <footer>
    Run <code>${escapeHtml(digest.runId)}</code> ·
    LLM: ${digest.llmUsage ? escapeHtml(digest.llmUsage.model) : "not used (rules-only)"} ·
    cost this run: $${digest.llmUsage ? digest.llmUsage.estimatedCostUsd.toFixed(4) : "0.00"}
  </footer>
</body>
</html>
`;
}

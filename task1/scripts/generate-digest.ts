/**
 * Runs the full digest pipeline (all 8 collectors, rules scoring, LLM triage
 * if AI_GATEWAY_API_KEY is set) against live sources and writes Markdown +
 * JSON to the given output directory. Used by the weekly GitHub Actions
 * workflow (.github/workflows/weekly.yml) and for generating samples/.
 *
 * Usage: npx tsx scripts/generate-digest.ts [output-dir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runDigest } from "../lib/digest/run";
import { renderDigestMarkdown } from "../lib/digest/markdown";
import { renderDigestHtml } from "../lib/digest/html";

async function main() {
  const outDir = process.argv[2] ?? "samples";
  mkdirSync(outDir, { recursive: true });

  const digest = await runDigest((source) => {
    console.log(`[source] ${source.label}: ${source.status} (${source.count} items, ${source.durationMs}ms)`);
  });

  const isoWeek = digest.weekStart.slice(0, 10);
  const mdPath = `${outDir}/digest-${isoWeek}.md`;
  const htmlPath = `${outDir}/digest-${isoWeek}.html`;
  const jsonPath = `${outDir}/digest-${isoWeek}.json`;
  writeFileSync(mdPath, renderDigestMarkdown(digest));
  writeFileSync(htmlPath, renderDigestHtml(digest));
  writeFileSync(jsonPath, JSON.stringify(digest, null, 2));

  console.log(`\nWrote ${mdPath}, ${htmlPath} and ${jsonPath}`);
  console.log(
    `${digest.totalScanned} scanned, ${digest.totalSurfaced} surfaced, ` +
      `llmAvailable=${digest.llmAvailable}` +
      (digest.llmUsage ? `, cost=$${digest.llmUsage.estimatedCostUsd.toFixed(4)}` : ""),
  );

  const failed = digest.sources.filter((s) => s.status !== "ok");
  if (failed.length > 0) {
    console.error(`Sources not ok: ${failed.map((s) => `${s.label} (${s.status})`).join(", ")}`);
    process.exitCode = 2; // partial success — mirrors the brief's exit-code convention
  }
}

main();

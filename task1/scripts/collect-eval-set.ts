/**
 * Runs every collector against the live sources and dumps the FULL rule-scored
 * item list — including everything the digest filters out — to a JSON file.
 * The digest itself only keeps surfaced (relevant) items, so this is the only
 * way to get a candidate pool that includes true negatives for a precision/
 * recall eval. Does not call the LLM — this is about the rules engine only.
 *
 * Usage: npm run collect-eval-set
 */
import { writeFileSync } from "node:fs";
import { collectTapLegalActs } from "../lib/sources/tap";
import { collectTapConsultations } from "../lib/sources/tap-consultations";
import { collectTapMeetings } from "../lib/sources/tap-meetings";
import { collectSaeimaCommittees } from "../lib/sources/saeima";
import { collectEmNews, collectLiaaNews, collectAltumNews } from "../lib/sources/rss";
import { scoreItems } from "../lib/relevance/score";
import type { Item } from "../lib/types";

async function main() {
  const collectors: { name: string; run: () => Promise<Item[]> }[] = [
    { name: "tap_legal_acts", run: collectTapLegalActs },
    { name: "tap_consultations", run: collectTapConsultations },
    { name: "tap_vss", run: () => collectTapMeetings("state_secretaries") },
    { name: "tap_mk", run: () => collectTapMeetings("cabinet_ministers") },
    { name: "saeima_committees", run: collectSaeimaCommittees },
    { name: "em_news", run: collectEmNews },
    { name: "liaa_news", run: collectLiaaNews },
    { name: "altum_news", run: collectAltumNews },
  ];

  const allItems: Item[] = [];
  for (const c of collectors) {
    try {
      const items = await c.run();
      console.log(`${c.name}: ${items.length} items`);
      allItems.push(...items);
    } catch (err) {
      console.error(`${c.name}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const scored = scoreItems(allItems).map((s) => ({
    id: s.id,
    source: s.source,
    sourceLabel: s.sourceLabel,
    title: s.title,
    url: s.url,
    date: s.date,
    dateIsApproximate: s.dateIsApproximate,
    deadline: s.deadline,
    institution: s.institution,
    stage: s.stage,
    text: s.text,
    score: s.score,
    matchedRules: s.matchedRules,
    actionable: s.actionable,
    predictedRelevant: s.relevant,
  }));

  writeFileSync("eval/raw-scored-items.json", JSON.stringify(scored, null, 2));
  console.log(`\nTotal: ${allItems.length} scanned, ${scored.filter((s) => s.predictedRelevant).length} predicted relevant`);
  console.log(`Wrote eval/raw-scored-items.json`);
}

main();

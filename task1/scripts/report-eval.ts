/**
 * Re-scores every hand-labelled eval item with the CURRENT rules engine and
 * prints precision/recall — "current" so this catches drift the moment
 * someone edits keywords.ts, rather than reporting a number baked in once
 * and never revisited. Also used by tests/eval.test.ts as a regression floor.
 *
 * Usage: npm run eval
 */
import { readFileSync } from "node:fs";
import { scoreItem } from "../lib/relevance/score";
import type { Item } from "../lib/types";

interface LabelledItem extends Item {
  humanRelevant: boolean;
  note: string;
  predictedRelevant: boolean; // the prediction at label time — kept for reference only
}

export function loadLabelledItems(): LabelledItem[] {
  const lines = readFileSync("eval/labelled_items.jsonl", "utf8").trim().split("\n");
  return lines.map((l) => JSON.parse(l) as LabelledItem);
}

export interface EvalResult {
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  misses: { id: string; title: string; note: string }[];
  falsePositives: { id: string; title: string; note: string }[];
}

export function runEval(items: LabelledItem[]): EvalResult {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const misses: EvalResult["misses"] = [];
  const falsePositives: EvalResult["falsePositives"] = [];

  for (const item of items) {
    const { relevant: predicted } = scoreItem(item);
    if (predicted && item.humanRelevant) tp++;
    else if (predicted && !item.humanRelevant) {
      fp++;
      falsePositives.push({ id: item.id, title: item.title, note: item.note });
    } else if (!predicted && item.humanRelevant) {
      fn++;
      misses.push({ id: item.id, title: item.title, note: item.note });
    } else tn++;
  }

  return {
    n: items.length,
    tp,
    fp,
    fn,
    tn,
    precision: tp + fp > 0 ? tp / (tp + fp) : 1,
    recall: tp + fn > 0 ? tp / (tp + fn) : 1,
    misses,
    falsePositives,
  };
}

function main() {
  const items = loadLabelledItems();
  const result = runEval(items);
  console.log(`Eval set: ${result.n} hand-labelled items (stratified sample of a live 322-item scan)`);
  console.log(`  TP=${result.tp}  FP=${result.fp}  FN=${result.fn}  TN=${result.tn}`);
  console.log(`  Precision: ${(result.precision * 100).toFixed(0)}%`);
  console.log(`  Recall:    ${(result.recall * 100).toFixed(0)}%`);
  if (result.misses.length > 0) {
    console.log(`\nMissed (false negatives):`);
    for (const m of result.misses) console.log(`  - [${m.id}] ${m.title}\n    ${m.note}`);
  }
  if (result.falsePositives.length > 0) {
    console.log(`\nFalse positives:`);
    for (const f of result.falsePositives) console.log(`  - [${f.id}] ${f.title}\n    ${f.note}`);
  }
}

if (process.argv[1]?.includes("report-eval")) main();

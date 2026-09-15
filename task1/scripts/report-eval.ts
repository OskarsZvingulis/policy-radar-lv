/**
 * Re-scores every hand-labelled eval item with the CURRENT rules engine and
 * prints precision/recall — "current" so this catches drift the moment
 * someone edits keywords.ts, rather than reporting a number baked in once
 * and never revisited. Also used by tests/eval.test.ts as a regression floor.
 *
 * The set is split train/holdout. Report the HOLDOUT number: recall measured
 * on the same items whose misses prompted the keywords is training-set
 * performance, which is close to meaningless as a quality signal — the
 * inflected-Altum bug survived exactly that way, because the sample only
 * contained nominative forms.
 *
 * Usage: npm run eval
 */
import { readFileSync } from "node:fs";
import { scoreItem } from "../lib/relevance/score";
import type { Item } from "../lib/types";

export type EvalSplit = "train" | "holdout";

interface LabelledItem extends Item {
  humanRelevant: boolean;
  note: string;
  predictedRelevant: boolean; // the prediction at label time — kept for reference only
  split: EvalSplit;
}

export function loadLabelledItems(split?: EvalSplit): LabelledItem[] {
  const lines = readFileSync("eval/labelled_items.jsonl", "utf8").trim().split("\n");
  const items = lines.map((l) => JSON.parse(l) as LabelledItem);
  return split ? items.filter((i) => i.split === split) : items;
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
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
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

function report(label: string, result: EvalResult) {
  console.log(`\n${label}: n=${result.n}`);
  console.log(`  TP=${result.tp}  FP=${result.fp}  FN=${result.fn}  TN=${result.tn}`);
  console.log(`  Precision: ${(result.precision * 100).toFixed(0)}%`);
  console.log(`  Recall:    ${(result.recall * 100).toFixed(0)}%`);
  if (result.misses.length > 0) {
    console.log(`  Missed (false negatives):`);
    for (const m of result.misses) console.log(`    - [${m.id}] ${m.title}\n      ${m.note}`);
  }
  if (result.falsePositives.length > 0) {
    console.log(`  False positives:`);
    for (const f of result.falsePositives) console.log(`    - [${f.id}] ${f.title}\n      ${f.note}`);
  }
}

const CAVEAT = [
  "",
  "Read the holdout number, not the combined one.",
  "",
  "Stated plainly: the split was introduced retrospectively, after the current",
  "keywords had already been tuned against all 40 items. Today's holdout figure",
  "is therefore still partly contaminated and is NOT a clean generalization",
  "estimate. It becomes one only for changes made from here on, and only if the",
  "holdout is never consulted while tuning. A genuinely clean measurement needs",
  "a freshly labelled sample from a different week's scan.",
  "",
  "n=16 on the holdout is also small: a single item moves recall by ~17 points.",
].join("\n");

function main() {
  const holdout = runEval(loadLabelledItems("holdout"));
  const train = runEval(loadLabelledItems("train"));
  const all = runEval(loadLabelledItems());

  console.log("Eval set: 40 hand-labelled items from a live scan, split train/holdout.");
  report("HOLDOUT (the number that means something)", holdout);
  report("train (keywords were tuned against these)", train);
  report("all 40 combined", all);
  console.log(CAVEAT);
}

if (process.argv[1]?.includes("report-eval")) main();

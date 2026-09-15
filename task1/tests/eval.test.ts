import { describe, it, expect } from "vitest";
import { loadLabelledItems, runEval } from "../scripts/report-eval";

/**
 * Regression guard on the hand-labelled eval set (eval/labelled_items.jsonl,
 * built from a real live scan — see scripts/collect-eval-set.ts and
 * scripts/build-labelled-eval.ts). The brief is explicit that a missed
 * relevant item costs far more than an extra line in the digest, so recall
 * is the hard floor; precision is tracked but allowed to be soft, since a
 * few false positives are the accepted cost of not missing real items.
 *
 * The floor is enforced on the HOLDOUT split only. Enforcing it on all 40
 * measured training-set performance: those were the same items whose misses
 * prompted the keywords being graded. That number could only ever go up, and
 * said nothing about a week the engine hadn't seen — the inflected-Altum bug
 * survived a "100% recall" CI run precisely because the sample happened to
 * contain only nominative forms.
 *
 * Honest limitation: the split was added retrospectively, so the holdout is
 * not pristine today. It is a guard against FUTURE overfitting, not a clean
 * generalization estimate — that needs a freshly labelled week.
 */
describe("relevance eval set", () => {
  it("meets the recall floor on the held-out split", () => {
    const holdout = loadLabelledItems("holdout");
    const result = runEval(holdout);
    console.log(
      `eval[holdout]: n=${result.n} precision=${(result.precision * 100).toFixed(0)}% ` +
        `recall=${(result.recall * 100).toFixed(0)}% (tp=${result.tp} fp=${result.fp} fn=${result.fn} tn=${result.tn})`,
    );
    if (result.misses.length > 0) {
      throw new Error(
        `Missed relevant items in the holdout — loosen the matching keyword:\n` +
          result.misses.map((m) => `  [${m.id}] ${m.title}\n    ${m.note}`).join("\n"),
      );
    }
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps the train split from regressing either", () => {
    const result = runEval(loadLabelledItems("train"));
    console.log(
      `eval[train]: n=${result.n} precision=${(result.precision * 100).toFixed(0)}% ` +
        `recall=${(result.recall * 100).toFixed(0)}%`,
    );
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
  });

  it("has a non-trivial holdout that is actually held out", () => {
    const holdout = loadLabelledItems("holdout");
    const train = loadLabelledItems("train");
    const all = loadLabelledItems();

    expect(holdout.length + train.length).toBe(all.length);
    expect(holdout.length).toBeGreaterThanOrEqual(10);
    // Both splits must contain positives, or recall on them is meaningless.
    expect(holdout.filter((i) => i.humanRelevant).length).toBeGreaterThan(0);
    expect(train.filter((i) => i.humanRelevant).length).toBeGreaterThan(0);
    // No id may appear in both splits.
    const trainIds = new Set(train.map((i) => i.id));
    expect(holdout.some((i) => trainIds.has(i.id))).toBe(false);
  });
});

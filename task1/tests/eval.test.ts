import { describe, it, expect } from "vitest";
import { loadLabelledItems, runEval } from "../scripts/report-eval";

/**
 * Regression guard on the hand-labelled eval set (eval/labelled_items.jsonl,
 * built from a real live scan — see scripts/collect-eval-set.ts and
 * scripts/build-labelled-eval.ts). The brief is explicit that a missed
 * relevant item costs far more than an extra line in the digest, so recall
 * is the hard floor; precision is tracked but allowed to be soft, since a
 * few false positives are the accepted cost of not missing real items.
 */
describe("relevance eval set", () => {
  it("meets the recall floor on the hand-labelled sample", () => {
    const items = loadLabelledItems();
    const result = runEval(items);
    console.log(
      `eval: n=${result.n} precision=${(result.precision * 100).toFixed(0)}% ` +
        `recall=${(result.recall * 100).toFixed(0)}% (tp=${result.tp} fp=${result.fp} fn=${result.fn} tn=${result.tn})`,
    );
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
    if (result.misses.length > 0) {
      throw new Error(
        `Missed relevant items — loosen the matching keyword:\n` +
          result.misses.map((m) => `  [${m.id}] ${m.title}\n    ${m.note}`).join("\n"),
      );
    }
  });
});

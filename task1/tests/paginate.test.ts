import { describe, it, expect } from "vitest";
import { paginate, paginateGroups, pageContaining } from "../lib/digest/paginate";

describe("paginate", () => {
  it("slices the requested page", () => {
    const items = Array.from({ length: 46 }, (_, i) => i);
    const p = paginate(items, 2, 25);
    expect(p.rows).toEqual(Array.from({ length: 21 }, (_, i) => i + 25));
    expect(p).toMatchObject({ page: 2, pageCount: 2, from: 26, to: 46, total: 46 });
  });

  it("handles the empty case without dividing by zero", () => {
    const p = paginate([], 1, 25);
    expect(p).toMatchObject({ rows: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it("clamps an out-of-range page to the last page", () => {
    const items = Array.from({ length: 46 }, (_, i) => i);
    const p = paginate(items, 99, 25);
    expect(p.page).toBe(2);
    expect(p.rows).toHaveLength(21);
  });

  it("clamps a page below 1 up to 1", () => {
    const items = [1, 2, 3];
    expect(paginate(items, 0, 25).page).toBe(1);
    expect(paginate(items, -5, 25).page).toBe(1);
  });

  it("reports the last page correctly when the count divides evenly", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const p = paginate(items, 2, 25);
    expect(p).toMatchObject({ pageCount: 2, from: 26, to: 50 });
  });
});

describe("paginateGroups", () => {
  const groups = [
    { key: "a", label: "Closes this week", rows: Array.from({ length: 6 }, (_, i) => `a${i}`) },
    { key: "b", label: "Closes later", rows: Array.from({ length: 3 }, (_, i) => `b${i}`) },
    { key: "c", label: "No submission window", rows: Array.from({ length: 37 }, (_, i) => `c${i}`) },
  ];

  it("keeps groups in order on the first page and marks none as continued", () => {
    const page = paginateGroups(groups, 1, 25);
    expect(page.sections.map((s) => s.key)).toEqual(["a", "b", "c"]);
    expect(page.sections.every((s) => !s.continued)).toBe(true);
    expect(page.sections.find((s) => s.key === "c")!.rows).toHaveLength(16); // 25 - 6 - 3
    expect(page.total).toBe(46);
  });

  it("marks a group that started on an earlier page as continued", () => {
    const page = paginateGroups(groups, 2, 25);
    const c = page.sections.find((s) => s.key === "c")!;
    expect(c.continued).toBe(true);
    expect(c.rows).toHaveLength(21); // 37 - 16 already shown on page 1
  });

  it("omits a group entirely if it has no rows on this page", () => {
    const twoGroups = [
      { key: "a", label: "A", rows: Array.from({ length: 25 }, (_, i) => `a${i}`) },
      { key: "b", label: "B", rows: ["b0"] },
    ];
    const page1 = paginateGroups(twoGroups, 1, 25);
    expect(page1.sections.map((s) => s.key)).toEqual(["a"]);
    const page2 = paginateGroups(twoGroups, 2, 25);
    expect(page2.sections.map((s) => s.key)).toEqual(["b"]);
  });
});

describe("pageContaining", () => {
  const groups = [
    { key: "a", label: "A", rows: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}` })) },
    { key: "c", label: "C", rows: Array.from({ length: 37 }, (_, i) => ({ id: `c${i}` })) },
  ];

  it("finds the page containing a deeply-linked item", () => {
    expect(pageContaining(groups, 25, (x) => x.id === "a0")).toBe(1);
    expect(pageContaining(groups, 25, (x) => x.id === "c20")).toBe(2); // index 26 -> page 2
  });

  it("returns undefined for an id that isn't in any group", () => {
    expect(pageContaining(groups, 25, (x) => x.id === "nope")).toBeUndefined();
  });
});

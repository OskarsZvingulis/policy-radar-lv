import { describe, it, expect } from "vitest";
import {
  urlStateReducer,
  parseUrlState,
  serializeUrlState,
  DEFAULT_URL_STATE,
  type UrlState,
} from "../lib/digest/url-state";

const patch = (state: UrlState, p: Partial<UrlState>) =>
  urlStateReducer(state, { type: "patch", patch: p });

describe("urlStateReducer — the actual bug this exists to fix", () => {
  // The reported failure: click view, then a topic, then another topic, then
  // type, then change view again, and watch each step overwrite the last
  // because the code re-derived state from a URL that hadn't caught up yet.
  // A reducer applied against React's own prior state, not the URL, cannot
  // exhibit that: each call here only ever sees the previous call's result.
  it("keeps view and topic together, never dropping the earlier one", () => {
    let state = DEFAULT_URL_STATE;
    state = patch(state, { view: "all" });
    state = patch(state, { topics: ["funding"] });
    expect(state.view).toBe("all");
    expect(state.topics).toEqual(["funding"]);
  });

  it("accumulates a second topic instead of replacing the first", () => {
    let state = DEFAULT_URL_STATE;
    state = patch(state, { view: "all" });
    state = patch(state, { topics: ["funding"] });
    state = patch(state, { topics: ["funding", "tax"] });
    expect(state.topics).toEqual(["funding", "tax"]);
    expect(state.view).toBe("all");
  });

  it("typing a query keeps the view and topics already set", () => {
    let state = DEFAULT_URL_STATE;
    state = patch(state, { view: "all" });
    state = patch(state, { topics: ["funding", "tax"] });
    state = patch(state, { query: "altum" });
    expect(state).toMatchObject({ view: "all", topics: ["funding", "tax"], query: "altum" });
  });

  it("runs the full reported click sequence and ends with everything applied", () => {
    let state = DEFAULT_URL_STATE;
    state = patch(state, { view: "all" });
    state = patch(state, { topics: ["funding"] });
    state = patch(state, { topics: ["funding", "tax"] });
    state = patch(state, { query: "altum" });
    state = patch(state, { view: "not_relevant" });
    expect(state).toMatchObject({
      view: "not_relevant",
      topics: ["funding", "tax"],
      query: "altum",
    });
  });
});

describe("urlStateReducer — page reset rule", () => {
  it("resets page to 1 on a filter change", () => {
    const state = patch({ ...DEFAULT_URL_STATE, page: 5 }, { view: "all" });
    expect(state.page).toBe(1);
  });

  it("resets page to 1 on a query change", () => {
    const state = patch({ ...DEFAULT_URL_STATE, page: 5 }, { query: "altum" });
    expect(state.page).toBe(1);
  });

  it("does not reset page when the patch is only a page change", () => {
    const state = patch({ ...DEFAULT_URL_STATE, page: 5 }, { page: 2 });
    expect(state.page).toBe(2);
  });

  it("does not reset page when the patch is only an item change", () => {
    const state = patch({ ...DEFAULT_URL_STATE, page: 5 }, { item: "26-TA-1" });
    expect(state.page).toBe(5);
    expect(state.item).toBe("26-TA-1");
  });

  it("does not reset page when page and item change together", () => {
    const state = patch({ ...DEFAULT_URL_STATE, page: 5 }, { page: 3, item: "26-TA-1" });
    expect(state.page).toBe(3);
    expect(state.item).toBe("26-TA-1");
  });

  it("resets page when a filter changes alongside item", () => {
    // Not a real call site today, but the rule is "anything other than page
    // or item resets page", not "page survives if item is also present".
    const state = patch({ ...DEFAULT_URL_STATE, page: 5 }, { view: "all", item: "26-TA-1" });
    expect(state.page).toBe(1);
  });
});

describe("urlStateReducer — replace action (popstate)", () => {
  it("adopts the given state wholesale, including its page, with no reset", () => {
    const restored: UrlState = { view: "all", topics: ["tax"], sources: [], query: "x", page: 4 };
    const state = urlStateReducer({ ...DEFAULT_URL_STATE, page: 1 }, { type: "replace", state: restored });
    expect(state).toEqual(restored);
  });
});

describe("parseUrlState / serializeUrlState round-trip", () => {
  it("round-trips a fully populated state", () => {
    const state: UrlState = {
      view: "not_relevant",
      topics: ["funding", "tax"],
      sources: ["liaa_news"],
      query: "altum",
      page: 3,
      item: "tap_legal_acts:26-TA-1",
    };
    const qs = serializeUrlState(state);
    expect(parseUrlState(qs)).toEqual(state);
  });

  it("produces an empty string for the default state", () => {
    expect(serializeUrlState(DEFAULT_URL_STATE)).toBe("");
  });

  it("parses an empty search string as the default state", () => {
    expect(parseUrlState("")).toEqual(DEFAULT_URL_STATE);
  });

  it("falls back to the default view for an invalid value", () => {
    expect(parseUrlState("?view=nonsense").view).toBe(DEFAULT_URL_STATE.view);
  });

  it("clamps a page below 1 up to 1", () => {
    expect(parseUrlState("?page=0").page).toBe(1);
    expect(parseUrlState("?page=-5").page).toBe(1);
  });
});

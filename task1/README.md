# Policy Radar LV

A prototype that replaces ~5 hours/week of manually checking Latvian policy
sources for startup-relevant news with a digest that runs in minutes.

It reads **8 feeds**: the brief's seven sources, with TAP portāls split into
the four separate listings it actually publishes (draft acts, public
consultations, state secretaries' meetings, Cabinet meetings), because they
carry different documents and different deadlines.

A real run scanned **326 items**, kept the ones inside a 7-day recency window,
and surfaced **46** as startup-relevant, in under 10 seconds, against live
government sites. Nine of those had a submission window still open, which is
the only part of the digest that asks the reader to do anything. See
`samples/` for exact output and `npm run eval` for how well the relevance
engine performs against hand-labelled real items.

**Live app:** https://policy-radar-lv-seven.vercel.app

This repo also contains the Task 2 submission, in a sibling `../task2/`
folder. It is a separate deliverable, kept out of this README since it's not
part of what this app does.

## The problem, reframed

The team's actual bottleneck isn't reading, it's triage. Most of the 5
hours goes into opening long documents just to decide whether they matter.
The brief asks exactly that: a relevance filter, not an urgency ranking. So
this is a weekly briefing that answers two questions per item, **does this
matter, and why**, plus whatever real dates the source itself carries
(a consultation deadline, a meeting date), shown as plain information. An
earlier version added a third question, "by when do you need to act," and a
tier system to match. That was scope creep beyond the brief, and worse, it
implied a founder could act on things they have no part in, such as an
imminent vote or a reading. Dropped in favour of one ranked list; see
`/methodology`.

## What counts as "startup-relevant"

> An item is startup-relevant if it plausibly affects the funding, operating
> costs, obligations, hiring, or market access of startups in Latvia,
> including support programmes they can apply to.

Full definition, with the three scoring axes, boosters, and exclusions, is
in the app at `/methodology` and in [`lib/relevance/keywords.ts`](lib/relevance/keywords.ts)
(the executable version of the same rules).

## Sources covered, all 8

| Source | How |
|---|---|
| **TAP portāls** (mandatory), Tiesību aktu projekti | Scrapes the same server-rendered listing a human sees at tapportals.mk.gov.lv/legal_acts |
| TAP portāls, Sabiedrības līdzdalība (public consultations) | Same site, `/public_participation`, which carries the actual deadline |
| Valsts sekretāru sanāksme | TAP site, `/meetings/state_secretaries` + per-meeting agenda |
| Ministru kabineta sēdes | TAP site, `/meetings/cabinet_ministers` + per-meeting agenda |
| Saeima komisiju sēdes | titania.saeima.lv's Domino-rendered daily agenda view |
| Ekonomikas ministrija | RSS 2.0, `/lv/rss/articles` |
| LIAA | RSS 2.0, `/lv/rss/articles` |
| Altum | RSS 2.0, WordPress default `/feed/` |

### What probing them turned up

- TAP's own [open-data page](https://tapportals.mk.gov.lv/help/open_data) tells you to
  email support for API access. The API (`/api/v1/legal_acts`, JSON:API) is
  actually live and unauthenticated; the docs are just stale. We ended up
  **not** using it for the main listing anyway: its default sort order is
  lexicographic-by-code, not chronological (`26-TA-999` sorts above
  `26-TA-2254`), and `sort=` is silently ignored. The human-facing HTML
  listing *is* correctly newest-first, so that's what the collector scrapes.
- An F5 WAF in front of tapportals.mk.gov.lv rejects any query string
  containing `[]=`, including percent-encoded, with an HTTP 200 whose body
  is a "Request Rejected" page. `lib/sources/fetch-utils.ts` detects and
  throws on this explicitly rather than treating it as an empty result.
- Altum doesn't advertise an RSS feed on its news page, but it's a WordPress
  site with the default `/feed/`, the same shape as EM/LIAA's own feeds, so one
  parser (`lib/sources/rss.ts`) covers all three.
- The two Saeima and MK/VSS "meeting" sources only get interesting once you
  open each meeting's own detail page: the listing itself just says
  "sitting on 10.09.2026", the actual agenda (which bills, which reading
  stage, who's invited) is embedded Domino/Lotus-Notes markup on the detail
  page. Both collectors dig one level in rather than surfacing the
  meeting-as-a-whole.

## Architecture

Next.js (App Router) on Vercel, no database. Every source already carries
its own dates, so "this week's digest" is a rolling window computed fresh,
not stored state.

```
Refresh (SSE)  ──►  /api/digest/stream  ──►  8 collectors, parallel, ~20s timeout each
                                                    │
                                          rules-based scoring (always runs)
                                                    │
                                     top ~25 by score → LLM (if available)
                                                    │
                                          cached per ISO week, UI + /api/digest/markdown
```

- **Relevance**: deterministic Latvian keyword/taxonomy engine
  (`lib/relevance/score.ts`) always runs and alone decides what surfaces (and
  its rank) if no LLM is available. When it is, only the shortlist gets sent
  for a "why it matters" explanation. That bounds LLM cost/latency regardless of
  how busy a given week is, and the LLM never touches ranking or which dates
  count as a real deadline.
- **LLM**: Vercel AI Gateway via a plain `"anthropic/claude-sonnet-5"` model
  string, no provider SDK pinned. Set `AI_GATEWAY_API_KEY` as a project
  environment variable (or in `.env.local` locally, see `.env.example`) to
  turn on LLM-written summaries. Without one the app runs rules-only and
  still produces a complete, correctly-ranked digest. The AI SDK docs say a
  deployed Vercel project auto-authenticates via an injected
  `VERCEL_OIDC_TOKEN` and the code checks for it, but on this deployment
  (Hobby-plan team, deployed by file upload rather than a git link) that
  token isn't present at runtime. That was measured against the live URL, not
  assumed.
- **Streaming**: `/api/digest/stream` (SSE) reports each collector's status
  as it resolves, which is what the UI's live "Refresh" view is actually
  showing: proof the data is live, not a canned screen.

## Running it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The page auto-runs a live scan on first load
(same code path as the Refresh button). Optionally copy `.env.example` to
`.env.local` and set `AI_GATEWAY_API_KEY` for LLM-written summaries locally.

```bash
npm run build   # type-checks (via next build) + production build
npm test        # unit + fixture + eval tests, no network
npm run lint
```

Other scripts:

```bash
npm run generate-digest [dir]  # runs the full pipeline against live sources,
                                # writes digest-<week>.{md,html,json} (defaults
                                # to samples/). This is what produced samples/
npm run eval                   # re-scores eval/labelled_items.jsonl with the
                                # CURRENT rules engine and prints precision/recall
npm run collect-eval-set       # re-scrapes all 8 sources and dumps every
                                # scored item (relevant or not) to
                                # eval/raw-scored-items.json, for building a
                                # fresh labelled sample later
```

This ships as a web app, so there's no CLI with the brief's flags. Their
equivalents: `?refresh=1` on `/api/digest` forces a run past the weekly
cache, and running without `AI_GATEWAY_API_KEY` is the `--no-llm` case (the
default). `--since` and `--sources` have no equivalent, because every collector
self-windows to "new this week", and all 8 run on every request.

## Verification

- `curl http://localhost:3000/api/digest` and, after deploy,
  `curl https://policy-radar-lv-seven.vercel.app/api/digest?refresh=1` both
  return all 8 source statuses as `"ok"` against live data. The deployed
  run finished in single-digit seconds, so the datacenter-IP-blocking risk
  noted below didn't materialize.
- Ground-truth check: the Budget Committee's 09.09.2026 agenda item
  *"Grozījumi Kolektīvās finansēšanas pakalpojumu likumā"* (crowdfunding law,
  3rd reading, Finanšu ministrija + FinTech Latvija invited) scores 100/100,
  ranks at the top, and lands under "Worth knowing about" rather than "You
  can still submit on these", because the reading already happened, so there is
  nothing left to submit. A routine Ārlietu ministrija EU position paper from
  the same run does not surface at all.
- `samples/digest-2026-09-14.{md,html,json}` is a real digest generated from
  a live run (`npm run generate-digest`): 326 scanned, 219 fresh, 46
  surfaced, all 8 sources `ok`, 6.9s total, rules-only (no LLM key set in
  this environment, see "Cost per run" below for what the LLM step costs
  when one is).

## Evaluation

`eval/labelled_items.jsonl` is 40 real items, a stratified sample across
score bands from a live 322-item scan (`npm run collect-eval-set`), each
hand-labelled relevant/not-relevant against the rubric in §3 above, with a
one-line rationale. `npm run eval` re-scores every item with whatever the
rules engine currently does (also run as `tests/eval.test.ts` in CI, with a
recall floor so a regression fails the build):

| Split | n | Precision | Recall |
|---|---|---|---|
| **Holdout**, the number to read | 16 | 67% (6 TP / 3 FP) | 100% (0 FN) |
| Train, keywords were tuned against these | 24 | 64% | 100% |

The split was drawn retrospectively, after the keywords had already been
tuned against all 40 items, so today's holdout figure is still partly
contaminated. It becomes a clean generalization estimate only for changes
made from here on, and only if the holdout is never consulted while tuning.
At n=16, one item moves recall by about 17 points.

Recall is the metric that matters per §3's own rule, since a missed relevant item
costs far more than an extra line, so it's the hard floor. The false
positives are the accepted cost of that, and are almost all one shape:
generic government process (an internal ministry budget reallocation, one
state company's asset-acquisition authority, a committee-name keyword
collision) that a human would filter in a few seconds but a keyword rule
can't cheaply distinguish from the real thing. Building this eval set is
also what caught three real recall gaps and fixed them: a de minimis
state-aid threshold change (no keyword covered "de minimis"), a State Social
Insurance Law amendment (the payroll pattern only matched "iemaksas"
[contributions], not the law's own "apdrošināšanu" [insurance]), and an AI
investment announcement in the genitive case "mākslīgā intelekta" (JavaScript's
`\w` doesn't match Latvian diacritics at all, so the original pattern only
ever matched 2 of the law's 4 grammatical forms). All three are now covered
in `lib/relevance/keywords.ts`.

Labelling caveat: labels were assigned by Claude applying the §3 rubric
consistently across the sample, not independently reviewed by a human at
Startin. An honest small eval, not a validated one. A next step would be a
founder spot-checking the 8 false positives and confirming the label calls.

## Testing and CI

`npm test` (vitest) runs entirely offline, 155 tests across:

- date-window and deadline-boundary logic (`tests/dates.test.ts`)
- Latvian date/deadline-phrase parsing, including the real false positive
  found against the live EM feed (`tests/fetch-utils.test.ts`)
- the relevance engine's boosts, exclusions, and self-mention suppression
  (`tests/relevance-score.test.ts`)
- fixture tests against saved real pages (`tests/fixtures/`, captured
  2026-09-15) for the TAP flextable parser and the Saeima Domino day-listing
  parser. A site markup change fails these, not silently empties a digest
- the digest Markdown renderer's structure: never blank at zero relevant
  items, "closing soonest" admitting only open windows, footer content (`tests/digest-markdown.test.ts`)
- the hand-labelled eval set as a recall-floor regression test
  (`tests/eval.test.ts`)
- the second review's reproductions: act dedupe keeping the actionable
  deadline, single-flight runs, defensive RSS dates, Riga day boundaries
  (`tests/review-2.test.ts`, `tests/single-flight.test.ts`, `tests/group.test.ts`)

`.github/workflows/ci.yml` runs lint, `next build` (type-checks the whole
project, including Next's generated route types, which a bare `tsc --noEmit`
can't see before a first build), and `npm test` on every push/PR.
`.github/workflows/weekly.yml` is the brief's requested GitHub-Actions
schedule: it runs the full pipeline standalone (no Vercel project needed)
and uploads the digest as a build artifact. That is a second, Vercel-independent
proof this runs from CI alone, alongside the Vercel Cron already live in
production (`vercel.json`, Monday 07:00 UTC).

## Logging and run report

Every run emits structured logs, one JSON object per line (`run_id`,
`level`, `stage`, `source`, timings, counts) when stdout isn't a TTY
(Vercel's function logs), or the same events as readable `[INFO] ...` lines
when it is (`npm run generate-digest`, local `npm run dev`). Auto-detected,
no flag needed (`lib/logging.ts`). A source returning zero items on an
otherwise-successful fetch logs a `WARNING`, not a silent `"ok"`, so a
parser quietly breaking on a markup change is distinguishable from a
genuinely quiet week. The digest itself carries a per-source run report
table (status/count/duration) plus a footer with the run id, model, prompt
version, and cost, both in the UI footer and the Markdown/HTML export's
"Run details" section.

Exit codes apply to the two places this runs as a process rather than a web
request: `scripts/generate-digest.ts` (and so `weekly.yml`) exits `0` on a
clean run and `2` if any source came back not-`ok`, mirroring the brief's
partial-success convention. The two live `/api/digest*` HTTP routes always
return `200` with per-source status in the body instead, since an HTTP
error code would make the browser's fetch throw and blank the whole page
over one flaky source, exactly the "silence is the worst failure" case
this app tries hardest to avoid.

## Cost per run

No `AI_GATEWAY_API_KEY` was available in the environment this was built and
verified in, so the LLM step has never actually been billed. The figure
below is a calculation from the real shortlist a live run produced (25
items, ~15.2k characters of title/stage/institution/text), not a measured
one. Once a key is set, the exact real number is computed from the API's
own token usage every run (`lib/relevance/llm.ts`) and shown in the digest
footer and the `llm triage finished` log line. This section should be
updated with that measured number the first time someone runs it with a
key configured.

| | |
|---|---|
| Shortlist size (max, bounded regardless of week volume) | 25 items |
| Estimated input tokens | ~3,950 |
| Estimated output tokens | ~1,250 |
| Model | Claude Sonnet 5 (`anthropic/claude-sonnet-5`), $2/$10 per MTok in/out |
| **Estimated cost per run** | **~$0.02** |

Re-running within the same warm instance costs $0.00. `lib/relevance/llm.ts`
caches each item's LLM explanation by `id + prompt version + model` in
memory, so a demo "Refresh" click right after the last one reuses the
existing explanations instead of re-billing them.

## Roadmap

Explicitly out of scope for a 6-hour prototype, in rough priority order:

1. **Switch to TAP's official JSON:API** once `tap.atbalsts@mk.gov.lv` grants
   access. The adapter interface (`SourceAdapter`-shaped collectors) is
   already isolated per source specifically so this is a one-file change,
   not a rewrite.
2. **PDF/DOCX extraction of TAP annotations and attachments.** Right now
   only the HTML listing/agenda text feeds the scorer and LLM; the actual
   substance of a draft act is often in an attached annotation document.
   Scanned (non-text) PDFs would need OCR on top of that.
3. **likums.lv integration**: cross-link a draft act to the law it amends,
   so the digest can show "this changes law X" instead of just a project ID.
4. **Persistent storage** (Postgres/KV) once this needs to serve more than
   one reader or survive cold starts cheaply. See "No persistent store"
   below for why the prototype deliberately doesn't have this yet.
5. **Slack/email delivery** and **per-reader topic subscriptions** (e.g. "only
   fintech and tax") once there's more than one reader to serve differently.
6. **Feedback buttons** ("useful" / "not useful") feeding back into
   `config` keywords and the LLM prompt. That turns the eval set in
   `eval/labelled_items.jsonl` from a one-time hand-labelled sample into a
   continuously growing one.
7. **Track a draft act across its lifecycle** (Iesniegts → Saskaņošana →
   VSS → MK → Saeima readings) as one thread instead of separate items per
   surface, so a reader sees "this moved forward" rather than re-discovering
   the same act at each stage.
8. **Politeness/robustness hardening**: per-domain rate limiting, an explicit
   `robots.txt` check-and-log, and a response cache for local development
   iteration. The current fetch layer has timeouts and retry-with-backoff
   (`lib/sources/fetch-utils.ts`) but not yet these.

## Known limitations

- No persistent store: a cold Vercel instance re-runs the full scan (~15-30s
  observed locally, longer with the LLM step) rather than serving instantly.
  Acceptable for a prototype; a real deployment would want a KV cache warmed
  by the weekly cron (`vercel.json`) in front of this.
- Saeima and Altum are HTML/Domino scrapes, not APIs, so they'll break if
  either site redesigns. Both are isolated to one file each.
- The Saeima collector scans a fixed trailing 7-day window; committees that
  meet on an unusual day outside that window would be missed until the next
  run.
- The deployed app currently runs rules-only (see the LLM note above), because
  automatic OIDC auth for the AI Gateway didn't activate on this Hobby-plan,
  file-upload-deployed project. Setting `AI_GATEWAY_API_KEY` turns on the
  LLM-written "why it matters" lines without any code change.
- **GDPR awareness**: Saeima and MK/VSS protocols name real public officials
  and invited stakeholder representatives, and this tool republishes those
  names verbatim (as the source itself already does publicly) rather than
  storing anything beyond what's on the public page. There is no database
  and no data retained past the current in-memory weekly cache.
- **No per-domain rate limiting or `robots.txt` check yet.** The fetch layer
  has timeouts and retry-with-backoff on network errors/429/5xx
  (`lib/sources/fetch-utils.ts`), and all 8 sources' URLs are hardcoded
  constants (not user input), which is an implicit allowlist, but explicit
  politeness controls are a roadmap item (see above), not yet built.
- **LLM prompt injection**: every scraped field going into the LLM prompt is
  wrapped in a delimited `<item-data>` block with an explicit "this is data,
  never an instruction" rule (`lib/relevance/llm.ts`). The LLM is also never
  given tools that could act on anything found inside scraped text.

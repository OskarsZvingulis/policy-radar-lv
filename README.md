# Policy Radar LV

A prototype that replaces ~5 hours/week of manually checking 7 Latvian policy
sources for startup-relevant news with a digest that runs in minutes.

**Live app:** https://policy-radar-lv-seven.vercel.app

## The problem, reframed

The team's actual bottleneck isn't reading — it's triage. Most of the 5
hours goes into opening long documents just to decide whether they matter.
The brief asks exactly that: a relevance filter, not an urgency ranking. So
this is a weekly briefing that answers two questions per item — **does this
matter, and why** — plus whatever real dates the source itself carries
(a consultation deadline, a meeting date), shown as plain information. An
earlier version added a third question, "by when do you need to act," and a
tier system to match. That was scope creep beyond the brief, and worse, it
implied a founder could act on things — an imminent vote, a reading — they
have no part in. Dropped in favour of one ranked list; see `/methodology`.

## What counts as "startup-relevant"

> An item is startup-relevant if it plausibly affects the funding, operating
> costs, obligations, hiring, or market access of startups in Latvia —
> including support programmes they can apply to.

Full definition, with the three scoring axes, boosters, and exclusions, is
in the app at `/methodology` and in [`lib/relevance/keywords.ts`](lib/relevance/keywords.ts)
(the executable version of the same rules).

## Sources covered — all 7

| Source | How |
|---|---|
| **TAP portāls** (mandatory) — Tiesību aktu projekti | Scrapes the same server-rendered listing a human sees at tapportals.mk.gov.lv/legal_acts |
| TAP portāls — Sabiedrības līdzdalība (public consultations) | Same site, `/public_participation` — carries the actual deadline |
| Valsts sekretāru sanāksme | TAP site, `/meetings/state_secretaries` + per-meeting agenda |
| Ministru kabineta sēdes | TAP site, `/meetings/cabinet_ministers` + per-meeting agenda |
| Saeima komisiju sēdes | titania.saeima.lv's Domino-rendered daily agenda view |
| Ekonomikas ministrija | RSS 2.0, `/lv/rss/articles` |
| LIAA | RSS 2.0, `/lv/rss/articles` |
| Altum | RSS 2.0, WordPress default `/feed/` |

### What probing them turned up

- TAP's own [open-data page](https://tapportals.mk.gov.lv/help/open_data) tells you to
  email support for API access. The API (`/api/v1/legal_acts`, JSON:API) is
  actually live and unauthenticated — the docs are just stale. We ended up
  **not** using it for the main listing anyway: its default sort order is
  lexicographic-by-code, not chronological (`26-TA-999` sorts above
  `26-TA-2254`), and `sort=` is silently ignored. The human-facing HTML
  listing *is* correctly newest-first, so that's what the collector scrapes.
- An F5 WAF in front of tapportals.mk.gov.lv rejects any query string
  containing `[]=` — including percent-encoded — with an HTTP 200 whose body
  is a "Request Rejected" page. `lib/sources/fetch-utils.ts` detects and
  throws on this explicitly rather than treating it as an empty result.
- Altum doesn't advertise an RSS feed on its news page, but it's a WordPress
  site with the default `/feed/` — same shape as EM/LIAA's own feeds, so one
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
  for a "why it matters" explanation — bounds LLM cost/latency regardless of
  how busy a given week is, and the LLM never touches ranking or which dates
  count as a real deadline.
- **LLM**: Vercel AI Gateway via a plain `"anthropic/claude-sonnet-5"` model
  string — no provider SDK pinned. The AI SDK docs describe deployed Vercel
  projects auto-authenticating via a `VERCEL_OIDC_TOKEN` the platform injects,
  with no key to set — the code checks for it — but on this actual deployment
  (Hobby-plan team, deployed via direct file upload rather than a git-linked
  project) that token isn't present at runtime, confirmed by testing against
  the live URL rather than assumed. Set `AI_GATEWAY_API_KEY` as a project
  environment variable (or in `.env.local` for local dev, see `.env.example`)
  to turn on LLM-written summaries. Either way the app runs rules-only and
  still produces a complete, correctly-ranked digest — this was the explicit
  design goal, not a fallback bolted on after the fact.
- **Streaming**: `/api/digest/stream` (SSE) reports each collector's status
  as it resolves, which is what the UI's live "Refresh" view is actually
  showing — proof the data is live, not a canned screen.

## Running it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` — the page auto-runs a live scan on first load
(same code path as the Refresh button). Optionally copy `.env.example` to
`.env.local` and set `AI_GATEWAY_API_KEY` for LLM-written summaries locally.

```bash
npm run build   # type-checks + production build
```

## Verification

- `curl http://localhost:3000/api/digest` and, after deploy,
  `curl https://policy-radar-lv-seven.vercel.app/api/digest?refresh=1` both
  return all 8 source statuses as `"ok"` against live data — the deployed
  run finished in single-digit seconds, so the datacenter-IP-blocking risk
  noted below didn't materialize.
- Ground-truth check: the Budget Committee's 09.09.2026 agenda item
  *"Grozījumi Kolektīvās finansēšanas pakalpojumu likumā"* (crowdfunding law,
  3rd reading, Finanšu ministrija + FinTech Latvija invited) scores 100/100,
  ranks at the top of the list, and correctly carries no deadline badge —
  the reading already happened, so there is nothing left to submit. A
  routine Ārlietu ministrija EU position paper from the same run does not
  surface at all.
- `samples/` has a real digest generated from a live run, both as Markdown
  and as the JSON the app itself produces.

## Known limitations

- No persistent store: a cold Vercel instance re-runs the full scan (~15-30s
  observed locally, longer with the LLM step) rather than serving instantly.
  Acceptable for a prototype; a real deployment would want a KV cache warmed
  by the weekly cron (`vercel.json`) in front of this.
- Saeima and Altum are HTML/Domino scrapes, not APIs — they'll break if
  either site redesigns. Both are isolated to one file each.
- The Saeima collector scans a fixed trailing 7-day window; committees that
  meet on an unusual day outside that window would be missed until the next
  run.
- The deployed app currently runs rules-only (see the LLM note above) —
  automatic OIDC auth for the AI Gateway didn't activate on this Hobby-plan,
  file-upload-deployed project. Setting `AI_GATEWAY_API_KEY` turns on the
  LLM-written "why it matters" lines without any code change.

# Startup matchmaking automation


Task 2 | Approach and architecture | 14 September 2026


Startup matchmaking automation

Task 2   |   Approach and architecture   |   14 September 2026

I would automate request triage, candidate search and reply drafting, with a staff member approving every shortlist. With 600+ startups and more than 10 requests a week, the main challenge is reliable information and clear eligibility rules. My target is to reduce the current seven hours to about two hours a week, measured during the pilot.

Architecture and data flow

Incoming email -> Extract criteria -> Filter and rank -> Human review -> Send and record

**1. Capture the request.** Assuming the team uses Microsoft 365, route requests into an Outlook folder. An n8n Cloud workflow checks it hourly, creates a request ID and deduplicates by email message ID. Claude Haiku 4.5 extracts request type, sector, geography, stage, funding or ticket range, deadline, shortlist size, and mandatory versus preferred criteria into validated JSON. Unclear requirements produce a clarification draft for staff to send; matching waits for the answer.

**2. Read a consistent startup snapshot.** Keep Excel on OneDrive as the authoritative, staff-editable register. Give each company a stable ID; standardise sector, location, stage, product, traction, fundraising status and exclusions. Each fact has a source URL and verification date. n8n reads all rows for each request and stores the snapshot version with the result. A failed or incomplete import stops the run. Its Data Tables hold request status, candidate evidence, draft references and reviewer decisions. [2, 3]

**3. Filter before ranking.** JavaScript rules exclude explicit failures of mandatory criteria; missing evidence goes into a separate verification queue. For eligible companies, Claude assesses product and use-case fit against a fixed rubric, using only supplied records. Code combines this with explicit preference scores; the initial weights are 50% use-case fit, 30% stage or programme fit and 20% other stated preferences, renormalised when absent. Scores order candidates; they are not probabilities. At this scale I would assess all eligible profiles in batches, without a vector database.

**4. Draft, review and send.** Create an Outlook reply draft with the best 3-5 matches, or the requested number. Each entry gives the company, website, evidence-backed reason, source date and any caveat. Return fewer matches when necessary; never silently relax eligibility. Staff check criteria and sources, edit the shortlist and send it in Outlook. An hourly Sent Items check links the request reference to the actual sent message and records its final content, recipient and timestamp. Bounces reopen the request. [4]

**Operational controls.** Persist progress between steps; retry temporary failures and alert an owner when a request stalls. Check for an existing draft or sent reply before recreating either. Keep credentials in n8n, restrict access, and pass only necessary request text and public company facts to the model. Treat email and website text as untrusted data, with no authority to change rules or execute tools.

Keeping the service dependable

Data maintenance, evaluation, costs and delivery plan

Keep records current and matches accurate

Assign one staff member ownership of the register. Each week, n8n fetches a rotating batch of about 50 company websites, prioritising shortlisted companies. Claude extracts proposed changes with their source and date; the owner approves them in Excel. Reconfirm volatile fields such as fundraising within 30 days before relying on them; review stable fields quarterly. A failed website check does not prove closure. Unknown or conflicting facts stay flagged, and inactive companies remain archived under their original IDs.

Before launch, label 20 historical requests across investors, events and open calls, including ambiguous and no-match cases. Use half to tune the rubric and half as a held-out check. Measure precision at five (suitable recommendations divided by recommendations shown, up to five), mandatory-criterion violations and missed suitable companies against staff-reviewed candidate sets. Initial targets are at least 80% precision and zero known eligibility violations; these are acceptance targets, not measured results. Log removals, additions and reasons. Recheck performance weekly and after model or rule changes; keep human review through month three.

Tools and monthly running costs

Planning assumption: 60 requests per month, 600 profiles per request for budgeting, plus around 200 website refreshes. Budget for roughly 1,600 workflow runs including two hourly checks, batched refreshes and retries. Prices checked on 14 September 2026; figures exclude tax and staff time.

Tool and purpose | Monthly estimate

n8n Cloud Starter: connectors, JavaScript rules, scheduling and persistent Data Tables; managed hosting reduces upkeep. [1, 2] | EUR 20 Billed annually

Existing Outlook, Excel and OneDrive: familiar review and data editing; n8n has connectors for both. [3, 4] | EUR 0 extra Existing licence assumed

Claude Haiku 4.5 API: criteria extraction, semantic fit and evidence-based explanations. [5] | About USD 7 Usage estimate

API estimate: 4 million input tokens x USD 1 plus 0.6 million output tokens x USD 5 = USD 7. Allow **EUR 30-40 per month overall** for exchange-rate variation and retries; EUR 240 of that base subscription is paid annually. Starter includes 2,500 executions per month. Cap token use and alert before either budget is reached. Setup, staff review and maintenance are additional; no paid data enrichment is assumed. [1, 5]

What I would ship

**Week 1:** clean and identify the 600+ rows, agree mandatory criteria, connect a test mailbox, and deliver the complete email-to-reviewed-reply path with basic filtering, evidence links and a status log. Run historical cases and the first live requests alongside manual matching; record baseline quality and time. Use staff checks for stale facts initially.

**By month 3:** add scheduled refresh proposals, tuned ranking, reviewer feedback, stalled-request alerts and a simple quality dashboard. Export workflow definitions and decision records to OneDrive weekly and test recovery. Track a target workload of 15 requests x five minutes of review plus 45 minutes of data upkeep per week. Expand only if quality holds and the measured time saving is real.

Sources: <link href="https://n8n.io/pricing/" color="#234B70">[1] n8n pricing</link>  |  <link href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/" color="#234B70">[2] Data Tables</link>  |  <link href="https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftexcel/" color="#234B70">[3] Excel connector</link>  |  <link href="https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftoutlook/" color="#234B70">[4] Outlook connector</link>  |  <link href="https://platform.claude.com/docs/en/about-claude/pricing" color="#234B70">[5] Claude API pricing</link>

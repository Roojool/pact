# PACT — submission final (paste-ready)

> Paste-ready text for the submission form. Every claim is separated into
> **verified evidence** (dated, executed) and **planned work** (not yet executed).
> Do not paste a claim as verified unless it happened. The participant walkthrough
> is **not yet completed** and must be done personally before filing (see
> [`AI_ASSISTANCE.md`](./AI_ASSISTANCE.md)).

## Project title

**PACT — Check the promise before you make it**

## Short description (paste-ready)

PACT is a small-business planning desk that checks whether the work a team has
promised can actually be delivered by its people, explains the conflict with
graph-grounded evidence, proposes a checked repair, and records a human-approved
internal plan in FalkorDB. New visitors describe their business in one short
prompt, then draft a starting setup with AI, fill the same fields in manually, or
open a labelled example — every proposed assumption is reviewed and separately
accepted before anything is saved, and unknown hours or responsibilities stay
unknown.

The worked scenario is the fictional Morrow Studio agency: every **pair** of
campaigns fits the team's Day-1 capacity, but **all three do not** — 12 work-hours
are due against 8 available. PACT names that joint conflict, proves it with real
graph paths and source documents, and proposes the checked repair (move the Comet
launch to Day 2) while showing the backup person is blocked by a recorded
responsibility fact. On **human approval**, PACT records an **internal
reservation** of hours and an owner-task checklist in the graph — not real
publishing, delivery or messaging. A fresh session recovers the decision and its
sources, and when an approval source changes, the next check can reconsider a
previously rejected option.

PACT is a bounded **two-day staff/task planner** (people, tasks, hours,
responsibility rules) — not a point-of-sale, inventory, live-order or delivery
system — and an approved plan is an internal reservation, not a guarantee of
real-world delivery.

## Track(s) entered — all three

PACT is entered in all three *Graph Hacks: Context for AI Agents* tracks
(WeMakeDevs × FalkorDB) — and only these three:

1. **Agents That Act on Connected Data** — the two agent roles (Account Manager →
   Campaign Producer) consume a graph-derived structured context and act on it;
   every citation is filtered against source IDs that actually exist in the graph.
   Setup drafting is one bounded structured-output request whose quoted facts must
   come from the user's own note.
2. **Agent Memory and Coordination** — durable handoff memory in FalkorDB
   (`pact_agent` graph), a durable workspace memory chain
   (`Memory -[:NEXT]-> Memory`), and a real two-role handoff where each role is
   its own runtime session.
3. **Company Brain** — work commitments, people, available hours, responsibility
   rules, events, sources, decisions and owner tasks live in one queryable graph,
   and the feasibility answer is derived by traversal rather than a denormalized
   table.

You must name every track you are entering when you submit.

## Why the graph is necessary

Eligibility, capacity, conflicts, proposals, decisions, reservations and memory
are all discovered by **traversal**. There is no in-memory business-state
fallback: if FalkorDB is removed, PACT cannot answer anything (DB down ⇒
`503 graph_unavailable`). The graph is not a cache in front of a relational
model — it *is* the model. Business-setup workspaces persist the reviewed note
and accepted assumptions as real `Source` nodes in the same graph model
([`queries/`](../queries/)).

## Repository

<https://github.com/Roojool/pact> — reviewed source is **published** (source,
setup, graph model, Cypher and tests). Merging the AI business-setup branch into
this repository is **planned work handled by the maintainer**, not yet executed.

## Live link status

- **Live app (HTTPS):**
  <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com> —
  production domain (Azure for Students, Hyderabad / `indiasouthcentral`).
  **Currently it serves the earlier, independently reviewed production release**
  (deterministic journey, 0 provider calls for the capture, $5 cap unchanged —
  historical evidence, not re-run). **Redeploying the same domain so it opens
  with AI business setup is planned and not yet verified.**
- **Local fallback:** complete local and Docker setup instructions are in
  [`README.md`](../README.md); manual setup and labelled examples need no
  provider key.

## Demo video and deck status

- The published demo video and pitch deck (release
  [`v1.0.0`](https://github.com/Roojool/pact/releases/tag/v1.0.0), the
  <https://youtu.be/PKR43OuwzXg> upload, and the self-hosted watchpage at
  <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo>) are
  **historical recordings of the earlier interface**. They are kept as
  drafts/history and are **not** presented as footage of this release.
- **A replacement recording of this release is pending** and is not claimed as
  published.
- The LinkedIn post (<https://lnkd.in/p/dnpZSBgW>) and profile are **unchanged**.

## Details

- Graph model and exact Cypher (read-only vs mutation): [`queries/`](../queries/).
- Setup, environment variables and verification evidence:
  [`README.md`](../README.md).
- Business-setup feature, bounds and demo sequence:
  [`docs/BUSINESS_SETUP.md`](./BUSINESS_SETUP.md).
- AI-assistance disclosure and participant walkthrough:
  [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md).

All business data is synthetic (Morrow Studio, Sunroom Studio, BunStop).
Feasibility is checked under an explicit two-day (16 one-hour slots),
single-person-per-task planning model with bounded inputs (at most 6 tasks and
4 team members per workspace, whole hours 1–8 or unknown); unknown durations and
unknown responsibilities are reported as unknown rather than guessed, and an
exhausted bounded search reports `search_limit`. This is a planning aid, not a
guarantee of real-world delivery.

## Rules compliance checklist

From the official rules (<https://www.wemakedevs.org/hackathons/falkordb/rules>):

| Requirement | Status |
| --- | --- |
| FalkorDB is the primary graph database and central to the product | ✅ graph holds all state; no fallback |
| Data is public/synthetic/own | ✅ entirely synthetic fixtures |
| Track(s) named | ✅ all three above (only these three) |
| Public source-code repository | ✅ **published** — <https://github.com/Roojool/pact>; branch merge planned |
| README with setup instructions and graph data model | ✅ [`README.md`](../README.md) |
| Cypher queries / graph algorithms the product depends on | ✅ [`queries/`](../queries/) |
| Demo video showing the working project | ⚠️ **historical video published** (earlier interface, verified playback); **replacement recording of this release pending** — file with the replacement once it exists, or disclose the recording age |
| Live deployment, or complete local setup instructions | ✅ live domain (earlier verified release) **plus** complete local + Docker setup; business-setup redeploy planned |
| AI coding-assistant use disclosed | ✅ [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) |
| Participant understands and can explain the code | ⏳ participant to complete the walkthrough (not yet completed) |

## Important dates

- Hackathon window: **15 Oct 2026 00:01 IST → 18 Oct 2026 23:59 IST**
- Submissions close: **18 Oct 2026 23:59 IST**

## Fields to complete from actual artifacts

- **Repository:** <https://github.com/Roojool/pact> (reviewed source published;
  branch merge planned by the maintainer).
- **Live deployment:** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>
  — paste only after the business-setup redeploy is actually verified; until then
  the domain serves the earlier reviewed release, and the local setup in
  `README.md` is the documented fallback for this release.
- **Demo video:** use the replacement recording once published; the existing
  <https://youtu.be/PKR43OuwzXg> upload and the self-hosted watchpage are
  historical (earlier interface).
- **Live AI evidence:** historical and dated only — one live production session
  (both agent roles + live graph memory) passed on 2026-10-15 in an independent
  verification run (ledger estimate $0.136371 at that checkpoint; durable ledger
  now estimates $0.855696 of the $5 cap, $0 reserved; application-ledger
  estimates, not provider bills), and one real short-prompt setup generation
  passed on 2026-10-16 against the shared budget store ($0.024456 estimate, cap
  unchanged). **No new live AI test is claimed by this release, no project-wide
  call total is established, and the single authorized paid setup call for the
  final release is still to be run by the maintainer.**
- **Team:** Rujul Talekar, solo participant. Confirm the form's account details
  before submitting.

## Do not submit while…

- A required public link stops working; verify the published links before filing.
- The business-setup redeploy is described as already deployed/verified before it
  actually is.
- The pending replacement video is described as published, or the historical
  video is presented as footage of this release.
- A live AI result is claimed beyond the dated evidence above, a project-wide
  call total is stated, or the deterministic path is described as live.
- The project is described as having spent nothing historically, or the bounded
  planner is described as POS/inventory/orders/guaranteed delivery.
- More than the three named tracks are claimed.
- The AI-assistance disclosure is missing.
- The participant cannot explain the graph model, the queries, the architecture
  and the technical decisions. Complete the walkthrough and answer the questions
  in [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) first.

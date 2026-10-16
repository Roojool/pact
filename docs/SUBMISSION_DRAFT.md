# PACT — submission draft

> Paste-ready text below. Verify every field against the finished build before
> filing. The app, public source, playable demo, captions and editable deck are
> published and independently reviewed. The participant walkthrough remains
> uncompleted and must be done personally before submission.

## Project title

**PACT — Check the promise before you make it**

## Short description (paste-ready)

An influencer agency can have three available creators and still promise more work
than its production team can deliver. PACT connects campaign commitments, creators,
editing capacity, brand approvals, source documents and decision owners in a graph,
then answers one question: *do these promises fit together, and if not, what is the
smallest change that makes them fit?*

In the fictional Morrow Studio scenario, every **pair** of campaigns fits the
editor's Day-1 capacity, but **all three do not**: 12 editor-hours are due against 8
approved Day-1 editor-hours. PACT names the joint conflict, explains it with
graph-grounded evidence, and proposes a checked repair — move the Comet launch film
to Day 2 — while showing that using the backup editor Sam for Comet is blocked by a
recorded approval fact. On **human approval**, PACT records an **internal
reservation** of editing time and an owner-task checklist in the graph (not real
publishing or delivery). A fresh session can recover the decision and its sources,
and when a brand approval changes the next check can reconsider a previously
rejected option.

## Track(s) entered — all three

PACT is entered in all three *Graph Hacks: Context for AI Agents* tracks
(WeMakeDevs × FalkorDB):

1. **Agents That Act on Connected Data** — the two agent roles (Account Manager →
   Campaign Producer) consume a graph-derived structured context and act on it, and
   every citation is filtered against source IDs that actually exist in the graph.
2. **Agent Memory and Coordination** — a durable handoff memory in FalkorDB
   (`pact_agent` graph), a durable workspace memory chain (`Memory -[:NEXT]-> Memory`),
   and a real two-role handoff where each role is its own runtime session.
3. **Company Brain** — the agency's campaigns, commitments, capacity, approvals,
   events, sources, decisions and owner tasks live in one queryable graph, and the
   feasibility answer is derived by traversal rather than a denormalized table.

You must name every track you are entering when you submit.

## Why the graph is necessary

Eligibility, capacity, conflicts, proposals, decisions, reservations and memory are
all discovered by **traversal**. There is no in-memory business-state fallback: if
FalkorDB is removed, PACT cannot answer anything (DB down ⇒ `503 graph_unavailable`).
The graph is not a cache in front of a relational model — it *is* the model.

## Repository

<https://github.com/Roojool/pact> — reviewed source is **published** (source, setup,
graph model, Cypher and tests).

## Live link status

- **Live app (HTTPS):** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>
  — the verified **Golden Hour production release** (commit `3985edf`, Hyderabad /
  `indiasouthcentral`, a permitted Azure for Students region). Independently reviewed
  live with **0 provider calls** for the capture and the **$5 cap unchanged**.
- **Demo watchpage (HTTPS):**
  <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo> —
  verified self-hosted video and captions.
- **Golden Hour redesign:** **deployed** — it is the live UI.
- **Local fallback:** complete local and Docker setup instructions are in
  [`README.md`](../README.md).

## Demo video and deck status

**Published and reviewed:** [watch the actual 2:40 demo](https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo).
[Release v1.0.0](https://github.com/Roojool/pact/releases/tag/v1.0.0) contains the
MP4, SRT/VTT captions, narration transcript, editable PowerPoint and PDF.

The video uses real current-interface rules-mode footage and a clearly labeled
verified production recall screenshot. Narration is synthesized offline. Earlier
live AI validation is disclosed as historical; no new paid model call was made.
See [release verification](./RELEASE_VERIFICATION.md).

## Details

- Graph model and exact Cypher (read-only vs mutation): [`queries/`](../queries/).
- Setup, environment variables and verification evidence: [`README.md`](../README.md).
- AI-assistance disclosure and participant walkthrough:
  [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md).

All agency data is synthetic. Feasibility is checked under an explicit two-day
(16 one-hour slots), single-editor planning model with bounded inputs (up to 6 jobs
per workspace); unknown durations and unknown eligibility are reported as unknown
rather than guessed, and an exhausted bounded search reports `search_limit`. This is
a planning aid, not a guarantee of real-world delivery.

## Rules compliance checklist

From the official rules (<https://www.wemakedevs.org/hackathons/falkordb/rules>):

| Requirement | Status |
| --- | --- |
| FalkorDB is the primary graph database and central to the product | ✅ graph holds all state; no fallback |
| Data is public/synthetic/own | ✅ entirely synthetic fixture |
| Track(s) named | ✅ all three above |
| Public source-code repository | ✅ **published** — <https://github.com/Roojool/pact> |
| README with setup instructions and graph data model | ✅ [`README.md`](../README.md) |
| Cypher queries / graph algorithms the product depends on | ✅ [`queries/`](../queries/) |
| Demo video showing the working project | ✅ [published playable demo](https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo) |
| Live deployment, or complete local setup instructions | ✅ **live** — <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com> (Golden Hour, verified; complete local + Docker setup also documented) |
| AI coding-assistant use disclosed | ✅ [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) |
| Participant understands and can explain the code | ⏳ participant to complete the walkthrough in `PARTICIPANT_WALKTHROUGH.md` / `AI_ASSISTANCE.md` (not yet completed) |

## Important dates

- Hackathon window: **15 Oct 2026 00:01 IST → 18 Oct 2026 23:59 IST**
- Submissions close: **18 Oct 2026 23:59 IST**

## Fields to complete from actual artifacts

- **Repository:** <https://github.com/Roojool/pact> (reviewed source published).
- **Demo video:** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo> (159.83 seconds; MP4 and captions also in release `v1.0.0`).
- **Live deployment:** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>
  — the verified Golden Hour production release (commit `3985edf`), independently
  reviewed with zero paid calls for the capture. Watchpage:
  <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo>. The
  complete local/Docker setup in `README.md` remains the fallback.
- **Live AI session:** ✅ **verified once (earlier deployment)** in an independent
  verification run — a real live production session (both agent roles
  `account_manager` → `producer` plus live graph memory) passed on 2026-10-15 06:56
  UTC. Analysis mode was live, both roles ran, one human approval recorded a decision,
  and live graph memory returned six sources. The conservative application budget
  ledger recorded that session as a **$0.136371** cumulative estimate against the **$5** application
  cap with **$0** reserved; the durable ledger now estimates **$0.855696** used after
  later recording attempts. These are **historical application-ledger estimates, not
  OpenAI billing measurements, current balances or cash-cost guarantees**; the project
  has **not** spent nothing historically. The Golden Hour UI release/capture made **0
  provider calls**. Not re-run in this docs pass. The total number of live requests
  made across the project is **not** established, so no total call count is claimed.
  The deterministic path remains an zero-provider-cost fallback for the demo.
- **Team:** Rujul Talekar, solo participant. Confirm the form's account details
  before submitting.

## Do not submit while…

- A required public link stops working; verify the published links before filing.
- A live AI result is claimed beyond the single verified session above, a project-wide
  call total is stated, or the deterministic path is described as live.
- The project is described as having spent nothing historically, or a new paid
  AI test is claimed for the final rules-mode video.
- The AI-assistance disclosure is missing.
- The participant cannot explain the graph model, the queries, the architecture
  and the technical decisions. Complete the walkthrough and answer the questions
  in [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) first.

# PACT — 3-minute demo capture plan (zero new paid calls)

A reusable shot list for recording the **working project** (the rules require a
demo video, not a storyboard). Total target: **~3:00**. Rehearse once, then record.

> **Cost rule for this demo: ZERO new paid calls.** Record a fresh **deterministic**
> production walkthrough (the "Rules check"). If you want to show the agent path,
> include only an **explicitly captioned earlier live-AI validation clip** (previous
> interface) from the existing evidence. Never present the old interface as the
> current one, and never describe a deterministic run as a live model call. This
> recording adds no spend, but do **not** claim the project has never spent anything:
> the durable application ledger already records a historical estimate of
> `$0.855696` of the `$5` cap (see [README.md](../README.md)); the Golden Hour UI
> release/capture itself made **0 provider calls**.

## Before you record

1. Pick a target:
   - **Live deployment (verified):** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>
     — this URL serves the **Golden Hour production release** (commit `3985edf`,
     Hyderabad / `indiasouthcentral`). Record the actual deployed UI; do not present
     an older interface as the current one.
   - **Local:** `docker start pact-graph` (or the `docker run` from README.md),
     then `npm run dev` → `http://127.0.0.1:3000`.
2. Keep the AI switch **off** and record the **deterministic "Rules check"**. It runs
   instantly at $0 and exercises the exact same FalkorDB graph traversals, capacity
   audit, conflict explanation, repair proposals, human approval and memory recall
   as the live path. Do **not** launch a new live AI request for this recording.
3. If you want to show the two-agent handoff, insert a **short existing raw clip**
   captioned **"Earlier live AI validation — previous interface"**, only if a
   completed result is visible in it. Do not re-record it, and do not label it as
   current.
4. Open the app in a clean browser window, 1280×800 or larger. Zoom so text is
   readable. Close other tabs/notifications.
5. Record the whole browser window (or screen). Speak over it; no title cards needed.

## Name the three tracks (once, briefly)

PACT is entered in all three *Graph Hacks: Context for AI Agents* tracks:

1. **Agents That Act on Connected Data** — the two agent roles (Account Manager →
   Producer) consume graph-derived structured context and act on it; every
   citation is filtered against source IDs that actually exist in the graph.
2. **Agent Memory and Coordination** — a durable handoff memory in FalkorDB
   (`pact_agent` graph), a durable workspace memory chain
   (`Memory -[:NEXT]-> Memory`), and a two-role handoff where each role is its
   own runtime session.
3. **Company Brain** — the agency's campaigns, commitments, capacity, approvals,
   events, sources, decisions and owner tasks live in one queryable graph, and
   the feasibility answer is derived by traversal rather than a denormalized
   table.

## On-screen names (use these exactly)

The plan has five plain-language views. Refer to them by their real labels:

- **Your work** — the studio plan overview.
- **Needs attention** — the conflict and its graph-grounded evidence.
- **Plan options** — checked repairs, including blocked candidates.
- **Saved plan** — approved internal reservations and owner tasks.
- **Ask PACT** — graph-grounded studio memory recall.

The main action button is **Check this plan**; the repair button is
**Approve this option**. The **Sources** launcher opens the source drawer.

## Shot list

### 0:00–0:20 — What PACT is (Your work)

- On **Your work**, read the headline: *"Check the promise before you make it."*
- Say: PACT is an influencer-agency planning desk. The story is a fictional
  agency, **Morrow Studio**: three campaigns each need a 4-hour edit by the end
  of Day 1 (12h total demand); two editors exist; Alex has 16 slots across Day 1
  and Day 2 and is approved for all campaigns; Sam has four Day 1 slots but is
  explicitly not approved for Comet; Aurora and Beacon are locked to Day 1 and
  Comet may flex to Day 2.
- Name the three tracks (the exact list above), then point at the campaign cards,
  the editing-availability grid, the approval matrix and the events.

### 0:20–0:45 — Check the plan (Needs attention)

- Click **Check this plan** (rules mode).
- When the verdict appears, read it: *these promises do not fit together* — 12
  editor-hours due on Day 1 against 8 Day-1 approved editor-hours available from Alex.
- Say: any **pair** fits (4h + 4h = 8h); all three do not (12h > 8h). That is a
  **joint capacity conflict** (a 4h joint shortfall), not one broken promise.
- Note that this is the deterministic rules check and it made no paid model call.

### 0:45–1:15 — Evidence (why the graph proves it)

- Open **Needs attention** and show the capacity audit and the explainable evidence
  paths.
- Say: eligibility comes from recorded approval facts, availability from the
  editor calendar, and the conflict is discovered by traversal over the graph —
  remove FalkorDB and PACT cannot answer this.
- Open the **Sources** drawer briefly and show a brief/policy excerpt
  (`src-brief-a`, `src-cal`, `src-policy`), then close it.

### 1:15–1:50 — The repair and the blocked candidate (Plan options)

- Open **Plan options**.
- Show the feasible repair: **move Comet Coffee Launch Film to Day 2** (allowed
  by the brief's flex window), while Aurora and Beacon keep their Day-1 deadlines.
- Show the **rejected candidate**: using Sam for Comet is explicitly **blocked
  by an approval fact** in `src-policy` (and Sam's eligibility for Aurora/Beacon
  is unknown due to missing approval records; Sam cannot resolve the conflict).
- Say: PACT never guesses unknown data and never silently schedules a non-approved editor.
  A new approval fact would re-open that option.

### 1:50–2:25 — Approve (Saved plan: internal reservation, not publishing)

- Click **Approve this option**.
- On the **Saved plan** receipt, read an owner task aloud: *"Internal
  reservation: hold 4h with Alex Rivera for Comet Coffee Launch Film (slots 8,9,10,11).
  This reserves editing time; it is not delivery."*
- Say: approval writes a decision, allocations, `RESERVES` edges and owner tasks
  to the graph — an internal reservation and task checklist, not external campaign
  delivery, publishing, social posting or client messaging. No signed cryptographic
  receipts or benchmark latencies are claimed.

### 2:25–2:50 — Memory (Ask PACT: graph-grounded recall)

- Open **Ask PACT**.
- Ask: *"What was approved for Comet Coffee and what happens next?"*
- Show the reply naming the plan status, the workspace revision, and its source
  citations (returning six grounded sources) — all read from the graph. Mention
  that memory is durable across sessions and revision-safe.
- If you also want the live agent path on screen, cut here to the captioned
  earlier clip (**"Earlier live AI validation — previous interface"**), then return.

### 2:50–3:00 — Close

- Say: everything is synthetic; feasibility is checked under a two-day, one-hour,
  single-editor model with bounded search; unknown data is reported as unknown;
  approval records an internal reservation, not real delivery.
- Show the public repo README and `queries/` on screen for two seconds, with the
  live URL, watchpage and repo link visible:
  <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com> ·
  <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo> ·
  <https://github.com/Roojool/pact> *(the live URL is the verified India release;
  the source repository is published)*
- Note that the demo video and deck are pending reviewed publication to release
  `v1.0.0`, and the participant walkthrough is not yet completed.
- End on the graph model line: *the graph does the work; there is no fallback.*

## Optional B-roll (only if you have spare time)

- Toggle an approval in the matrix, re-check, and show the verdict change.
- Set a commitment to **Unknown duration**, re-check, and show the missing-hours
  state.
- Show `queries/mutations.cypher` with the `w.revision` guard highlighted.

## Do not do

- Do not launch a new live AI request for this recording; the demo uses zero new
  paid calls (deterministic walkthrough plus a clearly labelled earlier clip).
- Do not present the earlier interface as the current one, and do not describe the
  deterministic rules check as a live model call.
- Do not claim a project-wide "total call count". The final captured live attempt
  recorded 1 analysis / 1 memory, but earlier recording launches happened and the
  total is not established.
- Do not claim external campaign delivery, social posting, signed cryptographic
  receipts, or benchmark latency. Approval records an internal reservation and owner
  task checklist in the graph only.
- Do not claim the participant walkthrough is complete — it is **not yet completed**.
- Do not invent a demo-video URL or claim the release assets are published before
  the root gate; the intended `v1.0.0` asset URLs are targets only.
- Do not present an older interface as the current one: the Golden Hour redesign
  **is** the deployed live UI.
- Do not show `.env` files, keys or private operations files on screen.
- Do not exceed three minutes; the judge's attention is the budget.

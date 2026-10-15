# PACT — 3-minute demo capture script

A reusable shot list for recording the **working project** (rules require a demo
video, not a storyboard). Total target: **~3:00**. Rehearse once, then record.

## Before you record

1. Pick a target:
   - **Live deployment (recommended):**
     <https://pact-roojool-20261015.malaysiawest.cloudapp.azure.com> — nothing to
     install.
   - **Local:** `docker start pact-graph` (or the `docker run` from README.md),
     then `npm run dev` → `http://127.0.0.1:3000`.
2. Choose your execution mode:
   - **Verified Live AI mode ("AI-assisted check"):** Demonstrates the real
     two-agent handoff (Account Manager → Campaign Producer) and live graph
     memory powered by the Eve runtime and direct OpenAI model, guarded by the
     durable in-graph budget gate. (A real production session was verified on
     2026-10-15 06:56 UTC, consuming an estimated $0.136371 against the $5 cap
     with $0 reserved). Use this mode if your deployment has runtime credentials active.
   - **Deterministic fallback ("Rules check"):** If runtime credentials or
     provider balances are not active, use the deterministic rules check. It runs
     instantly at $0 cost and executes the exact same FalkorDB graph traversals,
     capacity audits, conflict explanations, repair proposals, and memory recall.
   *Both paths exercise the exact same underlying FalkorDB graph schema, conflict
   diagnosis, repair proposals, human approval, and memory persistence.*
3. Open the app in a clean browser window, 1280×800 or larger. Zoom so text is
   readable. Close other tabs/notifications.
4. Record the whole browser window (or screen). Speak over it; no title cards
   needed.

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

## Shot list

### 0:00–0:20 — What PACT is (Overview)

- On the **Deliverables & Desk** view, read the headline: *"Check the promise
  before you make it."*
- Say: PACT is an influencer-agency planning desk. The story is a fictional
  agency, **Morrow Studio**: three campaigns each need a 4-hour edit by the end
  of Day 1 (12h total demand); two editors exist; Alex has 16 slots across Day 1
  and Day 2 and is approved for all campaigns; Sam has four Day 1 slots but is
  explicitly not approved for Comet; Aurora and Beacon are locked to Day 1 and
  Comet may flex to Day 2.
- Name the three tracks (the exact list above), then point at the campaign cards,
  the editing-availability grid, the approval matrix and the events.

### 0:20–0:45 — Check the plan (the conflict)

- Click **Check this plan** (triggering either verified Live AI or the Deterministic fallback).
- When the verdict appears, read it: *these promises do not fit together* — 12
  editor-hours due on Day 1 against 8 Day-1 approved editor-hours available from Alex.
- Say: any **pair** fits (4h + 4h = 8h); all three do not (12h > 8h). That is a
  **joint capacity conflict** (a 4h joint shortfall), not one broken promise.
- If demonstrating Live AI, highlight the two-agent reasoning (Account Manager handoff
  to Producer) and source citations. If using deterministic fallback, note the instant rules verdict.

### 0:45–1:15 — Evidence (why the graph proves it)

- Open **Conflict evidence**.
- Show the capacity audit and the explainable evidence paths.
- Say: eligibility comes from recorded approval facts, availability from the
  editor calendar, and the conflict is discovered by traversal over the graph —
  remove FalkorDB and PACT cannot answer this.
- Open **Source evidence** briefly and show a brief/policy excerpt (`src-brief-a`,
  `src-cal`, `src-policy`), then close.

### 1:15–1:50 — The repair and the blocked candidate

- Open **Repair proposals**.
- Show the feasible repair: **move Comet Coffee Launch Film to Day 2** (allowed
  by the brief's flex window), while Aurora and Beacon keep their Day-1 deadlines.
- Show the **rejected candidate**: using Sam for Comet is explicitly **blocked
  by an approval fact** in `src-policy` (and Sam's eligibility for Aurora/Beacon
  is unknown due to missing approval records; Sam cannot resolve the conflict).
- Say: PACT never guesses unknown data and never silently schedules a non-approved editor.
  A new approval fact would re-open that option.

### 1:50–2:25 — Approve (internal reservation, not publishing)

- Click **Approve proposal & save plan**.
- On the **Saved plan** receipt, read an owner task aloud: *"Internal
  reservation: hold 4h with Alex Rivera for Comet Coffee Launch Film (slots 8,9,10,11).
  This reserves editing time; it is not delivery."*
- Say: approval writes a decision, allocations, `RESERVES` edges and owner tasks
  to the graph — an internal reservation and task checklist, not external campaign
  delivery, publishing, or client messaging. No signed cryptographic receipts or
  benchmark latencies are claimed.

### 2:25–2:50 — Memory (graph-grounded recall)

- Open **Studio memory**.
- Ask: *"What was approved and what happens next?"*
- Show the reply naming the plan status, the workspace revision, and its source
  citations (returning 6 grounded sources) — all read from the graph. Mention
  that memory is durable across sessions and revision-safe.

### 2:50–3:00 — Close

- Say: everything is synthetic; feasibility is checked under a two-day, one-hour,
  single-editor model with bounded search; unknown data is reported as unknown;
  approval records an internal reservation, not real delivery.
- Show the public repo README and `queries/` on screen for two seconds, with the
  live URL and repo link visible:
  <https://pact-roojool-20261015.malaysiawest.cloudapp.azure.com> ·
  <https://github.com/Roojool/pact> *(repository shell exists; source publication pending reviewed push)*
- Note that the demo video is pending recording, and the participant walkthrough is not yet completed.
- End on the graph model line: *the graph does the work; there is no fallback.*

## Optional B-roll (only if you have spare time)

- Toggle an approval in the matrix, re-check, and show the verdict change.
- Set a commitment to **Unknown duration**, re-check, and show
  `needs_information`.
- Show `queries/mutations.cypher` with the `w.revision` guard highlighted.

## Do not do

- Do not imply live mode is running when using the deterministic fallback, or vice
  versa. Clearly state which mode is being demonstrated.
- Do not claim external campaign delivery, signed cryptographic receipts, or
  benchmark latency. Approval records an internal reservation and owner task checklist
  in the graph only.
- Do not claim the participant walkthrough is complete — it is **not yet completed**.
- Do not invent a demo-video URL or pretend source code is published when publication
  is pending reviewed push.
- Do not show `.env` files, keys or private operations files on screen.
- Do not exceed three minutes; the judge's attention is the budget.

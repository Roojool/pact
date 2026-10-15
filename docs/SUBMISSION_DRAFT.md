# PACT — submission draft

> Verify every field against the finished build before filing. The live app link
> is real, the public repository shell exists (with source publication pending reviewed push),
> and the demo video is marked **pending** — do not replace a pending field with a fabricated URL.

## Project title

**PACT — Check the promise before you make it**

## Track(s) entered — all three

1. **Agents That Act on Connected Data**
2. **Agent Memory and Coordination**
3. **Company Brain**

(WeMakeDevs × FalkorDB *Graph Hacks: Context for AI Agents*. You must name every
track you are entering when you submit.)

## Description

An influencer agency can have three available creators and still promise more
work than its production team can deliver. PACT connects campaign commitments,
creators, editing capacity, brand approvals, source documents and decision owners
in FalkorDB. It checks whether those promises can be kept **together**, explains
the conflicting dependency with graph-grounded evidence, and proposes a checked
repair.

In the fictional Morrow Studio scenario, every pair of campaigns fits the editor's
capacity, but all three do not: 12 editor-hours are due against 8 Day-1
editor-hours. PACT identifies an allowed deadline change (move the Comet launch
film to Day 2), shows that using the backup editor Sam for Comet is blocked by a
recorded approval fact, and — on human approval — records an **internal
reservation** and owner tasks (not real publishing or delivery). A fresh session
can recover the decision and its sources from the graph. When a brand approval
changes, the next check can reconsider a previously rejected option.

Why the graph does the work: eligibility, capacity, conflicts, proposals,
decisions, reservations and memory are all discovered by traversal. There is no
in-memory business-state fallback; if FalkorDB is removed, PACT cannot answer
anything.

- Graph model and exact Cypher (read-only vs mutation):
  [`queries/`](../queries/).
- Setup, environment variables and verification evidence: [`README.md`](../README.md).
- AI assistance disclosure and participant walkthrough:
  [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md).

All agency data is synthetic. Feasibility is checked under an explicit two-day,
one-hour, single-editor planning model with bounded inputs; unknown durations and
unknown eligibility are reported as unknown rather than guessed, and an exhausted
bounded search reports `search_limit`. This is a planning aid, not a guarantee of
real-world delivery.

## Rules compliance checklist

From the official rules (<https://www.wemakedevs.org/hackathons/falkordb/rules>):

| Requirement | Status |
| --- | --- |
| FalkorDB is the primary graph database and central to the product | ✅ graph holds all state; no fallback |
| Data is public/synthetic/own | ✅ entirely synthetic fixture |
| Track(s) named | ✅ all three above |
| Public source-code repository | ⏳ **pending push** — <https://github.com/Roojool/pact> (repository shell exists; reviewed source publication pending) |
| README with setup instructions and graph data model | ✅ [`README.md`](../README.md) |
| Cypher queries / graph algorithms the product depends on | ✅ [`queries/`](../queries/) |
| Demo video showing the working project | ⏳ **pending recording** (script: [`docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md)) |
| Live deployment, or complete local setup instructions | ✅ live HTTPS deployment <https://pact-roojool-20261015.malaysiawest.cloudapp.azure.com>; local + Docker setup also documented |
| AI coding-assistant use disclosed | ✅ [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) |
| Participant understands and can explain the code | ⏳ participant to complete the walkthrough in `AI_ASSISTANCE.md` (not yet completed) |

## Important dates

- Hackathon window: **15 Oct 2026 00:01 IST → 18 Oct 2026 23:59 IST**
- Submissions close: **18 Oct 2026 23:59 IST**

## Fields to complete from actual artifacts

- **Repository:** <https://github.com/Roojool/pact> (repository shell exists; reviewed
  source publication is pending).
- **Demo video:** upload the recording of the working project (not a storyboard),
  following `docs/DEMO_SCRIPT.md`. *Pending recording.*
- **Live deployment:** <https://pact-roojool-20261015.malaysiawest.cloudapp.azure.com>
  (verified by independent HTTPS visual smoke run in deterministic mode). The
  complete local/Docker setup in `README.md` remains available as a fallback.
- **Live AI session:** ✅ **verified once** in an independent verification run — a real live
  production session (both agent roles `account_manager` → `producer` plus live graph memory)
  passed against the live URL on 2026-10-15 06:56 UTC. Analysis mode was live, both roles ran,
  one human approval recorded a decision, and live graph memory returned 6 sources. The
  conservative application budget ledger estimated $0.136371 used against the $5 cap with
  $0 reserved (this is an application ledger estimate, not an OpenAI billing measurement; the
  durable budget gate was independently verified before those calls). Not re-run in this docs pass.
  The deterministic path remains available as an instant zero-cost fallback for the demo.
- **Team:** Rujul Talekar, solo participant. Confirm the form's account details
  before submitting.

## Do not submit while…

- Required links remain unverified — the **demo video is still pending recording**, and **reviewed source publication is pending push**.
- A live AI result is claimed beyond the single verified session above, or the
  deterministic path is described as live.
- The AI-assistance disclosure is missing.
- The participant cannot explain the graph model, the queries, the architecture
  and the technical decisions. Complete the walkthrough and answer the questions
  in [`docs/AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) first.

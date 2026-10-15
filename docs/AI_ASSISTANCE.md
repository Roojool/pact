# AI assistance disclosure

This file is part of the submission. It discloses how AI coding assistants were
used, records what was actually verified, and gives the solo participant a
walkthrough and a question list to personally validate the work before submitting.

## Disclosure

**Participant:** Rujul Talekar (solo).

**AI coding assistants used during development:**

- **Codex** — orchestration, integration review, and cross-checking of worker
  output.
- **OpenCode and Antigravity** — implementation, UI, and documentation repair passes
  across models including GLM 5.3, DeepSeek Flash, and Gemini 3.8 Flash (High), with
  free fallback models used where appropriate.

AI-generated changes were reviewed and checked with the test suites listed below;
the participant is responsible for understanding and validating the result. The
participant must **not** claim to have manually authored AI-generated code.

### Meaningful participant contribution

The participant's own decisions and contributions:

- Selected the influencer-agency setting and the Morrow Studio scenario.
- Defined the budget and model-use constraints (a hard paid-call cap; no live
  calls without a key; deterministic fallback).
- Chose the visual direction and requested the guided/editable planning desk.
- Directed the honesty requirements: unknown eligibility/duration must be
  reported as unknown, blocked candidates must be shown as blocked, and approval
  must be an internal reservation rather than real publishing.
- Owns the final validation: reading the code, running the checks, and being able
  to explain the graph model, the queries, the architecture and the technical
  decisions.

Record any further design or debugging decisions in the commit history.

## Verified checks (executed, not claimed)

These checks were **executed before this documentation pass** on 15 Oct 2026 and
are **not re-run here** (this pass only edits docs). The unit and integration
suites ran against the local build, with FalkorDB reachable at `127.0.0.1:16379`;
the visual smoke journey and one live AI session ran against the **live HTTPS
deployment**. No paid model call was made by this documentation pass.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Root unit tests | `npm test` | 74 pass / 0 fail |
| Agent unit tests | `npx tsx --test tests/agents.test.ts` | 36 pass / 0 fail |
| Graph integration (real FalkorDB) | `npx tsx --test tests/graph.integration.ts` | 21 pass / 0 fail |
| Budget integration (real FalkorDB) | `npx tsx --test tests/budget.integration.ts` | 6 pass / 0 fail |
| Runtime budgeted-provider tests | `npx tsx --test agent-runtime/tests/budgeted-model.test.ts` | 8 pass / 0 fail |
| Runtime tenant-binding tests | `npx tsx --test agent-runtime/tests/handoff-binding.test.ts` | 7 pass / 0 fail |
| Visual smoke journey (live HTTPS deployment) | `node scripts/run_visual_inspection.js` | 16 screenshots / 7 grouped checks pass |

The graph suite closes its shared FalkorDB connection in teardown, so it exits
normally without `--test-force-exit`.

**Verified before this pass, not re-run here (executed in an independent verification run):**

- **Live AI verified in production.** One real live AI session (both agent roles —
  `account_manager` → `producer` — plus live graph memory) was driven end to end
  against the HTTPS deployment on 2026-10-15 06:56 UTC and passed. Analysis mode was
  live, both Account Manager and Campaign Producer executed, one human-approved
  decision was recorded, and live graph memory returned six sources. The conservative
  application budget ledger estimated **$0.136371** used against a **$5** cap with
  **$0** reserved (this is an application budget ledger estimate, not an OpenAI billing
  measurement). The durable budget gate was independently verified before those calls.
  A first attempt failed with a network `fetch failed` before any ledger existed; the
  second attempt passed. The Eve HTTP contract and the app's stream parser are
  additionally verified against a loopback fake server, and the budgeted-provider
  wrapper is unit-tested against a fake model.

**Still not verified (do not claim these):**

- The **demo video** is still pending recording.
- The **public source repository shell exists**, but **source publication is pending reviewed push**.
- The **participant walkthrough is not yet completed** (see below).
- The production `npm run build`, the HTTP integration suite, and the local
  Playwright inspection were not re-run in this docs pass (the HTTP suite needs a
  running app server). The live HTTPS smoke and the live AI session were executed
  in an independent verification run, not here.

## Deployment and cost considerations (no cash outlay)

- **Cash spent on this build: $0.** No accounts or credentials were purchased.
  One real live AI session was run against the configured provider (the conservative
  application budget ledger estimated $0.136371 used against the $5 cap with $0 reserved;
  this is an application ledger estimate, not an OpenAI billing measurement). The
  full stack is self-hosted on a single
  small Azure VM (`Standard_B2als_v2`, MalaysiaWest) funded by an **Azure for
  Students credit balance** — a credit grant, not cash — and the deterministic
  build also runs entirely locally with a Docker FalkorDB container plus
  `npm run dev`.
- **Deterministic mode is free.** PACT performs the full graph check, repair
  proposals, approvals, reservations and memory recall with no provider spend.
  The live deployment is normally exercised in this deterministic mode; it has
  also passed one real live AI session (both roles plus live memory) with conservative
  budget ledger estimated spend of $0.136371 against the $5 cap.
- **Live mode would cost money.** A live agent turn bills the configured provider
  (default pricing assumptions `$3`/M input and `$15`/M output tokens). The
  durable budget ledger caps total spend at `PACT_API_BUDGET_USD` (default `$5`)
  and fails closed, but it does not make calls free. A public live demo would
  therefore need either a small prepaid provider balance or to stay in
  deterministic mode.
- **Deployment.** The stack (FalkorDB + web + two Eve runtimes + Caddy) is
  deployed behind Caddy on ports 80/443, with the app, graph and runtimes on a
  private Docker network and the session cookie signed server-side. Any live
  model usage remains a paid dependency; the complete local/Docker setup
  instructions remain in the README.

## Participant walkthrough

> **Status: not yet completed.** The participant must work through this
> walkthrough and answer the questions below before submitting. Do not mark it
> done until that has actually happened.

Read the code and be able to explain each of these in your own words. Point at
the file and line that proves it.

1. **Trace one campaign** from its commitment and editing requirement to the
   approved editor. Which source establishes the editor's eligibility, and which
   establishes their availability? (`src/lib/domain.ts` eligibility index;
   `src/lib/fixtures.ts` approvals/editors/sources.)
2. **Explain the arithmetic.** Why do 4h and 8h fit but 12h not, given Alex's
   eight Day-1 hours? Why is checking total hours alone insufficient when windows
   differ? (`checkPlan` union `availableHours`, joint-conflict diagnosis.)
3. **Describe the matcher.** How does the bounded checker assign one editor per
   task and match its hour units to available slots? What are the model's
   assumptions, and how does it treat unknown data and an exhausted search?
   (`searchOnce`, `SEARCH_STEP_LIMIT`, `needs_information`, `search_limit`.)
4. **Show the concurrency guarantees.** Why can a proposal's old revision not be
   approved after another edit? What is the difference between saving a plan and
   delivering a campaign? (`assertRevision`, `proposal_stale`, `RESERVES` edges,
   "not delivery" task text.)
5. **Show graph memory and source revisions.** Start a fresh agent session,
   recover a decision from FalkorDB, and show how a changed approval source
   affects an old rejection. (`recallMemory`, `Memory-[:NEXT]->`, `sourceVersions`,
   `proposal_stale`.)

## Questions the participant must be able to answer

1. Where exactly does eligibility come from, and what happens when an editor has
   no approval record at all?
2. Why is `availableHours` a union of (editor, slot) pairs rather than the sum of
   each campaign's capacity?
3. What makes a snapshot consistent under concurrent writes, and what does the
   `createdAt` guard protect against?
4. Walk through an approval replay: what happens when the first response is lost
   and the workspace revision has already moved?
5. What is written to the graph when a repair is approved, and why is that not
   real publishing or delivery?
6. Where is the paid-call budget enforced, and why is there exactly one
   enforcement point per transport?
7. Which Cypher queries are read-only and which mutate? (See `queries/`.)
8. What is deliberately *not* verified, and why?

# AI assistance disclosure

This file is part of the submission. It discloses how AI coding assistants were
used, records what was actually verified, and gives the solo participant a
walkthrough and a question list to personally validate the work before submitting.

## Disclosure

**Participant:** Rujul Talekar (solo).

**AI coding assistants used during development:**

- **Codex** — orchestration, integration review, and cross-checking of worker
  output.
- **OpenCode and Gemini-based assistants** — implementation, UI and documentation
  passes across several models (for example GLM, DeepSeek and Gemini variants),
  with free fallback models used where appropriate.
- **Runtime OpenAI** — the optional live AI path in the shipped app calls OpenAI
  models through the budgeted provider proxy. That is product behaviour, not a
  development assistant.

The number of assistant/model requests made across the whole project is **not**
tracked here and is deliberately **not** stated. Earlier work included repeated
recording and validation attempts, so no "total call count" is claimed as verified.

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
the desktop/mobile deterministic journey and one live AI session ran against the
**live HTTPS deployment**. No paid model call was made by this documentation pass.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Root unit tests | `npm test` | 74 pass / 0 fail |
| Agent unit tests | `npx tsx --test tests/agents.test.ts` | 36 pass / 0 fail |
| Graph integration (real FalkorDB) | `npx tsx --test tests/graph.integration.ts` | 21 pass / 0 fail |
| Budget integration (real FalkorDB) | `npx tsx --test tests/budget.integration.ts` | 6 pass / 0 fail |
| Runtime budgeted-provider tests | `npx tsx --test agent-runtime/tests/budgeted-model.test.ts` | 8 pass / 0 fail |
| Runtime tenant-binding tests | `npx tsx --test agent-runtime/tests/handoff-binding.test.ts` | 7 pass / 0 fail |
| Desktop/mobile deterministic journey (earlier live release) | `node scripts/run_visual_inspection.js` | passed, zero paid calls |

The graph suite closes its shared FalkorDB connection in teardown, so it exits
normally without `--test-force-exit`.

**Dated evidence note:** the **current India production release** (commit `3985edf`,
2026-10-15) was independently reviewed live and passed the full deterministic
production journey with **0 provider calls** and the **$5 cap unchanged**. Earlier,
on the prior release (commit `6e04796`, 2026-10-15) the deterministic journey against
the live HTTPS deployment passed with **19 captures / 13 numbered groups** and **0
paid calls**.

**18 Oct 2026 UI/docs pass (executed):** restored the README, removed an abandoned
`/lab` basePath experiment (config, client fetch prefixes, font rewrites) and the
fork banner that linked the app to its own production domain, updated the release
documentation, and ran one clean typecheck (`npx tsc --noEmit`, exit 0). **No
provider call, no live-site test and no test-suite re-run happened in this pass.**
The participant walkthrough below remains **not completed**.

**Verified before this pass, not re-run here (executed in an independent verification run):**

- **Live AI verified in production.** One real live AI session (both agent roles —
  `account_manager` → `producer` — plus live graph memory) was driven end to end
  against the HTTPS deployment on 2026-10-15 06:56 UTC and passed. Analysis mode was
  live, both Account Manager and Campaign Producer executed, one human-approved
  decision was recorded, and live graph memory returned six sources. The conservative
  application budget ledger recorded that session as **$0.136371** of a **$5**
  application cap with **$0** reserved. That figure is a **historical
  application-ledger estimate, not an OpenAI billing measurement, current balance or
  cash-cost guarantee**; the durable budget gate was independently verified before
  those calls. A first attempt failed with a network `fetch failed` before any ledger
  existed; the second attempt passed. The Eve HTTP contract and the app's stream
  parser are additionally verified against a loopback fake server, and the
  budgeted-provider wrapper is unit-tested against a fake model.
- **No total live-request count is established.** The earlier demo-video worker
  launched recording attempts more than once, and the final captured attempt
  recording 1 analysis / 1 memory does **not** prove that only one live request was
  ever made. Do not state a project-wide call total.

**Publication and remaining verification:**

- The **video, captions, transcript, editable deck and PDF are published** in
  [release v1.0.0](https://github.com/Roojool/pact/releases/tag/v1.0.0). Actual browser
  playback and all final slides were reviewed; see [verification](./RELEASE_VERIFICATION.md).
- The **Golden Hour redesign is deployed** — it is the live UI on the verified India
  production release (Hyderabad / `indiasouthcentral`).
- The **participant walkthrough is not yet completed** (see below).
- The production `npm run build`, the HTTP integration suite, and the local
  Playwright inspection were not re-run in this docs pass (the HTTP suite needs a
  running app server). The live HTTPS deterministic journey and the live AI session
  were executed in an independent verification run, not here.

The **reviewed source is published** at <https://github.com/Roojool/pact>.

## Deployment and cost considerations (no cash outlay)

- **No accounts or credentials were purchased for this build.** The full stack is
  self-hosted on a single small Azure VM (`Standard_B2als_v2`, **India South Central
  / Hyderabad**, `indiasouthcentral`) funded by an **Azure for Students credit
  balance** — a credit grant, not cash. The deterministic build also runs entirely
  locally with a Docker FalkorDB container plus `npm run dev`.
- **The $5 cap is an application guard, not a bill.** One real live AI session was
  run against the configured provider. The conservative application budget ledger
  recorded that session as a $0.136371 cumulative estimate against the $5 cap with $0 reserved; the
  durable ledger now estimates $0.855696 used after later recording attempts. These
  are **historical application-ledger estimates, not OpenAI billing measurements, not
  current balances, and not guarantees of cash costs**. The project has **not** spent
  nothing historically. The Golden Hour UI release/capture made **0 provider calls**
  and the durable cap remained $5. The durable budget gate was independently verified
  before those calls.
- **Deterministic mode is free.** PACT performs the full graph check, repair
  proposals, approvals, reservations and memory recall with no provider spend.
  The live deployment is normally exercised in this deterministic mode.
- **Live mode would cost money.** A live agent turn bills the configured provider
  (default pricing assumptions `$3`/M input and `$15`/M output tokens). The
  durable budget ledger caps total spend at `PACT_API_BUDGET_USD` (default `$5`)
  and fails closed, but it does not make calls free and it is not a provider
  guarantee. A public live demo would therefore need either a small prepaid
  provider balance or to stay in deterministic mode.
- **Deployment.** The stack (FalkorDB + web + two Eve runtimes + Caddy) is
  deployed behind Caddy on ports 80/443, with the app, graph and runtimes on a
  private Docker network and the session cookie signed server-side. The live URL is
  the verified Golden Hour production release
  (<https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>), served from a
  permitted Azure for Students region in Hyderabad; redeploying that same domain
  with the AI business-setup release is **planned and not yet verified**. Any live
  model usage remains a
  paid dependency; the complete local/Docker setup instructions remain in the README.

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

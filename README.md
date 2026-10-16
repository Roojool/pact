# PACT Lab — AI business setup fork

This separate version adds **describe your business → review an editable setup →
create a real company workspace → check/repair/approve**. The original app and its
deployment remain unchanged. Start with [Business setup](docs/BUSINESS_SETUP.md)
for the feature, local run instructions, demo sequence and verification limits.

Manual setup and a clearly labelled example work without paid AI. Live extraction
requires a configured provider key and the existing shared budget store; its
contract is tested with injected responses, not a fresh paid model run.

**The documentation below describes the original PACT baseline. Its live URLs,
published media and historical live-AI evidence belong to that original app, not
this fork.**

---

# PACT — Check the promise before you make it

PACT is an influencer-agency planning desk that checks whether the work an agency
has **promised** can actually be delivered by its production team, explains the
conflict with graph-grounded evidence, proposes a checked repair, and records a
human-approved internal plan in [FalkorDB](https://falkordb.com).

An agency can have three available creators and still promise more editing work
than its team can deliver. PACT connects campaigns, creators, editing capacity,
brand approvals, source documents and decision owners in a graph, then answers:
*do these promises fit together, and if not, what is the smallest change that
makes them fit?*

> **Submission status:** the app is **live over HTTPS** at the verified India
> (Hyderabad, `indiasouthcentral`) production release linked below, with the
> **Golden Hour visual redesign deployed and independently reviewed**, and the
> **reviewed source is published in the public repository**. A **real live AI
> session has been verified** against an earlier deployment (both agent roles plus
> live graph memory, executed in an independent verification run; see
> [Verification evidence](#verification-evidence)). The **demo video and pitch deck
> are published** in the GitHub release below, and
> the **participant walkthrough is not yet completed**. See [Live links](#live-links)
> and [Publication status](#publication-status). Nothing here fabricates a link, a
> live-model result, or a test result that was not actually executed.

---

## Live links

- **Live app (HTTPS):** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>
  — the production app, with a sunset dashboard and an interactive work-flow graph,
  served from a permitted **Azure for Students** region in **Hyderabad, India South
  Central (`indiasouthcentral`)**. Independently reviewed live with **0 provider
  calls** for the capture; the **$5 application budget cap is unchanged**.
- **Demo watchpage (HTTPS):** <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo>
  — verified self-hosted player with video and captions
  (`/media/PACT_demo.mp4`, `/media/PACT_demo.vtt`). The recording and deck show the
  earlier interface; the live app now opens on Dashboard.
- **Public source repository:** <https://github.com/Roojool/pact> — source, setup, graph queries and tests are published.
- **Demo video & pitch deck:** **published** in release
  [`v1.0.0`](https://github.com/Roojool/pact/releases/tag/v1.0.0); downloadable asset
  URLs are listed under [Publication status](#publication-status), and the recording
  plan is in [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md).

The desktop/mobile deterministic journey passed on the **current India production
release** (independent review, deterministic mode, zero paid calls); the dated
capture and check counts are in [Verification evidence](#verification-evidence). An
independent verification run also drove a real **live** AI session against an
**earlier** deployment (both agent roles plus live graph memory) and verified the
live path. This documentation pass did not re-run either check.

---

## Table of contents

- [Live links](#live-links)
- [The use case](#the-use-case)
- [Honest product status](#honest-product-status)
- [Visual design (Golden Hour editorial)](#visual-design-golden-hour-editorial)
- [Hackathon tracks](#hackathon-tracks)
- [How it works](#how-it-works)
- [Graph model](#graph-model)
- [Cypher queries and algorithm](#cypher-queries-and-algorithm)
- [The bounded planning model](#the-bounded-planning-model)
- [Approvals: internal reservations, not publishing](#approvals-internal-reservations-not-publishing)
- [Memory, source revisions and stale/idempotent approvals](#memory-source-revisions-and-staleidempotent-approvals)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Agent roles (Eve)](#agent-roles-eve)
- [Paid-call budget guard](#paid-call-budget-guard)
- [Verification evidence](#verification-evidence)
- [Synthetic data disclosure](#synthetic-data-disclosure)
- [AI assistance](#ai-assistance)
- [Publication status](#publication-status)
- [Repository layout](#repository-layout)
- [License](#license)

---

## The use case

Fictional **Morrow Studio** has six creators and three campaigns, each with a
creator who needs a four-hour edit finished before the end of Day 1:

| Campaign | Brand | Creator | Edit needed | Window |
| --- | --- | --- | --- | --- |
| Aurora Skincare Launch | Aurora | Mia Fabel | 4h | Day 1 (fixed) |
| Beacon Fitness Challenge | Beacon Active | Ode Ilerioluwa | 4h | Day 1 (fixed) |
| Comet Coffee Launch Film | Comet Roasters | Tamar Qureshi | 4h | Day 1, may flex to Day 2 |

Two editors exist. **Alex** has all 16 one-hour slots across Day 1 and Day 2 and
is approved for every campaign. **Sam** has four Day 1 slots but is explicitly
**not approved** for Comet (and has no approval record at all for Aurora/Beacon).

Every *pair* of campaigns fits Alex's Day 1 capacity. **All three do not**: that
is 12 editor-hours due against 8 Day-1 editor-hours available. This is a *joint*
capacity conflict, not one broken promise. PACT says so, explains it with the
approval and calendar facts that prove it, and proposes the repair the brief
allows — move Comet to Day 2 — while showing that using Sam for Comet is
**blocked by a recorded approval fact**. The user then approves the repair; PACT
persists an internal reservation, owner tasks and an internal decision record.

## Honest product status

**Working and verified:**

- Deterministic, bounded feasibility checker over the graph-derived workspace
  (`checkPlan`), with explainable evidence paths.
- Deterministic repair proposals (`proposeRepairs`): deadline moves allowed by
  the brief, explicitly blocked backup-editor candidates, and
  "needs information" proposals for unknown durations.
- FalkorDB persistence with traversal-only snapshot recovery, optimistic
  concurrency (409 `stale_revision`), idempotent approvals, version-checked
  approvals, reservation/double-booking guards, and durable graph memory.
- A Next.js UI that consumes the API contract. The **Golden Hour editorial**
  direction described in [Visual design](#visual-design-golden-hour-editorial) is
  **deployed** on the live India production release.
- Two-role agent integration and a durable, atomic, global paid-call budget
  ledger. Agent **unit** tests use a fake provider and never touch the network.
- A **live AI path that has been exercised end-to-end** against an earlier HTTPS
  deployment — both agent roles (`account_manager` → `producer`) and live graph
  memory — with conservative budget ledger estimated spend inside the $5
  application cap. Executed in an independent verification run before this pass;
  see [Verification evidence](#verification-evidence).

**Scope and remaining human checks:**

- The **demo video and pitch deck are published**. The **live
  deployment and published source** are available (see [Live links](#live-links)).
- The **participant walkthrough is not yet completed** (see [`docs/AI_ASSISTANCE.md`](./docs/AI_ASSISTANCE.md)).
- The live AI verification above is **not re-run in this documentation pass**:
  it was a single real production session driven in an independent verification run,
  and actual provider billing is not measured. That session's conservative
  application-ledger cumulative estimate was **$0.136371**; the durable ledger now reads an
  estimated **$0.855696** used against the **$5** application cap with **$0**
  reserved (the later increase reflects subsequent recording attempts, not this
  documentation pass). Both figures are historical application-ledger estimates, not
  provider bills, not a current balance, and not guarantees of cash costs (the
  durable budget gate was independently verified before those calls). **No claim is
  made that the project spent nothing historically.** The Golden Hour UI
  release/capture itself made **0 provider calls** and left the **$5 cap unchanged**.
  The Eve HTTP *contract* (health, session create, followed stream, cancel, reset) and
  the app's stream parser are additionally verified against a loopback fake server,
  and the budgeted-provider wrapper is unit-tested against a fake model.
- The UI was verified in an independent review run with headless Chrome/Chromium
  (`node scripts/run_visual_inspection.js`) against the **live HTTPS deployment** as
  a desktop/mobile **deterministic journey** with zero paid calls (screenshots land
  under `output/playwright/`, git-ignored). This documentation pass did not re-run
  it; the dated capture/check counts are in
  [Verification evidence](#verification-evidence).
- No external campaign delivery, social posting, signed cryptographic receipts, or
  benchmark latencies are claimed. Approvals represent internal reservations in the
  graph only.

## Visual design (Golden Hour editorial)

The interface uses a **Golden Hour editorial** direction: softly blurred sunset,
sunflower and forest colours behind calm cream surfaces, with Anton display type,
Instrument Serif, Inter and JetBrains Mono. It is adapted from design references the participant
supplied and explicitly permitted, and it is a **presentation-layer change only**:
it does not alter any check, evidence path, proposal or approval behaviour.

The plan is organised into six plain-language views, using their actual on-screen
labels:

- **Dashboard** — an interactive dot-and-line view of the actual jobs, shared editing
  capacity and checked bottleneck, with job editing and brief links. Unchecked,
  unknown, feasible and booked states stay distinct; editing clears the check.
- **Your work** — work-by-work editing, team hours and client approvals.
- **Needs attention** — the conflict and its graph-grounded evidence.
- **Plan options** — checked repairs, including blocked candidates.
- **Saved plan** — approved internal reservations and owner tasks.
- **Ask PACT** — graph-grounded studio memory recall.

Setup, the Cypher queries and the graph model stay discoverable in this README and
in [`queries/`](./queries/). The redesign has **not** been through a user study:
there is no usability result and no "zero learning curve" claim. The Golden Hour
design is now the **deployed** live UI on the India production release.

## Hackathon tracks

This project is entered in **all three** tracks of *Graph Hacks: Context for AI
Agents* (WeMakeDevs × FalkorDB):

1. **Agents That Act on Connected Data** — the two agent roles consume a
   graph-derived structured context and act on it (an Account Manager assessment
   handed to a Campaign Producer); every citation is filtered against source IDs
   that actually exist in the graph.
2. **Agent Memory and Coordination** — a durable handoff memory in FalkorDB
   (`pact_agent` graph), a durable workspace memory chain
   (`Memory -[:NEXT]-> Memory`), and a two-role handoff where each role is its
   own runtime session.
3. **Company Brain** — the agency's campaigns, commitments, capacity, approvals,
   events, sources, decisions and owner tasks live in one queryable graph, and
   the feasibility answer is derived by traversal rather than a denormalized
   table.

Official rules: <https://www.wemakedevs.org/hackathons/falkordb/rules>.
Hackathon window: **15 Oct 2026 00:01 IST → 18 Oct 2026 23:59 IST** (submissions
close at the end of the window).

## How it works

1. A visitor opens the app and gets an isolated anonymous workspace (an opaque
   server-generated id in an HMAC-signed cookie; the client never supplies it).
   The workspace is seeded into its **own** FalkorDB graph as the synthetic
   Morrow Studio fixture.
2. **Check this plan** calls `analyzeWorkspace`, which reads a consistent
   snapshot, runs the pure bounded checker and repair proposer, and atomically
   persists the check activity and proposals (bumping the revision).
3. The UI shows the verdict, the conflict evidence (real graph paths and source
   documents), and the candidate repairs. Feasible repairs can be **approved**;
   blocked/rejected candidates are shown as rejected, with the approval fact
   that blocks them.
4. **Approve** calls `approveProposal`: it re-checks feasibility at the current
   state, verifies source versions, guards against double-booking reserved
   slots, and atomically writes the decision, allocations, reservation edges and
   owner tasks — all in one guarded query.
5. **Studio memory** (`recallMemory`) answers questions from the graph and
   appends the note to a durable memory chain. Memory writes never bump the
   workspace revision, so asking a question never stales the UI.
6. Optionally, a user-controlled **AI-assisted check** runs the two agent roles
   (Account Manager → Producer) through the Eve runtime, gated by the paid-call
   budget. With no key/runtime/budget it falls back to a clearly labeled
   deterministic result.

## Graph model

One graph per workspace: `pact-ws-<opaque id>`. Nodes carry facts; relationships
carry the structure. Snapshots are rebuilt **only** through traversals — there
are no denormalized foreign keys on nodes. Full diagram and the exact Cypher are
in [`queries/`](./queries/):

- [`queries/README.md`](./queries/README.md) — graph model + concurrency model
- [`queries/reads.cypher`](./queries/reads.cypher) — read-only traversals
- [`queries/mutations.cypher`](./queries/mutations.cypher) — guarded writes

Key nodes: `Workspace`, `Creator`, `Person`, `Source`, `Campaign`, `Commitment`,
`Editor`, `Approval`, `Event`, `Proposal`, `Decision`, `Allocation`, `OwnerTask`,
`Activity`, `Memory`. Key relationships include
`Campaign-[:FOR_CREATOR]->Creator`, `Approval-[:ABOUT_CAMPAIGN]->Campaign`,
`Approval-[:FOR_EDITOR]->Editor`, `Commitment-[:FOR_CAMPAIGN]->Campaign`,
`Decision-[:RESERVES {slots}]->Editor`, `Decision-[:CREATES_TASK]->OwnerTask`,
and `Memory-[:NEXT]->Memory`. The agent handoff memory lives in a separate
`pact_agent` graph as `PactHandoff` nodes.

## Cypher queries and algorithm

The product depends on the graph for **all** of its state; remove FalkorDB and
PACT cannot answer anything (there is no in-memory business-state fallback — DB
down ⇒ `503 graph_unavailable`). Representative queries, taken verbatim from the
code:

**Read-only** (`graph.roQuery`, see `queries/reads.cypher`):

- Snapshot loaders, e.g.
  `MATCH (w:Workspace {key:$wk})-[:HAS_CAMPAIGN]->(c:Campaign)-[:FOR_CREATOR]->(cr:Creator), (c)-[:OWNED_BY]->(p:Person), (c)-[:FROM_SOURCE]->(s:Source) ...`
- Memory recall: `MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory) ... ORDER BY seq DESC LIMIT 5`
- Reservation guard:
  `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[r:RESERVES]->(e:Editor) WHERE e.key IN $editorIds ...`
- Idempotent replay lookup:
  `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision {idempotencyKey:$ik}) RETURN d.key AS id`

**Mutations** (`graph.query`, see `queries/mutations.cypher`) — each is a single
atomic guarded statement that also bumps `w.revision`, e.g.:

```cypher
MATCH (w:Workspace {key:$wk}) WHERE w.revision = $rev AND w.createdAt = $createdAt
SET w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (act:Activity {key:'act-' + toString(seq), role:'system', text:$actText, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
...
```

The **algorithm** (`src/lib/domain.ts`) is a pure, deterministic function over a
workspace snapshot:

- **Eligibility** comes from approval facts. Only `approved = true` makes an
  editor a candidate; an `approved = false` record is an explicit block; a
  **missing** record is *unknown* and the editor is never scheduled.
- **One editor per commitment** ("same editor per task"); work is divisible into
  whole one-hour slots; editing may only happen inside the commitment's window
  `releaseDay ≤ day(slot) ≤ deadlineDay`, where deadline moves are capped by
  `flexUntilDay`.
- Commitments are ordered **most-constrained-first** (earliest deadline, then
  longest, then stable by id) and placed with a **bounded depth-first search
  with backtracking** (`SEARCH_STEP_LIMIT = 50_000`).
- `availableHours` is the size of the **union** of eligible (editor, slot) pairs
  across the selected commitments' windows — it never double-counts an
  editor-hour two campaigns could both draw on.
- Infeasibility is diagnosed honestly: a **joint conflict** (every subset fits,
  the whole set does not), a single blocker, a pinned-editor failure, or a
  calendar conflict are reported distinctly.
- **Unknown durations** (`hours = null`) produce `needs_information`; the
  checker never guesses. Exhausting the search bound produces `search_limit`
  instead of guessing.

## The bounded planning model

The model is deliberately small and explicit (all of it is stated to the user in
the UI and to the agents):

- **Two-day horizon.** Slots `0..7` are Day 1 09:00–17:00; `8..15` are Day 2
  09:00–17:00. Agency events use integer hours `0..48` from the start of Day 1
  (end-exclusive).
- **One-hour granularity.** Edits are whole one-hour slots; a commitment is
  completed by a single editor.
- **Bounded inputs.** At most 6 commitments per workspace and 1–8 hours per
  commitment; larger inputs are rejected with `invalid_request`.
- **Unknowns stay unknown.** A commitment with no stated duration yields
  `needs_information`; an editor with no approval record is treated as unknown
  eligibility and is reported as an assumption, never scheduled.
- **Search limit.** If the bounded matcher cannot decide within 50,000 steps it
  reports `search_limit` rather than guessing feasibility.
- **Event conflicts.** The same creator cannot attend two overlapping events
  (end-exclusive), and this blocks the plan before matching.

This is a planning aid, **not** a guarantee of real-world delivery.

## Approvals: internal reservations, not publishing

Approving a repair does **not** publish, deliver or message anyone. It records an
**internal reservation** of editing time and an **owner task** checklist:

> *"Internal reservation: hold 4h with Alex Rivera for Comet Coffee Launch Film
> (slots 8,9,10,11). This reserves editing time; it is not delivery."*

The approval writes `Decision-[:RESERVES {slots}]->Editor` edges, so a later
approval that would double-book a reserved slot is rejected with `slot_conflict`
(409). The UI labels this as a saved plan/receipt, and the agent prompts
explicitly forbid claiming real publishing, delivery or client messaging.

## Memory, source revisions and stale/idempotent approvals

- **Persistent graph memory.** Every recall appends a `Memory` node chained with
  `-[:NEXT]->`, durable across restarts (verified through an independent fresh
  connection). Memory survives edits and is **revision-safe**: it bumps only
  `activitySeq`/`memorySeq`, so read-only memory traffic never stales a UI
  holding the current revision. Agent handoffs are likewise persisted as
  `PactHandoff` nodes in the `pact_agent` graph.
- **Source revisions.** Each `Source` (brief, policy, calendar, handoff) carries
  a `revision`. A `Proposal` snapshots the revision of every source it was
  computed from (`sourceVersions`).
- **Stale approvals.** If any of those sources changed after the proposal was
  computed, approval is rejected with `proposal_stale` (409). If the workspace
  revision moved (someone else edited), approval is rejected with
  `stale_revision` (409). Already-approved/rejected proposals get
  `proposal_state` (409); a proposal that no longer yields a feasible plan gets
  `proposal_infeasible` (409).
- **Idempotent approvals.** Approval is keyed by a client `idempotencyKey`. A
  replay is looked up **before** any revision check, so if the first response was
  lost and the revision moved on, retrying returns the **same** stored decision
  with no side effects. A concurrent same-key race is also collapsed to one
  decision.

## Setup

### Prerequisites

- Node.js 24.x and npm
- Docker (for FalkorDB; Docker is not required if you already have a FalkorDB
  server)

### Local development

```powershell
# 1. Install app dependencies
npm install

# 2. Start FalkorDB locally (pinned image, same one used by compose.yaml).
#    Maps the container's 6379 to 127.0.0.1:16379, the default FALKORDB_URL.
docker run -d --name pact-graph `
  -p 127.0.0.1:16379:6379 `
  falkordb/falkordb@sha256:107455e862a824e45e8e9f5a7fbfdf5e00a08b14e13eae2577c72fd9e3f59ba6

# 3. Create .env.local from .env.example and fill in the placeholders
#    (at minimum SESSION_SECRET and FALKORDB_URL; see Environment variables).
Copy-Item .env.example .env.local

# 4. Run the app
npm run dev        # http://127.0.0.1:3000
```

The deterministic "rules check" works with **no** API key. The optional
"AI-assisted check" additionally needs `OPENAI_API_KEY`, a
`PACT_RUNTIME_TOKEN`, and the two Eve runtimes running (see
[Agent roles](#agent-roles-eve)).

### Tests

```powershell
npm run typecheck                     # tsc --noEmit
npm test                              # root unit tests (deterministic + agent + http)
npm run test:integration              # graph + budget + http integration (needs FalkorDB)
node scripts/run_visual_inspection.js # deterministic desktop/mobile journey (zero paid calls)
```

`npm run test:integration` runs `tsx --env-file-if-exists=.env.local --test
tests/*.integration.ts`. The graph and budget suites need only a reachable
FalkorDB. The HTTP suite needs a running app server at `PACT_BASE_URL`
(default `http://127.0.0.1:3000`). The graph suite closes its shared FalkorDB
connection during teardown and exits normally.

`node scripts/run_visual_inspection.js` runs a portable **deterministic
desktop/mobile journey** using `playwright-core` (auto-detects installed Google
Chrome or Microsoft Edge, or can be overridden with `PACT_BROWSER_PATH`). It
captures screenshots under `output/playwright/` while validating grouped checks —
initial 12h/8h capacity conflict, mobile layout, feasible repair proposal approval,
studio memory grounded retrieval, Sam approval yielding feasible original Day 1
deadlines, unknown duration handling, keyboard Escape dismissal of the Source
drawer, and real HTTP 409 optimistic locking. It makes **zero paid model calls**.
The dated counts from the production review are recorded in
[Verification evidence](#verification-evidence).

### Docker (full stack)

`compose.yaml` brings up the graph, both agent runtimes, the web app, and a
Caddy reverse proxy:

```powershell
# Provide the interpolation values via a root .env (or your shell):
#   PACT_RUNTIME_TOKEN=<shared-secret>
#   OPENAI_API_KEY=<optional>
#   PACT_DOMAIN=<host>
docker compose up --build
```

- `graph` — FalkorDB, persisted to the `graph-data` volume (AOF enabled),
  internal port 6379.
- `agent-account-manager` / `agent-producer` — the two Eve runtimes (built from
  `./agent-runtime`), internal ports 3010/3011, durable workflow volumes.
- `web` — the Next.js standalone app, internal port 3000, talking to
  `redis://graph:6379` and the runtimes over the shared token.
- `proxy` — Caddy on ports 80/443, the only public gateway, proxying to
  `web:3000`.

The stack is configured entirely from the root environment (a root `.env` or an
explicit `--env-file`); `compose.yaml` does not mount `.env.local` into the
containers. Caddy terminates TLS for the host named by `PACT_DOMAIN` (default
`localhost`, which uses a local certificate) and redirects plain HTTP to HTTPS.
Any resolvable hostname works — for an Azure VM the built-in
`<vm-name>.<region>.cloudapp.azure.com` DNS name is enough, so **no domain
purchase is required** to get HTTPS.

## Environment variables

All values below are **names with placeholders only**; never commit real secrets.
`.env*` files are git-ignored except `.env.example`.

| Variable | Used by | Default / placeholder | Purpose |
| --- | --- | --- | --- |
| `SESSION_SECRET` | web | `<32+ byte random string>` | HMAC-signs the anonymous workspace cookie |
| `FALKORDB_URL` | web + runtimes | `redis://127.0.0.1:16379` | FalkorDB connection |
| `OPENAI_API_KEY` | runtimes + direct transport | `<blank>` | Live model calls (blank ⇒ deterministic) |
| `OPENAI_MODEL` | web + runtimes | `gpt-6.1-sol` | Model id |
| `PACT_AGENT_TRANSPORT` | web | `eve` (`direct` for the Responses fallback) | Agent transport |
| `PACT_RUNTIME_TOKEN` | web + runtimes | `<shared secret>` | App↔runtime bearer auth (fail-closed if unset) |
| `AGENT_RUNTIME_URL` | web | `http://127.0.0.1:3010` | Account Manager runtime |
| `AGENT_PRODUCER_URL` | web | `http://127.0.0.1:3011` | Producer runtime |
| `PACT_API_BUDGET_USD` | web + runtimes | `5` | Global paid-call cap |
| `PACT_BUDGET_GRAPH` | web + runtimes | `pact_budget` | Budget key namespace |
| `PACT_AGENT_GRAPH` | runtimes | `pact_agent` | Handoff-memory graph |
| `PACT_AGENT_MAX_CONTEXT_BYTES` | web | `24000` | Context byte ceiling |
| `PACT_AGENT_MAX_OUTPUT_TOKENS` | web + runtimes | `1200` | Per-call output cap |
| `PACT_AGENT_MAX_MODEL_STEPS` | runtime | `4` | Model steps per session |
| `PACT_AGENT_MAX_STREAM_BYTES` | web | `8388608` | Eve stream byte cap |
| `PACT_MODEL_INPUT_USD_PER_MTOK` / `PACT_MODEL_OUTPUT_USD_PER_MTOK` | web + runtimes | `3` / `15` | Pricing used for reservations |
| `PACT_AGENT_TIMEOUT_MS` | web | `60000` | Agent call deadline |
| `PACT_DOMAIN` | compose/Caddy | `localhost` | Public hostname for the proxy |
| `PACT_MEDIA_DIR` | compose/Caddy | `./media` | Read-only directory for the published video, captions and deck assets |
| `PACT_BASE_URL` | HTTP test / visual inspection | `http://127.0.0.1:3000` | App under test |
| `PACT_BROWSER_PATH` | visual inspection | `<optional browser path>` | Optional browser executable override |
| `PACT_MCP_WORKSPACE_ID` | MCP adapter | `<workspace id>` | Fixed tenant for the read-only MCP tools |

## Agent roles (Eve)

The optional live path uses two **separate** Eve runtime members (each role is
its own session/server — a real two-role handoff, not one call pretending to be
two):

| Role | Directory | Default port | Narrow tools |
| --- | --- | --- | --- |
| Account Manager (`account_manager`) | `agent-runtime/agents/account-manager` | 3010 | `record_handoff`, `validate_citations` |
| Campaign Producer (`producer`) | `agent-runtime/agents/producer` | 3011 | `read_handoffs`, `validate_citations` |

Configuration (from `agent-runtime/agents/*/agent/agent.ts`):

- **Direct OpenAI provider** (`eve/models/openai`, no AI Gateway), model id from
  `OPENAI_MODEL` (default `gpt-6.1-sol`), `reasoning: "low"`.
- The model is wrapped in the PACT **budgeted provider proxy**
  (`./lib/budgeted-model`), which enforces the durable budget gate before each
  actual provider request, forces a real per-call output cap, and bounds model
  steps per session.
- `defaultTools: false` — no shell, file, browser, web or self-cloning tools;
  `subagents.total = 0`. The handoff tools run **fixed, parameterized Cypher**;
  the model cannot supply a query, and there is no raw-Cypher tool.
- Channel auth is `runtimeTokenAuth()` (shared secret `PACT_RUNTIME_TOKEN`,
  constant-time SHA-256 comparison, fail-closed when unset) + `localDev()`.
- `limits` are soft framework limits checked after provider-reported usage; the
  **durable** guard is the in-runtime budget gate.

Launch (development), one process per role:

```powershell
cd agent-runtime
npm install
npx eve dev --agent account-manager --port 3010 --no-ui --no-default-extensions
npx eve dev --agent producer        --port 3011 --no-ui --no-default-extensions
```

`--no-default-extensions` is required so Eve does not mount a self-modification
extension. Production (self-host) builds and starts **each member from its own
directory**:

```powershell
cd agent-runtime/agents/producer
npx eve build --skip-sandbox-prewarm
npx eve start --host 0.0.0.0 --port 3011
```

`agent-runtime/Dockerfile` packages both members; run one role per container via
`PACT_AGENT_ROLE` / `PACT_AGENT_PORT`.

> **Runtime contract verified and live turn exercised:** the runtimes were booted
> and inspected (`GET /eve/v1/info` reports the direct OpenAI model, the narrow
> tools and zero subagents) and the Docker image was built. A real live session
> (both roles plus live graph memory) has since been driven end to end against the
> HTTPS deployment in an independent verification run (see
> [Verification evidence](#verification-evidence)); it is not re-run in this pass.
> The live path is implemented, contract-verified, and exercised once.

## Paid-call budget guard

Every billable call is gated by a **durable, atomic, global** ledger in FalkorDB
(`src/lib/budget.ts`; the runtime uses the byte-compatible `budget-gate.ts`):

- Every mutation is a single Redis **Lua script** on the FalkorDB connection, so
  independent instances can never oversubscribe; there is no TTL lock and no
  read-then-write window.
- The ledger is keyed globally (`pact_budget:<graph>:total|spent|reserved` and
  `...:res:<id>`), so a workspace reset cannot erase spend.
- **One enforcement point per transport.** `direct`: the app reserves for the
  exact request before dispatch and settles after. `eve`: the in-runtime gate is
  the single enforcement point (per model step) and the app only does a read-only
  pre-flight, so the shared ledger is not double-charged.
- **Fail closed.** Missing/zero usage after a dispatched request settles at the
  full conservative reservation; a failed settle leaves the reservation open; a
  missing ledger/`FALKORDB_URL` refuses the call. The input-token ceiling is one
  token per UTF-8 byte (a true upper bound), not `bytes/4`.
- Default cap `$5` (`PACT_API_BUDGET_USD`). The cap is an **application-level
  guard**: it is not a provider bill, not a guarantee of cash costs, and not a
  measured invoice. With `OPENAI_API_KEY` blank, no billable call is possible and
  the app returns a labeled deterministic result.

## Verification evidence

The results below were **executed before this documentation pass** (15 Oct 2026)
and are **not re-run here** — this pass only edits docs. The unit and integration
suites ran against the local build (FalkorDB reachable at `127.0.0.1:16379`); the
desktop/mobile deterministic journey and one live AI session ran against the
**live HTTPS deployment**. No paid model call was made by this documentation pass.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 (clean) |
| Production build | `npm run build` | exit 0 (Turbopack optimized) |
| Root unit tests | `npm test` | **74 pass / 0 fail** |
| Agent unit tests | `npx tsx --test tests/agents.test.ts` | **36 pass / 0 fail** |
| Graph integration (real FalkorDB) | `npx tsx --test tests/graph.integration.ts` | **21 pass / 0 fail** |
| Budget integration (real FalkorDB) | `npx tsx --test tests/budget.integration.ts` | **6 pass / 0 fail** |
| Runtime budgeted-provider tests | `npx tsx --test agent-runtime/tests/budgeted-model.test.ts` | **8 pass / 0 fail** |
| Runtime tenant-binding tests | `npx tsx --test agent-runtime/tests/handoff-binding.test.ts` | **7 pass / 0 fail** |
| Desktop/mobile deterministic journey (India production release) | `node scripts/run_visual_inspection.js` | **passed, zero paid calls** |

The root unit suite includes the six requirement tests in
`tests/requirements.test.ts` and the three HTTP contract tests in
`tests/http.test.ts`. Integration suites use isolated `pact-ws-wstest*` /
`pact_budget:*` namespaces and never touch other workspaces. The graph suite
closes its shared FalkorDB connection in teardown, so it exits normally without
`--test-force-exit`.

**Live deployment evidence (executed before this pass, not re-run here):** the
**current India production release** (commit `3985edf`, 2026-10-15) was independently
reviewed live: the full deterministic production
check/repair/human-approval/persisted-allocation/owner-task/grounded-recall journey
passed on desktop and mobile, with **0 provider calls**, **49 source graphs
preserved**, and the **$5 budget cap unchanged** (`$0.855696` historical ledger
estimate, `$0` reserved). Earlier, on the prior release (commit `6e04796`,
2026-10-15), an independent verification run passed the desktop/mobile deterministic
journey against HTTPS — **19 captures / 13 numbered groups, 0 paid calls** — alongside
checks that workspace isolation, the secure `HttpOnly` / `SameSite` session cookie,
cross-origin write rejection, and approval persistence after replacing the graph
container all hold. These live checks are **not** re-asserted by this documentation
pass; see [Live links](#live-links).

**Live AI evidence (executed before this pass, not re-run here):** an independent
verification run drove one real **live** AI session against the HTTPS deployment on
2026-10-15 06:56 UTC. It passed: both agent roles (`account_manager` → `producer`)
and live graph memory ran end to end; the analysis reported the 12h/8h joint conflict
with source citations, one human-approved decision was recorded, and memory recalled
six sources. The conservative application budget ledger recorded that session as a
**$0.136371** cumulative estimate against the **$5** application cap with **$0** reserved; the
durable ledger now reads an estimated **$0.855696** used with **$0** reserved (the
later increase reflects subsequent recording attempts; the Golden Hour UI
release/capture itself made **0 provider calls**). Both figures are historical
application-ledger estimates, **not** OpenAI billing measurements, current balances or
cash-cost guarantees (the durable budget gate was independently verified before those
calls). A first attempt failed with a network `fetch failed` before any ledger
existed; the second attempt passed. This documentation pass did not re-run the live
session, and the number of live requests made across the whole project is **not**
claimed.

**Reported by prior verification (not re-run here):** production build (`next build`),
typecheck (`tsc --noEmit`), and the unit and integration suites. The live agent
path is now **end-to-end verified once** (see the live AI evidence above) in
addition to being contract-verified against a loopback fake server and unit-tested
against a fake model.

**Final provenance correction (16 Oct 2026):** release `e8fbd44` follows approval
source relationships in rules-mode recall. Focused deployed checks confirmed
Comet citations `src-brief-c` / `src-policy`, editor citations including `src-cal`,
working policy links and unchanged plan revisions. The full UI journey above was
reviewed on the same Golden Hour interface at baseline `3985edf`.

## Synthetic data disclosure

All agency data is **fictional and synthetic** (Morrow Studio, its creators,
campaigns, editors, approvals, events and source documents). No real, personal,
private or login-protected data is loaded into the graph. The fixture lives in
`src/lib/fixtures.ts`.

## AI assistance

Development used AI coding assistants. In brief: **Codex** orchestrated and
cross-checked the work; **OpenCode and Gemini-based assistants** did development and
documentation passes; and the runtime's optional AI path calls **OpenAI** models
through the budgeted provider proxy. The full disclosure, the participant
walkthrough, and a questions-to-answer list are in
[`docs/AI_ASSISTANCE.md`](./docs/AI_ASSISTANCE.md). The participant must be
able to explain the graph model, the queries, the architecture and the technical
decisions, and should personally validate the code before submission.

## Publication status

| Artifact | Status |
| --- | --- |
| Live deployment (HTTPS) | ✅ **live** — <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com> (Golden Hour UI, commit `3985edf`, Hyderabad / `indiasouthcentral`; independently reviewed deterministic journey, **0 provider calls** for the capture, **$5 cap unchanged**; not re-run in this docs pass). |
| Demo watchpage (HTTPS) | ✅ **verified playback and captions** — <https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo> (self-hosted video + captions). |
| Public source repository | ✅ **published** — <https://github.com/Roojool/pact> (source, setup, graph model, Cypher and tests) |
| Demo video & pitch deck | ✅ **published and reviewed** — release `v1.0.0` assets: [PACT_demo.mp4](https://github.com/Roojool/pact/releases/download/v1.0.0/PACT_demo.mp4), [PACT_pitch_final.pptx](https://github.com/Roojool/pact/releases/download/v1.0.0/PACT_pitch_final.pptx), [PACT_pitch_final.pdf](https://github.com/Roojool/pact/releases/download/v1.0.0/PACT_pitch_final.pdf), [PACT_demo.srt](https://github.com/Roojool/pact/releases/download/v1.0.0/PACT_demo.srt), [PACT_demo.vtt](https://github.com/Roojool/pact/releases/download/v1.0.0/PACT_demo.vtt), [PACT_demo_narration.md](https://github.com/Roojool/pact/releases/download/v1.0.0/PACT_demo_narration.md). |
| Live AI session | ✅ **verified once (earlier deployment)** — real live production session (both roles + live memory) executed in an independent verification run; ledger estimate at that checkpoint $0.136371, durable ledger now estimates $0.855696 of the $5 cap ($0 reserved) after later recording attempts; not a provider bill; not re-run in this docs pass |
| Participant walkthrough | ⏳ **not yet completed** — see [`docs/AI_ASSISTANCE.md`](./docs/AI_ASSISTANCE.md) |

The app, watchpage and six release assets are public. The 159.83-second H264/AAC
video passed actual browser playback, all 43 caption cues loaded, byte-range
streaming worked, and the media page was checked at desktop and 390px mobile widths.
See [final release verification](docs/RELEASE_VERIFICATION.md).
Complete local and Docker setup instructions are provided above.

Submission draft: [`docs/SUBMISSION_DRAFT.md`](./docs/SUBMISSION_DRAFT.md).

## Repository layout

```
pact/
├─ README.md                 ← this file
├─ compose.yaml              ← full Docker stack (graph + runtimes + web + proxy)
├─ Dockerfile                ← web app (Next.js standalone)
├─ Caddyfile                 ← reverse proxy
├─ queries/                  ← graph model + read-only/mutation Cypher
├─ docs/                     ← submission draft, walkthrough, AI disclosure, demo script
├─ src/
│  ├─ app/                   ← Next.js app router (UI + /api/[action] routes)
│  ├─ components/            ← UI components
│  └─ lib/                   ← domain.ts, graph.ts, fixtures.ts, validation.ts,
│                              agents.ts, budget.ts, http.ts, types.ts
├─ agent-runtime/            ← Eve workspace (account-manager + producer members)
├─ scripts/                  ← MCP adapter + visual inspection helper
└─ tests/                    ← unit + integration suites
```

## License

See [`LICENSE`](./LICENSE).

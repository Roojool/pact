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

> **Submission status:** the app is **deployed and reachable over HTTPS**, the
> **reviewed source is published in the public repository**,
> and a **real live AI session has been verified** against that deployment (both
> agent roles plus live graph memory, executed in an independent verification run; see
> [Verification evidence](#verification-evidence)). The **demo video is pending
> recording**, and the **participant walkthrough is not yet completed**. See
> [Live links](#live-links) and [Publication status](#publication-status). Nothing
> here fabricates a link, a live-model result, or a test result that was not actually executed.

---

## Live links

- **Live app (HTTPS):** <https://pact-roojool-20261015.malaysiawest.cloudapp.azure.com>
- **Public source repository:** <https://github.com/Roojool/pact> — source, setup, graph queries and tests are published.
- **Demo video:** *pending recording* — capture script in
  [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md)

An independent verification run verified the live deployment with
`node scripts/run_visual_inspection.js` against the HTTPS URL on 2026-10-15
(16 screenshots / 7 grouped checks passed, deterministic mode); see
[Verification evidence](#verification-evidence). An independent verification run
also drove a real **live** AI session against the same deployment (both agent roles plus
live graph memory) and verified the live path. This documentation
pass did not re-run either live check.

---

## Table of contents

- [Live links](#live-links)
- [The use case](#the-use-case)
- [Honest product status](#honest-product-status)
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

**Working and verified locally (this build):**

- Deterministic, bounded feasibility checker over the graph-derived workspace
  (`checkPlan`), with explainable evidence paths.
- Deterministic repair proposals (`proposeRepairs`): deadline moves allowed by
  the brief, explicitly blocked backup-editor candidates, and
  "needs information" proposals for unknown durations.
- FalkorDB persistence with traversal-only snapshot recovery, optimistic
  concurrency (409 `stale_revision`), idempotent approvals, version-checked
  approvals, reservation/double-booking guards, and durable graph memory.
- A Next.js UI (warm editorial "planning desk") that consumes the API contract.
- Two-role agent integration and a durable, atomic, global paid-call budget
  ledger. Agent **unit** tests use a fake provider and never touch the network.
- A **live AI path that has been exercised end-to-end** against the HTTPS
  deployment — both agent roles (`account_manager` → `producer`) and live graph
  memory — with conservative budget ledger estimated spend inside the $5 cap. Executed in
  an independent verification run before this pass; see [Verification evidence](#verification-evidence).

**Not verified / not claimed:**

- The **demo video is pending recording**. The **live deployment and published source** are available (see [Live links](#live-links)).
- The **participant walkthrough is not yet completed** (see [`docs/AI_ASSISTANCE.md`](./docs/AI_ASSISTANCE.md)).
- The live AI verification above is **not re-run in this documentation pass**:
  it was a single real production session driven in an independent verification run,
  and actual provider billing is not measured (the conservative application budget ledger
  estimated $0.136371 used against a $5 cap with $0 reserved; the durable budget gate was
  independently verified before those calls). The Eve HTTP *contract* (health, session create,
  followed stream, cancel, reset) and the app's stream parser are additionally verified
  against a loopback fake server, and the budgeted-provider wrapper is unit-tested
  against a fake model.
- The UI was verified in an independent verification run with headless Chrome/Chromium
  (`node scripts/run_visual_inspection.js`) against the **HTTPS deployment**,
  capturing 16 screenshots under `output/playwright/` (git-ignored) with all 7
  grouped checks passing in deterministic mode. This documentation pass did not
  re-run it.
- No external campaign delivery, signed cryptographic receipts, or benchmark
  latencies are claimed. Approvals represent internal reservations in the graph only.

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
node scripts/run_visual_inspection.js # 16-screenshot visual smoke journey & 7 grouped checks
```

`npm run test:integration` runs `tsx --env-file-if-exists=.env.local --test
tests/*.integration.ts`. The graph and budget suites need only a reachable
FalkorDB. The HTTP suite needs a running app server at `PACT_BASE_URL`
(default `http://127.0.0.1:3000`). The graph suite closes its shared FalkorDB
connection during teardown and exits normally.

`node scripts/run_visual_inspection.js` runs a portable visual smoke journey
using `playwright-core` (auto-detects installed Google Chrome or Microsoft Edge,
or can be overridden with `PACT_BROWSER_PATH`). It captures 16 screenshots under
`output/playwright/` while validating 7 grouped checks: initial 12h/8h capacity
conflict, feasible repair proposal approval, studio memory grounded retrieval,
Sam approval yielding feasible original Day 1 deadlines, unknown duration handling,
keyboard Escape dismissal of the Source drawer, and real HTTP 409 optimistic locking.

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
- Default cap `$5` (`PACT_API_BUDGET_USD`). With `OPENAI_API_KEY` blank, no
  billable call is possible and the app returns a labeled deterministic result.

## Verification evidence

The results below were **executed before this documentation pass** (15 Oct 2026)
and are **not re-run here** — this pass only edits docs. The unit and integration
suites ran against the local build (FalkorDB reachable at `127.0.0.1:16379`); the
visual smoke journey and one live AI session ran against the **live HTTPS
deployment**. No paid model call was made by this documentation pass.

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
| Visual smoke journey (live HTTPS deployment) | `node scripts/run_visual_inspection.js` | **16 screenshots / 7 grouped checks pass** |

The root unit suite includes the six requirement tests in
`tests/requirements.test.ts` and the three HTTP contract tests in
`tests/http.test.ts`. Integration suites use isolated `pact-ws-wstest*` /
`pact_budget:*` namespaces and never touch other workspaces. The graph suite
closes its shared FalkorDB connection in teardown, so it exits normally without
`--test-force-exit`.

**Live deployment evidence (executed before this pass, not re-run here):** an
independent verification run ran the 16-screenshot / 7-check visual smoke journey
against the HTTPS deployment in deterministic mode dated 2026-10-15 02:17 UTC,
alongside checks that workspace isolation, the secure `HttpOnly` / `SameSite` session
cookie, cross-origin write rejection, and approval persistence after replacing the graph
container all hold. Those live checks are **not** re-asserted by this
documentation pass; see [Live links](#live-links).

**Live AI evidence (executed before this pass, not re-run here):** an independent
verification run drove one real **live** AI session against the HTTPS deployment on
2026-10-15 06:56 UTC. It passed: both agent roles (`account_manager` → `producer`)
and live graph memory ran end to end; the analysis reported the 12h/8h joint conflict
with source citations, one human-approved decision was recorded, and memory recalled
six sources. Tracked live spend in the conservative application budget ledger was
estimated at **$0.136371** against the **$5** application cap with **$0** reserved;
this is an application ledger estimate, not an OpenAI billing measurement (the durable
budget gate was independently verified before those calls). A first attempt failed with
a network `fetch failed` before any ledger existed; the second attempt passed. This
documentation pass did not re-run the live session.

**Reported by prior verification (not re-run here):** production build (`next build`),
typecheck (`tsc --noEmit`), and the unit and integration suites. The live agent
path is now **end-to-end verified once** (see the live AI evidence above) in
addition to being contract-verified against a loopback fake server and unit-tested
against a fake model.

## Synthetic data disclosure

All agency data is **fictional and synthetic** (Morrow Studio, its creators,
campaigns, editors, approvals, events and source documents). No real, personal,
private or login-protected data is loaded into the graph. The fixture lives in
`src/lib/fixtures.ts`.

## AI assistance

Development used AI coding assistants; the disclosure, the exact models used, a
participant walkthrough, and a questions-to-answer list for the participant are
in [`docs/AI_ASSISTANCE.md`](./docs/AI_ASSISTANCE.md). The participant must be
able to explain the graph model, the queries, the architecture and the technical
decisions, and should personally validate the code before submission.

## Publication status

| Artifact | Status |
| --- | --- |
| Live deployment (HTTPS) | ✅ **live** — <https://pact-roojool-20261015.malaysiawest.cloudapp.azure.com> (verified by independent visual smoke; not re-run in this docs pass) |
| Public source repository | ✅ **published** — <https://github.com/Roojool/pact> (source, setup, graph model, Cypher and tests) |
| Demo video (working project) | ⏳ **pending recording** — reusable 3-minute capture script in [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md) |
| Live AI session | ✅ **verified once** — real live production session (both roles + live memory) executed against the HTTPS deployment in an independent verification run; conservative budget ledger estimate $0.136371 of $5 cap ($0 reserved); not re-run in this docs pass |
| Participant walkthrough | ⏳ **not yet completed** — see [`docs/AI_ASSISTANCE.md`](./docs/AI_ASSISTANCE.md) |

No link above is invented: the live URL and repository URL are the real,
operator-provided endpoints, and the demo-video link is left pending rather than
fabricated. Complete local and Docker setup instructions are provided above,
which the rules accept if the project cannot be deployed.

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

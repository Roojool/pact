# PACT graph queries

PACT stores every anonymous workspace in its **own FalkorDB graph**
(`pact-ws-<opaque server id>`). Domain entities are nodes and the structure lives
in relationships, so a workspace snapshot is rebuilt **only through
traversals** — there are no denormalized foreign keys on the nodes. If FalkorDB
is unavailable the product returns `503 graph_unavailable`; there is no in-memory
business-state fallback.

Every query below is copied from the implementation, so the query strings,
parameters and semantics match the running code:

- Reads: `src/lib/graph.ts` (run through `graph.roQuery(...)`, i.e. read-only).
- Mutations: `src/lib/graph.ts` (run through `graph.query(...)`, guarded by
  `w.revision` + `w.createdAt`).
- Agent handoff memory: `src/lib/agents.ts` (`FalkorHandoffMemory`) and
  `agent-runtime/agents/*/agent/tools/*.ts` (separate `pact_agent` graph).
- Budget ledger: `src/lib/budget.ts` and
  `agent-runtime/agents/*/agent/lib/budget-gate.ts` (Redis keys + Lua on the
  same FalkorDB connection, not Cypher).

Two files split the Cypher by intent:

- [`reads.cypher`](./reads.cypher) — read-only traversals (safe to run against a
  seeded workspace; never changes the graph).
- [`mutations.cypher`](./mutations.cypher) — writes. Every one is either
  idempotent (`MERGE`) or guarded by the optimistic revision so it is a no-op if
  another writer already advanced the workspace.

> ⚠️ `mutations.cypher` contains destructive seeding (`GRAPH.DELETE`) and
> revision-bumping writes. Do not run it against a workspace you care about.
> Replace `$wk`/`$rev`/`$createdAt` with real values first.

## Graph model

```
                          ┌─────────────────────────────────────────────┐
                          │        Workspace {key, agency, revision,     │
                          │   activitySeq, memorySeq, decisionSeq,       │
                          │   createdAt}  ← one node per graph, the hub   │
                          └─────────────────────────────────────────────┘
   HAS_CREATOR→ Creator            HAS_PERSON→ Person          HAS_SOURCE→ Source
   HAS_CAMPAIGN→ Campaign          HAS_COMMITMENT→ Commitment  HAS_EDITOR→ Editor
   HAS_APPROVAL→ Approval          HAS_EVENT→ Event            HAS_ACTIVITY→ Activity
   HAS_PROPOSAL→ Proposal          HAS_DECISION→ Decision      HAS_MEMORY→ Memory

   Campaign  -[:FOR_CREATOR]->    Creator
   Campaign  -[:OWNED_BY]->       Person
   Campaign  -[:FROM_SOURCE]->    Source
   Commitment-[:FOR_CAMPAIGN]->   Campaign
   Editor    -[:FROM_SOURCE]->    Source
   Approval  -[:ABOUT_CAMPAIGN]-> Campaign      Approval -[:FOR_EDITOR]-> Editor
   Approval  -[:FROM_SOURCE]->    Source
   Event     -[:FOR_CAMPAIGN]->   Campaign      Event -[:FEATURES_CREATOR]-> Creator
   Event     -[:FROM_SOURCE]->    Source
   Activity  -[:MENTIONS_SOURCE]-> Source
   Proposal  -[:PROPOSES_CHANGE]-> Commitment   (decoration edge, written after analyze)
   Decision  -[:DECIDES]->        Proposal
   Decision  -[:HAS_ALLOCATION]-> Allocation    Allocation -[:FOR_COMMITMENT]-> Commitment
                                                Allocation -[:WITH_EDITOR]->   Editor
   Decision  -[:RESERVES {slots}]-> Editor      (the reservation that blocks double-booking)
   Decision  -[:CREATES_TASK]->   OwnerTask
   Memory    -[:NEXT]->           Memory        (append-only chain, most recent last)

   separate graph `pact_agent`:
   PactHandoff {id, workspaceId, from, to, summary, sourceIds, createdAt}
```

`Source.revision` is the version of a brief/policy/calendar/handoff. Proposals
snapshot every source revision (`sourceVersions`, stored as a JSON string) so an
approval can be rejected with `proposal_stale` when a source has since changed.

## Concurrency model (why the mutations look like this)

Each write is a single Cypher statement of the form

```
MATCH (w:Workspace {key:$wk}) WHERE w.revision = $rev AND w.createdAt = $createdAt
SET w.revision = w.revision + 1, ... CREATE (act:Activity ...) ...
```

FalkorDB runs one query atomically, so exactly one of two competing writers can
match; the loser gets an empty result and surfaces `409 stale_revision`. The
`createdAt` term defeats revision-counter reuse after a workspace reset. Reads
re-check `(revision, createdAt)` before and after the traversal (`loadConsistent`)
so a snapshot is never torn by an interleaved write.

Approval is idempotent: a replay is looked up by `idempotencyKey` **before** any
revision check, so a lost response can be retried safely even after the revision
moved on. Memory/activity appends bump only `activitySeq`/`memorySeq`, never
`revision`, so read-only memory traffic never stales the UI.

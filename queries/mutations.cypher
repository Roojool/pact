// PACT — mutation Cypher (executed via graph.query in src/lib/graph.ts).
//
// ⚠️  DESTRUCTIVE / WRITE OPERATIONS. Every write below either uses MERGE
//     (idempotent) or is guarded by the optimistic revision:
//
//       MATCH (w:Workspace {key:$wk}) WHERE w.revision = $rev AND w.createdAt = $createdAt
//       SET w.revision = w.revision + 1 ...
//
//     FalkorDB runs one query atomically, so exactly one competing writer can
//     match; the loser observes an empty result and the app raises
//     `409 stale_revision`. The `createdAt` term defeats revision-counter reuse
//     after a reset. Do not run these against a workspace you care about.
//
// Parameters: $wk workspace key, $rev expected revision, $createdAt guard,
// $ts timestamp, plus per-entity parameters named inline.

// ---------------------------------------------------------------------------
// 0. Reset/seed. createWorkspace first drops the whole graph, then MERGEs the
//    fixture (all synthetic). `GRAPH.DELETE` is issued through the client
//    (g.delete()) before these statements.
// ---------------------------------------------------------------------------
MERGE (w:Workspace {key:$wk})
SET w.agency = $agency, w.revision = 1, w.activitySeq = 1, w.memorySeq = 0,
    w.decisionSeq = 0, w.createdAt = $createdAt;

MATCH (w:Workspace {key:$wk})
UNWIND $rows AS r
MERGE (n:Creator {key:r.id})
SET n.name = r.name, n.handle = r.handle, n.category = r.category,
    n.initials = r.initials, n.color = r.color
MERGE (w)-[:HAS_CREATOR]->(n);
// ... analogous UNWIND $rows blocks MERGE Person, Source, Editor, Approval,
// Event and Activity (with Activity -[:MENTIONS_SOURCE]-> Source). Campaigns,
// Commitments and Events also MERGE their outgoing relationships:
//
//   MERGE (c:Campaign {key:r.id}) ... MERGE (c)-[:FOR_CREATOR]->(cr)
//   MERGE (c)-[:OWNED_BY]->(p)       MERGE (c)-[:FROM_SOURCE]->(s)
//   MERGE (m:Commitment {key:r.id}) ... MERGE (m)-[:FOR_CAMPAIGN]->(c)
//   MERGE (v:Event {key:r.id}) ... MERGE (v)-[:FOR_CAMPAIGN]->(c)
//                                    MERGE (v)-[:FEATURES_CREATOR]->(cr)
//                                    MERGE (v)-[:FROM_SOURCE]->(s)


// ---------------------------------------------------------------------------
// 1. analyzeWorkspace — bump revision, append the check activity, and persist
//    the deterministic proposals. The proposals block is only appended when
//    proposals exist. All in ONE atomic guarded statement.
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk}) WHERE w.revision = $rev AND w.createdAt = $createdAt
SET w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (act:Activity {key:'act-' + toString(seq), role:'system', text:$actText, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH w
UNWIND $proposals AS pr
MERGE (p:Proposal {key:pr.id})
SET p.title = pr.title, p.description = pr.description, p.revision = pr.revision,
    p.status = pr.status, p.createdAt = pr.createdAt, p.changes = pr.changesJson,
    p.sourceVersions = pr.sourceVersionsJson
MERGE (w)-[:HAS_PROPOSAL]->(p)
WITH w
RETURN 1 AS ok;

// Decoration edges, guarded by the NEW revision (idempotent MERGE):
MATCH (w:Workspace {key:$wk})
WHERE w.revision = $newRev AND w.createdAt = $createdAt
UNWIND $proposals AS pr
MATCH (p:Proposal {key:pr.id})
UNWIND pr.changeTargets AS tid
MATCH (w)-[:HAS_COMMITMENT]->(cm:Commitment {key:tid})
MERGE (p)-[:PROPOSES_CHANGE]->(cm);

// Attach cited sources to the new activity (idempotent MERGE):
MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(act:Activity {key:$actId})
WHERE w.revision = $newRev AND w.createdAt = $createdAt
UNWIND $srcIds AS sid
MATCH (s:Source {key:sid})
MERGE (act)-[:MENTIONS_SOURCE]->(s);


// ---------------------------------------------------------------------------
// 2. editWorkspace — four shapes, all guarded by $rev + $createdAt. Each bumps
//    the revision, appends an Activity and links its source.
// ---------------------------------------------------------------------------
// (a) commitment hours / deadline
MATCH (w:Workspace {key:$wk})-[:HAS_COMMITMENT]->(m:Commitment {key:$eid})
WHERE w.revision = $rev AND w.createdAt = $createdAt
SET m.hours = $hours, m.deadlineDay = $deadline,
    w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (act:Activity {key:'act-' + toString(seq), role:'producer', text:$actText, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH act
MATCH (s:Source {key:$srcId})
MERGE (act)-[:MENTIONS_SOURCE]->(s)
RETURN 1 AS ok;

// (b) approval fact (the Account Manager toggles eligibility)
MATCH (w:Workspace {key:$wk})-[:HAS_APPROVAL]->(a:Approval {key:$eid})
WHERE w.revision = $rev AND w.createdAt = $createdAt
SET a.approved = $approved,
    w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (act:Activity {key:'act-' + toString(seq), role:'account_manager', text:$actText, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH act
MATCH (s:Source {key:$srcId})
MERGE (act)-[:MENTIONS_SOURCE]->(s)
RETURN 1 AS ok;

// (c) editor slots
MATCH (w:Workspace {key:$wk})-[:HAS_EDITOR]->(e:Editor {key:$eid})
WHERE w.revision = $rev AND w.createdAt = $createdAt
SET e.slots = $slots,
    w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (act:Activity {key:'act-' + toString(seq), role:'producer', text:$actText, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH act
MATCH (s:Source {key:$srcId})
MERGE (act)-[:MENTIONS_SOURCE]->(s)
RETURN 1 AS ok;

// (d) event attendance window (0..48, end exclusive)
MATCH (w:Workspace {key:$wk})-[:HAS_EVENT]->(v:Event {key:$eid})
WHERE w.revision = $rev AND w.createdAt = $createdAt
SET v.start = $start, v.end = $end,
    w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (act:Activity {key:'act-' + toString(seq), role:'producer', text:$actText, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH act
MATCH (s:Source {key:$srcId})
MERGE (act)-[:MENTIONS_SOURCE]->(s)
RETURN 1 AS ok;


// ---------------------------------------------------------------------------
// 3. approveProposal — mark the proposal approved, bump revision/activity/
//    decision counters, persist the Decision, its allocations, RESERVES edges,
//    owner tasks, and any deadline move. ONE atomic guarded statement.
//    (An idempotency replay is looked up first and returns early; see
//    reads.cypher §5. A concurrent same-key writer is handled after this runs.)
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk})-[:HAS_PROPOSAL]->(p:Proposal {key:$pid})
WHERE w.revision = $rev AND w.createdAt = $createdAt AND p.status = 'proposed'
SET p.status = 'approved',
    w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1, w.decisionSeq = w.decisionSeq + 1
WITH w, p, w.activitySeq AS aseq
CREATE (d:Decision {key:$did, idempotencyKey:$ik, title:p.title, revision:$rev, createdAt:$ts,
                    note:$note, sourceVersions:p.sourceVersions, changes:p.changes})
CREATE (w)-[:HAS_DECISION]->(d)
CREATE (d)-[:DECIDES]->(p)
CREATE (act:Activity {key:'act-' + toString(aseq), role:'account_manager', text:$actText, createdAt:$ts, seq:aseq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH w, d
UNWIND $allocs AS al
MATCH (w)-[:HAS_COMMITMENT]->(cm:Commitment {key:al.commitmentId})
MATCH (w)-[:HAS_EDITOR]->(e:Editor {key:al.editorId})
CREATE (a:Allocation {key:al.key, slots:al.slots})
CREATE (d)-[:HAS_ALLOCATION]->(a)
CREATE (a)-[:FOR_COMMITMENT]->(cm)
CREATE (a)-[:WITH_EDITOR]->(e)
CREATE (d)-[:RESERVES {slots:al.slots}]->(e)
WITH DISTINCT w, d
UNWIND $tasks AS t
CREATE (tk:OwnerTask {key:t.id, ownerId:t.ownerId, title:t.title, status:'todo'})
CREATE (d)-[:CREATES_TASK]->(tk)
// optional deadline move (only when the proposal changes a deadline):
WITH DISTINCT w, d
UNWIND $deadlineChanges AS ch
MATCH (w)-[:HAS_COMMITMENT]->(cm:Commitment {key:ch.commitmentId})
SET cm.deadlineDay = ch.deadlineDay
RETURN d.key AS decisionId;

// Attach the proposal's source versions to the approval activity:
MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(act:Activity {key:$actId})
WHERE w.revision = $newRev AND w.createdAt = $createdAt
UNWIND $srcIds AS sid
MATCH (s:Source {key:sid})
MERGE (act)-[:MENTIONS_SOURCE]->(s);


// ---------------------------------------------------------------------------
// 4. recallMemory — append-only. Bumps ONLY activitySeq/memorySeq (never
//    revision), creates the Memory node, chains it with NEXT, and appends the
//    activity. Read-only memory traffic therefore never stales the UI.
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk})
SET w.activitySeq = w.activitySeq + 1, w.memorySeq = w.memorySeq + 1
WITH w, w.activitySeq AS aseq, w.memorySeq AS mseq
CREATE (m:Memory {key:'mem-' + toString(mseq), message:$message, reply:$reply, createdAt:$ts, seq:mseq})
CREATE (w)-[:HAS_MEMORY]->(m)
WITH w, m, aseq
CREATE (act:Activity {key:'act-' + toString(aseq), role:'system', text:$actText, createdAt:$ts, seq:aseq})
CREATE (w)-[:HAS_ACTIVITY]->(act)
WITH w, m
OPTIONAL MATCH (w)-[:HAS_MEMORY]->(prev:Memory) WHERE prev.seq = m.seq - 1
FOREACH (p IN CASE WHEN prev IS NULL THEN [] ELSE [prev] END | CREATE (p)-[:NEXT]->(m))
RETURN m.key AS memoryId;


// ---------------------------------------------------------------------------
// 5. recordLiveActivities — append agent-emitted activity (activitySeq only).
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk})
SET w.activitySeq = w.activitySeq + 1
WITH w, w.activitySeq AS seq
CREATE (a:Activity {key:'act-' + toString(seq), role:$role, text:$text, createdAt:$ts, seq:seq})
CREATE (w)-[:HAS_ACTIVITY]->(a);

MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(a:Activity {key:$actId})
UNWIND $srcIds AS sid
MATCH (s:Source {key:sid})
MERGE (a)-[:MENTIONS_SOURCE]->(s);


// ---------------------------------------------------------------------------
// 6. Agent handoff memory — separate graph `pact_agent` (idempotent MERGE).
//    src/lib/agents.ts and agent-runtime/agents/*/agent/tools/record_handoff.ts
// ---------------------------------------------------------------------------
MERGE (h:PactHandoff {id: $id})
SET h.workspaceId = $workspaceId, h.from = 'account_manager', h.to = 'producer',
    h.summary = $summary, h.sourceIds = $sourceIds, h.createdAt = $createdAt;

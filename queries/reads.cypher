// PACT — read-only Cypher (executed via graph.roQuery in src/lib/graph.ts).
// These never mutate the graph. Parameters:
//   $wk  workspace graph key, e.g. "pact-ws-ws_ab12..." (the graph itself is
//        selected by client.selectGraph($wk); the node key repeats it)
//   $ck  a campaign key, e.g. "cp-c"
//   $ek  an editor key, e.g. "ed-alex"
//   $ik  an approval idempotency key
//   $editorIds  array of editor keys
//   $workspaceId  workspace id used by the agent handoff graph (pact_agent)
//   $limit  integer


// ---------------------------------------------------------------------------
// 1. Workspace meta (revision + sequence counters). Also used by the
//    consistent-read retry: read before and after the traversal loads.
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk})
RETURN w.revision AS revision, w.createdAt AS createdAt,
       w.activitySeq AS activitySeq, w.memorySeq AS memorySeq, w.decisionSeq AS decisionSeq;


// ---------------------------------------------------------------------------
// 2. Snapshot loaders — one traversal per entity, rebuilt every read.
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk})-[:HAS_CREATOR]->(n:Creator)
RETURN n.key AS id, n.name AS name, n.handle AS handle, n.category AS category,
       n.initials AS initials, n.color AS color
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_PERSON]->(n:Person)
RETURN n.key AS id, n.name AS name, n.role AS role ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_SOURCE]->(n:Source)
RETURN n.key AS id, n.title AS title, n.kind AS kind, n.revision AS revision,
       n.excerpt AS excerpt, n.updatedAt AS updatedAt
ORDER BY id;

// Campaign → its creator, owner and source are all resolved by traversal.
MATCH (w:Workspace {key:$wk})-[:HAS_CAMPAIGN]->(c:Campaign)-[:FOR_CREATOR]->(cr:Creator),
      (c)-[:OWNED_BY]->(p:Person), (c)-[:FROM_SOURCE]->(s:Source)
RETURN c.key AS id, c.name AS name, c.brand AS brand, c.category AS category, c.color AS color,
       cr.key AS creatorId, p.key AS ownerId, s.key AS sourceId
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_COMMITMENT]->(m:Commitment)-[:FOR_CAMPAIGN]->(c:Campaign)
RETURN m.key AS id, m.title AS title, m.hours AS hours, m.releaseDay AS releaseDay,
       m.deadlineDay AS deadlineDay, m.flexUntilDay AS flexUntilDay, m.status AS status,
       c.key AS campaignId
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_EDITOR]->(e:Editor)-[:FROM_SOURCE]->(s:Source)
RETURN e.key AS id, e.name AS name, e.initials AS initials, e.slots AS slots, s.key AS sourceId
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_APPROVAL]->(a:Approval)-[:ABOUT_CAMPAIGN]->(c:Campaign),
      (a)-[:FOR_EDITOR]->(e:Editor), (a)-[:FROM_SOURCE]->(s:Source)
RETURN a.key AS id, a.approved AS approved, c.key AS campaignId, e.key AS editorId, s.key AS sourceId
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_EVENT]->(v:Event)-[:FOR_CAMPAIGN]->(c:Campaign),
      (v)-[:FEATURES_CREATOR]->(cr:Creator), (v)-[:FROM_SOURCE]->(s:Source)
RETURN v.key AS id, v.title AS title, v.start AS start, v.end AS end,
       c.key AS campaignId, cr.key AS creatorId, s.key AS sourceId
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_PROPOSAL]->(p:Proposal)
RETURN p.key AS id, p.title AS title, p.description AS description, p.revision AS revision,
       p.status AS status, p.createdAt AS createdAt, p.changes AS changes,
       p.sourceVersions AS sourceVersions
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)
RETURN d.key AS id, d.idempotencyKey AS idempotencyKey, d.title AS title, d.revision AS revision,
       d.createdAt AS createdAt, d.note AS note, d.sourceVersions AS sourceVersions
ORDER BY id;

MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[:DECIDES]->(p:Proposal)
RETURN d.key AS decisionId, p.key AS proposalId;

MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[:HAS_ALLOCATION]->(al:Allocation)-[:FOR_COMMITMENT]->(cm:Commitment),
      (al)-[:WITH_EDITOR]->(e:Editor)
RETURN d.key AS decisionId, cm.key AS commitmentId, e.key AS editorId, al.slots AS slots
ORDER BY commitmentId;

MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[:CREATES_TASK]->(t:OwnerTask)
RETURN d.key AS decisionId, t.key AS id, t.ownerId AS ownerId, t.title AS title, t.status AS status
ORDER BY id;

// Activity with its cited sources collected in one traversal.
MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(a:Activity)
OPTIONAL MATCH (a)-[:MENTIONS_SOURCE]->(s:Source)
RETURN a.key AS id, a.role AS role, a.text AS text, a.createdAt AS createdAt, a.seq AS seq,
       collect(s.key) AS sourceIds
ORDER BY seq;


// ---------------------------------------------------------------------------
// 3. Memory recall (most recent notes first) — the append-only Memory chain.
// ---------------------------------------------------------------------------
MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory)
RETURN m.key AS id, m.message AS message, m.seq AS seq
ORDER BY seq DESC LIMIT 5;


// ---------------------------------------------------------------------------
// 4. Graph-grounded recall drill-downs (used by recallMemory).
// ---------------------------------------------------------------------------
MATCH (c:Campaign {key:$ck})<-[:FOR_CAMPAIGN]-(m:Commitment)
RETURN m.key AS id, m.title AS title, m.hours AS hours, m.deadlineDay AS deadlineDay,
       m.flexUntilDay AS flexUntilDay
ORDER BY id;

MATCH (c:Campaign {key:$ck})<-[:ABOUT_CAMPAIGN]-(a:Approval)-[:FOR_EDITOR]->(e:Editor)
RETURN a.approved AS approved, a.key AS approvalId, a.sourceId AS sourceId,
       e.key AS editorId, e.name AS editorName
ORDER BY editorId;

MATCH (c:Campaign {key:$ck})<-[:FOR_CAMPAIGN]-(v:Event)
RETURN v.key AS id, v.title AS title, v.start AS start, v.end AS end
ORDER BY id;

MATCH (e:Editor {key:$ek})<-[:FOR_EDITOR]-(a:Approval)-[:ABOUT_CAMPAIGN]->(c:Campaign)
RETURN c.key AS campaignId, c.name AS campaignName, a.approved AS approved, a.sourceId AS sourceId
ORDER BY campaignId;


// ---------------------------------------------------------------------------
// 5. Approval lookups.
// ---------------------------------------------------------------------------
// Idempotent replay: find a decision by its idempotency key.
MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision {idempotencyKey:$ik})
RETURN d.key AS id;

// Reservation guard: which slots are already reserved on these editors?
MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[r:RESERVES]->(e:Editor)
WHERE e.key IN $editorIds
RETURN e.key AS editorId, d.key AS decisionId, r.slots AS slots;


// ---------------------------------------------------------------------------
// 6. Health probe (own graph, no workspace state).
// ---------------------------------------------------------------------------
RETURN 1 AS ok;


// ---------------------------------------------------------------------------
// 7. Agent handoff memory — separate graph `pact_agent`
//    (src/lib/agents.ts FalkorHandoffMemory; agent tools use the same shape).
// ---------------------------------------------------------------------------
MATCH (h:PactHandoff {workspaceId: $workspaceId})
RETURN h.id AS id, h.from AS from, h.to AS to, h.summary AS summary,
       h.sourceIds AS sourceIds, h.createdAt AS createdAt
ORDER BY h.createdAt DESC LIMIT $limit;

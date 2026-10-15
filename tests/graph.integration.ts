/**
 * PACT core integration tests — run against a REAL FalkorDB server.
 * Run: npm run test:integration  (tsx --env-file=.env.local --test tests/*.integration.ts)
 *
 * Proves: snapshot recovery from traversals, optimistic concurrency (competing
 * approvals/edits are safe), idempotent approval replays, version-checked
 * approvals, reservation integrity, and graph memory persistence — including
 * reads through a fresh, independent client connection.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { FalkorDB } from 'falkordb';
import { createFixture } from '../src/lib/fixtures';
import { checkPlan } from '../src/lib/domain';
import { PactError } from '../src/lib/validation';
import {
  analyzeWorkspace, approveProposal, createWorkspace, editWorkspace,
  graphHealth, readWorkspace, recallMemory, closeGraphConnection,
} from '../src/lib/graph';
import type { Proposal } from '../src/lib/types';

const URL = process.env.FALKORDB_URL?.trim() || 'redis://127.0.0.1:16379';

after(closeGraphConnection);

let counter = 0;
function freshId(): string {
  counter += 1;
  return `wstest${Date.now().toString(36)}${counter}`;
}

async function expectPactError(promise: Promise<unknown>, code: string, status: number): Promise<PactError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof PactError, `expected PactError, got ${String(err)}`);
    const pactErr = err as PactError;
    assert.equal(pactErr.code, code, `expected code ${code}, got ${pactErr.code}: ${pactErr.message}`);
    assert.equal(pactErr.status, status);
    return pactErr;
  }
  throw new Error(`expected PactError ${code}, but the call succeeded`);
}

async function rawClient(): Promise<FalkorDB> {
  return FalkorDB.connect({ url: URL });
}

test('graphHealth reports true against the running server', async () => {
  assert.equal(await graphHealth(), true);
});

test('snapshot recovery: seed round-trips exactly through graph traversals', async () => {
  const id = freshId();
  const created = await createWorkspace(id);
  assert.equal(created.revision, 1);
  const read = await readWorkspace(id);
  assert.ok(read);
  // Collections come back in canonical graph-traversal order; compare the
  // full data canonically (every entity by id, activity sourceIds sorted).
  const canonical = (ws: typeof read): typeof read => ({
    ...ws,
    creators: [...ws.creators].sort((a, b) => a.id.localeCompare(b.id)),
    people: [...ws.people].sort((a, b) => a.id.localeCompare(b.id)),
    sources: [...ws.sources].sort((a, b) => a.id.localeCompare(b.id)),
    campaigns: [...ws.campaigns].sort((a, b) => a.id.localeCompare(b.id)),
    commitments: [...ws.commitments].sort((a, b) => a.id.localeCompare(b.id)),
    editors: [...ws.editors].sort((a, b) => a.id.localeCompare(b.id)),
    approvals: [...ws.approvals].sort((a, b) => a.id.localeCompare(b.id)),
    events: [...ws.events].sort((a, b) => a.id.localeCompare(b.id)),
    activity: [...ws.activity].sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => ({ ...a, sourceIds: [...a.sourceIds].sort() })),
  });
  assert.deepEqual(canonical(read), canonical(createFixture(id)));
});

test('readWorkspace returns null for an unknown workspace', async () => {
  assert.equal(await readWorkspace('never-created-xyz'), null);
});

test('seeded graph survives an independent fresh connection (real persistence)', async () => {
  const id = freshId();
  await createWorkspace(id);
  const client = await rawClient();
  try {
    const g = client.selectGraph(`pact-ws-${id}`);
    const rows = await g.roQuery<{ n: number }>(
      `MATCH (w:Workspace)-[:HAS_COMMITMENT]->(m:Commitment)-[:FOR_CAMPAIGN]->(c:Campaign)-[:FOR_CREATOR]->(cr:Creator)
       RETURN count(m) AS n`,
    );
    assert.equal(rows.data?.[0]?.n, 3, 'three commitments linked to campaigns and creators');
    const edges = await g.roQuery<{ n: number }>(
      `MATCH (w:Workspace)-[:HAS_APPROVAL]->(a:Approval)-[:ABOUT_CAMPAIGN]->(:Campaign),
             (a)-[:FOR_EDITOR]->(:Editor), (a)-[:FROM_SOURCE]->(:Source)
       RETURN count(a) AS n`,
    );
    assert.equal(edges.data?.[0]?.n, 4, 'four approval records with full edge structure');
  } finally {
    await client.close();
  }
});

test('analyzeWorkspace persists proposals and bumps the revision', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { workspace, analysis } = await analyzeWorkspace(id, 1);
  assert.equal(workspace.revision, 2);
  assert.equal(analysis.mode, 'deterministic');
  assert.equal(analysis.check.status, 'infeasible');
  assert.ok(analysis.proposals.length >= 2, 'move + rejected proposals');
  assert.equal(analysis.activity.length, 1);
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.revision, 2);
  assert.equal(stored.proposals.length, analysis.proposals.length);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  assert.ok(stored.proposals.some((p) => p.id === move.id && p.status === 'proposed'));
  // re-analyzing at the new revision is idempotent for proposal ids (MERGE by key)
  const again = await analyzeWorkspace(id, 2);
  assert.equal(again.workspace.revision, 3);
  assert.equal(again.workspace.proposals.length, analysis.proposals.length);
});

test('analyzeWorkspace with a stale revision is rejected', async () => {
  const id = freshId();
  await createWorkspace(id);
  await expectPactError(analyzeWorkspace(id, 99), 'stale_revision', 409);
  await expectPactError(analyzeWorkspace(id, 0), 'invalid_request', 400);
});

test('editWorkspace: approval fact edit persists and unlocks the original deadlines', async () => {
  const id = freshId();
  await createWorkspace(id);
  const edited = await editWorkspace(id, 1, { kind: 'approval', id: 'ap-c-sam', approved: true });
  assert.equal(edited.revision, 2);
  const ap = edited.approvals.find((a) => a.id === 'ap-c-sam')!;
  assert.equal(ap.approved, true);
  // graph-derived plan is now feasible on Day 1 (new approval fact)
  const check = checkPlan(edited);
  assert.equal(check.status, 'feasible');
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.approvals.find((a) => a.id === 'ap-c-sam')!.approved, true);
});

test('editWorkspace: semantic and not-found errors, stale revisions', async () => {
  const id = freshId();
  await createWorkspace(id);
  await expectPactError(
    editWorkspace(id, 1, { kind: 'commitment', id: 'cm-a', deadlineDay: 2 }),
    'invalid_edit', 400, // cm-a flexes only to Day 1
  );
  await expectPactError(
    editWorkspace(id, 1, { kind: 'approval', id: 'ap-nope', approved: true }),
    'approval_not_found', 400,
  );
  const ws = await editWorkspace(id, 1, { kind: 'editor', id: 'ed-sam', slots: [0, 1, 2, 3, 4] });
  assert.equal(ws.revision, 2);
  await expectPactError(
    editWorkspace(id, 1, { kind: 'editor', id: 'ed-sam', slots: [0] }),
    'stale_revision', 409,
  );
  const ws2 = await editWorkspace(id, 2, { kind: 'commitment', id: 'cm-c', deadlineDay: 2 });
  assert.equal(ws2.commitments.find((c) => c.id === 'cm-c')!.deadlineDay, 2);
  // unknown-hours edit keeps unknown data unknown
  const ws3 = await editWorkspace(id, 3, { kind: 'commitment', id: 'cm-b', hours: null });
  assert.equal(ws3.commitments.find((c) => c.id === 'cm-b')!.hours, null);
  assert.equal(checkPlan(ws3).status, 'needs_information');
});

test('hero journey: analyze, approve the move, reservations and owner tasks persist', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { workspace, analysis } = await analyzeWorkspace(id, 1);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  const { workspace: after, decision } = await approveProposal(id, 2, move.id, 'hero-key-0001');
  assert.equal(after.revision, 3);
  assert.equal(decision.proposalId, move.id);
  assert.equal(decision.allocations.length, 3);
  assert.deepEqual(
    decision.allocations.find((a) => a.commitmentId === 'cm-c'),
    { commitmentId: 'cm-c', editorId: 'ed-alex', slots: [8, 9, 10, 11] },
  );
  assert.ok(decision.tasks.length >= 1);
  assert.ok(decision.tasks.every((t) => t.status === 'todo' && t.ownerId === 'p-am'));
  assert.match(decision.tasks[0]!.title, /not delivery/);
  // proposal flips to approved; deadline change applied; snapshot recovered
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.proposals.find((p) => p.id === move.id)!.status, 'approved');
  assert.equal(stored.commitments.find((c) => c.id === 'cm-c')!.deadlineDay, 2);
  assert.equal(stored.decisions.length, 1);
  assert.deepEqual(stored.decisions[0]!.allocations, decision.allocations);
  // reservations visible via a fresh raw connection through real traversals
  const client = await rawClient();
  try {
    const g = client.selectGraph(`pact-ws-${id}`);
    const reserved = await g.roQuery<{ slots: number[] }>(
      `MATCH (w:Workspace)-[:HAS_DECISION]->(d:Decision)-[r:RESERVES]->(e:Editor {key:'ed-alex'})
       RETURN r.slots AS slots`,
    );
    const slots = reserved.data?.flatMap((row) => row.slots) ?? [];
    assert.deepEqual([...slots].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  } finally {
    await client.close();
  }
  // plan is feasible now, and re-analysis proposes nothing
  const recheck = await analyzeWorkspace(id, 3);
  assert.equal(recheck.analysis.check.status, 'feasible');
  assert.deepEqual(recheck.analysis.proposals, []);
});

test('approval idempotency: replay returns the same decision without side effects', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { analysis } = await analyzeWorkspace(id, 1);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  const first = await approveProposal(id, 2, move.id, 'idem-key-aaaa');
  // Lost-response scenario: the client never saw the first success and retries
  // with its now-stale revision 2 — the replay must still return the decision.
  const replayed = await approveProposal(id, 2, move.id, 'idem-key-aaaa');
  assert.equal(replayed.decision.id, first.decision.id);
  assert.equal(replayed.workspace.revision, first.workspace.revision);
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.decisions.length, 1);
});

test('approval rejections: wrong state, wrong proposal, infeasible/rejected proposals', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { analysis } = await analyzeWorkspace(id, 1);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  const rejected = analysis.proposals.find((p) => p.status === 'rejected')!;
  await expectPactError(approveProposal(id, 2, 'pr-does-not-exist', 'key-12345678'), 'proposal_not_found', 400);
  // approving the rejected backup-editor candidate fails on its state: it was
  // already rejected when it was generated, so it can never be approved.
  await expectPactError(approveProposal(id, 2, rejected.id, 'key-12345678'), 'proposal_state', 409);
  await approveProposal(id, 2, move.id, 'key-aaaabbbb');
  // already approved -> state error even with a fresh key
  await expectPactError(approveProposal(id, 3, move.id, 'key-bbbbcccc'), 'proposal_state', 409);
});

test('version-checked approval: a mutated source revision blocks approval', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { analysis } = await analyzeWorkspace(id, 1);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  // Simulate an out-of-band policy revision directly in the graph.
  const client = await rawClient();
  try {
    const g = client.selectGraph(`pact-ws-${id}`);
    await g.query(`MATCH (s:Source {key:'src-policy'}) SET s.revision = 99`);
  } finally {
    await client.close();
  }
  const err = await expectPactError(approveProposal(id, 2, move.id, 'key-vercheck1'), 'proposal_stale', 409);
  assert.match(err.message, /src-policy/);
});

test('reservation integrity: double-booking reserved editor slots conflicts', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { analysis } = await analyzeWorkspace(id, 1);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  const approved = await approveProposal(id, 2, move.id, 'key-reserve-1');
  assert.equal(approved.workspace.revision, 3);
  // New approval fact makes the ORIGINAL Day 1 deadlines feasible again...
  const edited = await editWorkspace(id, 3, { kind: 'approval', id: 'ap-c-sam', approved: true });
  assert.equal(edited.revision, 4);
  const plan = checkPlan(edited);
  assert.equal(plan.status, 'feasible');
  // ...but the deterministic plan re-uses Alex slots 0..7, which the earlier
  // decision already reserved, so approving such a plan must conflict.
  assert.ok(plan.allocations.some((a) => a.editorId === 'ed-alex' && a.slots.includes(0)));
  // Craft that plan as a proposal (deadline back to Day 1) directly in the
  // graph, then try to approve it through the public API.
  const client = await rawClient();
  try {
    const g = client.selectGraph(`pact-ws-${id}`);
    await g.query(
      `MATCH (w:Workspace {key:$wk})
       CREATE (p2:Proposal {key:'pr-test-overlap', title:'Tighten Comet back to Day 1', description:'test overlap proposal',
         revision:4, status:'proposed', createdAt:'2026-10-15T00:00:00.000Z',
         changes:'[{"commitmentId":"cm-c","deadlineDay":1}]', sourceVersions:'{}'})
       CREATE (w)-[:HAS_PROPOSAL]->(p2)`,
      { params: { wk: `pact-ws-${id}` } },
    );
  } finally {
    await client.close();
  }
  const err = await expectPactError(approveProposal(id, 4, 'pr-test-overlap', 'key-overlap-1'), 'slot_conflict', 409);
  assert.match(err.message, /reserved by decision dec-1/);
  // nothing was written by the failed approval
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.revision, 4);
  assert.equal(stored.decisions.length, 1);
});

test('optimistic concurrency: competing approvals at the same revision — exactly one wins', async () => {
  const id = freshId();
  await createWorkspace(id);
  const { analysis } = await analyzeWorkspace(id, 1);
  const move = analysis.proposals.find((p) => p.status === 'proposed')!;
  const [a, b] = await Promise.allSettled([
    approveProposal(id, 2, move.id, 'key-race-aaaa'),
    approveProposal(id, 2, move.id, 'key-race-bbbb'),
  ]);
  const wins = [a, b].filter((r) => r.status === 'fulfilled');
  const losses = [a, b].filter((r) => r.status === 'rejected');
  assert.equal(wins.length, 1, `exactly one approval wins (got ${JSON.stringify([a.status, b.status])})`);
  assert.equal(losses.length, 1);
  for (const loss of losses) {
    assert.equal((loss as PromiseRejectedResult).reason.code, 'stale_revision');
  }
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.revision, 3);
  assert.equal(stored.decisions.length, 1);
});

test('optimistic concurrency: competing edits at the same revision — exactly one wins', async () => {
  const id = freshId();
  await createWorkspace(id);
  const [a, b] = await Promise.allSettled([
    editWorkspace(id, 1, { kind: 'approval', id: 'ap-c-sam', approved: true }),
    editWorkspace(id, 1, { kind: 'editor', id: 'ed-sam', slots: [0, 1, 2] }),
  ]);
  const wins = [a, b].filter((r) => r.status === 'fulfilled');
  assert.equal(wins.length, 1);
  const losses = [a, b].filter((r) => r.status === 'rejected');
  assert.equal(losses.length, 1);
  assert.equal((losses[0] as PromiseRejectedResult).reason.code, 'stale_revision');
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.revision, 2);
});

test('recallMemory: graph-grounded reply, memory persisted, chained and revision-safe', async () => {
  const id = freshId();
  await createWorkspace(id);
  const first = await recallMemory(id, 'What is the status of the Comet Coffee Launch Film?');
  assert.equal(first.mode, 'deterministic');
  assert.match(first.text, /Comet Coffee Launch Film/);
  assert.match(first.text, /Alex Rivera/);
  assert.match(first.text, /Sam Ashby/);
  assert.match(first.text, /NOT approved/);
  assert.match(first.text, /Workspace revision: 1/);
  assert.ok(first.sourceIds.includes('src-brief-c'), 'first recall must cite campaign brief src-brief-c');
  assert.ok(first.sourceIds.includes('src-policy'), 'first recall matching Comet must include approval source src-policy');
  assert.ok(first.sourceIds.every((sid) => typeof sid === 'string' && sid.length > 0), 'first recall citations must all be nonempty');
  assert.ok(!first.sourceIds.includes(''), 'first recall citations must not contain empty string');
  assert.equal(first.activity.length, 1);

  const second = await recallMemory(id, 'Can Sam Ashby take the Comet edit?');
  assert.match(second.text, /Memory: 1 earlier note/);
  assert.match(second.text, /Sam Ashby/);
  assert.ok(second.sourceIds.includes('src-policy'), 'second recall matching Comet and Sam must include approval source src-policy');
  assert.ok(second.sourceIds.includes('src-brief-c'), 'second recall must include campaign brief src-brief-c');
  assert.ok(second.sourceIds.includes('src-cal'), 'second recall must include editor calendar src-cal');
  assert.ok(second.sourceIds.every((sid) => typeof sid === 'string' && sid.length > 0), 'second recall citations must all be nonempty');
  assert.ok(!second.sourceIds.includes(''), 'second recall citations must not contain empty string');

  // memory chain persisted: NEXT edge + two Memory nodes through a fresh client
  const client = await rawClient();
  try {
    const g = client.selectGraph(`pact-ws-${id}`);
    const chain = await g.roQuery<{ n: number }>(
      `MATCH (w:Workspace)-[:HAS_MEMORY]->(m1:Memory)-[:NEXT]->(m2:Memory) RETURN count(*) AS n`,
    );
    assert.equal(chain.data?.[0]?.n, 1, 'memory NEXT chain edge exists');
    const nodes = await g.roQuery<{ n: number }>(`MATCH (:Workspace)-[:HAS_MEMORY]->(m:Memory) RETURN count(m) AS n`);
    assert.equal(nodes.data?.[0]?.n, 2);
  } finally {
    await client.close();
  }
  // Recalling memory is an append-only read: the workspace revision did NOT
  // move, so a UI holding revision 1 can still act without being staled.
  const stored = await readWorkspace(id);
  assert.ok(stored);
  assert.equal(stored.revision, 1);
  assert.equal(stored.activity.length, 3, 'two memory activities plus the seeded one');

  const actualSourceIds = new Set(stored.sources.map((s) => s.id));
  assert.ok(actualSourceIds.size > 0, 'workspace must have sources');
  for (const sid of first.sourceIds) {
    assert.ok(actualSourceIds.has(sid), `first recall citation "${sid}" must be drawn from actual workspace sources`);
  }
  for (const sid of second.sourceIds) {
    assert.ok(actualSourceIds.has(sid), `second recall citation "${sid}" must be drawn from actual workspace sources`);
  }
  for (const act of stored.activity) {
    for (const sid of act.sourceIds) {
      assert.ok(typeof sid === 'string' && sid.length > 0, 'activity citation must be nonempty');
      assert.ok(actualSourceIds.has(sid), `activity citation "${sid}" must be drawn from actual workspace sources`);
    }
  }

  const afterMemory = await analyzeWorkspace(id, 1);
  assert.equal(afterMemory.workspace.revision, 2, 'analyze at the pre-memory revision still succeeds');
});

test('edits never erase graph memory', async () => {
  const id = freshId();
  await createWorkspace(id);
  await recallMemory(id, 'Please keep an eye on the Comet launch film for me.');
  const edited = await editWorkspace(id, 1, { kind: 'approval', id: 'ap-c-sam', approved: true });
  assert.equal(edited.revision, 2);
  const recalled = await recallMemory(id, 'Anything on file about the Comet launch film?');
  assert.match(recalled.text, /Memory: 1 earlier note/);
  assert.match(recalled.text, /Comet launch film for me/);
  const client = await rawClient();
  try {
    const g = client.selectGraph(`pact-ws-${id}`);
    const nodes = await g.roQuery<{ n: number }>(`MATCH (:Workspace)-[:HAS_MEMORY]->(m:Memory) RETURN count(m) AS n`);
    assert.equal(nodes.data?.[0]?.n, 2, 'the first note survived the edit');
  } finally {
    await client.close();
  }
});

test('snapshots stay consistent across concurrent writes', async () => {
  const id = freshId();
  await createWorkspace(id);
  const writer = (async () => {
    let revision = 1;
    for (let i = 0; i < 4; i++) {
      const ws = await editWorkspace(id, revision, {
        kind: 'approval', id: 'ap-c-sam', approved: i % 2 === 0,
      });
      revision = ws.revision;
    }
  })();
  const reads: Promise<void>[] = [];
  for (let i = 0; i < 8; i++) {
    reads.push((async () => {
      const ws = await readWorkspace(id);
      assert.ok(ws);
      // Every snapshot must pair a revision with its matching approval state:
      // seed is revision 1 / approved=false, then each edit flips approval and
      // bumps the revision by one (even revision >= 2 <=> approved). No torn reads.
      const approved = ws.approvals.find((a) => a.id === 'ap-c-sam')!.approved;
      assert.equal(approved, ws.revision >= 2 && ws.revision % 2 === 0, `revision ${ws.revision} with approved=${approved}`);
    })());
  }
  await Promise.all([writer, ...reads]);
  const final = await readWorkspace(id);
  assert.ok(final);
  assert.equal(final.revision, 5);
});

test('recallMemory on unknown workspace and invalid message', async () => {
  await expectPactError(recallMemory('never-created-zz', 'hello'), 'workspace_not_found', 400);
  const id = freshId();
  await createWorkspace(id);
  await expectPactError(recallMemory(id, '   '), 'invalid_request', 400);
});

test('workspace ids are validated (opaque server scope)', async () => {
  await expectPactError(createWorkspace('../etc/passwd'), 'invalid_workspace_id', 400);
  await expectPactError(readWorkspace('no'), 'invalid_workspace_id', 400);
});

test('reset (createWorkspace) replaces state and invalidates stale pre-reset writers', async () => {
  const id = freshId();
  const before = await createWorkspace(id);
  await editWorkspace(id, 1, { kind: 'approval', id: 'ap-c-sam', approved: true });
  const after = await createWorkspace(id); // reset
  assert.equal(after.revision, 1);
  assert.equal(after.approvals.find((a) => a.id === 'ap-c-sam')!.approved, false);
  // a writer holding the pre-reset revision 2 loses to the new generation
  await expectPactError(
    editWorkspace(id, 2, { kind: 'editor', id: 'ed-sam', slots: [0] }),
    'stale_revision', 409,
  );
  // proposals list: find proposals helper for type-only usage
  const proposals: Proposal[] = before.proposals;
  assert.deepEqual(proposals, []);
});

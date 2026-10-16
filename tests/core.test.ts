/**
 * PACT core unit tests — pure domain logic, no database required.
 * Run: npm test  (tsx --test tests/*.test.ts)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../src/lib/fixtures';
import { checkPlan, proposeRepairs, stableId, SEARCH_STEP_LIMIT } from '../src/lib/domain';
import { PactError, validateIdempotencyKey, validateMessage, validateRevision, validateWorkspaceEdit, validateWorkspaceId } from '../src/lib/validation';
import type { PlanChange, Proposal, Workspace } from '../src/lib/types';

function fixture(): Workspace {
  return createFixture('ws-core-unit');
}

function withApprovalFlipped(ws: Workspace, approvalId: string, approved: boolean): Workspace {
  return { ...ws, approvals: ws.approvals.map((a) => (a.id === approvalId ? { ...a, approved } : a)) };
}

test('fixture encodes the hero dataset contract', () => {
  const ws = fixture();
  assert.equal(ws.agency, 'Morrow Studio');
  assert.equal(ws.creators.length, 6);
  assert.equal(ws.campaigns.length, 3);
  // three campaigns with distinct creators
  assert.equal(new Set(ws.campaigns.map((c) => c.creatorId)).size, 3);
  // each campaign needs 4 editor-hours before end of Day 1
  for (const cm of ws.commitments) {
    assert.equal(cm.hours, 4, `${cm.id} hours`);
    assert.equal(cm.deadlineDay, 1, `${cm.id} deadline`);
  }
  // only campaign C may flex to Day 2
  assert.deepEqual(
    ws.commitments.map((c) => c.flexUntilDay).sort(),
    [1, 1, 2],
  );
  const alex = ws.editors.find((e) => e.id === 'ed-alex')!;
  const sam = ws.editors.find((e) => e.id === 'ed-sam')!;
  assert.deepEqual(alex.slots, Array.from({ length: 16 }, (_, i) => i));
  assert.ok(sam.slots.length >= 4);
  assert.ok(sam.slots.every((s) => s <= 7), 'Sam only has Day 1 slots');
  // Alex approved for all three campaigns
  for (const campaignId of ['cp-a', 'cp-b', 'cp-c']) {
    assert.ok(ws.approvals.some((a) => a.campaignId === campaignId && a.editorId === 'ed-alex' && a.approved));
  }
  // Sam explicitly unapproved for C, no record for A/B (unknown)
  const samOnC = ws.approvals.find((a) => a.campaignId === 'cp-c' && a.editorId === 'ed-sam')!;
  assert.equal(samOnC.approved, false);
  assert.ok(!ws.approvals.some((a) => a.editorId === 'ed-sam' && a.campaignId !== 'cp-c'));
});

test('triple does not fit Day 1: initial check is infeasible with truthful numbers', () => {
  const ws = fixture();
  const result = checkPlan(ws);
  assert.equal(result.status, 'infeasible');
  assert.equal(result.requiredHours, 12);
  assert.equal(result.availableHours, 8);
  assert.ok(result.conflictIds.includes('cm-c'));
  assert.deepEqual(result.allocations, []);
  // Unknown eligibility for Sam on A/B is reported, never silently used.
  const unknownAssumption = result.assumptions.find((l) => l.includes('ed-sam') && l.includes('cp-a'));
  assert.ok(unknownAssumption, 'assumption about Sam/unknown eligibility present');
  assert.match(unknownAssumption!, /unknown/i);
});

test('pair fits: A+B alone are feasible on Day 1', () => {
  const ws = fixture();
  const result = checkPlan(ws, [], ['cm-a', 'cm-b']);
  assert.equal(result.status, 'feasible');
  assert.equal(result.requiredHours, 8);
  assert.deepEqual(
    result.allocations,
    [
      { commitmentId: 'cm-a', editorId: 'ed-alex', slots: [0, 1, 2, 3] },
      { commitmentId: 'cm-b', editorId: 'ed-alex', slots: [4, 5, 6, 7] },
    ],
  );
});

test('repair works: moving C to Day 2 makes the whole plan feasible', () => {
  const ws = fixture();
  const changes: PlanChange[] = [{ commitmentId: 'cm-c', deadlineDay: 2 }];
  const result = checkPlan(ws, changes);
  assert.equal(result.status, 'feasible');
  assert.deepEqual(
    result.allocations,
    [
      { commitmentId: 'cm-a', editorId: 'ed-alex', slots: [0, 1, 2, 3] },
      { commitmentId: 'cm-b', editorId: 'ed-alex', slots: [4, 5, 6, 7] },
      { commitmentId: 'cm-c', editorId: 'ed-alex', slots: [8, 9, 10, 11] },
    ],
  );
  // evidence paths walk commitment -> campaign -> approval -> editor
  const evidence = result.evidence.find((e) => e.id === 'ev-cm-c')!;
  assert.deepEqual(evidence.labels, ['Commitment', 'Campaign', 'Approval', 'Editor']);
  assert.deepEqual(evidence.nodeIds, ['cm-c', 'cp-c', 'ap-c-alex', 'ed-alex']);
  assert.ok(evidence.sourceIds.includes('src-policy'));
});

test('rejected backup editor: pinning Sam to C is blocked by the explicit approval fact', () => {
  const ws = fixture();
  const changes: PlanChange[] = [{ commitmentId: 'cm-c', editorId: 'ed-sam' }];
  const result = checkPlan(ws, changes);
  assert.equal(result.status, 'infeasible');
  assert.ok(result.conflictIds.includes('ap-c-sam'), 'blocking approval is in conflictIds');
  assert.ok(result.issues.some((i) => i.includes('ap-c-sam') && /not approved/i.test(i)));
});

test('a rejected backup editor is never silently scheduled, even with spare capacity', () => {
  const ws = fixture();
  // Give Sam far more than enough raw hours — the explicit block must still hold.
  const roomy: Workspace = {
    ...ws,
    editors: ws.editors.map((e) => (e.id === 'ed-sam' ? { ...e, slots: [0, 1, 2, 3, 4, 5, 6, 7] } : e)),
  };
  const result = checkPlan(roomy);
  assert.equal(result.status, 'infeasible');
  assert.ok(!JSON.stringify(result.allocations).includes('ed-sam'), 'no allocation uses Sam');
});

test('unknown eligibility (no approval record) is treated as unknown and never scheduled', () => {
  const ws = fixture();
  const changes: PlanChange[] = [{ commitmentId: 'cm-a', editorId: 'ed-sam' }];
  const result = checkPlan(ws, changes);
  assert.equal(result.status, 'infeasible');
  assert.ok(result.issues.some((i) => i.includes('cm-a') && /unknown/i.test(i) && i.includes('ed-sam')));
  assert.ok(!JSON.stringify(result.allocations).includes('ed-sam'));
});

test('new approval fact enables the original Day 1 deadlines', () => {
  const ws = withApprovalFlipped(fixture(), 'ap-c-sam', true);
  const result = checkPlan(ws);
  assert.equal(result.status, 'feasible');
  assert.ok(result.allocations.every((a) => a.slots.every((s) => s <= 7)), 'everything stays on Day 1');
  assert.deepEqual(
    result.allocations.find((a) => a.commitmentId === 'cm-c'),
    { commitmentId: 'cm-c', editorId: 'ed-sam', slots: [0, 1, 2, 3] },
  );
});

test('unknown durations remain unknown: needs_information, never guessed', () => {
  const ws = fixture();
  ws.commitments = ws.commitments.map((c) => (c.id === 'cm-b' ? { ...c, hours: null } : c));
  const result = checkPlan(ws);
  assert.equal(result.status, 'needs_information');
  assert.deepEqual(result.conflictIds, ['cm-b']);
  assert.equal(result.requiredHours, 8); // only the known hours are counted
  assert.deepEqual(result.allocations, []);
  assert.ok(result.issues.some((i) => i.includes('cm-b') && /unknown work hours/i.test(i)));
  assert.ok(result.evidence.some((e) => e.id === 'ev-cm-b' && e.explanation.includes('will not guess')));
});

test('checkPlan is deterministic and does not mutate its input', () => {
  const ws = fixture();
  const before = structuredClone(ws);
  const a = checkPlan(ws, [{ commitmentId: 'cm-c', deadlineDay: 2 }]);
  const b = checkPlan(ws, [{ commitmentId: 'cm-c', deadlineDay: 2 }]);
  assert.deepEqual(a, b);
  assert.deepEqual(ws, before);
});

test('backtracking: Day 1 capacity that disappears is honestly reported', () => {
  const ws = fixture();
  const tight: Workspace = {
    ...ws,
    editors: ws.editors.map((e) => (e.id === 'ed-alex' ? { ...e, slots: [0, 1, 2, 3] } : e)),
  };
  const result = checkPlan(tight);
  assert.equal(result.status, 'infeasible');
  assert.equal(result.availableHours, 4);
});

test('proposeRepairs: move-C proposal (proposed) and Sam-for-C candidate (rejected)', () => {
  const ws = fixture();
  const before = structuredClone(ws);
  const proposals = proposeRepairs(ws);
  assert.deepEqual(ws, before, 'input workspace is not mutated');

  const move = proposals.find((p) => p.status === 'proposed')!;
  assert.ok(move, 'a proposed repair exists');
  assert.deepEqual(move.changes, [{ commitmentId: 'cm-c', deadlineDay: 2 }]);
  assert.equal(move.result.status, 'feasible');
  assert.match(move.title, /Comet launch film edit.* to Day 2/);

  const rejected = proposals.find((p) => p.status === 'rejected')!;
  assert.ok(rejected, 'the rejected backup candidate is surfaced, not hidden');
  assert.deepEqual(rejected.changes, [{ commitmentId: 'cm-c', editorId: 'ed-sam' }]);
  assert.equal(rejected.result.status, 'infeasible');
  assert.ok(rejected.result.conflictIds.includes('ap-c-sam'));

  // A rejected proposal must never become the recommended repair.
  assert.notEqual(move.id, rejected.id);
});

test('proposeRepairs: no repairs when feasible, info proposals when hours unknown', () => {
  const ws = fixture();
  const feasibleWs = withApprovalFlipped(ws, 'ap-c-sam', true);
  assert.deepEqual(proposeRepairs(feasibleWs), []);

  const unknownWs: Workspace = { ...ws, commitments: ws.commitments.map((c) => (c.id === 'cm-c' ? { ...c, hours: null } : c)) };
  const info = proposeRepairs(unknownWs);
  assert.equal(info.length, 1);
  assert.equal(info[0]!.status, 'proposed');
  assert.deepEqual(info[0]!.changes, []);
  assert.equal(info[0]!.result.status, 'needs_information');
});

test('proposal ids are deterministic and content-stable', () => {
  const ws = fixture();
  const a = proposeRepairs(ws);
  const b = proposeRepairs(structuredClone(ws));
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.equal(new Set(a.map((p) => p.id)).size, a.length, 'ids unique within a run');
  const moveA = a.find((p) => p.status === 'proposed')!;
  const sameMoveInB = b.find((p) => p.id === moveA.id)!;
  assert.ok(sameMoveInB, 'same proposal id for same logical content');
  assert.equal(stableId('x'), stableId('x'));
  assert.notEqual(stableId('x'), stableId('y'));
});

test('checkPlan rejects unknown commitment references in changes and selection', () => {
  const ws = fixture();
  assert.throws(() => checkPlan(ws, [{ commitmentId: 'cm-zzz', deadlineDay: 2 }]), PactError);
  assert.throws(() => checkPlan(ws, [], ['cm-zzz']), PactError);
});

test('search is bounded', () => {
  assert.ok(Number.isInteger(SEARCH_STEP_LIMIT) && SEARCH_STEP_LIMIT > 0 && SEARCH_STEP_LIMIT <= 1_000_000);
});

test('validation: workspace ids, revisions, idempotency keys, messages', () => {
  assert.equal(validateWorkspaceId('abcd-1_2'), 'abcd-1_2');
  assert.throws(() => validateWorkspaceId('ab'), PactError);
  assert.throws(() => validateWorkspaceId('../etc'), PactError);
  assert.throws(() => validateWorkspaceId('x'.repeat(65)), PactError);

  assert.equal(validateRevision(3), 3);
  assert.throws(() => validateRevision(0), PactError);
  assert.throws(() => validateRevision(1.5), PactError);

  assert.equal(validateIdempotencyKey('key-1234'), 'key-1234');
  assert.throws(() => validateIdempotencyKey('short'), PactError);
  assert.throws(() => validateIdempotencyKey('has space'), PactError);

  assert.equal(validateMessage('  What about Comet?  '), 'What about Comet?');
  assert.throws(() => validateMessage('   '), PactError);
  assert.throws(() => validateMessage('x'.repeat(2001)), PactError);
});

test('validation: workspace edits', () => {
  assert.deepEqual(
    validateWorkspaceEdit({ kind: 'commitment', id: 'cm-a', hours: null }),
    { kind: 'commitment', id: 'cm-a', hours: null },
  );
  assert.deepEqual(
    validateWorkspaceEdit({ kind: 'commitment', id: 'cm-a', deadlineDay: 2 }),
    { kind: 'commitment', id: 'cm-a', deadlineDay: 2 },
  );
  assert.deepEqual(
    validateWorkspaceEdit({ kind: 'approval', id: 'ap-c-sam', approved: true }),
    { kind: 'approval', id: 'ap-c-sam', approved: true },
  );
  assert.deepEqual(
    validateWorkspaceEdit({ kind: 'commitment', id: 'cm-a', hours: 4, deadlineDay: 1 }),
    { kind: 'commitment', id: 'cm-a', hours: 4, deadlineDay: 1 },
  );
  assert.deepEqual(
    validateWorkspaceEdit({ kind: 'event', id: 'ev-brand', start: 20, end: 22 }),
    { kind: 'event', id: 'ev-brand', start: 20, end: 22 },
  );
});

test('validation: editor slots normalize sorted+unique, duplicates rejected', () => {
  assert.deepEqual(validateWorkspaceEdit({ kind: 'editor', id: 'ed-sam', slots: [3, 1, 0] }), {
    kind: 'editor', id: 'ed-sam', slots: [0, 1, 3],
  });
  assert.throws(() => validateWorkspaceEdit({ kind: 'editor', id: 'ed-sam', slots: [1, 1] }), PactError);
  assert.throws(() => validateWorkspaceEdit({ kind: 'editor', id: 'ed-sam', slots: [16] }), PactError);
  assert.throws(() => validateWorkspaceEdit({ kind: 'editor', id: 'ed-sam', slots: [-1] }), PactError);
});

test('validation: bad edits throw PactError with 400 status', () => {
  const cases: unknown[] = [
    null,
    {},
    { kind: 'nope', id: 'x-y' },
    { kind: 'commitment', id: 'cm-a' }, // no fields
    { kind: 'commitment', id: 'cm-a', hours: -1 },
    { kind: 'commitment', id: 'cm-a', hours: 0 },
    { kind: 'commitment', id: 'cm-a', hours: 9 },
    { kind: 'commitment', id: 'cm-a', hours: 4.5 },
    { kind: 'commitment', id: 'cm-a', deadlineDay: 3 },
    { kind: 'approval', id: 'ap-c-sam', approved: 'yes' },
    { kind: 'event', id: 'ev-kickoff', start: 5, end: 5 },
    { kind: 'event', id: 'ev-kickoff', start: -1, end: 4 },
    { kind: 'event', id: 'ev-kickoff', start: 2, end: 49 },
  ];
  for (const bad of cases) {
    try {
      validateWorkspaceEdit(bad);
      assert.fail(`expected PactError for ${JSON.stringify(bad)}`);
    } catch (err) {
      assert.ok(err instanceof PactError, `PactError for ${JSON.stringify(bad)}`);
      assert.equal((err as PactError).status, 400);
      assert.equal((err as PactError).code, 'invalid_request');
    }
  }
});

test('event edits cover both full days (0..48, end exclusive); commitment hours stay bounded 1..8', () => {
  assert.deepEqual(validateWorkspaceEdit({ kind: 'event', id: 'ev-brand', start: 40, end: 48 }), {
    kind: 'event', id: 'ev-brand', start: 40, end: 48,
  });
  for (const hours of [0, 9]) {
    assert.throws(() => validateWorkspaceEdit({ kind: 'commitment', id: 'cm-a', hours }), PactError);
  }
});

test('event edits validate their hour range', () => {
  assert.deepEqual(validateWorkspaceEdit({ kind: 'event', id: 'ev-brand', start: 20, end: 22 }), {
    kind: 'event', id: 'ev-brand', start: 20, end: 22,
  });
});

test('the initial conflict is joint: every pair fits, so all three are in conflictIds', () => {
  const ws = fixture();
  const result = checkPlan(ws);
  assert.equal(result.status, 'infeasible');
  for (const id of ['cm-a', 'cm-b', 'cm-c']) {
    assert.ok(result.conflictIds.includes(id), `${id} is part of the joint conflict`);
  }
  assert.ok(result.issues.some((i) => /[Jj]oint conflict/.test(i)), 'joint phrasing, not a per-task blame');
});

test('editing cannot be scheduled before its release day', () => {
  const ws = fixture();
  ws.commitments = ws.commitments.map((c) => (c.id === 'cm-c' ? { ...c, releaseDay: 2, deadlineDay: 2 } : c));
  ws.editors = ws.editors.map((e) => ({ ...e, slots: e.slots.filter((s) => s < 8) }));
  const result = checkPlan(ws);
  assert.notEqual(result.status, 'feasible');
  assert.ok(result.issues.some((i) => i.includes('Day 2..2')), 'diagnostic names the release window');
});

test('overlapping events for one creator block the plan; adjacent windows fit', () => {
  const ws = withApprovalFlipped(fixture(), 'ap-c-sam', true);
  ws.events[1] = { ...ws.events[1]!, creatorId: ws.events[0]!.creatorId, start: 0, end: 1 };
  const conflicting = checkPlan(ws);
  assert.equal(conflicting.status, 'infeasible');
  assert.ok(conflicting.conflictIds.includes('ev-kickoff'));
  assert.ok(conflicting.conflictIds.includes('ev-brand'));
  ws.events[1]!.start = 1;
  ws.events[1]!.end = 2;
  assert.equal(checkPlan(ws).status, 'feasible', 'end-exclusive adjacent windows fit');
});

test('availableHours counts the union of eligible editor-hours, not one commitment max', () => {
  const ws = withApprovalFlipped(fixture(), 'ap-c-sam', true);
  const result = checkPlan(ws);
  assert.equal(result.status, 'feasible');
  // Union of eligible (editor, slot) pairs: Alex {0..7} for A/B/C plus Sam {0..3}
  // for C => 8 + 4 = 12. Sam's hours are counted once even though he is eligible
  // for campaign C alongside Alex — never double-counted per campaign.
  assert.equal(result.availableHours, 12);
});

test('bounds: more than six commitments or tasks beyond eight hours are unsupported', () => {
  const ws = fixture();
  const tooMany = structuredClone(ws);
  for (let i = 0; tooMany.commitments.length <= 6; i++) {
    tooMany.commitments.push({
      id: `cm-x${i}`, campaignId: 'cp-a', title: `extra ${i}`, hours: 1,
      releaseDay: 1, deadlineDay: 1, flexUntilDay: 1, status: 'committed',
    });
  }
  assert.throws(() => checkPlan(tooMany), (err) => err instanceof PactError && err.code === 'invalid_request');
  const tooLong = structuredClone(ws);
  tooLong.commitments[0]!.hours = 9;
  assert.throws(() => checkPlan(tooLong), (err) => err instanceof PactError && err.code === 'invalid_request');
});

test('deadline changes beyond flexUntilDay are rejected inside checkPlan', () => {
  const ws = fixture();
  assert.throws(() => checkPlan(ws, [{ commitmentId: 'cm-a', deadlineDay: 2 }]), PactError);
  assert.throws(() => checkPlan(ws, [{ commitmentId: 'cm-c', deadlineDay: 2 }, { commitmentId: 'cm-a', deadlineDay: 2 }]), PactError);
});

test('proposals carry sourceVersions for version-checked approval', () => {
  const ws = fixture();
  const proposals: Proposal[] = proposeRepairs(ws);
  for (const p of proposals) {
    assert.equal(p.sourceVersions['src-policy'], 1);
    assert.equal(p.sourceVersions['src-cal'], 1);
    assert.equal(p.revision, ws.revision);
    assert.ok(p.createdAt.endsWith('Z'));
  }
});

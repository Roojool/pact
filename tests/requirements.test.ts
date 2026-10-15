import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../src/lib/fixtures';
import { checkPlan } from '../src/lib/domain';
import { validateWorkspaceEdit } from '../src/lib/validation';

test('editing cannot begin before its release day', () => {
  const ws = createFixture('requirement-release');
  ws.commitments = [{ ...ws.commitments[2], releaseDay: 2, deadlineDay: 2 }];
  ws.editors.forEach(editor => { editor.slots = editor.slots.filter(slot => slot < 8); });
  assert.notEqual(checkPlan(ws).status, 'feasible');
});

test('the same creator cannot attend overlapping events even when editing fits', () => {
  const ws = createFixture('requirement-events');
  ws.approvals.find(approval => approval.id === 'ap-c-sam')!.approved = true;
  ws.events[1] = { ...ws.events[1], creatorId: ws.events[0].creatorId, start: 0, end: 1 };
  assert.equal(checkPlan(ws).status, 'infeasible');
  ws.events[1].start = 1;
  ws.events[1].end = 2;
  assert.equal(checkPlan(ws).status, 'feasible', 'end-exclusive adjacent attendance windows fit');
});

test('event edits support both full days while editing tasks remain bounded', () => {
  assert.deepEqual(validateWorkspaceEdit({ kind: 'event', id: 'ev-brand', start: 40, end: 48 }), { kind: 'event', id: 'ev-brand', start: 40, end: 48 });
  for (const hours of [0, 9]) assert.throws(() => validateWorkspaceEdit({ kind: 'commitment', id: 'cm-a', hours }));
});

test('all source references in a check resolve to a recorded source', () => {
  const ws = createFixture('requirement-sources');
  for (const hours of [4, null]) {
    ws.commitments[2].hours = hours;
    const result = checkPlan(ws);
    for (const path of result.evidence) {
      assert.ok(path.sourceIds.length > 0);
      for (const id of path.sourceIds) assert.ok(ws.sources.some(source => source.id === id), `unresolved source: ${id}`);
    }
  }
});

test('the initial conflict involves all three promises, with every pair feasible', () => {
  const ws = createFixture('requirement-conflict');
  for (const removed of ws.commitments) {
    const ids = ws.commitments.filter(item => item.id !== removed.id).map(item => item.id);
    assert.equal(checkPlan(ws, [], ids).status, 'feasible');
  }
  for (const item of ws.commitments) assert.ok(checkPlan(ws).conflictIds.includes(item.id), `${item.id} is part of the joint conflict`);
});

test('candidate changes cannot exceed the flexibility recorded in the brief', () => {
  const ws = createFixture('requirement-flex');
  assert.throws(() => checkPlan(ws, [{ commitmentId: 'cm-a', deadlineDay: 2 }]));
});

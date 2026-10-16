import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardState } from '../src/lib/dashboard';
import { createFixture } from '../src/lib/fixtures';
import { checkPlan } from '../src/lib/domain';
import type { Analysis } from '../src/lib/types';

test('a fresh dashboard does not invent a check or infer an approval', () => {
  const ws = createFixture('dashboard-fresh');
  const state = dashboardState(ws, null);
  assert.equal(state.status, 'unchecked');
  assert.equal(state.knownHours, 12);
  assert.equal(state.readyOptions, 0);
  assert.equal(state.affected.size, 0);
  ws.commitments[0].hours = null;
  assert.equal(dashboardState(ws, null).unknownHours, true);
  assert.equal(dashboardState(ws, null).knownHours, 8);
});

test('the graph follows the actual joint check, including unknown and search limits', () => {
  const ws = createFixture('dashboard-check');
  const analysis: Analysis = { check: checkPlan(ws), proposals: [], activity: [], mode: 'deterministic' };
  assert.equal(dashboardState(ws, analysis).status, 'infeasible');
  assert.equal(dashboardState(ws, analysis).affected.size, 3);
  for (const status of ['needs_information', 'search_limit'] as const) {
    assert.equal(dashboardState(ws, { ...analysis, check: { ...analysis.check, status } }).status, status);
  }
});

test('previous bookings do not certify an edited plan or turn a proposal into approval', () => {
  const ws = createFixture('dashboard-saved');
  ws.revision = 3;
  ws.decisions = [{ id: 'dec-1', proposalId: 'p1', title: 'Day 2', revision: 2, createdAt: '', idempotencyKey: 'test', allocations: [], tasks: [], sourceVersions: {}, note: '' }];
  assert.equal(dashboardState(ws, null).status, 'saved');
  ws.revision++;
  assert.equal(dashboardState(ws, null).status, 'changed');
  const analysis: Analysis = { check: { ...checkPlan(ws), status: 'feasible' }, proposals: [], activity: [], mode: 'deterministic' };
  assert.equal(dashboardState(ws, analysis).status, 'feasible');
  assert.equal(dashboardState(ws, analysis).decision, undefined);
});

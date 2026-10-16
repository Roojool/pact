import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySetup, missingSetupFields, setupToWorkspace, validateSetupDraft } from '../src/lib/business-setup';
import { checkPlan, proposeRepairs } from '../src/lib/domain';
import { setupFixture } from './setup-fixture';
import { describeCheck } from '../src/components/ui-copy';

test('a custom business has no hidden fixture people, bookings, or permissions', () => {
  const draft = setupFixture();
  draft.permissions = [];
  draft.jobs[0].hours = null;
  const ws = setupToWorkspace('setup-pure', draft, 'Entered by the owner.');
  assert.equal(ws.agency, 'Sunroom Studio');
  assert.equal(ws.creators.length, 0);
  assert.equal(ws.approvals.length, 0);
  assert.equal(ws.decisions.length, 0);
  assert.equal(ws.commitments[0].hours, null);
  assert.equal(checkPlan(ws).status, 'needs_information');
  assert(!JSON.stringify(ws).includes('Morrow'));
});

test('the demo creates a real shortage, a permitted repair, then a new shortage after an edit', () => {
  const ws = setupToWorkspace('setup-story', setupFixture(), 'Owner confirmation');
  assert.equal(checkPlan(ws).status, 'infeasible');
  assert.equal(checkPlan(ws).requiredHours, 12);
  const move = proposeRepairs(ws).find(p => p.result.status === 'feasible');
  assert(move);
  ws.commitments[2].deadlineDay = 2;
  assert.equal(checkPlan(ws).status, 'feasible');
  ws.commitments[0].hours = 5;
  assert.equal(checkPlan(ws).status, 'infeasible');
  assert.match(describeCheck(checkPlan(ws)).diagnosis, /deadline/);
  assert.doesNotMatch(describeCheck(checkPlan(ws)).diagnosis, /still needs an editor/);
});

test('invalid references, duplicate hours, unsupported ranges and fabricated quotes are rejected', () => {
  const raw = setupFixture();
  raw.permissions[0].jobIndex = 5;
  assert.throws(() => validateSetupDraft(raw, ''), /references/);
  raw.permissions[0].jobIndex = 0;
  raw.editors[0].slots = [0, 0];
  assert.throws(() => validateSetupDraft(raw, ''), /duplicate/);
  raw.editors[0].slots = [0];
  raw.jobs[0].evidence = 'not in the note';
  assert.throws(() => validateSetupDraft(raw, 'real note'), /citation/);
  raw.jobs[0].evidence = '';
  raw.jobs[0].hours = 9;
  assert.throws(() => setupToWorkspace('setup-invalid', raw, ''));
  assert(missingSetupFields(emptySetup()).length >= 4);
});

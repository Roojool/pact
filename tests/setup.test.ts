import test from 'node:test';
import assert from 'node:assert/strict';
import { burgerExample, BURGER_DEMO_NOTE, emptySetup, missingSetupFields, SETUP_DEMO_NOTE, setupToWorkspace, validateSetupDraft } from '../src/lib/business-setup';
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

test('padded quotes normalize to their verbatim form and whitespace-only quotes are no citation', () => {
  const raw = setupFixture();
  raw.editors[0].evidence = `  ${'Neha edits 9–5 on Day 1 and Day 2.'}  `;
  raw.jobs[0].evidence = '   ';
  const draft = validateSetupDraft(raw, SETUP_DEMO_NOTE);
  assert.equal(draft.editors[0].evidence, 'Neha edits 9–5 on Day 1 and Day 2.', 'padded real quote keeps its verbatim text');
  assert.equal(draft.jobs[0].evidence, '', 'whitespace-only evidence is treated as absent, not as a quote');
});

test('burger shop uses real staff constraints and moves only flexible training', () => {
  const ws = setupToWorkspace('burger-test', burgerExample(), BURGER_DEMO_NOTE);
  assert.equal(ws.businessType, 'food_shop');
  assert.deepEqual(missingSetupFields(burgerExample()), []);
  const check = checkPlan(ws);
  assert.equal(check.status, 'infeasible');
  assert.equal(check.requiredHours, 6);
  assert.equal(check.availableHours, 4);
  const repairs = proposeRepairs(ws).filter(p => p.result.status === 'feasible');
  assert.equal(repairs.length, 1);
  assert.deepEqual(repairs[0].changes, [{ commitmentId: 'cm-3', deadlineDay: 2 }]);
  assert(repairs[0].result.allocations.every(a => a.editorId === 'ed-1'));
  assert.throws(() => checkPlan(ws, [{ commitmentId: 'cm-1', deadlineDay: 2 }]), /exceeds the flexibility/);
  assert.doesNotMatch(JSON.stringify(ws), /Morrow|Aurora|Comet|editing/);
});

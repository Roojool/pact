import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBusinessWorkspace, readWorkspace, analyzeWorkspace, approveProposal, editWorkspace, closeGraphConnection } from '../src/lib/graph';
import { setupFixture } from './setup-fixture';
import { burgerExample, BURGER_DEMO_NOTE } from '../src/lib/business-setup';
after(closeGraphConnection);

test('burger identity, allowed team and fixed opening tasks survive persistence and booking', async () => {
  const id = `setup-${randomUUID()}`;
  await createBusinessWorkspace(id, burgerExample(), BURGER_DEMO_NOTE, randomUUID());
  const loaded = await readWorkspace(id);
  assert.equal(loaded!.businessType, 'food_shop');
  assert.equal(loaded!.agency, 'BunStop');
  const result = await analyzeWorkspace(id, 1);
  assert.equal(result.analysis.check.availableHours, 4);
  const proposal = result.analysis.proposals.find(p => p.result.status === 'feasible')!;
  const booked = await approveProposal(id, result.workspace.revision, proposal.id, randomUUID());
  assert.equal(booked.workspace.commitments[0].deadlineDay, 1);
  assert.equal(booked.workspace.commitments[1].deadlineDay, 1);
  assert.equal(booked.workspace.commitments[2].deadlineDay, 2);
  assert(booked.decision.allocations.every(a => a.editorId === 'ed-1'));
});

test('atomic setup survives reload, concurrent retries, approval and editing without replacing another company', async () => {
  const id = `setup-${randomUUID()}`;
  const draft = setupFixture();
  const key = randomUUID();
  const [first, retry] = await Promise.all([createBusinessWorkspace(id, draft, 'Owner confirmation', key), createBusinessWorkspace(id, draft, 'Owner confirmation', key)]);
  assert.deepEqual(first, retry);
  assert.equal(first.commitments.length, 3);
  assert.equal(first.agency, 'Sunroom Studio');
  assert.equal(first.kind, 'custom');
  assert.equal(first.creators.length, 0);
  assert.equal(first.campaigns.length, 3, 'jobs without creators must survive graph traversal');
  await closeGraphConnection();
  assert.deepEqual(await readWorkspace(id), first);
  await assert.rejects(createBusinessWorkspace(id, { ...draft, companyName: 'Overwritten' }, 'Owner confirmation', key), /already exists/);
  const secondId = `setup-${randomUUID()}`;
  await createBusinessWorkspace(secondId, { ...draft, companyName: 'Second business' }, '', randomUUID());
  assert.equal((await readWorkspace(id))!.agency, 'Sunroom Studio');
  assert.equal((await readWorkspace(secondId))!.agency, 'Second business');
  const result = await analyzeWorkspace(id, 1);
  assert.equal(result.analysis.check.status, 'infeasible');
  const move = result.analysis.proposals.find(p => p.result.status === 'feasible')!;
  assert(move);
  const approved = await approveProposal(id, result.workspace.revision, move.id, randomUUID());
  assert.equal(approved.decision.allocations.length, 3);
  const edited = await editWorkspace(id, approved.workspace.revision, { kind: 'commitment', id: 'cm-1', hours: 5 });
  assert.equal(edited.decisions.length, 1);
  assert.equal((await analyzeWorkspace(id, edited.revision)).analysis.check.status, 'infeasible');
});

test('an invalid setup creates no partial graph or sample fallback', async () => {
  const id = `setup-${randomUUID()}`;
  const draft = setupFixture(); draft.editors[0].name = '';
  await assert.rejects(createBusinessWorkspace(id, draft, '', randomUUID()));
  assert.equal(await readWorkspace(id), null);
});

test('unknown client permissions can be recorded later with sources and revision guards', async () => {
  const id = `setup-${randomUUID()}`;
  const draft = setupFixture(); draft.permissions = [];
  await createBusinessWorkspace(id, draft, '', randomUUID());
  const ws = await editWorkspace(id, 1, { kind: 'permission', editorId: 'ed-1', campaignId: 'cp-1', approved: true });
  assert.equal(ws.approvals.length, 1);
  assert.equal(ws.approvals[0].approved, true);
  assert(ws.sources.some(s => s.id === ws.approvals[0].sourceId));
  await assert.rejects(editWorkspace(id, 1, { kind: 'permission', editorId: 'ed-1', campaignId: 'cp-2', approved: true }), /revision/);
  const changed = await editWorkspace(id, 2, { kind: 'permission', editorId: 'ed-1', campaignId: 'cp-1', approved: false });
  assert.equal(changed.approvals.length, 1);
  assert.equal(changed.approvals[0].approved, false);
});

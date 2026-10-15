import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Workspace, Analysis, Decision } from '../src/lib/types';

const base = process.env.PACT_BASE_URL ?? 'http://127.0.0.1:3000';
async function workspace() {
  const res = await fetch(`${base}/api/workspace`);
  assert.equal(res.status, 200, await res.clone().text());
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, state: (await res.json()).workspace as Workspace };
}
async function send(cookie: string, path: string, body: unknown, method = 'POST') {
  const res = await fetch(`${base}/api/${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
test('browser API: isolated workspaces, checked approval, stale rejection and fresh memory', async () => {
  const a = await workspace();
  const b = await workspace();
  assert.notEqual(a.state.id, b.state.id);
  const initial = await send(a.cookie, 'analyze', { revision: a.state.revision, live: false });
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  assert.equal((initial.data.analysis as Analysis).check.status, 'infeasible');
  const first = (initial.data.analysis as Analysis).proposals.find(p => p.result.status === 'feasible');
  assert.ok(first);
  const foreign = await send(b.cookie, 'approve', { revision: b.state.revision, proposalId: first.id, idempotencyKey: randomUUID() });
  assert.ok(foreign.status >= 400, 'A proposal must not be usable in B');
  const beforeEdit = initial.data.workspace as Workspace;
  const changed = await send(a.cookie, 'workspace', { revision: beforeEdit.revision, edit: { kind: 'commitment', id: beforeEdit.commitments[0].id, hours: 3 } }, 'PATCH');
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  const stale = await send(a.cookie, 'approve', { revision: beforeEdit.revision, proposalId: first.id, idempotencyKey: randomUUID() });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  const checked = await send(a.cookie, 'analyze', { revision: changed.data.workspace.revision, live: false });
  assert.equal(checked.status, 200, JSON.stringify(checked.data));
  const proposal = (checked.data.analysis as Analysis).proposals.find(p => p.result.status === 'feasible');
  assert.ok(proposal);
  const command = { revision: checked.data.workspace.revision, proposalId: proposal.id, idempotencyKey: randomUUID() };
  const approved = await send(a.cookie, 'approve', command);
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.ok((approved.data.decision as Decision).allocations.length);
  const retry = await send(a.cookie, 'approve', command);
  assert.equal(retry.status, 200, JSON.stringify(retry.data));
  assert.equal(retry.data.decision.id, approved.data.decision.id);
  const handoff = await send(a.cookie, 'memory', { message: 'What was approved and what happens next?', live: false });
  assert.equal(handoff.status, 200, JSON.stringify(handoff.data));
  assert.ok(handoff.data.reply.text.length > 30);
  assert.equal(handoff.data.workspace.decisions.length, 1);
  const other = await fetch(`${base}/api/workspace`, { headers: { cookie: b.cookie } }).then(r => r.json());
  assert.equal(other.workspace.decisions.length, 0);
  const badCookie = a.cookie.replace('pact_workspace=', 'pact_workspace=changed');
  assert.equal((await send(badCookie, 'analyze', { revision: 1 })).status, 401);
});

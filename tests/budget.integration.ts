/**
 * Integration test for the persistent FalkorDB budget ledger.
 *
 * Requires a local FalkorDB (default redis://127.0.0.1:16379). Uses an isolated
 * key namespace and cleans up only its own test data. Makes NO provider calls.
 *
 * Run: npm run test:integration
 */

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { FalkorDB } from 'falkordb';
import { BudgetExceededError, createBudgetLedger, type BudgetLedger } from '../src/lib/budget';

const URL = process.env.FALKORDB_URL?.trim() || 'redis://127.0.0.1:16379';
const GRAPH = 'pact_budget_integration_test';
const ENV = { FALKORDB_URL: URL, PACT_BUDGET_GRAPH: GRAPH, PACT_API_BUDGET_USD: '5' };
const PREFIX = `pact_budget:${GRAPH}`;

let admin: FalkorDB;
const ledgers: BudgetLedger[] = [];

function makeLedger(): BudgetLedger {
  const ledger = createBudgetLedger(ENV);
  ledgers.push(ledger);
  return ledger;
}

async function cleanup(): Promise<void> {
  const client = await admin.connection;
  const keys = await client.keys(`${PREFIX}:*`);
  for (const key of keys) await client.del(String(key));
}

before(async () => {
  admin = await FalkorDB.connect({ url: URL });
});

beforeEach(async () => {
  await cleanup();
});

after(async () => {
  try {
    await cleanup();
  } finally {
    for (const ledger of ledgers) await ledger.close().catch(() => undefined);
    await admin.close();
  }
});

test('integration: ledger starts empty with the configured $5 cap', async () => {
  const ledger = makeLedger();
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.totalUsd, 5);
  assert.equal(snapshot.spentUsd, 0);
  assert.equal(snapshot.reservedUsd, 0);
  assert.equal(snapshot.remainingUsd, 5);
});

test('integration: concurrent independent instances never oversubscribe', async () => {
  const a = makeLedger();
  const b = makeLedger();
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 === 0 ? a : b)
        .reserve(`conc:${i}`, 1)
        .then(() => 'ok' as const)
        .catch((error: unknown) =>
          error instanceof BudgetExceededError ? ('blocked' as const) : (`err:${String(error)}` as const),
        ),
    ),
  );
  assert.equal(results.filter((r) => r === 'ok').length, 5, 'exactly five $1 reservations fit in a $5 cap');
  const snapshot = await a.snapshot();
  assert.equal(snapshot.reservedUsd, 5);
  assert.equal(snapshot.remainingUsd, 0);
});

test('integration: spend and reservations survive a restart (new instance)', async () => {
  const writer = makeLedger();
  await writer.reserve('persist:1', 1);
  await writer.reserve('persist:2', 1);
  await writer.settle('persist:1', 0.25);
  await writer.release('persist:2');
  await writer.close();

  const reader = makeLedger();
  const snapshot = await reader.snapshot();
  assert.equal(snapshot.spentUsd, 0.25, 'settled spend persisted across a restart');
  assert.equal(snapshot.reservedUsd, 0, 'settled and released reservations are no longer open');
});

test('integration: settle then release is idempotent and atomic', async () => {
  const ledger = makeLedger();
  await ledger.reserve('idem:1', 0.5);
  await ledger.settle('idem:1', 0.2);
  await ledger.settle('idem:1', 0.2);
  await ledger.release('idem:1');
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.spentUsd, 0.2, 'double settle does not double count');
  assert.equal(snapshot.reservedUsd, 0, 'release after settle is a no-op');
  const record = (await ledger.listReservations()).find((r) => r.id === 'idem:1');
  assert.equal(record?.status, 'settled');
  assert.equal(record?.settledUsd, 0.2);
});

test('integration: a reservation over the remaining cap is rejected', async () => {
  const ledger = makeLedger();
  await assert.rejects(() => ledger.reserve('over:1', 6), (error: unknown) => {
    assert.ok(error instanceof BudgetExceededError);
    return true;
  });
});

test('integration: listReservations reflects every status', async () => {
  const ledger = makeLedger();
  await ledger.reserve('status:open', 0.1);
  await ledger.reserve('status:settled', 0.1);
  await ledger.settle('status:settled', 0.05);
  await ledger.reserve('status:released', 0.1);
  await ledger.release('status:released');

  const byId = new Map((await ledger.listReservations()).map((r) => [r.id, r.status]));
  assert.equal(byId.get('status:open'), 'reserved');
  assert.equal(byId.get('status:settled'), 'settled');
  assert.equal(byId.get('status:released'), 'released');
});

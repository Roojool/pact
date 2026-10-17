import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import type { Analysis, AgentReply, Workspace } from '../src/lib/types';
import {
  BudgetExceededError,
  BudgetLedger,
  createMemoryBudgetLedger,
  MemoryBudgetStore,
  round6,
} from '../src/lib/budget';
import {
  __resetAgentDeps,
  __setAgentDeps,
  buildAgentContext,
  collectKnownSourceIds,
  estimateCostUsd,
  estimateInputTokenCeiling,
  estimateReservationUsd,
  extractOutputText,
  extractUsage,
  MemoryHandoffMemory,
  runAgentAnalysis,
  runAgentMemory,
  validateAssessment,
  validateMemoryOutput,
  validateProducerAnalysis,
} from '../src/lib/agents';

/* ------------------------------------------------------------------ *
 * Fictional fixtures (no real agency data)
 * ------------------------------------------------------------------ */

function fixtureWorkspace(): Workspace {
  return {
    id: 'ws-test',
    agency: 'Morrow Studio',
    revision: 3,
    creators: [
      { id: 'cr_a', name: 'Ava', handle: '@ava', category: 'beauty', initials: 'AV', color: '#111' },
      { id: 'cr_b', name: 'Ben', handle: '@ben', category: 'tech', initials: 'BE', color: '#222' },
    ],
    people: [
      { id: 'p_am', name: 'Alex', role: 'Account Manager' },
      { id: 'p_pr', name: 'Sam', role: 'Producer' },
    ],
    sources: [
      { id: 'src_brief', title: 'Q3 brief', kind: 'brief', revision: 3, excerpt: 'Ship three campaigns.', updatedAt: '2026-10-01T00:00:00.000Z' },
      { id: 'src_policy', title: 'Eligibility policy', kind: 'policy', revision: 2, excerpt: 'Editors need approval.', updatedAt: '2026-10-01T00:00:00.000Z' },
      { id: 'src_cal', title: 'Calendar', kind: 'calendar', revision: 1, excerpt: 'Day 1 and Day 2.', updatedAt: '2026-10-01T00:00:00.000Z' },
    ],
    campaigns: [
      { id: 'c_a', name: 'Alpha', brand: 'Acme', creatorId: 'cr_a', ownerId: 'p_am', sourceId: 'src_brief', category: 'beauty', color: '#333' },
      { id: 'c_b', name: 'Beta', brand: 'Borealis', creatorId: 'cr_b', ownerId: 'p_am', sourceId: 'src_brief', category: 'tech', color: '#444' },
    ],
    commitments: [
      { id: 'k_a', campaignId: 'c_a', title: 'Edit Alpha', hours: 4, releaseDay: 1, deadlineDay: 1, flexUntilDay: 1, status: 'committed' },
      { id: 'k_b', campaignId: 'c_b', title: 'Edit Beta', hours: 4, releaseDay: 1, deadlineDay: 1, flexUntilDay: 2, status: 'proposed' },
    ],
    editors: [
      { id: 'e_alex', name: 'Alex', initials: 'AL', slots: [0, 1, 2, 3, 4, 5, 6, 7], sourceId: 'src_cal' },
      { id: 'e_sam', name: 'Sam', initials: 'SA', slots: [0, 1, 2, 3], sourceId: 'src_cal' },
    ],
    approvals: [
      { id: 'ap_a', campaignId: 'c_a', editorId: 'e_alex', approved: true, sourceId: 'src_policy' },
      { id: 'ap_b', campaignId: 'c_b', editorId: 'e_sam', approved: false, sourceId: 'src_policy' },
    ],
    events: [{ id: 'ev_a', campaignId: 'c_a', creatorId: 'cr_a', title: 'Shoot', start: 0, end: 2, sourceId: 'src_cal' }],
    proposals: [],
    decisions: [],
    activity: [],
  };
}

function fixtureAnalysis(): Analysis {
  return {
    check: {
      status: 'infeasible',
      summary: 'Beta cannot meet its Day 1 deadline as planned.',
      requiredHours: 8,
      availableHours: 8,
      conflictIds: ['k_b'],
      issues: ['Sam is not approved for campaign B.'],
      allocations: [],
      evidence: [
        { id: 'ev_path_1', labels: ['Commitment', 'Approval'], nodeIds: ['k_b', 'ap_b'], sourceIds: ['src_policy', 'src_brief'], explanation: 'Beta relies on an unapproved editor.' },
      ],
      assumptions: [],
    },
    proposals: [],
    activity: [],
    mode: 'deterministic',
  };
}

function fixtureFallback(): AgentReply {
  return {
    text: 'Deterministic recall: Beta is at risk on Day 1.',
    activity: [],
    sourceIds: ['src_brief'],
    mode: 'deterministic',
  };
}

const AM_PAYLOAD = {
  assessment: 'Beta is at risk because its editor is not approved.',
  risks: ['Beta deadline Day 1'],
  sourceIds: ['src_policy', 'src_ghost'],
};
const PRODUCER_PAYLOAD = {
  summary: 'Move Beta to Day 2.',
  warnings: [],
  sourceIds: ['src_policy', 'src_ghost'],
  activities: [{ text: 'Request approval or move Beta to Day 2.', sourceIds: ['src_policy'] }],
};
const MEMORY_PAYLOAD = {
  reply: 'Beta is at risk because Sam is not approved for it (src_policy).',
  sourceIds: ['src_policy', 'src_ghost'],
  confidence: 'high',
};

function responsesBody(payload: unknown, usage: Record<string, unknown> = {}) {
  return {
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }],
    usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 0 }, ...usage },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Direct Responses transport: dispatch by the requested schema name. */
function directFetch(bySchema: Record<string, unknown>, counter?: { calls: number }): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    if (counter) counter.calls += 1;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const name = ((body.text as Record<string, unknown>)?.format as Record<string, unknown>)?.name;
    const payload = bySchema[String(name)];
    if (payload instanceof Response) return payload;
    return jsonResponse(responsesBody(payload));
  }) as typeof fetch;
}

/** eve transport: health + session + NDJSON stream, keyed by role port. */
function eveFetch(options: { am?: unknown; producer?: unknown; sessions?: string[]; healthStatus?: number }): typeof fetch {
  const payloadBySession = new Map<string, unknown>();
  let sessionSeq = 0;
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/eve/v1/health')) {
      return jsonResponse({ ok: true, status: 'ready', workflowId: 'wf_test' }, options.healthStatus ?? 200);
    }
    if (url.endsWith('/eve/v1/session') && init?.method === 'POST') {
      const isProducer = url.includes(':3011');
      const sessionId = isProducer ? `sess_producer_${sessionSeq++}` : `sess_am_${sessionSeq++}`;
      payloadBySession.set(sessionId, isProducer ? options.producer : options.am);
      options.sessions?.push(sessionId);
      return jsonResponse({ ok: true, sessionId, status: 'accepted' });
    }
    if (url.includes('/stream')) {
      const sessionId = url.split('/session/')[1]?.split('/')[0] ?? '';
      const payload = payloadBySession.get(decodeURIComponent(sessionId));
      const lines = [
        JSON.stringify({ type: 'result.completed', data: { result: payload } }),
        JSON.stringify({ type: 'session.waiting', data: { usage: { costUsd: 0.004 } } }),
      ];
      return new Response(`${lines.join('\n')}\n`, { status: 200 });
    }
    if (url.endsWith('/reset')) return jsonResponse({ ok: true });
    return jsonResponse({ error: 'unexpected route' }, 404);
  }) as typeof fetch;
}

/* ------------------------------------------------------------------ *
 * Budget ledger
 * ------------------------------------------------------------------ */

test('budget: reserve, settle and snapshot track spend', async () => {
  const ledger = createMemoryBudgetLedger(5);
  assert.equal((await ledger.snapshot()).spentUsd, 0);
  await ledger.reserve('r1', 0.5);
  const mid = await ledger.snapshot();
  assert.equal(mid.reservedUsd, 0.5);
  assert.equal(mid.remainingUsd, 4.5);
  await ledger.settle('r1', 0.25);
  const after = await ledger.snapshot();
  assert.equal(after.spentUsd, 0.25);
  assert.equal(after.reservedUsd, 0);
  assert.equal(after.remainingUsd, 4.75);
});

test('budget: release drops a reservation without spending', async () => {
  const ledger = createMemoryBudgetLedger(5);
  await ledger.reserve('r1', 1);
  await ledger.release('r1');
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.spentUsd, 0);
  assert.equal(snapshot.reservedUsd, 0);
  assert.equal(snapshot.remainingUsd, 5);
});

test('budget: exceeding the cap throws and blocks the call', async () => {
  const ledger = createMemoryBudgetLedger(0.001);
  await assert.rejects(() => ledger.reserve('r1', 0.01), (error: unknown) => {
    assert.ok(error instanceof BudgetExceededError);
    assert.equal((error as BudgetExceededError).code, 'budget_exceeded');
    return true;
  });
});

test('budget: concurrent reservations cannot oversubscribe the cap', async () => {
  const ledger = createMemoryBudgetLedger(1);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      ledger
        .reserve(`r${index}`, 0.3)
        .then(() => 'ok' as const)
        .catch(() => 'blocked' as const),
    ),
  );
  assert.equal(results.filter((r) => r === 'ok').length, 3, 'only three 0.30 reservations fit in a $1 cap');
  await Promise.all(Array.from({ length: 3 }, (_, index) => ledger.settle(`r${index}`, 0.3)));
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.spentUsd, round6(0.9));
  assert.ok(snapshot.remainingUsd >= 0.0999 && snapshot.remainingUsd <= 0.1001);
});

test('budget: a settled reservation is not double counted', async () => {
  const ledger = createMemoryBudgetLedger(5);
  await ledger.reserve('r1', 1);
  await ledger.settle('r1', 0.4);
  await ledger.settle('r1', 0.4);
  assert.equal((await ledger.snapshot()).spentUsd, 0.4);
});

test('budget: reservation ids are idempotent while open', async () => {
  const ledger = createMemoryBudgetLedger(5);
  await ledger.reserve('r1', 0.5);
  await ledger.reserve('r1', 0.5);
  assert.equal((await ledger.snapshot()).reservedUsd, 0.5);
});

/* ------------------------------------------------------------------ *
 * Context + validation
 * ------------------------------------------------------------------ */

test('context: collects every source ID referenced in the graph context', () => {
  const ids = collectKnownSourceIds(fixtureWorkspace(), fixtureAnalysis());
  for (const expected of ['src_brief', 'src_policy', 'src_cal']) assert.ok(ids.includes(expected));
});

test('context: serializes bounded JSON with known source IDs', () => {
  const built = buildAgentContext(fixtureWorkspace(), fixtureAnalysis(), { PACT_AGENT_MAX_CONTEXT_BYTES: '20000' });
  assert.equal(built.workspaceId, 'ws-test');
  assert.ok(built.textBytes <= 20000);
  assert.ok(built.knownSourceIds.includes('src_policy'));
  assert.ok(built.estimatedInputTokens > 0);
  assert.doesNotThrow(() => JSON.parse(built.text));
});

test('context: carries the business type for non-agency workspaces', () => {
  const foodShop = { ...fixtureWorkspace(), businessType: 'food_shop' as const, kind: 'custom' as const };
  const built = buildAgentContext(foodShop, undefined, {});
  assert.equal((built.context as Record<string, unknown>).businessType, 'food_shop');
  assert.equal((built.context as Record<string, unknown>).kind, 'custom');
  assert.match(built.text, /"businessType":"food_shop"/);
  const untyped = buildAgentContext(fixtureWorkspace(), undefined, {});
  assert.equal((untyped.context as Record<string, unknown>).businessType, null, 'unset type stays explicit null');
});

test('tokens: ceiling is conservative (UTF8 bytes, never chars/4)', () => {
  const text = 'é'.repeat(3000); // 6000 UTF8 bytes, 3000 chars
  const ceiling = estimateInputTokenCeiling([text]);
  assert.ok(ceiling >= 2000, `ceiling ${ceiling} must exceed bytes/4=1500`);
  assert.ok(ceiling > Math.ceil(text.length / 4));
});

test('validation: unknown source IDs are dropped from role outputs', () => {
  const known = new Set(['src_brief', 'src_policy']);
  const assessment = validateAssessment(AM_PAYLOAD, known);
  assert.deepEqual(assessment.sourceIds, ['src_policy']);
  const producer = validateProducerAnalysis(PRODUCER_PAYLOAD, known);
  assert.deepEqual(producer.sourceIds, ['src_policy']);
  assert.deepEqual(producer.activities[0].sourceIds, ['src_policy']);
});

test('validation: malformed outputs throw', () => {
  assert.throws(() => validateAssessment({ assessment: '' }, new Set()), /failed validation/);
  assert.throws(() => validateMemoryOutput({ reply: '' }, new Set()), /failed validation/);
});

test('validation: memory output keeps only known source IDs', () => {
  const output = validateMemoryOutput(MEMORY_PAYLOAD, new Set(['src_policy']));
  assert.deepEqual(output.sourceIds, ['src_policy']);
  assert.equal(output.confidence, 'high');
});

/* ------------------------------------------------------------------ *
 * Provider parsing + cost
 * ------------------------------------------------------------------ */

test('parsing: extracts text and usage from a Responses payload', () => {
  const raw = responsesBody({ ok: true });
  assert.equal(extractOutputText(raw), JSON.stringify({ ok: true }));
  const usage = extractUsage(raw);
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.outputTokens, 200);
});

test('cost: estimates from usage and pricing', () => {
  const cost = estimateCostUsd(
    { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 0 },
    { inputPerMillionUsd: 3, outputPerMillionUsd: 15, cachedInputMultiplier: 0.25 },
  );
  assert.equal(cost, 18);
  const reservation = estimateReservationUsd(1000, 1200, { inputPerMillionUsd: 3, outputPerMillionUsd: 15, cachedInputMultiplier: 0.25 }, 2);
  assert.ok(reservation > 0);
});

/* ------------------------------------------------------------------ *
 * runAgentAnalysis — direct transport (two-role handoff)
 * ------------------------------------------------------------------ */

test('runAgentAnalysis: no key + direct transport returns labeled deterministic', async () => {
  const workspace = fixtureWorkspace();
  const analysis = fixtureAnalysis();
  const before = JSON.stringify(analysis);
  __setAgentDeps({ env: { PACT_AGENT_TRANSPORT: 'direct' } });
  const result = await runAgentAnalysis(workspace, analysis);
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /OPENAI_API_KEY/);
  assert.equal(JSON.stringify(analysis), before, 'input analysis must not be mutated');
  __resetAgentDeps();
});

test('runAgentAnalysis: two roles hand off and the ledger records real spend', async () => {
  const workspace = fixtureWorkspace();
  const ledger = createMemoryBudgetLedger(5);
  const memory = new MemoryHandoffMemory();
  const counter = { calls: 0 };
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: memory,
    now: () => new Date('2026-10-15T12:00:00.000Z'),
    fetchImpl: directFetch({ pact_assessment: AM_PAYLOAD, pact_producer_analysis: PRODUCER_PAYLOAD }, counter),
  });

  const result = await runAgentAnalysis(workspace, fixtureAnalysis());
  assert.equal(counter.calls, 2, 'one call per role');
  assert.equal(result.mode, 'live');
  assert.equal(result.model, 'gpt-6.1-sol');
  assert.ok((result.usageUsd ?? 0) > 0);
  assert.equal(result.activity.length, 2);
  assert.equal(result.activity[0].role, 'account_manager');
  assert.equal(result.activity[1].role, 'producer');
  assert.deepEqual(result.activity[1].sourceIds, ['src_policy'], 'ghost source ID dropped');

  const handoffs = await memory.read('ws-test');
  assert.equal(handoffs.length, 1, 'handoff persisted for the Producer');
  assert.equal(handoffs[0].from, 'account_manager');
  assert.equal(handoffs[0].to, 'producer');

  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.reservedUsd, 0, 'reservation closed');
  assert.ok(snapshot.spentUsd > 0, 'real usage recorded');
  __resetAgentDeps();
});

test('runAgentAnalysis: provider failure retains a conservative reservation', async () => {
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    fetchImpl: (async () => jsonResponse({ error: { message: 'rate limited' } }, 429)) as typeof fetch,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /openai_http_429|rate limited/);
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.reservedUsd, 0);
  assert.ok(snapshot.spentUsd > 0, 'a dispatched request retains a conservative charge');
  __resetAgentDeps();
});

test('runAgentAnalysis: budget gate blocks the provider call', async () => {
  const ledger = createMemoryBudgetLedger(0.0001);
  const counter = { calls: 0 };
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    fetchImpl: directFetch({}, counter),
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /budget gate reached/);
  assert.equal(counter.calls, 0, 'no paid call may happen when the gate rejects');
  __resetAgentDeps();
});

/* ------------------------------------------------------------------ *
 * runAgentAnalysis — eve transport (default)
 * ------------------------------------------------------------------ */

test('runAgentAnalysis: eve transport drives two role sessions', async () => {
  const workspace = fixtureWorkspace();
  const ledger = createMemoryBudgetLedger(5);
  const sessions: string[] = [];
  __setAgentDeps({
    env: { PACT_AGENT_TRANSPORT: 'eve', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: eveFetch({ am: AM_PAYLOAD, producer: PRODUCER_PAYLOAD, sessions }),
  });

  const result = await runAgentAnalysis(workspace, fixtureAnalysis());
  assert.equal(result.mode, 'live');
  assert.equal(sessions.length, 2, 'Account Manager and Producer are separate sessions');
  assert.ok(sessions[0].startsWith('sess_am'));
  assert.ok(sessions[1].startsWith('sess_producer'));
  assert.equal(result.activity[0].role, 'account_manager');
  assert.equal(result.activity[1].role, 'producer');
  __resetAgentDeps();
});

test('runAgentAnalysis: eve calls bind the workspace with the trusted runtime header', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = String(value);
    }
    requests.push({ url, headers });
    if (url.endsWith('/eve/v1/health')) return jsonResponse({ ok: true, status: 'ready' });
    if (url.endsWith('/eve/v1/session') && init?.method === 'POST') {
      const isProducer = url.includes(':3011');
      return jsonResponse({ ok: true, sessionId: isProducer ? 'sess_producer' : 'sess_am', status: 'accepted' });
    }
    if (url.includes('/stream')) {
      const payload = url.includes(':3011') ? PRODUCER_PAYLOAD : AM_PAYLOAD;
      return new Response(`${JSON.stringify({ type: 'result.completed', data: { result: payload } })}\n`, { status: 200 });
    }
    if (url.endsWith('/reset')) return jsonResponse({ ok: true });
    return jsonResponse({ error: 'unexpected' }, 404);
  }) as typeof fetch;
  __setAgentDeps({
    env: {
      PACT_AGENT_TRANSPORT: 'eve',
      PACT_AGENT_MAX_CONTEXT_BYTES: '20000',
      PACT_RUNTIME_TOKEN: 'test-runtime-token',
    },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'live');
  assert.ok(requests.length >= 2, 'both roles hit the runtime');
  for (const request of requests) {
    // Every app-to-runtime request binds the opaque server-generated workspace
    // id (never a browser-supplied value) alongside the shared-secret bearer.
    assert.equal(request.headers['x-pact-workspace-id'], 'ws-test', `missing binding on ${request.url}`);
    assert.equal(request.headers['authorization'], 'Bearer test-runtime-token');
  }
  __resetAgentDeps();
});

test('runAgentAnalysis: unreachable runtime falls back and releases the reservation', async () => {
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: { PACT_AGENT_TRANSPORT: 'eve', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    fetchImpl: (async () => jsonResponse({ error: 'down' }, 503)) as typeof fetch,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /runtime/);
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.spentUsd, 0, 'no model call was dispatched');
  assert.equal(snapshot.reservedUsd, 0, 'reservation released');
  __resetAgentDeps();
});

/* ------------------------------------------------------------------ *
 * runAgentMemory
 * ------------------------------------------------------------------ */

test('runAgentMemory: no key + direct transport returns the deterministic fallback', async () => {
  __setAgentDeps({ env: { PACT_AGENT_TRANSPORT: 'direct' } });
  const fallback = fixtureFallback();
  const result = await runAgentMemory(fixtureWorkspace(), 'Why is Beta at risk?', fallback);
  assert.equal(result.mode, 'deterministic');
  assert.equal(result.text, fallback.text);
  assert.match(result.warning ?? '', /OPENAI_API_KEY/);
  __resetAgentDeps();
});

test('runAgentMemory: live path returns a validated reply', async () => {
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: directFetch({ pact_memory: MEMORY_PAYLOAD }),
  });
  const result = await runAgentMemory(fixtureWorkspace(), 'Why is Beta at risk?', fixtureFallback());
  assert.equal(result.mode, 'live');
  assert.match(result.text, /src_policy/);
  assert.deepEqual(result.sourceIds, ['src_policy']);
  assert.ok((result.usageUsd ?? 0) > 0);
  __resetAgentDeps();
});

test('runAgentMemory: malformed model output falls back', async () => {
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: directFetch({ pact_memory: { reply: '', sourceIds: [] } }),
  });
  const result = await runAgentMemory(fixtureWorkspace(), 'Anything?', fixtureFallback());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /invalid_output|failed validation/);
  __resetAgentDeps();
});

test('runAgentMemory: eve transport returns a live reply', async () => {
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: { PACT_AGENT_TRANSPORT: 'eve', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: eveFetch({ producer: MEMORY_PAYLOAD }),
  });
  const result = await runAgentMemory(fixtureWorkspace(), 'Why is Beta at risk?', fixtureFallback());
  assert.equal(result.mode, 'live');
  assert.deepEqual(result.sourceIds, ['src_policy']);
  __resetAgentDeps();
});

/* ------------------------------------------------------------------ *
 * Business-neutral prompts: agencies, food shops, other small businesses
 * ------------------------------------------------------------------ */

test('prompts: direct analysis and memory prompts are business-neutral', async () => {
  const systems: Record<string, string> = {};
  const users: Record<string, string> = {};
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      input: { content: { text: string }[] }[];
      text?: { format?: { name?: string } };
    };
    const name = String(body.text?.format?.name ?? '');
    systems[name] = body.input[0]?.content?.[0]?.text ?? '';
    users[name] = body.input[1]?.content?.[0]?.text ?? '';
    const payload =
      name === 'pact_assessment' ? AM_PAYLOAD : name === 'pact_producer_analysis' ? PRODUCER_PAYLOAD : MEMORY_PAYLOAD;
    return jsonResponse(responsesBody(payload));
  }) as typeof fetch;
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });

  const analysis = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(analysis.mode, 'live');
  const reply = await runAgentMemory(fixtureWorkspace(), 'Why is Beta at risk?', fixtureFallback());
  assert.equal(reply.mode, 'live');

  for (const name of ['pact_assessment', 'pact_producer_analysis', 'pact_memory']) {
    const system = systems[name];
    assert.ok(system, `missing system prompt for ${name}`);
    assert.match(system, /small-business capacity-planning studio/);
    assert.match(system, /creative agency/);
    assert.match(system, /food shop/);
    assert.doesNotMatch(system, /agency capacity-planning studio/);
    assert.match(system, /verified professional qualification/);
    assert.match(system, /knownSourceIds/);
    assert.match(system, /Explicit denials always override suggestions/);
  }
  assert.match(users['pact_producer_analysis'], /Workspace context \(JSON\):/);
  assert.doesNotMatch(users['pact_producer_analysis'], /Agency context/);
  assert.match(users['pact_memory'], /Workspace context \(JSON\):/);
  assert.doesNotMatch(users['pact_memory'], /Agency context/);
  assert.match(reply.activity.at(-1)?.text ?? '', /^Producer replied \(confidence: high\)\.$/);
  __resetAgentDeps();
});

test('runtime instructions: business-neutral and keep the graph-backed handoff contract', () => {
  const read = (role: string) =>
    readFileSync(new URL(`../agent-runtime/agents/${role}/agent/instructions.md`, import.meta.url), 'utf8');
  const am = read('account-manager');
  const producer = read('producer');
  for (const doc of [am, producer]) {
    assert.match(doc, /small-business capacity-planning studio/);
    assert.match(doc, /creative agency/);
    assert.match(doc, /food shop/);
    assert.doesNotMatch(doc, /agency capacity-planning studio/);
    assert.match(doc, /verified professional qualification, certificate, or safety clearance/);
    assert.match(doc, /knownSourceIds/);
    assert.match(doc, /Explicit denials always override suggestions/);
  }
  // Stable role IDs and the real tool-backed handoff/source contracts remain.
  assert.match(am, /Account Manager/);
  assert.match(am, /record_handoff/);
  assert.match(producer, /Producer/);
  assert.match(producer, /read_handoffs/);
  assert.match(producer, /validate_citations/);
});

/* ------------------------------------------------------------------ *
 * Regression: conservative token ceiling (one token per byte)
 * ------------------------------------------------------------------ */

test('tokens: the ceiling is a true one-token-per-byte upper bound', () => {
  const hostile = '\u{1F4A9}\u{1F600}\u{1F680}'.repeat(5000); // 4 UTF8 bytes per char
  const bytes = Buffer.byteLength(hostile, 'utf8');
  const ceiling = estimateInputTokenCeiling([hostile]);
  assert.ok(ceiling >= bytes, `ceiling ${ceiling} must cover ${bytes} bytes`);
  const reserve = estimateReservationUsd(ceiling, 1200, {
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
    cachedInputMultiplier: 0.25,
  });
  assert.ok(reserve >= (bytes / 1_000_000) * 3, 'reservation covers the worst-case input cost');
});

test('runAgentAnalysis: the producer reservation covers the handoff and memory it sends', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const memory = new MemoryHandoffMemory();
  const users: Record<string, string> = {};
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const name = String(((body.text as Record<string, unknown>)?.format as Record<string, unknown>)?.name ?? '');
    const input = body.input as { content?: { text?: string }[] }[] | undefined;
    users[name] = input?.[1]?.content?.[0]?.text ?? '';
    return jsonResponse(responsesBody(name === 'pact_assessment' ? AM_PAYLOAD : PRODUCER_PAYLOAD));
  }) as typeof fetch;
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: memory,
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'live');
  assert.ok(
    users['pact_producer_analysis'].length > users['pact_assessment'].length,
    'the producer prompt adds the handoff and memory',
  );
  const producer = (await ledger.listReservations()).find((r) => r.id.startsWith('role:producer:'));
  assert.ok(producer, 'the producer reserved its own request');
  const producerBytes = Buffer.byteLength(users['pact_producer_analysis'], 'utf8');
  assert.ok(
    producer!.amountUsd >= (producerBytes / 1_000_000) * 3,
    'the producer reservation covers the full prompt bytes',
  );
  __resetAgentDeps();
});

/* ------------------------------------------------------------------ *
 * Regression: per-request reservations are independent (finding 3)
 * ------------------------------------------------------------------ */

test('runAgentAnalysis: a second-role pre-dispatch rejection keeps the first role spend', async () => {
  const ledger = createMemoryBudgetLedger(1);
  const counter = { calls: 0 };
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    counter.calls += 1;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const name = String(((body.text as Record<string, unknown>)?.format as Record<string, unknown>)?.name ?? '');
    if (name === 'pact_assessment') {
      return jsonResponse(responsesBody(AM_PAYLOAD, { input_tokens: 500_000, output_tokens: 100_000 }));
    }
    return jsonResponse(responsesBody(PRODUCER_PAYLOAD));
  }) as typeof fetch;
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.equal(counter.calls, 1, 'only the first role was dispatched');
  const snapshot = await ledger.snapshot();
  assert.ok(snapshot.spentUsd >= 3, 'the first role spend is retained');
  const reservations = await ledger.listReservations();
  assert.ok(reservations.some((r) => r.id.startsWith('role:account_manager:') && r.status === 'settled'));
  assert.ok(!reservations.some((r) => r.id.startsWith('role:producer:')), 'the second role never reserved');
  __resetAgentDeps();
});

test('runAgentAnalysis: a dispatched-but-timed-out second role retains its full reservation', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const name = String(((body.text as Record<string, unknown>)?.format as Record<string, unknown>)?.name ?? '');
    if (name === 'pact_assessment') return jsonResponse(responsesBody(AM_PAYLOAD));
    throw new Error('socket hang up (simulated timeout)');
  }) as typeof fetch;
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  const producer = (await ledger.listReservations()).find((r) => r.id.startsWith('role:producer:'));
  assert.ok(producer, 'the second role reserved before dispatch');
  assert.equal(producer!.status, 'settled');
  assert.equal(producer!.settledUsd, producer!.amountUsd, 'the uncertain cost is retained at the full ceiling');
  __resetAgentDeps();
});

test('runAgentAnalysis: a billable response with no usage is not treated as free', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const noUsage = (payload: unknown) => ({
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }],
  });
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const name = String(((body.text as Record<string, unknown>)?.format as Record<string, unknown>)?.name ?? '');
    return jsonResponse(noUsage(name === 'pact_assessment' ? AM_PAYLOAD : PRODUCER_PAYLOAD));
  }) as typeof fetch;
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'live');
  const reservations = await ledger.listReservations();
  assert.equal(reservations.length, 2);
  for (const reservation of reservations) {
    assert.equal(reservation.status, 'settled');
    assert.equal(reservation.settledUsd, reservation.amountUsd, 'absent usage settles at the conservative ceiling');
  }
  __resetAgentDeps();
});

test('runAgentAnalysis: a settle failure leaves the reservation reserved (fail closed)', async () => {
  // A ledger whose settle always throws models a durable-store write failure.
  // The reservation must stay open rather than being silently dropped.
  class FailingSettleStore extends MemoryBudgetStore {
    override async settle(): Promise<void> {
      throw new Error('durable ledger write failed');
    }
  }
  const ledger = new BudgetLedger(new FailingSettleStore(), 5);
  __setAgentDeps({
    env: { OPENAI_API_KEY: 'test-key', PACT_AGENT_TRANSPORT: 'direct', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: directFetch({ pact_assessment: AM_PAYLOAD, pact_producer_analysis: PRODUCER_PAYLOAD }),
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  // The provider calls succeeded, but neither reservation could be settled.
  assert.equal(result.mode, 'live');
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.spentUsd, 0, 'a failed settle records no spend');
  assert.ok(snapshot.reservedUsd > 0, 'a failed settle keeps the reservation open (fails closed)');
  __resetAgentDeps();
});

/* ------------------------------------------------------------------ *
 * Regression: eve streaming (findings 2-4)
 * ------------------------------------------------------------------ */

test('runAgentAnalysis: an accepted eve POST with no sessionId is reported as uncertain', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const routes: string[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    routes.push(url);
    if (url.endsWith('/eve/v1/health')) return jsonResponse({ ok: true, status: 'ready' });
    if (url.endsWith('/eve/v1/session') && init?.method === 'POST') return jsonResponse({ ok: true, status: 'accepted' });
    return jsonResponse({ error: 'unexpected' }, 404);
  }) as typeof fetch;
  __setAgentDeps({
    env: { PACT_AGENT_TRANSPORT: 'eve', PACT_AGENT_MAX_CONTEXT_BYTES: '20000' },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /no sessionId|uncertain/i);
  assert.ok(!routes.some((u) => u.endsWith('/reset')), 'no reset is attempted for an unknown session');
  __resetAgentDeps();
});

test('runAgentAnalysis: a second-role health failure keeps the first role turn and returns deterministic', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const sessions: string[] = [];
  const routes: string[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    routes.push(url);
    const isProducer = url.includes(':3011');
    if (url.endsWith('/eve/v1/health')) {
      return isProducer ? jsonResponse({ error: 'down' }, 503) : jsonResponse({ ok: true, status: 'ready' });
    }
    if (url.endsWith('/eve/v1/session') && init?.method === 'POST') {
      sessions.push(isProducer ? 'producer' : 'am');
      return jsonResponse({ ok: true, sessionId: `sess_${sessions.length}`, status: 'accepted' });
    }
    if (url.includes('/stream')) {
      const lines = [
        JSON.stringify({ type: 'step.completed', data: { usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.002 } } }),
        JSON.stringify({ type: 'result.completed', data: { result: AM_PAYLOAD } }),
        JSON.stringify({ type: 'session.waiting', data: { usage: { costUsd: 0.002 } } }),
      ];
      return new Response(`${lines.join('\n')}\n`, { status: 200 });
    }
    if (url.endsWith('/reset')) return jsonResponse({ ok: true });
    return jsonResponse({ error: 'unexpected' }, 404);
  }) as typeof fetch;
  __setAgentDeps({
    env: {
      PACT_AGENT_TRANSPORT: 'eve',
      PACT_AGENT_MAX_CONTEXT_BYTES: '20000',
      AGENT_RUNTIME_URL: 'http://127.0.0.1:3010',
    },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl,
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /runtime|503/i);
  assert.deepEqual(sessions, ['am'], 'only the first role dispatched a turn; the second health check failed first');
  // The first role's billed turn lives in the runtime ledger. The app must not
  // erase it by releasing/resetting a shared ledger, and must never charge the
  // app-side ledger itself for the eve transport.
  const snapshot = await ledger.snapshot();
  assert.equal(snapshot.spentUsd, 0);
  assert.equal(snapshot.reservedUsd, 0);
  assert.ok(!routes.some((u) => u.includes(':3011') && u.endsWith('/reset')), 'no producer reset is attempted');
  __resetAgentDeps();
});

test('runAgentAnalysis: eve follows an asynchronous turn to result.completed', async () => {
  const ledger = createMemoryBudgetLedger(5);
  __setAgentDeps({
    env: {
      PACT_AGENT_TRANSPORT: 'eve',
      PACT_AGENT_MAX_CONTEXT_BYTES: '20000',
      AGENT_RUNTIME_URL: 'http://127.0.0.1:3010',
    },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: delayedEveFetch({ am: AM_PAYLOAD, producer: PRODUCER_PAYLOAD, delayMs: 60 }),
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'live');
  assert.equal(result.activity[0].role, 'account_manager');
  assert.equal(result.activity[1].role, 'producer');
  assert.ok((result.usageUsd ?? 0) > 0, 'per-step usage is accumulated from the delayed stream');
  __resetAgentDeps();
});

test('runAgentAnalysis: an eve timeout cancels the session and returns deterministic', async () => {
  const ledger = createMemoryBudgetLedger(5);
  const routes: string[] = [];
  __setAgentDeps({
    env: {
      PACT_AGENT_TRANSPORT: 'eve',
      PACT_AGENT_MAX_CONTEXT_BYTES: '20000',
      AGENT_RUNTIME_URL: 'http://127.0.0.1:3010',
      PACT_AGENT_TIMEOUT_MS: '150',
    },
    ledger,
    handoffMemory: new MemoryHandoffMemory(),
    fetchImpl: hangingEveFetch(routes),
  });
  const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
  assert.equal(result.mode, 'deterministic');
  assert.match(result.warning ?? '', /timed out|timeout/i);
  assert.ok(routes.some((u) => u.endsWith('/cancel')), 'the in-flight turn is cancelled');
  assert.ok(routes.some((u) => u.endsWith('/reset')), 'the session is reset after the timeout');
  __resetAgentDeps();
});

/* ------------------------------------------------------------------ *
 * No-cost smoke test: real HTTP wiring to a fake eve runtime
 * ------------------------------------------------------------------ */

interface RecordedEveRequest {
  role: string;
  authorization?: string;
  body: Record<string, unknown>;
}

function eventLine(type: string, data: Record<string, unknown>): string {
  return `${JSON.stringify({ type, data })}\n`;
}

/** Fake eve runtime on a real localhost socket. Makes no provider calls. */
function startFakeEveServer(options: {
  payload: unknown;
  requests: RecordedEveRequest[];
}): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)));
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.endsWith('/eve/v1/health')) return send(200, { ok: true, status: 'ready' });
      if (url.endsWith('/eve/v1/session') && req.method === 'POST') {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
        const clientContext = (parsed.clientContext ?? {}) as Record<string, unknown>;
        options.requests.push({
          role: String(clientContext.pactRole ?? ''),
          authorization: req.headers.authorization,
          body: parsed,
        });
        return send(202, { ok: true, sessionId: `sess_${options.requests.length}`, status: 'accepted' });
      }
      if (url.includes('/stream')) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        res.write(eventLine('step.completed', { usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.001 } }));
        res.write(eventLine('result.completed', { result: options.payload }));
        res.write(eventLine('session.waiting', { usage: { costUsd: 0.001 } }));
        res.end();
        return;
      }
      if (url.endsWith('/reset')) return send(200, { ok: true, status: 'reset' });
      if (url.endsWith('/cancel')) return send(202, { ok: true, status: 'accepted' });
      return send(404, { error: 'unexpected' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

test('smoke: two authenticated eve role sessions with a durable handoff (no provider)', async () => {
  const amRequests: RecordedEveRequest[] = [];
  const producerRequests: RecordedEveRequest[] = [];
  const am = await startFakeEveServer({ payload: AM_PAYLOAD, requests: amRequests });
  const producer = await startFakeEveServer({ payload: PRODUCER_PAYLOAD, requests: producerRequests });
  const ledger = createMemoryBudgetLedger(5);
  const memory = new MemoryHandoffMemory();
  try {
    __resetAgentDeps();
    __setAgentDeps({
      env: {
        PACT_AGENT_TRANSPORT: 'eve',
        PACT_AGENT_MAX_CONTEXT_BYTES: '20000',
        AGENT_RUNTIME_URL: am.url,
        AGENT_PRODUCER_URL: producer.url,
        PACT_RUNTIME_TOKEN: 'dummy-runtime-token-local',
      },
      ledger,
      handoffMemory: memory,
    });
    const result = await runAgentAnalysis(fixtureWorkspace(), fixtureAnalysis());
    assert.equal(result.mode, 'live');
    assert.equal(result.activity[0].role, 'account_manager');
    assert.equal(result.activity[1].role, 'producer');

    assert.equal(amRequests.length, 1);
    assert.equal(producerRequests.length, 1);
    assert.equal(amRequests[0].role, 'account_manager');
    assert.equal(producerRequests[0].role, 'producer');
    assert.equal(amRequests[0].authorization, 'Bearer dummy-runtime-token-local');
    assert.equal(producerRequests[0].authorization, 'Bearer dummy-runtime-token-local');

    // Durable handoff: the producer request carries the persisted assessment.
    const producerContext = (producerRequests[0].body.clientContext as Record<string, unknown>).pactContext as Record<
      string,
      unknown
    >;
    const handoff = producerContext.handoff as Record<string, unknown>;
    assert.equal(handoff.assessment, AM_PAYLOAD.assessment);
    assert.ok(Array.isArray(producerContext.memory) && producerContext.memory.length >= 1, 'handoff persisted before role 2');

    // eve reserves in the runtime, so the app never charges the shared ledger.
    const snapshot = await ledger.snapshot();
    assert.equal(snapshot.spentUsd, 0);
    assert.equal(snapshot.reservedUsd, 0);
  } finally {
    __resetAgentDeps();
    await new Promise<void>((resolve) => am.server.close(() => resolve()));
    await new Promise<void>((resolve) => producer.server.close(() => resolve()));
  }
});

/** eve fake whose stream emits result.completed only after a delay. */
function delayedEveFetch(options: { am: unknown; producer: unknown; delayMs: number }): typeof fetch {
  let seq = 0;
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/eve/v1/health')) return jsonResponse({ ok: true, status: 'ready' });
    if (url.endsWith('/eve/v1/session') && init?.method === 'POST') {
      return jsonResponse({ ok: true, sessionId: `sess_${seq++}`, status: 'accepted' });
    }
    if (url.includes('/stream')) {
      const payload = url.includes(':3011') ? options.producer : options.am;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(
            encoder.encode(eventLine('step.started', { sequence: 0, stepIndex: 0, turnId: 'turn_0', modelId: 'fake' })),
          );
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
          controller.enqueue(
            encoder.encode(
              eventLine('step.completed', {
                sequence: 0,
                stepIndex: 0,
                turnId: 'turn_0',
                finishReason: 'stop',
                usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.001 },
              }),
            ),
          );
          controller.enqueue(encoder.encode(eventLine('result.completed', { result: payload })));
          controller.enqueue(encoder.encode(eventLine('session.waiting', { usage: { costUsd: 0.001 } })));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }
    if (url.endsWith('/reset')) return jsonResponse({ ok: true });
    return jsonResponse({ error: 'unexpected' }, 404);
  }) as typeof fetch;
}

/** eve fake whose stream never reaches a terminal boundary. */
function hangingEveFetch(routes: string[]): typeof fetch {
  let seq = 0;
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    routes.push(url);
    if (url.endsWith('/eve/v1/health')) return jsonResponse({ ok: true, status: 'ready' });
    if (url.endsWith('/eve/v1/session') && init?.method === 'POST') {
      return jsonResponse({ ok: true, sessionId: `sess_${seq++}`, status: 'accepted' });
    }
    if (url.includes('/stream')) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(eventLine('step.started', { sequence: 0, stepIndex: 0, turnId: 'turn_0', modelId: 'fake' })),
          );
          // Never emits a terminal event and never closes.
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    }
    if (url.endsWith('/cancel')) return jsonResponse({ ok: true, status: 'accepted' });
    if (url.endsWith('/reset')) return jsonResponse({ ok: true, status: 'reset' });
    return jsonResponse({ error: 'unexpected' }, 404);
  }) as typeof fetch;
}

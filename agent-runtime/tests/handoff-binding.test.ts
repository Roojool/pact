/**
 * No-cost tests for the tenant-bound runtime handoff tools (F3).
 *
 * The tools derive the workspace from the authenticated session binding, never
 * from a model argument. An in-memory handoff store and a fake eve tool context
 * stand in for FalkorDB and a live session. No network, no provider, no
 * credentials.
 *
 * Run from the repo root: npx tsx --test agent-runtime/tests/handoff-binding.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "eve/tools";

import recordHandoff from "../agents/account-manager/agent/tools/record_handoff";
import readHandoffs from "../agents/producer/agent/tools/read_handoffs";
import {
  FalkorHandoffStore,
  MemoryHandoffStore,
  resolveHandoffStore as resolveAccountManagerStore,
  setHandoffStoreForTests as setAccountManagerStore,
} from "../agents/account-manager/agent/lib/handoff";
import {
  resolveHandoffStore as resolveProducerStore,
  setHandoffStoreForTests as setProducerStore,
} from "../agents/producer/agent/lib/handoff";
import {
  isValidWorkspaceBinding,
  MissingWorkspaceBindingError,
  PACT_WORKSPACE_ATTRIBUTE,
  parseWorkspaceBindingHeader,
  readBoundWorkspaceId,
} from "../agents/account-manager/agent/lib/tenant";
import { MissingWorkspaceBindingError as ProducerMissingWorkspaceBindingError } from "../agents/producer/agent/lib/tenant";

type ExecutableTool = { execute(input: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> };

const amTool = recordHandoff as unknown as ExecutableTool;
const producerTool = readHandoffs as unknown as ExecutableTool;

/** Each role owns its own copy of the error class; accept either. */
function isMissingBinding(error: unknown): boolean {
  return error instanceof MissingWorkspaceBindingError || error instanceof ProducerMissingWorkspaceBindingError;
}

function authContext(workspaceId?: string) {
  const attributes: Record<string, string> = {};
  if (workspaceId !== undefined) attributes[PACT_WORKSPACE_ATTRIBUTE] = workspaceId;
  return { attributes, authenticator: "pact-runtime-token", principalId: "pact-app", principalType: "service" };
}

/** Fake tool context with a caller-bound workspace (or none). */
function ctx(workspaceId?: string): ToolContext {
  return {
    session: { id: "sess", auth: { current: authContext(workspaceId), initiator: null }, turn: { id: "turn", sequence: 1 } },
  } as unknown as ToolContext;
}

function ctxInitiatorOnly(workspaceId: string): ToolContext {
  return {
    session: { id: "sess", auth: { current: null, initiator: authContext(workspaceId) }, turn: { id: "turn", sequence: 1 } },
  } as unknown as ToolContext;
}

/**
 * The two eve roles are separate agent apps with their own copies of the store
 * module, so both test seams must point at the same in-memory store.
 */
function installSharedStore(): MemoryHandoffStore {
  const store = new MemoryHandoffStore();
  setAccountManagerStore(store);
  setProducerStore(store);
  return store;
}

function clearStores(): void {
  setAccountManagerStore(undefined);
  setProducerStore(undefined);
}

test("runtime handoff tools scope reads and writes to the bound workspace", async () => {
  installSharedStore();
  try {
    await amTool.execute({ summary: "A only", sourceIds: ["src_a"] }, ctx("ws-a"));
    await amTool.execute({ summary: "B only", sourceIds: ["src_b"] }, ctx("ws-b"));

    const a = (await producerTool.execute({ limit: 5 }, ctx("ws-a"))) as {
      workspaceId: string;
      handoffs: { summary: string }[];
    };
    const b = (await producerTool.execute({ limit: 5 }, ctx("ws-b"))) as {
      workspaceId: string;
      handoffs: { summary: string }[];
    };

    assert.equal(a.workspaceId, "ws-a");
    assert.equal(b.workspaceId, "ws-b");
    assert.deepEqual(a.handoffs.map((h) => h.summary), ["A only"], "tenant A reads only its own handoffs");
    assert.deepEqual(b.handoffs.map((h) => h.summary), ["B only"], "tenant B reads only its own handoffs");
  } finally {
    clearStores();
  }
});

test("a model-supplied workspaceId is ignored in favor of the authenticated binding", async () => {
  installSharedStore();
  try {
    // The model tries to write into ws-b while the session is bound to ws-a.
    await amTool.execute({ workspaceId: "ws-b", summary: "forged", sourceIds: [] }, ctx("ws-a"));

    const forgedTarget = (await producerTool.execute({ limit: 5 }, ctx("ws-b"))) as { handoffs: unknown[] };
    const boundTarget = (await producerTool.execute({ limit: 5 }, ctx("ws-a"))) as { handoffs: { summary: string }[] };
    assert.equal(forgedTarget.handoffs.length, 0, "the model cannot write into another tenant");
    assert.deepEqual(boundTarget.handoffs.map((h) => h.summary), ["forged"]);
  } finally {
    clearStores();
  }
});

test("the model-facing tool schemas no longer expose a workspaceId argument", () => {
  const amShape = (recordHandoff.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
  const producerShape = (readHandoffs.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
  assert.ok(!("workspaceId" in amShape), "record_handoff must not accept a model-supplied workspaceId");
  assert.ok(!("workspaceId" in producerShape), "read_handoffs must not accept a model-supplied workspaceId");
});

test("runtime handoff tools fail closed without an authenticated workspace binding", async () => {
  installSharedStore();
  try {
    await assert.rejects(
      () => amTool.execute({ summary: "x", sourceIds: [] }, ctx()),
      (error: unknown) => isMissingBinding(error),
    );
    await assert.rejects(
      () => producerTool.execute({ limit: 5 }, ctx()),
      (error: unknown) => isMissingBinding(error),
    );
  } finally {
    clearStores();
  }
});

test("a malformed or missing binding is rejected and an initiator binding is honored", () => {
  assert.equal(isValidWorkspaceBinding("ws-a_123"), true);
  assert.equal(isValidWorkspaceBinding("bad id"), false);
  assert.equal(isValidWorkspaceBinding(""), false);
  assert.equal(isValidWorkspaceBinding(undefined), false);
  assert.throws(() => readBoundWorkspaceId(ctx("bad id")), (error: unknown) => error instanceof MissingWorkspaceBindingError);
  assert.throws(() => readBoundWorkspaceId(ctx()), (error: unknown) => error instanceof MissingWorkspaceBindingError);
  assert.equal(readBoundWorkspaceId(ctxInitiatorOnly("ws-init")), "ws-init");
});

test("the runtime channel parses the trusted workspace header", () => {
  assert.deepEqual(parseWorkspaceBindingHeader("ws-a"), { kind: "bound", workspaceId: "ws-a" });
  assert.deepEqual(parseWorkspaceBindingHeader("ws-a_123"), { kind: "bound", workspaceId: "ws-a_123" });
  assert.deepEqual(parseWorkspaceBindingHeader(null), { kind: "absent" });
  assert.deepEqual(parseWorkspaceBindingHeader("   "), { kind: "absent" });
  assert.deepEqual(parseWorkspaceBindingHeader("bad id"), { kind: "invalid" });
});

test("each role reuses one durable handoff store and the test seam can be reset", () => {
  const previousUrl = process.env.FALKORDB_URL;
  const previousGraph = process.env.PACT_AGENT_GRAPH;
  try {
    setAccountManagerStore(undefined);
    setProducerStore(undefined);
    delete process.env.FALKORDB_URL;

    // Missing config stays fail-closed and is not cached as a success.
    assert.throws(() => resolveAccountManagerStore(), /FALKORDB_URL is not configured/);
    assert.throws(() => resolveAccountManagerStore(), /FALKORDB_URL is not configured/);

    process.env.FALKORDB_URL = "redis://127.0.0.1:6379";
    const first = resolveAccountManagerStore();
    const second = resolveAccountManagerStore();
    assert.ok(first instanceof FalkorHandoffStore, "an unset seam resolves the durable graph store");
    assert.equal(first, second, "repeated resolution reuses one durable store, not a fresh connection");

    // One durable store per role process: the two roles never share an instance.
    assert.notEqual(resolveProducerStore(), first, "the roles keep separate durable stores");

    // The test seam overrides the durable store and can be reset back to it.
    const override = new MemoryHandoffStore();
    setAccountManagerStore(override);
    assert.equal(resolveAccountManagerStore(), override, "the test seam takes precedence");
    setAccountManagerStore(undefined);
    assert.equal(resolveAccountManagerStore(), first, "resetting the seam returns the cached durable store");
  } finally {
    if (previousUrl === undefined) delete process.env.FALKORDB_URL;
    else process.env.FALKORDB_URL = previousUrl;
    if (previousGraph === undefined) delete process.env.PACT_AGENT_GRAPH;
    else process.env.PACT_AGENT_GRAPH = previousGraph;
    clearStores();
  }
});

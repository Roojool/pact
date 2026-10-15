/**
 * No-cost unit tests for the runtime budgeted provider proxy.
 *
 * A fake in-process `LanguageModelV4` stands in for OpenAI and a
 * `MemoryBudgetGateStore` stands in for the durable ledger. No network, no
 * provider, no credentials.
 *
 * Run from the repo root: npx tsx --test agent-runtime/tests/budgeted-model.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { LanguageModel } from "ai";

import { budgetedModel, MissingSessionKeyError, ModelStepLimitError } from "../agents/account-manager/agent/lib/budgeted-model";
import {
  BudgetGateError,
  MemoryBudgetGateStore,
  setBudgetGateStoreForTests,
  type BudgetGateStore,
} from "../agents/account-manager/agent/lib/budget-gate";

interface Captured {
  calls: number;
  params?: Record<string, unknown>;
}

function v4Usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

function fakeModel(
  captured: Captured,
  options: { input?: number; output?: number } = {},
): LanguageModel {
  const usage = v4Usage(options.input ?? 10, options.output ?? 5);
  const model = {
    specificationVersion: "v4",
    provider: "fake",
    modelId: "fake-model",
    supportedUrls: {},
    async doGenerate(params: unknown) {
      captured.calls += 1;
      captured.params = params as Record<string, unknown>;
      return { content: [{ type: "text", text: "{}" }], finishReason: "stop", usage, warnings: [] };
    },
    async doStream(params: unknown) {
      captured.calls += 1;
      captured.params = params as Record<string, unknown>;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "finish", usage, finishReason: "stop" });
          controller.close();
        },
      });
      return { stream };
    },
  };
  return model as unknown as LanguageModel;
}

type StreamCall = Parameters<ReturnType<typeof budgetedModel>["doStream"]>[0];

function callOptions(
  overrides: { maxOutputTokens?: number; promptCacheKey?: string; responseFormat?: unknown } = {},
): StreamCall {
  const options: Record<string, unknown> = {
    prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    maxOutputTokens: overrides.maxOutputTokens,
    providerOptions: { openai: { promptCacheKey: overrides.promptCacheKey } },
  };
  if (overrides.responseFormat !== undefined) options.responseFormat = overrides.responseFormat;
  return options as unknown as StreamCall;
}

async function drain(stream: ReadableStream<unknown>): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}

/** Records each reserved ceiling so a test can compare request sizes. */
class RecordingGateStore implements BudgetGateStore {
  readonly amounts: number[] = [];
  async reserve(_id: string, amountUsd: number): Promise<"reserved"> {
    this.amounts.push(amountUsd);
    return "reserved";
  }
  async settle(): Promise<void> {}
  async close(): Promise<void> {}
}

test("budgeted provider forces the real per-call output cap", async () => {
  const store = new MemoryBudgetGateStore(5);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const model = budgetedModel("test-cap", fakeModel(captured));
    const result = await model.doStream(callOptions({ maxOutputTokens: 999_999, promptCacheKey: "cap-session" }));
    await drain(result.stream);
    assert.equal(captured.params?.maxOutputTokens, 1200, "a requested cap above the limit is clamped");
    assert.ok(store.spentUsd > 0, "reported usage settled the reservation");
    assert.equal(store.reservedUsd, 0);
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

test("budgeted provider bounds the number of model steps per session", async () => {
  const store = new MemoryBudgetGateStore(5);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const model = budgetedModel("test-steps", fakeModel(captured));
    for (let step = 0; step < 4; step += 1) {
      const result = await model.doStream(callOptions({ promptCacheKey: "steps-session" }));
      await drain(result.stream);
    }
    await assert.rejects(
      async () => {
        await model.doStream(callOptions({ promptCacheKey: "steps-session" }));
      },
      (error: unknown) => error instanceof ModelStepLimitError,
    );
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

test("budgeted provider keys the step counter per session, not per system prompt", async () => {
  const store = new MemoryBudgetGateStore(5);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const model = budgetedModel("test-independent", fakeModel(captured));
    // Session A spends its whole step allowance.
    for (let step = 0; step < 4; step += 1) {
      const result = await model.doStream(callOptions({ promptCacheKey: "session-a" }));
      await drain(result.stream);
    }
    await assert.rejects(
      async () => {
        await model.doStream(callOptions({ promptCacheKey: "session-a" }));
      },
      (error: unknown) => error instanceof ModelStepLimitError,
    );
    // A different session with the same system prompt is unaffected: the
    // counter must never be shared across sessions.
    for (let step = 0; step < 4; step += 1) {
      const result = await model.doStream(callOptions({ promptCacheKey: "session-b" }));
      await drain(result.stream);
    }
    await assert.rejects(
      async () => {
        await model.doStream(callOptions({ promptCacheKey: "session-b" }));
      },
      (error: unknown) => error instanceof ModelStepLimitError,
    );
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

test("budgeted provider fails closed before dispatch when the per-session key is missing", async () => {
  const store = new MemoryBudgetGateStore(5);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const model = budgetedModel("test-no-key", fakeModel(captured));
    await assert.rejects(
      async () => {
        await model.doStream(callOptions({}));
      },
      (error: unknown) => error instanceof MissingSessionKeyError,
    );
    assert.equal(captured.calls, 0, "the inner provider was never called");
    assert.equal(store.reservedUsd, 0, "no budget was reserved for a rejected request");
    // Repeated keyless calls must not pool into one shared counter either.
    await assert.rejects(
      async () => {
        await model.doStream(callOptions({}));
      },
      (error: unknown) => error instanceof MissingSessionKeyError,
    );
    assert.equal(captured.calls, 0);
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

test("input ceiling prices a schema-bearing responseFormat", async () => {
  const properties: Record<string, unknown> = {};
  for (let i = 0; i < 4000; i += 1) {
    properties[`field_${i}`] = { type: "string", description: "x".repeat(16) };
  }
  const responseFormat = { type: "json", name: "pact_big", schema: { type: "object", properties } };
  const schemaBytes = Buffer.byteLength(JSON.stringify(responseFormat), "utf8");
  assert.ok(schemaBytes > 100_000, `schema should be large (got ${schemaBytes} bytes)`);

  const without = new RecordingGateStore();
  setBudgetGateStoreForTests(without);
  await drain(
    (await budgetedModel("rf-without", fakeModel({ calls: 0 })).doStream(
      callOptions({ promptCacheKey: "rf-without" }),
    )).stream,
  );

  const withSchema = new RecordingGateStore();
  setBudgetGateStoreForTests(withSchema);
  await drain(
    (await budgetedModel("rf-with", fakeModel({ calls: 0 })).doStream(
      callOptions({ promptCacheKey: "rf-with", responseFormat }),
    )).stream,
  );
  setBudgetGateStoreForTests(undefined);

  const delta = withSchema.amounts[0] - without.amounts[0];
  assert.ok(delta > 0, "a schema-bearing responseFormat must raise the reservation");
  // One token per byte at the default $3/Mtok input price: the schema bytes
  // alone must move the reservation by ~schemaBytes * 3 / 1e6.
  assert.ok(
    delta >= (schemaBytes / 1e6) * 3 * 0.9,
    `reservation delta ${delta} must cover the ${schemaBytes}-byte schema`,
  );
});

test("budgeted provider retains the full ceiling when usage is absent", async () => {
  const store = new MemoryBudgetGateStore(5);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const model = budgetedModel("test-usage", fakeModel(captured, { input: 0, output: 0 }));
    const result = await model.doStream(callOptions({ promptCacheKey: "usage-session" }));
    await drain(result.stream);
    assert.ok(store.spentUsd > 0, "a billable response with no usage is not free");
    assert.equal(store.reservedUsd, 0);
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

test("budgeted provider refuses the request before dispatch when the gate rejects", async () => {
  const store = new MemoryBudgetGateStore(0);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const model = budgetedModel("test-gate", fakeModel(captured));
    await assert.rejects(
      async () => {
        await model.doStream(callOptions({ promptCacheKey: "gate-session" }));
      },
      (error: unknown) => error instanceof BudgetGateError && error.code === "budget_exceeded",
    );
    assert.equal(captured.calls, 0, "the inner provider was never called");
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

test("budgeted provider retains the full ceiling when a dispatched stream is cancelled", async () => {
  const store = new MemoryBudgetGateStore(5);
  setBudgetGateStoreForTests(store);
  try {
    const captured: Captured = { calls: 0 };
    const neverEnding = {
      specificationVersion: "v4",
      provider: "fake",
      modelId: "fake-model",
      supportedUrls: {},
      async doGenerate() {
        captured.calls += 1;
        return { content: [{ type: "text", text: "{}" }], finishReason: "stop", usage: v4Usage(1, 1), warnings: [] };
      },
      async doStream() {
        captured.calls += 1;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-delta", id: "t", delta: "partial" });
            // Never closes: models a turn that stalls past the client deadline.
          },
        });
        return { stream };
      },
    } as unknown as LanguageModel;
    const model = budgetedModel("test-cancel", neverEnding);
    const result = await model.doStream(callOptions({ promptCacheKey: "cancel-session" }));
    const reader = result.stream.getReader();
    await reader.read();
    await reader.cancel("client deadline exceeded");
    // settle is fire-and-forget from the stream cancel handler; let it run.
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(captured.calls, 1, "the request was dispatched");
    assert.ok(store.spentUsd > 0, "a cancelled dispatched request is not treated as free");
    assert.equal(store.reservedUsd, 0, "the uncertain cost is retained at the full ceiling");
  } finally {
    setBudgetGateStoreForTests(undefined);
  }
});

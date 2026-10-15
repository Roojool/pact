/**
 * Budgeted provider proxy for one eve role (the "tightly internal budgeted
 * provider" required by the PACT budget contract).
 *
 * Wraps the direct OpenAI LanguageModel with an AI SDK middleware that:
 *
 *  1. forces a real per-call output cap (`maxOutputTokens`) onto every
 *     provider request — tools cannot widen it;
 *  2. bounds the number of model steps per session (`PACT_AGENT_MAX_MODEL_STEPS`),
 *     keyed by the provider's per-session key. A request without a per-session
 *     key fails closed BEFORE any dispatch instead of pooling unrelated
 *     sessions under a shared system-prompt hash;
 *  3. enforces the durable global budget gate BEFORE EACH actual provider
 *     request (see ./budget-gate) with a conservative byte-accurate ceiling:
 *     one token per UTF-8 byte of the serialized request (prompt, tools, and
 *     schema-bearing `responseFormat`) plus the forced output cap, priced with
 *     the same env knobs the app uses.
 *
 * A rejected gate, a missing session key, or a step limit fails the model step
 * BEFORE dispatch, so no paid call happens. After dispatch, real reported usage
 * settles the reservation; missing/zero usage, a provider error, or a stream
 * cancellation settles at the full ceiling (never treated as free).
 *
 * Only `ai` is imported. The provider-level shapes are derived from the
 * middleware contract so the runtime does not depend on an undeclared
 * transitive package.
 */

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { gateModelRequest, type GateReservation } from "./budget-gate";

export class ModelStepLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelStepLimitError";
  }
}

/**
 * Raised when a provider request carries no per-session key, so the per-session
 * step bound cannot be attributed to one session. Failing closed here keeps an
 * unrelated visitor from inheriting another session's step count.
 */
export class MissingSessionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingSessionKeyError";
  }
}

interface Pricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  const value = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function envFloat(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolvePricing(): Pricing {
  return {
    inputPerMillionUsd: envFloat("PACT_MODEL_INPUT_USD_PER_MTOK", 3),
    outputPerMillionUsd: envFloat("PACT_MODEL_OUTPUT_USD_PER_MTOK", 15),
  };
}

/** Provider-level shapes derived from the middleware contract (no extra deps). */
type WrapStreamArgs = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0];
type ProviderParams = WrapStreamArgs["params"];
type ProviderStreamResult = Awaited<ReturnType<WrapStreamArgs["doStream"]>>;
type ProviderStreamPart = ProviderStreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;
type ProviderGenerateResult = Awaited<ReturnType<WrapStreamArgs["doGenerate"]>>;
type ProviderUsage = ProviderGenerateResult["usage"];
type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/** Conservative input-token ceiling: one token per UTF-8 byte, never bytes/3. */
function requestCeilingTokens(params: ProviderParams): number {
  // `responseFormat` can carry a large JSON schema, so it is priced too: a
  // token is never smaller than one UTF-8 byte, so an uncounted schema would
  // break the ceiling's upper-bound guarantee.
  const serialized = JSON.stringify({
    prompt: params.prompt ?? null,
    tools: params.tools ?? null,
    responseFormat: params.responseFormat ?? null,
  });
  return Buffer.byteLength(serialized, "utf8") + 1024; // envelope + format overhead
}

function usageCostUsd(usage: ProviderUsage | undefined, pricing: Pricing): number | undefined {
  const input = usage?.inputTokens?.total ?? 0;
  const output = usage?.outputTokens?.total ?? 0;
  if (!(input > 0) && !(output > 0)) return undefined; // missing/zero usage is not free
  // Price the full input at the uncached rate: most conservative.
  return (input / 1e6) * pricing.inputPerMillionUsd + (output / 1e6) * pricing.outputPerMillionUsd;
}

function readPromptCacheKey(params: ProviderParams): string | undefined {
  const options = params.providerOptions as Record<string, unknown> | undefined;
  const openai = options?.openai as Record<string, unknown> | undefined;
  const key = openai?.promptCacheKey;
  return typeof key === "string" && key ? key : undefined;
}

/** Bounded per-session step counters (never grows without limit). */
const stepCounts = new Map<string, number>();
function nextStep(sessionKey: string): number {
  const next = (stepCounts.get(sessionKey) ?? 0) + 1;
  if (stepCounts.size > 8192) stepCounts.clear();
  stepCounts.set(sessionKey, next);
  return next;
}

interface GuardConfig {
  role: string;
  maxOutputTokens: number;
  maxSteps: number;
  pricing: Pricing;
}

async function beginGuard(config: GuardConfig, params: ProviderParams): Promise<GateReservation> {
  const sessionKey = readPromptCacheKey(params);
  if (!sessionKey) {
    // Fail closed BEFORE reserving budget or dispatching. Keying the step
    // counter on the system prompt would pool every session of a role into one
    // global counter and block later visitors; eve supplies a real per-session
    // key for direct openai/codex calls, so a missing key is a misconfiguration.
    throw new MissingSessionKeyError(
      "Budgeted provider: the provider request has no per-session key " +
        "(openai.promptCacheKey); refusing the request instead of sharing a step counter across sessions. " +
        "Configure a stable per-session promptCacheKey (eve does this for direct openai/codex providers).",
    );
  }
  const step = nextStep(sessionKey);
  if (step > config.maxSteps) {
    throw new ModelStepLimitError(
      `Budgeted provider: session exceeded ${config.maxSteps} model steps; refusing step ${step}.`,
    );
  }
  const ceilingUsd =
    (requestCeilingTokens(params) / 1e6) * config.pricing.inputPerMillionUsd +
    (config.maxOutputTokens / 1e6) * config.pricing.outputPerMillionUsd +
    0.0005; // minimum reservation
  return gateModelRequest(config.role, ceilingUsd);
}

function wrapResultStream(
  original: ProviderStreamResult["stream"],
  reservation: GateReservation,
  pricing: Pricing,
): ProviderStreamResult["stream"] {
  const reader = original.getReader();
  let usage: ProviderUsage | undefined;
  let settled = false;
  const settle = (error?: unknown): void => {
    if (settled) return;
    settled = true;
    const cost = usageCostUsd(usage, pricing);
    if (error !== undefined || cost === undefined) void reservation.retainUncertain();
    else void reservation.settleActual(cost);
  };
  return new ReadableStream<ProviderStreamPart>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settle();
          controller.close();
          return;
        }
        if (value.type === "finish") usage = value.usage;
        controller.enqueue(value);
      } catch (error) {
        settle(error);
        controller.error(error);
      }
    },
    cancel(reason) {
      settle(new Error(String(reason)));
      return reader.cancel(reason).catch(() => undefined);
    },
  });
}

/**
 * Wrap a direct provider LanguageModel with the PACT budget guard. The return
 * type is the concrete provider model so callers (and tests) can invoke it.
 */
export function budgetedModel(role: string, inner: LanguageModel): ReturnType<typeof wrapLanguageModel> {
  if (typeof inner === "string") {
    throw new Error("budgetedModel requires a provider LanguageModel, not a gateway model id");
  }
  const config: GuardConfig = {
    role,
    maxOutputTokens: envNumber("PACT_AGENT_MAX_OUTPUT_TOKENS", 1200, 16, 4000),
    maxSteps: envNumber("PACT_AGENT_MAX_MODEL_STEPS", 4, 1, 16),
    pricing: resolvePricing(),
  };
  const middleware: LanguageModelMiddleware = {
    transformParams: async ({ params }) => ({
      ...params,
      maxOutputTokens: Math.min(params.maxOutputTokens ?? Number.POSITIVE_INFINITY, config.maxOutputTokens),
    }),
    wrapGenerate: async ({ doGenerate, params }) => {
      const reservation = await beginGuard(config, params);
      try {
        const result = await doGenerate();
        const cost = usageCostUsd(result.usage, config.pricing);
        if (cost === undefined) await reservation.retainUncertain();
        else await reservation.settleActual(cost);
        return result;
      } catch (error) {
        await reservation.retainUncertain();
        throw error;
      }
    },
    wrapStream: async ({ doStream, params }) => {
      const reservation = await beginGuard(config, params);
      try {
        const result = await doStream();
        return { ...result, stream: wrapResultStream(result.stream, reservation, config.pricing) };
      } catch (error) {
        await reservation.retainUncertain();
        throw error;
      }
    },
  };
  return wrapLanguageModel({ model: inner as WrappableModel, middleware });
}

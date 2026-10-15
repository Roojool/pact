import { defineAgent } from "eve";
import { openai } from "eve/models/openai";

import { budgetedModel } from "./lib/budgeted-model";

/**
 * Account Manager role.
 *
 * Uses the direct OpenAI Responses provider (no AI Gateway). The model is
 * wrapped in the PACT budgeted provider proxy, which enforces the durable
 * global budget gate before EACH actual provider request, forces a real
 * per-call output cap, and bounds the model steps per session. Built-in
 * shell, browser, file, and self-cloning tools are disabled; the only
 * capabilities are the narrow tools under `agent/tools/`.
 */
export default defineAgent({
  model: budgetedModel("account_manager", openai(process.env.OPENAI_MODEL ?? "gpt-6.1-sol")),
  reasoning: "low",
  defaultTools: false,
  limits: {
    // Soft framework limits only — they are checked after provider-reported
    // usage and are NOT the budget guard. The durable guard is the budgeted
    // provider proxy (per-request ledger reservation in ./lib).
    maxInputTokensPerSession: 60_000,
    maxOutputTokensPerSession: 6_000,
    maxTokenCostUsdPerSession: 0.5,
  },
});

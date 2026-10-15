import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveHandoffStore } from "../lib/handoff";
import { readBoundWorkspaceId } from "../lib/tenant";

/**
 * Narrow, tenant-bound read of recent Account Manager handoffs.
 *
 * The workspace is NOT a tool argument: it is derived from the authenticated
 * session binding (the trusted app-supplied workspace header, copied into
 * `ctx.session.auth` by the runtime channel). The Cypher is fixed and
 * parameterized, so the model can neither supply a query nor read another
 * tenant's handoffs. A missing or invalid binding fails the call.
 */
export default defineTool({
  description: "Read recent Account Manager handoffs for the authenticated workspace from the shared graph.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async execute({ limit }, ctx) {
    const workspaceId = readBoundWorkspaceId(ctx);
    const handoffs = await resolveHandoffStore().read(workspaceId, limit);
    return { workspaceId, handoffs };
  },
});

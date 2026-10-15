import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveHandoffStore } from "../lib/handoff";
import { readBoundWorkspaceId } from "../lib/tenant";

/**
 * Narrow, tenant-bound write of the Account Manager's handoff summary.
 *
 * The workspace is NOT a tool argument: it is derived from the authenticated
 * session binding (the trusted app-supplied workspace header, copied into
 * `ctx.session.auth` by the runtime channel). The Cypher is fixed and
 * parameterized, so the model can neither supply a query nor write into
 * another tenant's handoffs. A missing or invalid binding fails the call.
 */
export default defineTool({
  description:
    "Persist the Account Manager's handoff summary for the authenticated workspace so the Campaign Producer can recall it later.",
  inputSchema: z.object({
    summary: z.string().min(1).max(2000),
    sourceIds: z.array(z.string().min(1).max(200)).max(40),
  }),
  async execute({ summary, sourceIds }, ctx) {
    const workspaceId = readBoundWorkspaceId(ctx);
    const { id, createdAt } = await resolveHandoffStore().write(workspaceId, { summary, sourceIds });
    return { id, workspaceId, createdAt };
  },
});

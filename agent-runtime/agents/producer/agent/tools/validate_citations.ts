import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Pure citation check. No external access; the model passes the known set from
 * the turn context and the IDs it intends to cite. Unknown IDs are returned so
 * the model can drop them before finalizing.
 */
export default defineTool({
  description:
    "Check candidate source IDs against the known source IDs from the context. Returns which are valid and which are unknown.",
  inputSchema: z.object({
    known: z.array(z.string()).max(200),
    candidate: z.array(z.string()).max(200),
  }),
  execute({ known, candidate }) {
    const knownSet = new Set(known);
    const valid: string[] = [];
    const unknown: string[] = [];
    for (const id of candidate) {
      if (knownSet.has(id)) {
        if (!valid.includes(id)) valid.push(id);
      } else if (!unknown.includes(id)) {
        unknown.push(id);
      }
    }
    return { valid, unknown };
  },
});

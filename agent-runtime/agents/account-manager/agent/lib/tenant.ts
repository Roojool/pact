/**
 * Trusted tenant binding for runtime tools.
 *
 * The workspace a runtime tool acts on must never come from the model: a
 * prompt-injected model could otherwise read or write another workspace's
 * graph nodes. Instead the tenant is bound by the trusted app-to-runtime
 * channel (`agent/channels/eve.ts`), which authenticates the Next.js app with
 * a shared secret and copies the app-supplied `x-pact-workspace-id` header into
 * the session's authenticated `attributes`. Tools read it back from the
 * supported eve tool context (`ctx.session.auth`) and fail closed when it is
 * absent or malformed.
 */

import type { ToolContext } from "eve/tools";

/** Header the trusted app uses to bind a runtime call to one workspace. */
export const PACT_WORKSPACE_HEADER = "x-pact-workspace-id";

/** Auth attribute key the channel writes the bound workspace id under. */
export const PACT_WORKSPACE_ATTRIBUTE = "pactWorkspaceId";

/** Workspace ids are opaque server-generated tokens; reject anything else. */
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export function isValidWorkspaceBinding(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_ID_PATTERN.test(value);
}

/** Parsed outcome of the app-supplied workspace header. */
export type WorkspaceBinding =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "bound"; readonly workspaceId: string };

/**
 * Classify the trusted app-supplied workspace header. Kept pure so the runtime
 * channel and tests share one implementation without importing the channel.
 */
export function parseWorkspaceBindingHeader(value: string | null): WorkspaceBinding {
  if (value === null || value.trim().length === 0) return { kind: "absent" };
  return isValidWorkspaceBinding(value) ? { kind: "bound", workspaceId: value } : { kind: "invalid" };
}

/** Raised when a tool runs without a usable authenticated workspace binding. */
export class MissingWorkspaceBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingWorkspaceBindingError";
  }
}

function attributeWorkspaceId(auth: ToolContext["session"]["auth"]["current"]): string | undefined {
  const raw = auth?.attributes?.[PACT_WORKSPACE_ATTRIBUTE];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isValidWorkspaceBinding(value) ? value : undefined;
}

/**
 * Resolve the workspace bound to the active session. Checks the current caller
 * first, then the session initiator (a later turn may not re-send the header).
 * Throws rather than falling back to any model-supplied or default tenant.
 */
export function readBoundWorkspaceId(ctx: ToolContext): string {
  const auth = ctx.session.auth;
  const bound = attributeWorkspaceId(auth.current) ?? attributeWorkspaceId(auth.initiator);
  if (!bound) {
    throw new MissingWorkspaceBindingError(
      "No authenticated workspace binding on this session; refusing to touch handoff memory. " +
        "The runtime channel binds it from the trusted app-supplied workspace header.",
    );
  }
  return bound;
}

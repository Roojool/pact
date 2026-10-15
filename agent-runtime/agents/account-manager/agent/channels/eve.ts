import { eveChannel } from "eve/channels/eve";
import {
  extractBearerToken,
  ForbiddenError,
  localDev,
  UnauthenticatedError,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";
import { createHash, timingSafeEqual } from "node:crypto";

import { parseWorkspaceBindingHeader, PACT_WORKSPACE_ATTRIBUTE, PACT_WORKSPACE_HEADER } from "../lib/tenant";

/**
 * Internal app-to-runtime channel.
 *
 * The Next.js app authenticates to this runtime with a shared secret carried
 * in the `Authorization: Bearer ...` header (`PACT_RUNTIME_TOKEN`, set only in
 * the environment of both processes — the value is never written to files).
 * The comparison is constant-time over SHA-256 digests.
 *
 * The same authenticated request also carries the workspace it acts on in the
 * `x-pact-workspace-id` header. Because only the trusted app holds the shared
 * secret, that header is trustworthy: this channel copies it into the session's
 * authenticated `attributes`, where tools read it from `ctx.session.auth`. A
 * malformed binding is rejected here; an absent one authenticates but leaves
 * the tools to fail closed rather than default to any tenant.
 *
 * This replaces the scaffolded `placeholderAuth()` chain so the runtime is
 * deployable inside Docker without Vercel OIDC credentials while staying
 * fail-closed: with no `PACT_RUNTIME_TOKEN` configured, this entry
 * authenticates nothing, and `localDev()` only works while the process is an
 * `eve dev` server — production requests without the secret are rejected 401.
 */
export function runtimeTokenAuth(): AuthFn<Request> {
  return withAuthChallenges(async (request) => {
    const expected = process.env.PACT_RUNTIME_TOKEN?.trim();
    if (!expected) return null; // nothing this entry can authenticate; keep walking
    const presented = extractBearerToken(request.headers.get("authorization"));
    if (presented === null) {
      throw new UnauthenticatedError({
        code: "runtime_token_required",
        message: "PACT app-to-runtime authentication requires a bearer token.",
      });
    }
    const presentedDigest = createHash("sha256").update(presented).digest();
    const expectedDigest = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(presentedDigest, expectedDigest)) {
      throw new UnauthenticatedError({
        code: "runtime_token_invalid",
        message: "Invalid PACT app-to-runtime bearer token.",
      });
    }
    const attributes: Record<string, string> = {};
    const binding = parseWorkspaceBindingHeader(request.headers.get(PACT_WORKSPACE_HEADER));
    if (binding.kind === "invalid") {
      throw new ForbiddenError({
        code: "workspace_binding_invalid",
        message: "The app-supplied workspace binding is malformed.",
      });
    }
    if (binding.kind === "bound") {
      attributes[PACT_WORKSPACE_ATTRIBUTE] = binding.workspaceId;
    }
    return {
      authenticator: "pact-runtime-token",
      principalId: "pact-app",
      principalType: "service",
      attributes,
    };
  }, [{ scheme: "Bearer" }]);
}

export default eveChannel({
  auth: [runtimeTokenAuth(), localDev()],
});

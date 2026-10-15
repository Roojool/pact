# syntax=docker/dockerfile:1
#
# PACT eve agent runtime — self-hosted, no Vercel.
#
# `agent-runtime/` is an eve *workspace* with two members (`account-manager`,
# `producer`). Per the installed eve docs (guides/deployment/self-hosting.md,
# "Run workspace members"), a root `eve build` produces a Vercel workspace
# deployment, NOT self-hosted Node servers; each member must be built and
# started from its own directory. This image builds BOTH members and starts one
# per container, selected at run time by PACT_AGENT_ROLE.
#
# Build context is this directory:
#   docker build -t pact-agent-runtime ./agent-runtime
#   docker run --rm -p 3011:3011 \
#     -e PACT_AGENT_ROLE=producer -e PACT_AGENT_PORT=3011 \
#     -e PACT_RUNTIME_TOKEN=<shared-secret> \
#     -e FALKORDB_URL=redis://graph:6379 \
#     pact-agent-runtime
#
# No Vercel OIDC credentials are used anywhere. The app-to-runtime channel is
# authenticated by the shared secret PACT_RUNTIME_TOKEN (see
# agents/*/agent/channels/eve.ts). With the secret unset the channel is
# fail-closed for non-dev callers (production `/eve/v1/info`, `/eve/v1/session`,
# stream, cancel and reset all return 401).

FROM node:24-bookworm-slim AS build
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Each workspace member is its own build. `--skip-sandbox-prewarm` is required
# because the build container has no Docker socket, and eve's default sandbox
# selector then falls back to `just-bash`, which is not installed. These agents
# expose NO sandbox tools (defaultTools: false; only the narrow typed tools in
# agent/tools are present), so the sandbox template is never used at runtime.
RUN cd agents/account-manager && npx eve build --skip-sandbox-prewarm
RUN cd agents/producer && npx eve build --skip-sandbox-prewarm

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace /workspace
# Pre-create each member's local Workflow world data directory. eve's default
# world stores run state under `.eve/.workflow-data` (resolved from the role's
# working directory), and that directory is runtime state, so it is absent from
# the build output. When a Docker *named* volume is mounted at a path that
# already exists in the image, Docker initializes the fresh volume from that
# path — including its ownership. Creating the directory here as `node` (this
# RUN still executes as root; `USER node` is set below) therefore makes a fresh
# `am-workflow-data` / `producer-workflow-data` volume node-owned instead of
# root-owned, so `eve start` can create and write its run state without EACCES.
# This fixes fresh volumes at build time; repairing an already-created
# production volume is separate operational remediation.
RUN mkdir -p \
      /workspace/agents/account-manager/.eve/.workflow-data \
      /workspace/agents/producer/.eve/.workflow-data \
 && chown -R node:node \
      /workspace/agents/account-manager/.eve \
      /workspace/agents/producer/.eve
# One role per container. Both members are built into the image; the role and
# port are chosen at run time.
ENV PACT_AGENT_ROLE=producer \
    PACT_AGENT_PORT=3011
EXPOSE 3011
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PACT_AGENT_PORT||3011)+'/eve/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "cd agents/${PACT_AGENT_ROLE} && exec npx eve start --host 0.0.0.0 --port ${PACT_AGENT_PORT}"]

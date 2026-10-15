# PACT worker contract

Read src/lib/types.ts. Do not change it without reporting the exact needed change to the orchestrator. User approved building PACT on Oct 15. All fixture data must be fictional. No secrets, screenshots, private planning reports or account details in the public repository.

## App API (orchestrator owns route handlers)
- GET /api/workspace => {workspace: Workspace}
- POST /api/analyze {revision:number, live?:boolean} => {workspace: Workspace, analysis: Analysis}
- PATCH /api/workspace {revision:number, edit: WorkspaceEdit} => {workspace: Workspace}
- POST /api/approve {revision:number, proposalId:string, idempotencyKey:string} => {workspace: Workspace, decision: Decision}
- POST /api/reset {} => {workspace: Workspace}
- POST /api/memory {message:string, live?:boolean} => {reply: AgentReply, workspace: Workspace}
- GET /api/health => status and public capability booleans (never secrets)
Errors {error:string,code:string} HTTP 400/409/429/503. Cookies identify an isolated anonymous workspace. Never accept workspace ID from client payload. No paid calls without OPENAI_API_KEY and global budget gate.

## Backend exports (DeepSeek worker owns src/lib/domain.ts, graph.ts, fixtures.ts, validation.ts and tests/core.test.ts + tests/graph.integration.ts)
- createFixture(id:string): Workspace
- checkPlan(workspace: Workspace, changes?: PlanChange[], commitmentIds?: string[]): CheckResult
- proposeRepairs(workspace: Workspace): Proposal[] (do not mutate input)
- readWorkspace(id:string): Promise<Workspace|null>
- createWorkspace(id:string): Promise<Workspace>
- analyzeWorkspace(id:string, revision:number): Promise<{workspace:Workspace,analysis:Analysis}>
- editWorkspace(id:string,revision:number,edit:WorkspaceEdit): Promise<Workspace>
- approveProposal(id:string,revision:number,proposalId:string,idempotencyKey:string): Promise<{workspace:Workspace,decision:Decision}>
- recallMemory(id:string,message:string): Promise<AgentReply>
- graphHealth(): Promise<boolean>
Graph must store domain nodes/edges, discover dependencies via actual traversals, and persist proposals, decisions and memory. No in-memory business-state substitute when DB unavailable. Prove snapshot recovery and optimistic concurrency. Scope per graph opaque server ID. Use falkordb npm client.

## Interface worker ownership
src/app/page.tsx, src/app/layout.tsx, src/app/globals.css, src/components/** only. Consume API above. Do not create backend handlers or change shared types/config/package/lockfile. Warm ivory editorial studio look, elegant serif headlines, readable sans body, clay and sage accents. Never a generic neon AI dashboard. All controls functional; show truthful deterministic/live status and unavailable/error state.

## Agent worker ownership
agent-runtime/**, src/lib/agents.ts, src/lib/budget.ts, tests/agents.test.ts, scripts/mcp.ts only. Create an Eve project as planned, read shipped docs first. Provide exports runAgentAnalysis(workspace:Workspace,analysis:Analysis):Promise<Analysis> and runAgentMemory(workspace:Workspace,message:string,fallback:AgentReply):Promise<AgentReply>. Agents consume graph-derived structured context; never freely mutate DB. Persist usage in FalkorDB so restarting cannot erase budget. MCP must use narrow domain tools and tenant binding; do not expose raw Cypher publicly. If creating dependencies request orchestrator or confine them to agent-runtime/package.json. Direct OpenAI Responses credentials (user's credits), not AI Gateway. No unbounded tools/shell/browser. Include honest unavailable state if key/runtime absent.

## Hero dataset
Morrow Studio, six creators, three campaigns with distinct creators, each needs 4 editor-hours before end Day 1. Alex has slots 0..15 and is approved for all. Sam has Day 1 capacity (at least four slots), explicitly unapproved for campaign C, and is not an eligible replacement for A/B under initial policies. C is allowed to move to Day 2. Same editor per task; work divisible into one-hour slots. Pair fits, triple does not. Repair: move C to Day 2. Rejected candidate: Sam for C. New approval fact must enable original deadlines. All unknown eligibility/duration handled truthfully. Approval is an internal reservation/owner task, not actual publishing or delivery.

## Boundaries
Only modify assigned files. Do not read .env*, credentials or user directories. No git commits/push, cloud provisioning, sending messages, model-provider tests or purchases. Use RTK for supported shell tools. No nested agents. Run meaningful checks for your module and report files changed, commands/results, gaps. Use installed docs/types; do not invent SDK methods. Code must compile under strict TypeScript.

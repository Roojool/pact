/**
 * PACT MCP adapter (stdio).
 *
 * Exposes a small, read-only tool surface to MCP clients. Design constraints:
 * - Tenant-bound: the workspace is fixed by configuration
 *   (`PACT_MCP_WORKSPACE_ID`), never by a tool argument.
 * - No raw Cypher and no query string is ever accepted from the model.
 * - Read/check only: nothing here mutates domain state.
 *
 * Transport: MCP JSON-RPC 2.0 over stdio, one JSON message per line.
 * Dependency-free (Node built-ins plus the repo's `falkordb` and graph reader).
 *
 * Config:
 *   PACT_MCP_WORKSPACE_ID  required tenant binding
 *   PACT_MCP_ALLOWED_TOOLS optional comma-separated allowlist
 *   FALKORDB_URL / PACT_BUDGET_GRAPH  for the read-only budget status tool
 *
 * Run: npx tsx scripts/mcp.ts
 */

import { createInterface } from 'node:readline';
import type { Workspace } from '../src/lib/types';
import { readWorkspace } from '../src/lib/graph';
import { createBudgetLedger } from '../src/lib/budget';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'pact-mcp';
const SERVER_VERSION = '0.1.0';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: McpToolDefinition[] = [
  {
    name: 'pact_workspace_summary',
    description: 'Read a bounded summary of the bound workspace (counts and IDs only, never a full graph dump).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pact_list_sources',
    description: 'List the source documents for the bound workspace with their revision metadata.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pact_check_plan',
    description:
      'Run a read-only advisory feasibility check over the bound workspace. The app domain checker remains authoritative.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pact_budget_status',
    description: 'Read the remaining agent spend from the persistent budget ledger. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

interface Config {
  workspaceId?: string;
  allowedTools?: Set<string>;
}

function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const allowed = env.PACT_MCP_ALLOWED_TOOLS?.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    workspaceId: env.PACT_MCP_WORKSPACE_ID?.trim() || undefined,
    allowedTools: allowed && allowed.length ? new Set(allowed) : undefined,
  };
}

/**
 * Read the bound tenant's workspace from the live graph through the shared,
 * graph-native reader. There is no JSON snapshot and no tenant argument: the
 * tenant is fixed by `PACT_MCP_WORKSPACE_ID`. A missing workspace or an
 * unreachable graph fails closed (the tool returns an error).
 */
async function loadWorkspace(config: Config): Promise<Workspace> {
  if (!config.workspaceId) throw new Error('PACT_MCP_WORKSPACE_ID is not configured');
  const workspace = await readWorkspace(config.workspaceId);
  if (!workspace) throw new Error(`Workspace "${config.workspaceId}" was not found in the graph.`);
  return workspace;
}

/** Read-only advisory check. Not a replacement for the domain checker. */
export function advisoryCheck(workspace: Workspace) {
  const commitments = workspace.commitments ?? [];
  const editors = workspace.editors ?? [];
  const approvals = workspace.approvals ?? [];
  const requiredHours = commitments.reduce((sum, c) => sum + (typeof c.hours === 'number' ? c.hours : 0), 0);
  const availableHours = editors.reduce((sum, e) => sum + (e.slots?.length ?? 0), 0);
  const approvedPairs = new Set(approvals.filter((a) => a.approved).map((a) => `${a.campaignId}:${a.editorId}`));
  const issues: string[] = [];
  const conflictIds: string[] = [];
  for (const commitment of commitments) {
    const hasApprovedEditor = editors.some((editor) => approvedPairs.has(`${commitment.campaignId}:${editor.id}`));
    if (!hasApprovedEditor) {
      issues.push(`Commitment ${commitment.id} has no approved editor for campaign ${commitment.campaignId}.`);
      conflictIds.push(commitment.id);
    }
  }
  const unknownHours = commitments.filter((c) => c.hours === null).map((c) => c.id);
  const status = unknownHours.length ? 'needs_information' : requiredHours > availableHours || issues.length ? 'infeasible' : 'feasible';
  return {
    status,
    requiredHours,
    availableHours,
    conflictIds,
    issues,
    unknownHours,
    note: 'Read-only advisory check from the MCP adapter. The app domain checker is authoritative.',
  };
}

async function runTool(name: string, config: Config): Promise<unknown> {
  if (name === 'pact_budget_status') {
    const ledger = createBudgetLedger(process.env);
    try {
      return await ledger.snapshot();
    } finally {
      await ledger.close().catch(() => undefined);
    }
  }
  const workspace = await loadWorkspace(config);
  switch (name) {
    case 'pact_workspace_summary':
      return {
        id: workspace.id,
        agency: workspace.agency,
        revision: workspace.revision,
        counts: {
          creators: workspace.creators?.length ?? 0,
          campaigns: workspace.campaigns?.length ?? 0,
          commitments: workspace.commitments?.length ?? 0,
          editors: workspace.editors?.length ?? 0,
          approvals: workspace.approvals?.length ?? 0,
          events: workspace.events?.length ?? 0,
          proposals: workspace.proposals?.length ?? 0,
          decisions: workspace.decisions?.length ?? 0,
        },
        campaignIds: (workspace.campaigns ?? []).map((c) => c.id).slice(0, 50),
      };
    case 'pact_list_sources':
      return {
        sources: (workspace.sources ?? []).map((s) => ({ id: s.id, title: s.title, kind: s.kind, revision: s.revision })),
      };
    case 'pact_check_plan':
      return advisoryCheck(workspace);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function handleRequest(request: JsonRpcRequest, config: Config): Record<string, unknown> | null {
  const id = request.id ?? null;
  const method = request.method ?? '';
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (method === 'notifications/initialized' || method.startsWith('notifications/')) return null;

  if (method === 'initialize') {
    return ok({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') {
    const tools = TOOLS.filter((tool) => !config.allowedTools || config.allowedTools.has(tool.name));
    return ok({ tools });
  }
  if (method === 'tools/call') {
    const name = typeof request.params?.name === 'string' ? request.params.name : '';
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return fail(-32602, `Unknown tool: ${name}`);
    if (config.allowedTools && !config.allowedTools.has(name)) return fail(-32601, `Tool not allowed: ${name}`);
    // The call is async; handled by the caller through `callTool`.
    return null;
  }
  return fail(-32601, `Method not found: ${method}`);
}

export async function callTool(name: string, config: Config): Promise<Record<string, unknown>> {
  try {
    const output = await runTool(name, config);
    return { content: [{ type: 'text', text: JSON.stringify(output) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const write = (message: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(message)}\n`);

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    if (request.method === 'tools/call') {
      const name = typeof request.params?.name === 'string' ? request.params.name : '';
      const response = await callTool(name, config);
      write({ jsonrpc: '2.0', id: request.id ?? null, result: response });
      continue;
    }
    const response = handleRequest(request, config);
    if (response) write(response);
  }
}

const entry = process.argv[1] ?? '';
if (/mcp\.(ts|js|mjs|cjs)$/.test(entry)) {
  void main();
}

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { analyzeWorkspace, approveProposal, createWorkspace, createBusinessWorkspace, editWorkspace, graphHealth, readWorkspace, recallMemory, recordLiveActivities } from '@/lib/graph';
import { runAgentAnalysis, runAgentMemory, runAgentSetup } from '@/lib/agents';
import { setupDraftSchema } from '@/lib/business-setup';
import { checkOrigin, errorResponse, HttpError, jsonBody, newSessionId, rateLimit, requireSession, response, sessionId } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const day = z.union([z.literal(1), z.literal(2)]);
const edit = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('permission'), campaignId: z.string().min(1).max(100), editorId: z.string().min(1).max(100), approved: z.boolean() }).strict(),
  z.object({ kind: z.literal('commitment'), id: z.string().min(1).max(100), hours: z.number().int().min(1).max(8).nullable().optional(), deadlineDay: day.optional() }).strict(),
  z.object({ kind: z.literal('approval'), id: z.string().min(1).max(100), approved: z.boolean() }).strict(),
  z.object({ kind: z.literal('editor'), id: z.string().min(1).max(100), slots: z.array(z.number().int().min(0).max(15)).max(16) }).strict(),
  z.object({ kind: z.literal('event'), id: z.string().min(1).max(100), start: z.number().int().min(0).max(47), end: z.number().int().min(1).max(48) }).strict(),
]);
const revision = z.number().int().nonnegative();
type Context = { params: Promise<{ action: string }> };

async function checkLiveAiCapability(): Promise<{ available: boolean; amReachable: boolean; prodReachable: boolean }> {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();
  const transport = (process.env.PACT_AGENT_TRANSPORT ?? 'eve').trim().toLowerCase();
  if (transport === 'direct') {
    return { available: Boolean(apiKey && process.env.PACT_BUDGET_URL), amReachable: true, prodReachable: true };
  }
  const amUrl = (process.env.AGENT_RUNTIME_URL ?? 'http://127.0.0.1:3010').replace(/\/+$/, '');
  const prodUrl = (process.env.AGENT_PRODUCER_URL ?? 'http://127.0.0.1:3011').replace(/\/+$/, '');
  const token = process.env.PACT_RUNTIME_TOKEN?.trim();
  const authHeaders: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  let amReachable = false;
  let prodReachable = false;
  try {
    const res = await fetch(`${amUrl}/eve/v1/health`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(1500),
    });
    amReachable = res.ok;
  } catch {
    amReachable = false;
  }

  try {
    const res = await fetch(`${prodUrl}/eve/v1/health`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(1500),
    });
    prodReachable = res.ok;
  } catch {
    prodReachable = false;
  }

  const available = amReachable && prodReachable && Boolean(apiKey && process.env.PACT_BUDGET_URL);
  return { available, amReachable, prodReachable };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { action } = await context.params;
    if (action === 'health') {
      const database = await graphHealth().catch(() => false);
      const { available: liveAiAvailable, amReachable, prodReachable } = await checkLiveAiCapability().catch(() => ({ available: false, amReachable: false, prodReachable: false }));
      const transport = (process.env.PACT_AGENT_TRANSPORT ?? 'eve').trim().toLowerCase();
      const runtimeReachable = transport === 'direct' ? true : (amReachable && prodReachable);
      return response({
        status: database ? 'ok' : 'unavailable',
        ok: database,
        database,
        graphConnected: database,
        runtimeReachable,
        amRuntimeReachable: amReachable,
        producerRuntimeReachable: prodReachable,
        liveAiAvailable,
        liveAvailable: liveAiAvailable,
        transport,
        setupFork: true,
        setupAiAvailable: Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.PACT_BUDGET_URL?.trim()),
      });
    }
    if (action !== 'workspace') throw new HttpError(404, 'NOT_FOUND', 'Unknown API route.');
    const existing = sessionId(request);
    const workspace = existing ? await readWorkspace(existing) : null;
    if (workspace) return response({ workspace });
    rateLimit('create:global', 60, 60 * 60 * 1000);
    const id = newSessionId();
    return response({ workspace: null }, id);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    checkOrigin(request);
    if ((await context.params).action !== 'workspace') throw new HttpError(404, 'NOT_FOUND', 'Unknown API route.');
    const id = requireSession(request);
    rateLimit(`edit:${id}`, 60, 60 * 60 * 1000);
    const body = z.object({ revision, edit }).strict().parse(await jsonBody(request));
    return response({ workspace: await editWorkspace(id, body.revision, body.edit) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    const id = requireSession(request);
    rateLimit(`request:${id}`, 60, 60 * 60 * 1000);
    const raw = await jsonBody(request, action === 'setup' ? 32768 : 8192);
    if (action === 'setup-draft') {
      rateLimit(`setup:${id}`, 3, 60 * 60 * 1000);
      const body = z.object({ note: z.string().trim().min(1).max(4000) }).strict().parse(raw);
      return response(await runAgentSetup(id, body.note));
    }
    if (action === 'setup') {
      rateLimit('create:global', 60, 60 * 60 * 1000);
      const body = z.object({ draft: setupDraftSchema, note: z.string().max(4000), confirmation: z.literal(true), idempotencyKey: z.string().min(8).max(100) }).strict().parse(raw);
      return response({ workspace: await createBusinessWorkspace(id, body.draft, body.note, body.idempotencyKey) });
    }
    if (action === 'reset') {
      z.object({}).strict().parse(raw);
      rateLimit('create:global', 60, 60 * 60 * 1000);
      const next = newSessionId();
      return response({ workspace: await createWorkspace(next) }, next);
    }
    if (action === 'analyze') {
      const body = z.object({ revision, live: z.boolean().optional() }).strict().parse(raw);
      if (body.live) rateLimit(`live:${id}`, 8, 60 * 60 * 1000);
      const result = await analyzeWorkspace(id, body.revision);
      if (body.live) {
        result.analysis = await runAgentAnalysis(result.workspace, result.analysis);
        if (result.analysis.mode === 'live' && result.analysis.activity.length > 0) {
          const liveActs = result.analysis.activity.filter((a) => a.role === 'account_manager' || a.role === 'producer');
          if (liveActs.length > 0) {
            result.workspace = await recordLiveActivities(id, liveActs);
          }
        }
      }
      return response(result);
    }
    if (action === 'approve') {
      const body = z.object({ revision, proposalId: z.string().min(1).max(100), idempotencyKey: z.string().min(8).max(100) }).strict().parse(raw);
      return response(await approveProposal(id, body.revision, body.proposalId, body.idempotencyKey));
    }
    if (action === 'memory') {
      const body = z.object({ message: z.string().trim().min(1).max(1000), live: z.boolean().optional() }).strict().parse(raw);
      const existing = await readWorkspace(id);
      if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Workspace not found.');
      let reply = await recallMemory(id, body.message);
      let freshWorkspace = await readWorkspace(id);
      if (body.live) {
        rateLimit(`live:${id}`, 8, 60 * 60 * 1000);
        reply = await runAgentMemory(freshWorkspace ?? existing, body.message, reply);
        if (reply.mode === 'live' && reply.activity.length > 0) {
          const liveActs = reply.activity.filter((a) => a.role === 'account_manager' || a.role === 'producer');
          if (liveActs.length > 0) {
            freshWorkspace = await recordLiveActivities(id, liveActs);
          }
        }
      }
      return response({ reply, workspace: freshWorkspace ?? existing });
    }
    throw new HttpError(404, 'NOT_FOUND', 'Unknown API route.');
  } catch (error) { return errorResponse(error); }
}

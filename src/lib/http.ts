import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

const COOKIE = 'pact_workspace';
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function sign(id: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, 'CONFIGURATION', 'Workspace signing is not configured.');
  return createHmac('sha256', secret).update(id).digest('hex');
}
export function sessionId(request: NextRequest): string | null {
  const cookie = request.cookies.get(COOKIE)?.value;
  if (!cookie) return null;
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [id, signature] = parts;
  if (!/^ws_[a-f0-9]{32}$/.test(id ?? '') || !/^[a-f0-9]{64}$/.test(signature ?? '')) return null;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id), 'hex')) ? id : null;
}
export function newSessionId() { return `ws_${randomBytes(16).toString('hex')}`; }
export function requireSession(request: NextRequest) {
  const id = sessionId(request);
  if (!id) throw new HttpError(401, 'SESSION_REQUIRED', 'Open the campaign desk to start your workspace.');
  return id;
}
export function response(data: unknown, id?: string) {
  const res = NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  if (id) res.cookies.set(COOKIE, `${id}.${sign(id)}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
}
export function checkOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { originHost = ''; }
  if (originHost !== request.headers.get('host')) throw new HttpError(403, 'ORIGIN', 'This request must come from the PACT app.');
}
export async function jsonBody(request: NextRequest): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_INPUT', 'A JSON request body is required.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new HttpError(413, 'INPUT_LIMIT', 'This request is too large.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_INPUT', 'Send a valid JSON request.');
  } finally { reader.releaseLock(); }
}
// shortcut: per-process request throttling; move to a shared limiter before adding app replicas.
const globalRates = globalThis as typeof globalThis & { pactRates?: Map<string, { count: number; until: number }> };
const rates = globalRates.pactRates ??= new Map();
export function rateLimit(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  for (const [k, value] of rates) if (value.until <= now) rates.delete(k);
  const value = rates.get(key) ?? { count: 0, until: now + windowMs };
  if (value.count >= maximum) throw new HttpError(429, 'RATE_LIMIT', 'This demo has reached its run allowance. Please try again later.');
  value.count++;
  rates.set(key, value);
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: 'Check the fields and allowed ranges.', code: 'INVALID_INPUT' }, { status: 400 });
  const e = error as { code?: string; status?: number; message?: string };
  const code = String(e?.code ?? '').toUpperCase();
  if (/STALE|CONFLICT|REVISION/.test(code)) return NextResponse.json({ error: 'The workspace changed. Reload and check the plan again.', code: 'REVISION_CONFLICT' }, { status: 409 });
  if (/BUDGET|LIMIT/.test(code)) return NextResponse.json({ error: 'The live demo allowance has been reached. Structured checks are still available.', code: 'BUDGET_LIMIT' }, { status: 429 });
  if (/INVALID|NOT_FOUND|INFEASIBLE|NOT_FEASIBLE/.test(code)) return NextResponse.json({ error: 'That operation is not valid for the current workspace.', code: code }, { status: code.includes('NOT_FOUND') ? 404 : 400 });
  console.error('[PACT] Request failed:', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({ error: 'The service is temporarily unavailable. Your last saved plan has not been replaced.', code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
}

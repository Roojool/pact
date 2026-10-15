import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { checkOrigin, jsonBody, newSessionId, response, sessionId } from '../src/lib/http';

process.env.SESSION_SECRET = 'test-only-session-secret-that-is-long-enough';
test('signed session rejects a changed workspace identifier', () => {
  const id = newSessionId();
  const cookie = response({}, id).headers.get('set-cookie')!;
  assert.equal(sessionId(new NextRequest('http://localhost/api/workspace', { headers: { cookie } })), id);
  const tampered = cookie.replace(id, newSessionId());
  assert.equal(sessionId(new NextRequest('http://localhost/api/workspace', { headers: { cookie: tampered } })), null);
  const extraSegment = cookie.replace(';', '.unexpected;');
  assert.equal(sessionId(new NextRequest('http://localhost/api/workspace', { headers: { cookie: extraSegment } })), null);
});
test('cross-site mutations are rejected', () => {
  assert.throws(() => checkOrigin(new NextRequest('http://localhost/api/approve', { headers: { host: 'localhost', origin: 'https://outside.example' } })));
  assert.throws(() => checkOrigin(new NextRequest('http://localhost/api/approve', { headers: { host: 'localhost', origin: 'null' } })), { status: 403 });
});
test('request bodies have a strict size limit', async () => {
  const request = new NextRequest('http://localhost/api/workspace', { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(9000) }) });
  await assert.rejects(jsonBody(request), /too large/);
});

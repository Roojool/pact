/**
 * PACT core — input validation and the shared error type.
 *
 * Pure, dependency-free. Every validator either returns a normalized value or
 * throws a PactError carrying a machine-readable code and an HTTP status hint
 * that route handlers can map directly.
 */
import type { WorkspaceEdit } from './types';

/** Single error type crossing the backend boundary. `status` is the HTTP hint (400/409/503). */
export class PactError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'PactError';
    this.code = code;
    this.status = status;
  }
}

/** Opaque server-generated workspace ids (cookie scope). Never client supplied. */
export const WORKSPACE_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** Entity ids used inside a workspace graph. */
export const ENTITY_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

export function validateWorkspaceId(id: string): string {
  if (typeof id !== 'string' || !WORKSPACE_ID_RE.test(id)) {
    throw new PactError('Workspace id must be 4-64 characters of letters, digits, "-" or "_".', 'invalid_workspace_id', 400);
  }
  return id;
}

export function validateEntityId(id: string, label: string): string {
  if (typeof id !== 'string' || !ENTITY_ID_RE.test(id)) {
    throw new PactError(`${label} id must match ${ENTITY_ID_RE.source}.`, 'invalid_request', 400);
  }
  return id;
}

export function validateRevision(revision: number): number {
  if (!Number.isInteger(revision) || revision < 1 || revision > 1_000_000_000) {
    throw new PactError('revision must be an integer between 1 and 1000000000.', 'invalid_request', 400);
  }
  return revision;
}

export function validateIdempotencyKey(key: string): string {
  if (typeof key !== 'string' || !IDEMPOTENCY_KEY_RE.test(key)) {
    throw new PactError('idempotencyKey must be 8-128 characters of letters, digits, "_", ".", ":" or "-".', 'invalid_request', 400);
  }
  return key;
}

export function validateMessage(message: string): string {
  if (typeof message !== 'string') {
    throw new PactError('message must be a string.', 'invalid_request', 400);
  }
  const trimmed = message.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    throw new PactError('message must be between 1 and 2000 characters.', 'invalid_request', 400);
  }
  return trimmed;
}

/** Editor slots are whole one-hour slots 0..15 (Day 1 = 0..7, Day 2 = 8..15). */
export function validateSlots(slots: unknown, label: string): number[] {
  if (!Array.isArray(slots)) {
    throw new PactError(`${label}: slots must be an array of integers.`, 'invalid_request', 400);
  }
  const seen = new Set<number>();
  for (const slot of slots) {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot > 15) {
      throw new PactError(`${label}: every slot must be an integer between 0 and 15.`, 'invalid_request', 400);
    }
    if (seen.has(slot)) {
      throw new PactError(`${label}: duplicate slot ${slot}.`, 'invalid_request', 400);
    }
    seen.add(slot);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Shape-validates a WorkspaceEdit (semantic rules that need stored state —
 * e.g. deadline <= flexUntilDay — live in graph.ts where the snapshot is loaded).
 */
export function validateWorkspaceEdit(edit: unknown): WorkspaceEdit {
  if (typeof edit !== 'object' || edit === null || typeof (edit as { kind?: unknown }).kind !== 'string') {
    throw new PactError('edit must be an object with a kind field.', 'invalid_request', 400);
  }
  const e = edit as Record<string, unknown>;
  switch (e.kind) {
    case 'permission': {
      const campaignId = validateEntityId(e.campaignId as string, 'campaign');
      const editorId = validateEntityId(e.editorId as string, 'editor');
      if (typeof e.approved !== 'boolean') throw new PactError('Client permission needs an explicit approved boolean.', 'invalid_request', 400);
      return { kind: 'permission', campaignId, editorId, approved: e.approved };
    }
    case 'commitment': {
      const id = validateEntityId(e.id as string, 'commitment');
      const hasHours = Object.prototype.hasOwnProperty.call(e, 'hours');
      const hasDeadline = Object.prototype.hasOwnProperty.call(e, 'deadlineDay');
      if (!hasHours && !hasDeadline) {
        throw new PactError('edit kind "commitment" needs at least one of hours or deadlineDay.', 'invalid_request', 400);
      }
      let hours: number | null | undefined;
      if (hasHours) {
        if (e.hours === null) {
          hours = null;
        } else if (typeof e.hours === 'number' && Number.isInteger(e.hours) && e.hours >= 1 && e.hours <= 8) {
          hours = e.hours;
        } else {
          throw new PactError('edit hours must be null or an integer between 1 and 8 (one editor, whole hours).', 'invalid_request', 400);
        }
      }
      let deadlineDay: 1 | 2 | undefined;
      if (hasDeadline) {
        if (e.deadlineDay !== 1 && e.deadlineDay !== 2) {
          throw new PactError('edit deadlineDay must be 1 or 2.', 'invalid_request', 400);
        }
        deadlineDay = e.deadlineDay;
      }
      return { kind: 'commitment', id, ...(hasHours ? { hours } : {}), ...(hasDeadline ? { deadlineDay } : {}) };
    }
    case 'approval': {
      const id = validateEntityId(e.id as string, 'approval');
      if (typeof e.approved !== 'boolean') {
        throw new PactError('edit kind "approval" needs approved: boolean.', 'invalid_request', 400);
      }
      return { kind: 'approval', id, approved: e.approved };
    }
    case 'editor': {
      const id = validateEntityId(e.id as string, 'editor');
      return { kind: 'editor', id, slots: validateSlots(e.slots, 'edit kind "editor"') };
    }
    case 'event': {
      const id = validateEntityId(e.id as string, 'event');
      const { start, end } = e;
      if (
        typeof start !== 'number' || typeof end !== 'number' ||
        !Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end > 48 || start >= end
      ) {
        throw new PactError(
          'edit kind "event" needs integer attendance hours with 0 <= start < end <= 48 (two full days, end exclusive).',
          'invalid_request', 400,
        );
      }
      return { kind: 'event', id, start, end };
    }
    default:
      throw new PactError(`Unknown edit kind "${String(e.kind)}".`, 'invalid_request', 400);
  }
}

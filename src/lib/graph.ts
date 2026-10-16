/**
 * PACT core — FalkorDB graph storage.
 *
 * Every workspace is one graph ("pact-setup-ws-<opaque server id>"). Domain entities
 * are nodes; relationships carry the structure (Campaign-[:FOR_CREATOR]->Creator,
 * Approval-[:ABOUT_CAMPAIGN]->Campaign, Decision-[:RESERVES]->Editor,
 * Memory-[:NEXT]->Memory ...). Snapshots are rebuilt EXCLUSIVELY through
 * traversals — there are no denormalized foreign keys on the nodes — so
 * dependency discovery is graph-native.
 *
 * Concurrency: every mutation is a single guarded query
 *   MATCH (w:Workspace {key:$wk}) WHERE w.revision = $rev AND w.createdAt = $createdAt
 *   SET w.revision = w.revision + 1 ...
 * FalkorDB executes one query atomically, so exactly one competing writer can
 * win; losers observe an empty result set and surface 409 stale_revision.
 * The createdAt term defeats revision-counter reuse after a reset.
 *
 * There is NO in-memory business-state fallback: if the database is
 * unreachable, operations fail with 503 graph_unavailable.
 */
import { FalkorDB, type Graph } from 'falkordb';
import { createHash, randomUUID } from 'node:crypto';
import { createFixture } from './fixtures';
import { setupToWorkspace } from './business-setup';
import { checkPlan, proposeRepairs } from './domain';
import {
  PactError, validateEntityId, validateIdempotencyKey, validateMessage,
  validateRevision, validateWorkspaceEdit, validateWorkspaceId,
} from './validation';
import type {
  Activity, AgentReply, Allocation, Analysis, Campaign, Decision, Day,
  Editor, OwnerTask, PlanChange, Proposal, Workspace, WorkspaceEdit,
} from './types';

function dbUrl(): string {
  const url = process.env.FALKORDB_URL?.trim();
  return url && url.length > 0 ? url : 'redis://127.0.0.1:16379';
}

let clientPromise: Promise<FalkorDB> | null = null;

/** Close the shared connection during process/test teardown. */
export async function closeGraphConnection(): Promise<void> {
  const pending = clientPromise;
  clientPromise = null;
  if (pending) await (await pending).close();
}

function unavailable(err: unknown): PactError {
  const message = err instanceof Error ? err.message : String(err);
  return new PactError(`Graph storage unavailable: ${message}`, 'graph_unavailable', 503);
}

async function getClient(): Promise<FalkorDB> {
  if (!clientPromise) {
    clientPromise = FalkorDB.connect({ url: dbUrl() }).then((client) => {
      // Swallow re-emitted socket errors; failures surface through command rejections.
      client.on('error', () => undefined);
      return client;
    });
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

function graphKey(workspaceId: string): string {
  return `pact-setup-ws-${validateWorkspaceId(workspaceId)}`;
}

async function graphFor(workspaceId: string): Promise<{ g: Graph; wk: string }> {
  try {
    const client = await getClient();
    return { g: client.selectGraph(graphKey(workspaceId)), wk: graphKey(workspaceId) };
  } catch (err) {
    if (err instanceof PactError) throw err; // invalid ids stay 400s, not 503s
    throw unavailable(err);
  }
}

async function run(
  g: Graph, query: string, params: Record<string, unknown>, readonly = false,
): Promise<Record<string, unknown>[]> {
  try {
    const options = { params: params as never };
    const reply = readonly
      ? await g.roQuery<Record<string, unknown>>(query, options)
      : await g.query<Record<string, unknown>>(query, options);
    return reply.data ?? [];
  } catch (err) {
    if (err instanceof PactError) throw err;
    throw unavailable(err);
  }
}

/* ---------------------------------- coercers ---------------------------------- */

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
function bool(v: unknown): boolean {
  return v === true;
}
function intArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string' || v.length === 0) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------- snapshot loading ------------------------------ */

interface Meta {
  agency: string;
  businessType: Workspace['businessType'];
  kind: 'sample' | 'custom';
  setupKey: string;
  setupHash: string;
  revision: number;
  createdAt: string;
  activitySeq: number;
  memorySeq: number;
  decisionSeq: number;
}

const META_QUERY = `MATCH (w:Workspace {key:$wk})
RETURN w.agency AS agency, w.businessType AS businessType, w.kind AS kind, w.setupKey AS setupKey, w.setupHash AS setupHash,
       w.revision AS revision, w.createdAt AS createdAt,
       w.activitySeq AS activitySeq, w.memorySeq AS memorySeq, w.decisionSeq AS decisionSeq`;

async function readMeta(g: Graph, wk: string): Promise<Meta | null> {
  let rows: Record<string, unknown>[];
  try {
    rows = await run(g, META_QUERY, { wk }, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/empty key/i.test(message)) return null; // graph key absent: workspace never created
    throw err;
  }
  const row = rows[0];
  if (!row) return null;
  return {
    agency: str(row.agency),
    businessType: row.businessType === 'food_shop' || row.businessType === 'other' ? row.businessType : 'creative_agency',
    kind: row.kind === 'custom' ? 'custom' : 'sample',
    setupKey: str(row.setupKey),
    setupHash: str(row.setupHash),
    revision: num(row.revision),
    createdAt: str(row.createdAt),
    activitySeq: num(row.activitySeq),
    memorySeq: num(row.memorySeq),
    decisionSeq: num(row.decisionSeq),
  };
}

async function loadWorkspace(g: Graph, wk: string, meta: Meta, workspaceId: string): Promise<Workspace> {
  const creators = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_CREATOR]->(n:Creator)
     RETURN n.key AS id, n.name AS name, n.handle AS handle, n.category AS category, n.initials AS initials, n.color AS color
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), name: str(r.name), handle: str(r.handle), category: str(r.category),
    initials: str(r.initials), color: str(r.color),
  }));

  const people = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_PERSON]->(n:Person)
     RETURN n.key AS id, n.name AS name, n.role AS role ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), name: str(r.name), role: str(r.role),
  }));

  const sources = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SOURCE]->(n:Source)
     RETURN n.key AS id, n.title AS title, n.kind AS kind, n.revision AS revision, n.excerpt AS excerpt, n.updatedAt AS updatedAt
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), title: str(r.title), kind: str(r.kind) as 'brief' | 'policy' | 'calendar' | 'handoff',
    revision: num(r.revision), excerpt: str(r.excerpt), updatedAt: str(r.updatedAt),
  }));

  const campaigns: Campaign[] = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_CAMPAIGN]->(c:Campaign),
          (c)-[:OWNED_BY]->(p:Person), (c)-[:FROM_SOURCE]->(s:Source)
     OPTIONAL MATCH (c)-[:FOR_CREATOR]->(cr:Creator)
     RETURN c.key AS id, c.name AS name, c.brand AS brand, c.category AS category, c.color AS color,
            cr.key AS creatorId, p.key AS ownerId, s.key AS sourceId
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), name: str(r.name), brand: str(r.brand), creatorId: str(r.creatorId),
    ownerId: str(r.ownerId), sourceId: str(r.sourceId), category: str(r.category), color: str(r.color),
  }));

  const commitments = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_COMMITMENT]->(m:Commitment)-[:FOR_CAMPAIGN]->(c:Campaign)
     RETURN m.key AS id, m.title AS title, m.hours AS hours, m.releaseDay AS releaseDay,
            m.deadlineDay AS deadlineDay, m.flexUntilDay AS flexUntilDay, m.status AS status,
            c.key AS campaignId
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), campaignId: str(r.campaignId), title: str(r.title),
    hours: typeof r.hours === 'number' ? r.hours : null,
    releaseDay: num(r.releaseDay) as Day, deadlineDay: num(r.deadlineDay) as Day,
    flexUntilDay: num(r.flexUntilDay) as Day,
    status: str(r.status) as 'proposed' | 'committed',
  }));

  const editors: Editor[] = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_EDITOR]->(e:Editor)-[:FROM_SOURCE]->(s:Source)
     RETURN e.key AS id, e.name AS name, e.initials AS initials, e.slots AS slots, s.key AS sourceId
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), name: str(r.name), initials: str(r.initials), slots: intArray(r.slots), sourceId: str(r.sourceId),
  }));

  const approvals = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_APPROVAL]->(a:Approval)-[:ABOUT_CAMPAIGN]->(c:Campaign),
          (a)-[:FOR_EDITOR]->(e:Editor), (a)-[:FROM_SOURCE]->(s:Source)
     RETURN a.key AS id, a.approved AS approved, c.key AS campaignId, e.key AS editorId, s.key AS sourceId
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), campaignId: str(r.campaignId), editorId: str(r.editorId),
    approved: bool(r.approved), sourceId: str(r.sourceId),
  }));

  const events = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_EVENT]->(v:Event)-[:FOR_CAMPAIGN]->(c:Campaign),
          (v)-[:FEATURES_CREATOR]->(cr:Creator), (v)-[:FROM_SOURCE]->(s:Source)
     RETURN v.key AS id, v.title AS title, v.start AS start, v.end AS end,
            c.key AS campaignId, cr.key AS creatorId, s.key AS sourceId
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), campaignId: str(r.campaignId), creatorId: str(r.creatorId), title: str(r.title),
    start: num(r.start), end: num(r.end), sourceId: str(r.sourceId),
  }));

  const proposals: Proposal[] = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_PROPOSAL]->(p:Proposal)
     RETURN p.key AS id, p.title AS title, p.description AS description, p.revision AS revision,
            p.status AS status, p.createdAt AS createdAt, p.changes AS changes, p.sourceVersions AS sourceVersions
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), title: str(r.title), description: str(r.description), revision: num(r.revision),
    changes: parseJson<PlanChange[]>(r.changes, []),
    result: {
      status: 'infeasible', summary: 'Result recomputed on approval; see analysis.',
      requiredHours: 0, availableHours: 0, conflictIds: [], issues: [],
      allocations: [], evidence: [], assumptions: [],
    } as Proposal['result'],
    status: str(r.status) as Proposal['status'],
    createdAt: str(r.createdAt),
    sourceVersions: parseJson<Record<string, number>>(r.sourceVersions, {}),
  }));

  const decisions = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)
     RETURN d.key AS id, d.idempotencyKey AS idempotencyKey, d.title AS title, d.revision AS revision,
            d.createdAt AS createdAt, d.note AS note, d.sourceVersions AS sourceVersions
     ORDER BY id`, { wk }, true)).map((r) => ({
    id: str(r.id), proposalId: '', title: str(r.title), revision: num(r.revision),
    createdAt: str(r.createdAt), idempotencyKey: str(r.idempotencyKey),
    allocations: [] as Allocation[], tasks: [] as OwnerTask[],
    sourceVersions: parseJson<Record<string, number>>(r.sourceVersions, {}),
    note: str(r.note),
  }));
  const decisionsById = new Map(decisions.map((d) => [d.id, d]));
  for (const row of await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[:DECIDES]->(p:Proposal)
     RETURN d.key AS decisionId, p.key AS proposalId`, { wk }, true)) {
    const decision = decisionsById.get(str(row.decisionId));
    if (decision) decision.proposalId = str(row.proposalId);
  }
  for (const row of await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[:HAS_ALLOCATION]->(al:Allocation)-[:FOR_COMMITMENT]->(cm:Commitment),
          (al)-[:WITH_EDITOR]->(e:Editor)
     RETURN d.key AS decisionId, cm.key AS commitmentId, e.key AS editorId, al.slots AS slots
     ORDER BY commitmentId`, { wk }, true)) {
    decisionsById.get(str(row.decisionId))?.allocations.push({
      commitmentId: str(row.commitmentId), editorId: str(row.editorId), slots: intArray(row.slots),
    });
  }
  for (const row of await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[:CREATES_TASK]->(t:OwnerTask)
     RETURN d.key AS decisionId, t.key AS id, t.ownerId AS ownerId, t.title AS title, t.status AS status
     ORDER BY id`, { wk }, true)) {
    decisionsById.get(str(row.decisionId))?.tasks.push({
      id: str(row.id), ownerId: str(row.ownerId), title: str(row.title),
      status: str(row.status) as OwnerTask['status'],
    });
  }

  const activity: Activity[] = (await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(a:Activity)
     OPTIONAL MATCH (a)-[:MENTIONS_SOURCE]->(s:Source)
     RETURN a.key AS id, a.role AS role, a.text AS text, a.createdAt AS createdAt, a.seq AS seq,
            collect(s.key) AS sourceIds
     ORDER BY seq`, { wk }, true)).map((r) => ({
    id: str(r.id), role: str(r.role) as Activity['role'], text: str(r.text),
    createdAt: str(r.createdAt), sourceIds: strArray(r.sourceIds).sort(),
  }));

  return {
    id: workspaceId,
    agency: meta.agency,
    businessType: meta.businessType,
    kind: meta.kind,
    revision: meta.revision,
    creators, people, sources, campaigns, commitments, editors, approvals, events,
    proposals, decisions, activity,
  };
}

async function requireMeta(g: Graph, wk: string): Promise<Meta> {
  const meta = await readMeta(g, wk);
  if (!meta) throw new PactError('Workspace not found.', 'workspace_not_found', 400);
  return meta;
}

/**
 * Loads a snapshot that is guaranteed internally consistent: because every
 * mutation is a single atomic query that also bumps w.revision, re-reading the
 * meta before and after the traversal loads and comparing (revision,
 * createdAt) proves no write interleaved. Retries a few times under heavy
 * write contention before surfacing a read_conflict.
 */
async function loadConsistent(
  g: Graph, wk: string, workspaceId: string, attempts = 4,
): Promise<{ meta: Meta; ws: Workspace } | null> {
  for (let attempt = 0; ; attempt++) {
    const meta = await readMeta(g, wk);
    if (!meta) return null;
    const ws = await loadWorkspace(g, wk, meta, workspaceId);
    const after = await readMeta(g, wk);
    if (after && after.revision === meta.revision && after.createdAt === meta.createdAt) {
      return { meta, ws };
    }
    if (attempt >= attempts) {
      throw new PactError('Workspace kept changing while reading; please retry.', 'read_conflict', 409);
    }
  }
}

async function requireSnapshot(g: Graph, wk: string, workspaceId: string): Promise<{ meta: Meta; ws: Workspace }> {
  const snapshot = await loadConsistent(g, wk, workspaceId);
  if (!snapshot) throw new PactError('Workspace not found.', 'workspace_not_found', 400);
  return snapshot;
}

function assertRevision(meta: Meta, revision: number): void {
  validateRevision(revision);
  if (meta.revision !== revision) {
    throw new PactError(
      `Workspace revision is ${meta.revision}; request carried ${revision}. Reload and retry.`,
      'stale_revision', 409,
    );
  }
}

async function staleOrMissing(g: Graph, wk: string, expected: Meta): Promise<never> {
  const current = await readMeta(g, wk);
  if (!current) throw new PactError('Workspace not found.', 'workspace_not_found', 400);
  if (current.createdAt !== expected.createdAt) {
    throw new PactError(
      `Workspace was reset during the write (current revision ${current.revision}).`,
      'stale_revision', 409,
    );
  }
  throw new PactError(
    `Workspace changed during the write (current revision ${current.revision}).`,
    'stale_revision', 409,
  );
}

/* ------------------------------------ seeding ----------------------------------- */

export async function createWorkspace(id: string): Promise<Workspace> {
  const { g, wk } = await graphFor(id);
  const workspaceId = validateWorkspaceId(id);
  try {
    await g.delete().catch(() => undefined);
  } catch {
    /* graph absent: nothing to delete */
  }
  const fixture = createFixture(workspaceId);
  const createdAt = new Date().toISOString();
  try {
    await run(g, `
      MERGE (w:Workspace {key:$wk})
      SET w.agency = $agency, w.revision = 1, w.activitySeq = 1, w.memorySeq = 0, w.decisionSeq = 0, w.createdAt = $createdAt`,
      { wk, agency: fixture.agency, createdAt });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (n:Creator {key:r.id})
      SET n.name = r.name, n.handle = r.handle, n.category = r.category, n.initials = r.initials, n.color = r.color
      MERGE (w)-[:HAS_CREATOR]->(n)`,
      { wk, rows: fixture.creators });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (n:Person {key:r.id})
      SET n.name = r.name, n.role = r.role
      MERGE (w)-[:HAS_PERSON]->(n)`,
      { wk, rows: fixture.people });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (n:Source {key:r.id})
      SET n.title = r.title, n.kind = r.kind, n.revision = r.revision, n.excerpt = r.excerpt, n.updatedAt = r.updatedAt
      MERGE (w)-[:HAS_SOURCE]->(n)`,
      { wk, rows: fixture.sources });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (c:Campaign {key:r.id})
      SET c.name = r.name, c.brand = r.brand, c.category = r.category, c.color = r.color
      MERGE (w)-[:HAS_CAMPAIGN]->(c)
      MERGE (cr:Creator {key:r.creatorId})
      MERGE (p:Person {key:r.ownerId})
      MERGE (s:Source {key:r.sourceId})
      MERGE (c)-[:FOR_CREATOR]->(cr)
      MERGE (c)-[:OWNED_BY]->(p)
      MERGE (c)-[:FROM_SOURCE]->(s)`,
      { wk, rows: fixture.campaigns });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (m:Commitment {key:r.id})
      SET m.title = r.title, m.hours = r.hours, m.releaseDay = r.releaseDay,
          m.deadlineDay = r.deadlineDay, m.flexUntilDay = r.flexUntilDay, m.status = r.status
      MERGE (w)-[:HAS_COMMITMENT]->(m)
      MERGE (c:Campaign {key:r.campaignId})
      MERGE (m)-[:FOR_CAMPAIGN]->(c)`,
      { wk, rows: fixture.commitments });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (e:Editor {key:r.id})
      SET e.name = r.name, e.initials = r.initials, e.slots = r.slots
      MERGE (w)-[:HAS_EDITOR]->(e)
      MERGE (s:Source {key:r.sourceId})
      MERGE (e)-[:FROM_SOURCE]->(s)`,
      { wk, rows: fixture.editors });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (a:Approval {key:r.id})
      SET a.approved = r.approved
      MERGE (w)-[:HAS_APPROVAL]->(a)
      MERGE (c:Campaign {key:r.campaignId})
      MERGE (e:Editor {key:r.editorId})
      MERGE (s:Source {key:r.sourceId})
      MERGE (a)-[:ABOUT_CAMPAIGN]->(c)
      MERGE (a)-[:FOR_EDITOR]->(e)
      MERGE (a)-[:FROM_SOURCE]->(s)`,
      { wk, rows: fixture.approvals });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (v:Event {key:r.id})
      SET v.title = r.title, v.start = r.start, v.end = r.end
      MERGE (w)-[:HAS_EVENT]->(v)
      MERGE (c:Campaign {key:r.campaignId})
      MERGE (cr:Creator {key:r.creatorId})
      MERGE (s:Source {key:r.sourceId})
      MERGE (v)-[:FOR_CAMPAIGN]->(c)
      MERGE (v)-[:FEATURES_CREATOR]->(cr)
      MERGE (v)-[:FROM_SOURCE]->(s)`,
      { wk, rows: fixture.events });

    await run(g, `
      MATCH (w:Workspace {key:$wk})
      UNWIND $rows AS r
      MERGE (a:Activity {key:r.id})
      SET a.role = r.role, a.text = r.text, a.createdAt = r.createdAt, a.seq = r.seq
      MERGE (w)-[:HAS_ACTIVITY]->(a)
      WITH a, r
      UNWIND r.sourceIds AS sid
      MATCH (s:Source {key:sid})
      MERGE (a)-[:MENTIONS_SOURCE]->(s)`,
      { wk, rows: fixture.activity.map((a, i) => ({ ...a, seq: i + 1 })) });
  } catch (err) {
    if (err instanceof PactError) throw err;
    throw unavailable(err);
  }
  const meta = await readMeta(g, wk);
  if (!meta || meta.revision !== 1) {
    throw new PactError('Seed verification failed.', 'graph_unavailable', 503);
  }
  return loadWorkspace(g, wk, meta, workspaceId);
}

/* ----------------------------------- reading ------------------------------------ */

/** A confirmed setup is created atomically; it can never replace an existing company. */
export async function createBusinessWorkspace(id: string, draft: unknown, source: string, setupKey: string): Promise<Workspace> {
  validateIdempotencyKey(setupKey);
  const ws = setupToWorkspace(validateWorkspaceId(id), draft, source);
  const hash = createHash('sha256').update(JSON.stringify({ draft, source })).digest('hex');
  const { g, wk } = await graphFor(id);
  const existing = await readMeta(g, wk);
  if (existing) {
    if (existing.setupKey !== setupKey || existing.setupHash !== hash) throw new PactError('This workspace already exists. Reload to open it.', 'setup_conflict', 409);
    return (await requireSnapshot(g, wk, id)).ws;
  }
  const createdAt = new Date().toISOString();
  const nonce = randomUUID();
  const result = await run(g, `
    MERGE (w:Workspace {key:$wk})
    ON CREATE SET w.createdAt=$createdAt, w.setupKey=$setupKey, w.setupHash=$hash, w.setupNonce=$nonce
    WITH w WHERE w.setupNonce=$nonce
    SET w.agency=$agency, w.businessType=$businessType, w.kind='custom', w.revision=1, w.activitySeq=1, w.memorySeq=0, w.decisionSeq=0
    FOREACH (r IN $people |
      CREATE (p:Person {key:r.id, name:r.name, role:r.role}) CREATE (w)-[:HAS_PERSON]->(p))
    FOREACH (r IN $sources |
      CREATE (s:Source {key:r.id, title:r.title, kind:r.kind, revision:r.revision, excerpt:r.excerpt, updatedAt:r.updatedAt}) CREATE (w)-[:HAS_SOURCE]->(s))
    FOREACH (r IN $campaigns |
      CREATE (c:Campaign {key:r.id, name:r.name, brand:r.brand, category:r.category, color:r.color})
      CREATE (w)-[:HAS_CAMPAIGN]->(c)
      MERGE (p:Person {key:r.ownerId}) MERGE (s:Source {key:r.sourceId})
      CREATE (c)-[:OWNED_BY]->(p) CREATE (c)-[:FROM_SOURCE]->(s))
    FOREACH (r IN $commitments |
      CREATE (m:Commitment {key:r.id, title:r.title, hours:r.hours, releaseDay:r.releaseDay, deadlineDay:r.deadlineDay, flexUntilDay:r.flexUntilDay, status:r.status})
      CREATE (w)-[:HAS_COMMITMENT]->(m) MERGE (c:Campaign {key:r.campaignId}) CREATE (m)-[:FOR_CAMPAIGN]->(c))
    FOREACH (r IN $editors |
      CREATE (e:Editor {key:r.id, name:r.name, initials:r.initials, slots:r.slots})
      CREATE (w)-[:HAS_EDITOR]->(e) MERGE (s:Source {key:r.sourceId}) CREATE (e)-[:FROM_SOURCE]->(s))
    FOREACH (r IN $approvals |
      CREATE (a:Approval {key:r.id, approved:r.approved}) CREATE (w)-[:HAS_APPROVAL]->(a)
      MERGE (c:Campaign {key:r.campaignId}) MERGE (e:Editor {key:r.editorId}) MERGE (s:Source {key:r.sourceId})
      CREATE (a)-[:ABOUT_CAMPAIGN]->(c) CREATE (a)-[:FOR_EDITOR]->(e) CREATE (a)-[:FROM_SOURCE]->(s))
    CREATE (act:Activity {key:'act-1', role:'system', text:$activity, createdAt:$createdAt, seq:1})
    CREATE (w)-[:HAS_ACTIVITY]->(act)
    WITH w, act MATCH (s:Source {key:'src-setup'}) CREATE (act)-[:MENTIONS_SOURCE]->(s)
    RETURN 1 AS ok`, { wk, createdAt, nonce, setupKey, hash, agency: ws.agency, businessType: ws.businessType, people: ws.people, sources: ws.sources, campaigns: ws.campaigns, commitments: ws.commitments, editors: ws.editors, approvals: ws.approvals, activity: ws.activity[0].text });
  if (!result.length) {
    const winner = await requireMeta(g, wk);
    if (winner.setupKey !== setupKey || winner.setupHash !== hash) throw new PactError('Another setup was saved. Reload to open it.', 'setup_conflict', 409);
  }
  return (await requireSnapshot(g, wk, id)).ws;
}

export async function readWorkspace(id: string): Promise<Workspace | null> {
  const { g, wk } = await graphFor(id);
  const snapshot = await loadConsistent(g, wk, validateWorkspaceId(id));
  return snapshot ? snapshot.ws : null;
}

/* ---------------------------------- analysis ------------------------------------ */

function referencedSourceIds(ws: Workspace): string[] {
  // Commitments carry no source of their own; their facts come from the
  // campaign brief (campaign.sourceId).
  const ids = new Set<string>();
  for (const c of ws.campaigns) ids.add(c.sourceId);
  for (const a of ws.approvals) ids.add(a.sourceId);
  for (const e of ws.editors) ids.add(e.sourceId);
  return [...ids].sort().slice(0, 12);
}

export async function analyzeWorkspace(id: string, revision: number): Promise<{ workspace: Workspace; analysis: Analysis }> {
  const { g, wk } = await graphFor(id);
  const workspaceId = validateWorkspaceId(id);
  const { meta, ws } = await requireSnapshot(g, wk, workspaceId);
  assertRevision(meta, validateRevision(revision));
  const check = checkPlan(ws);
  const proposals = proposeRepairs(ws);
  const ts = new Date().toISOString();
  const activity: Activity = {
    id: `act-${meta.activitySeq + 1}`,
    role: 'system',
    text: `Plan checked: ${check.summary}`,
    createdAt: ts,
    sourceIds: referencedSourceIds(ws),
  };
  const rows = proposals.map((p) => ({
    id: p.id, title: p.title, description: p.description, revision: p.revision,
    status: p.status, createdAt: p.createdAt,
    changesJson: JSON.stringify(p.changes),
    sourceVersionsJson: JSON.stringify(p.sourceVersions),
    changeTargets: p.changes.map((c) => c.commitmentId),
  }));
  const proposalsSection = rows.length > 0
    ? `
    WITH w
    UNWIND $proposals AS pr
    MERGE (p:Proposal {key:pr.id})
    SET p.title = pr.title, p.description = pr.description, p.revision = pr.revision,
        p.status = pr.status, p.createdAt = pr.createdAt, p.changes = pr.changesJson,
        p.sourceVersions = pr.sourceVersionsJson
    MERGE (w)-[:HAS_PROPOSAL]->(p)`
    : '';
  try {
    const result = await run(g, `
      MATCH (w:Workspace {key:$wk}) WHERE w.revision = $rev AND w.createdAt = $createdAt
      SET w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
      WITH w, w.activitySeq AS seq
      CREATE (act:Activity {key:'act-' + toString(seq), role:'system', text:$actText, createdAt:$ts, seq:seq})
      CREATE (w)-[:HAS_ACTIVITY]->(act)
      ${proposalsSection}
      WITH w
      RETURN 1 AS ok`,
      { wk, rev: revision, createdAt: meta.createdAt, actText: activity.text, ts, proposals: rows });
    if (result.length === 0) await staleOrMissing(g, wk, meta);
    // Decoration edges (idempotent MERGEs), guarded by the new revision.
    if (rows.length > 0) {
      await run(g, `
        MATCH (w:Workspace {key:$wk})
        WHERE w.revision = $newRev AND w.createdAt = $createdAt
        UNWIND $proposals AS pr
        MATCH (p:Proposal {key:pr.id})
        UNWIND pr.changeTargets AS tid
        MATCH (w)-[:HAS_COMMITMENT]->(cm:Commitment {key:tid})
        MERGE (p)-[:PROPOSES_CHANGE]->(cm)`,
        { wk, newRev: revision + 1, createdAt: meta.createdAt, proposals: rows });
    }
    if (activity.sourceIds.length > 0) {
      await run(g, `
        MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(act:Activity {key:$actId})
        WHERE w.revision = $newRev AND w.createdAt = $createdAt
        UNWIND $srcIds AS sid
        MATCH (s:Source {key:sid})
        MERGE (act)-[:MENTIONS_SOURCE]->(s)`,
        { wk, actId: activity.id, newRev: revision + 1, createdAt: meta.createdAt, srcIds: activity.sourceIds });
    }
  } catch (err) {
    if (err instanceof PactError) throw err;
    throw unavailable(err);
  }
  const after = await requireSnapshot(g, wk, workspaceId);
  const workspace = after.ws;
  return {
    workspace,
    analysis: { check, proposals, activity: [activity], mode: 'deterministic' },
  };
}

/* ------------------------------------ edits ------------------------------------- */

const ACTIVITY_TAIL = `
      WITH act
      MATCH (s:Source {key:$srcId})
      MERGE (act)-[:MENTIONS_SOURCE]->(s)
      RETURN 1 AS ok`;

export async function editWorkspace(id: string, revision: number, edit: WorkspaceEdit): Promise<Workspace> {
  const { g, wk } = await graphFor(id);
  const validated = validateWorkspaceEdit(edit);
  const workspaceId = validateWorkspaceId(id);
  const { meta, ws } = await requireSnapshot(g, wk, workspaceId);
  assertRevision(meta, validateRevision(revision));
  const ts = new Date().toISOString();

  let query = '';
  const params: Record<string, unknown> = { wk, rev: revision, createdAt: meta.createdAt, ts };

  switch (validated.kind) {
    case 'permission': {
      const editor = ws.editors.find(e => e.id === validated.editorId);
      const campaign = ws.campaigns.find(c => c.id === validated.campaignId);
      if (!editor || !campaign) throw new PactError('Editor or job not found in this workspace.', 'permission_not_found', 400);
      const existing = ws.approvals.find(a => a.editorId === editor.id && a.campaignId === campaign.id);
      if (existing) return editWorkspace(id, revision, { kind: 'approval', id: existing.id, approved: validated.approved });
      const key = createHash('sha256').update(`${editor.id}:${campaign.id}`).digest('hex').slice(0, 16);
      query = `
        MATCH (w:Workspace {key:$wk})-[:HAS_EDITOR]->(e:Editor {key:$editor}),
              (w)-[:HAS_CAMPAIGN]->(c:Campaign {key:$campaign})
        WHERE w.revision=$rev AND w.createdAt=$createdAt
        CREATE (s:Source {key:$srcId, title:$sourceTitle, kind:'policy', revision:1, excerpt:$actText, updatedAt:$ts})
        CREATE (w)-[:HAS_SOURCE]->(s)
        CREATE (a:Approval {key:$approval, approved:$approved})
        CREATE (w)-[:HAS_APPROVAL]->(a) CREATE (a)-[:FOR_EDITOR]->(e)
        CREATE (a)-[:ABOUT_CAMPAIGN]->(c) CREATE (a)-[:FROM_SOURCE]->(s)
        SET w.revision=w.revision+1, w.activitySeq=w.activitySeq+1
        WITH w, w.activitySeq AS seq
        CREATE (act:Activity {key:'act-'+toString(seq), role:'account_manager', text:$actText, createdAt:$ts, seq:seq})
        CREATE (w)-[:HAS_ACTIVITY]->(act)${ACTIVITY_TAIL}`;
      Object.assign(params, { editor: editor.id, campaign: campaign.id, approval: `ap-${key}`, srcId: `src-policy-${key}`, sourceTitle: `${editor.name} × ${campaign.brand} — recorded permission`, approved: validated.approved, actText: `User recorded ${editor.name} as ${validated.approved ? 'APPROVED' : 'NOT approved'} for ${campaign.name}.` });
      break;
    }
    case 'commitment': {
      const cm = ws.commitments.find((c) => c.id === validated.id);
      if (!cm) throw new PactError(`Commitment "${validated.id}" not found.`, 'commitment_not_found', 400);
      const campaign = ws.campaigns.find((c) => c.id === cm.campaignId);
      if (!campaign) throw new PactError(`Campaign "${cm.campaignId}" not found.`, 'campaign_not_found', 400);
      const deadline = validated.deadlineDay ?? cm.deadlineDay;
      const hours = Object.prototype.hasOwnProperty.call(validated, 'hours') ? validated.hours : cm.hours;
      if (deadline > cm.flexUntilDay || deadline < cm.releaseDay) {
        throw new PactError(
          `"${cm.title}" may only run between Day ${cm.releaseDay} and Day ${cm.flexUntilDay}; ` +
          `a deadline of Day ${deadline} exceeds the flexibility recorded in the brief.`,
          'invalid_edit', 400,
        );
      }
      const changes: string[] = [];
      if (hours !== cm.hours) changes.push(`hours ${cm.hours ?? 'unknown'} -> ${hours ?? 'unknown'}`);
      if (deadline !== cm.deadlineDay) changes.push(`deadline Day ${cm.deadlineDay} -> Day ${deadline}`);
      if (changes.length === 0) {
        throw new PactError('Edit does not change anything.', 'invalid_edit', 400);
      }
      query = `
        MATCH (w:Workspace {key:$wk})-[:HAS_COMMITMENT]->(m:Commitment {key:$eid})
        WHERE w.revision = $rev AND w.createdAt = $createdAt
        SET m.hours = $hours, m.deadlineDay = $deadline,
            w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
        WITH w, w.activitySeq AS seq
        CREATE (act:Activity {key:'act-' + toString(seq), role:'producer', text:$actText, createdAt:$ts, seq:seq})
        CREATE (w)-[:HAS_ACTIVITY]->(act)${ACTIVITY_TAIL}`;
      Object.assign(params, {
        eid: validated.id, hours, deadline,
        actText: `Producer updated "${cm.title}": ${changes.join(', ')}.`,
        srcId: campaign.sourceId,
      });
      break;
    }
    case 'approval': {
      const ap = ws.approvals.find((a) => a.id === validated.id);
      if (!ap) throw new PactError(`Approval "${validated.id}" not found.`, 'approval_not_found', 400);
      const editor = ws.editors.find((e) => e.id === ap.editorId);
      const campaign = ws.campaigns.find((c) => c.id === ap.campaignId);
      query = `
        MATCH (w:Workspace {key:$wk})-[:HAS_APPROVAL]->(a:Approval {key:$eid})
        WHERE w.revision = $rev AND w.createdAt = $createdAt
        SET a.approved = $approved,
            w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
        WITH w, w.activitySeq AS seq
        CREATE (act:Activity {key:'act-' + toString(seq), role:'account_manager', text:$actText, createdAt:$ts, seq:seq})
        CREATE (w)-[:HAS_ACTIVITY]->(act)${ACTIVITY_TAIL}`;
      Object.assign(params, {
        eid: validated.id, approved: validated.approved,
        actText:
          `Account manager recorded ${editor?.name ?? ap.editorId} as ` +
          `${validated.approved ? 'APPROVED' : 'NOT approved'} for ${campaign?.name ?? ap.campaignId}.`,
        srcId: ap.sourceId,
      });
      break;
    }
    case 'editor': {
      const ed = ws.editors.find((e) => e.id === validated.id);
      if (!ed) throw new PactError(`Editor "${validated.id}" not found.`, 'editor_not_found', 400);
      query = `
        MATCH (w:Workspace {key:$wk})-[:HAS_EDITOR]->(e:Editor {key:$eid})
        WHERE w.revision = $rev AND w.createdAt = $createdAt
        SET e.slots = $slots,
            w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
        WITH w, w.activitySeq AS seq
        CREATE (act:Activity {key:'act-' + toString(seq), role:'producer', text:$actText, createdAt:$ts, seq:seq})
        CREATE (w)-[:HAS_ACTIVITY]->(act)${ACTIVITY_TAIL}`;
      Object.assign(params, {
        eid: validated.id, slots: validated.slots,
        actText: `Calendar updated: ${ed.name} now has ${validated.slots.length} slot(s).`,
        srcId: ed.sourceId,
      });
      break;
    }
    case 'event': {
      const ev = ws.events.find((e) => e.id === validated.id);
      if (!ev) throw new PactError(`Event "${validated.id}" not found.`, 'event_not_found', 400);
      query = `
        MATCH (w:Workspace {key:$wk})-[:HAS_EVENT]->(v:Event {key:$eid})
        WHERE w.revision = $rev AND w.createdAt = $createdAt
        SET v.start = $start, v.end = $end,
            w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1
        WITH w, w.activitySeq AS seq
        CREATE (act:Activity {key:'act-' + toString(seq), role:'producer', text:$actText, createdAt:$ts, seq:seq})
        CREATE (w)-[:HAS_ACTIVITY]->(act)${ACTIVITY_TAIL}`;
      Object.assign(params, {
        eid: validated.id, start: validated.start, end: validated.end,
        actText: `Calendar updated: "${ev.title}" now runs hours ${validated.start}-${validated.end}.`,
        srcId: ev.sourceId,
      });
      break;
    }
  }

  try {
    const rows = await run(g, query, params);
    if (rows.length === 0) await staleOrMissing(g, wk, meta);
  } catch (err) {
    if (err instanceof PactError) throw err;
    throw unavailable(err);
  }
  const after = await requireSnapshot(g, wk, workspaceId);
  return after.ws;
}

/* ---------------------------------- approvals ----------------------------------- */

async function findDecisionByIdempotencyKey(
  g: Graph, wk: string, key: string, workspaceId: string,
): Promise<Decision | null> {
  const rows = await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision {idempotencyKey:$ik})
     RETURN d.key AS id`, { wk, ik: key }, true);
  if (rows.length === 0) return null;
  const decisionId = str(rows[0]!.id);
  const snapshot = await loadConsistent(g, wk, workspaceId);
  return snapshot ? snapshot.ws.decisions.find((d) => d.id === decisionId) ?? null : null;
}

/** Existing reservations via Decision-[:RESERVES {slots}]->Editor traversal. */
async function existingReservations(
  g: Graph, wk: string, editorIds: string[],
): Promise<{ editorId: string; decisionId: string; slots: number[] }[]> {
  if (editorIds.length === 0) return [];
  const rows = await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DECISION]->(d:Decision)-[r:RESERVES]->(e:Editor)
     WHERE e.key IN $editorIds
     RETURN e.key AS editorId, d.key AS decisionId, r.slots AS slots`,
    { wk, editorIds }, true);
  return rows.map((r) => ({ editorId: str(r.editorId), decisionId: str(r.decisionId), slots: intArray(r.slots) }));
}

export async function approveProposal(
  id: string, revision: number, proposalId: string, idempotencyKey: string,
): Promise<{ workspace: Workspace; decision: Decision }> {
  const { g, wk } = await graphFor(id);
  const workspaceId = validateWorkspaceId(id);
  validateRevision(revision);
  validateEntityId(proposalId, 'proposal');
  validateIdempotencyKey(idempotencyKey);

  // Idempotent replay: the same key returns the stored decision without re-applying,
  // even if the first response was lost and the workspace revision has since moved on.
  const replay = await findDecisionByIdempotencyKey(g, wk, idempotencyKey, workspaceId);
  if (replay) {
    const snapshot = await requireSnapshot(g, wk, workspaceId);
    return { workspace: snapshot.ws, decision: replay };
  }

  const { meta, ws } = await requireSnapshot(g, wk, workspaceId);
  assertRevision(meta, revision);
  const proposal = ws.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new PactError(`Proposal "${proposalId}" not found.`, 'proposal_not_found', 400);
  if (proposal.status !== 'proposed') {
    throw new PactError(
      `Proposal "${proposalId}" is already ${proposal.status}; it cannot be approved again.`,
      'proposal_state', 409,
    );
  }
  // Version check: every source the proposal was computed from must be unchanged.
  const changedSources = Object.entries(proposal.sourceVersions)
    .filter(([sourceId, version]) => (ws.sources.find((s) => s.id === sourceId)?.revision ?? -1) !== version)
    .map(([sourceId]) => sourceId);
  if (changedSources.length > 0) {
    throw new PactError(
      `Underlying sources changed since this proposal was computed: ${changedSources.sort().join(', ')}.`,
      'proposal_stale', 409,
    );
  }
  const check = checkPlan(ws, proposal.changes);
  if (check.status !== 'feasible' || check.allocations.length === 0) {
    throw new PactError(
      `Proposal "${proposalId}" does not yield a feasible plan: ${check.summary}`,
      'proposal_infeasible', 409,
    );
  }
  // Reservation guard: editor slots already reserved by other decisions cannot double-book.
  const editorIds = [...new Set(check.allocations.map((a) => a.editorId))];
  for (const reservation of await existingReservations(g, wk, editorIds)) {
    for (const allocation of check.allocations) {
      if (allocation.editorId !== reservation.editorId) continue;
      const overlap = allocation.slots.filter((s) => reservation.slots.includes(s));
      if (overlap.length > 0) {
        throw new PactError(
          `Editor ${allocation.editorId} slots [${overlap.sort((a, b) => a - b).join(', ')}] are already ` +
          `reserved by decision ${reservation.decisionId}.`,
          'slot_conflict', 409,
        );
      }
    }
  }

  const decisionId = `dec-${meta.decisionSeq + 1}`;
  const ts = new Date().toISOString();
  const note = `Approved at workspace revision ${revision}: ${check.summary}`;
  const campaignsById = new Map(ws.campaigns.map((c) => [c.id, c]));
  const editorsById = new Map(ws.editors.map((e) => [e.id, e]));
  const commitmentsById = new Map(ws.commitments.map((c) => [c.id, c]));
  const tasks: OwnerTask[] = check.allocations.map((allocation, index) => {
    const commitment = commitmentsById.get(allocation.commitmentId)!;
    const campaign = campaignsById.get(commitment.campaignId)!;
    const editor = editorsById.get(allocation.editorId)!;
    return {
      id: `${decisionId}-${index}`,
      ownerId: campaign.ownerId,
      title:
        `Internal reservation: hold ${commitment.hours ?? '?'}h with ${editor.name} for ${campaign.name} ` +
        `(slots ${allocation.slots.join(',')}). This reserves work time; it is not delivery.`,
      status: 'todo',
    };
  });
  const deadlineChanges = proposal.changes.filter(
    (c): c is PlanChange & { deadlineDay: Day } => typeof c.deadlineDay === 'number',
  );
  const deadlineSection = deadlineChanges.length > 0
    ? `
      WITH DISTINCT w, d
      UNWIND $deadlineChanges AS ch
      MATCH (w)-[:HAS_COMMITMENT]->(cm:Commitment {key:ch.commitmentId})
      SET cm.deadlineDay = ch.deadlineDay`
    : '';

  try {
    const rows = await run(g, `
      MATCH (w:Workspace {key:$wk})-[:HAS_PROPOSAL]->(p:Proposal {key:$pid})
      WHERE w.revision = $rev AND w.createdAt = $createdAt AND p.status = 'proposed'
      SET p.status = 'approved',
          w.revision = w.revision + 1, w.activitySeq = w.activitySeq + 1, w.decisionSeq = w.decisionSeq + 1
      WITH w, p, w.activitySeq AS aseq
      CREATE (d:Decision {key:$did, idempotencyKey:$ik, title:p.title, revision:$rev, createdAt:$ts,
                          note:$note, sourceVersions:p.sourceVersions, changes:p.changes})
      CREATE (w)-[:HAS_DECISION]->(d)
      CREATE (d)-[:DECIDES]->(p)
      CREATE (act:Activity {key:'act-' + toString(aseq), role:'account_manager', text:$actText, createdAt:$ts, seq:aseq})
      CREATE (w)-[:HAS_ACTIVITY]->(act)
      WITH w, d
      UNWIND $allocs AS al
      MATCH (w)-[:HAS_COMMITMENT]->(cm:Commitment {key:al.commitmentId})
      MATCH (w)-[:HAS_EDITOR]->(e:Editor {key:al.editorId})
      CREATE (a:Allocation {key:al.key, slots:al.slots})
      CREATE (d)-[:HAS_ALLOCATION]->(a)
      CREATE (a)-[:FOR_COMMITMENT]->(cm)
      CREATE (a)-[:WITH_EDITOR]->(e)
      CREATE (d)-[:RESERVES {slots:al.slots}]->(e)
      WITH DISTINCT w, d
      UNWIND $tasks AS t
      CREATE (tk:OwnerTask {key:t.id, ownerId:t.ownerId, title:t.title, status:'todo'})
      CREATE (d)-[:CREATES_TASK]->(tk)
      ${deadlineSection}
      RETURN d.key AS decisionId`,
      {
        wk, pid: proposalId, rev: revision, createdAt: meta.createdAt, did: decisionId,
        ik: idempotencyKey, ts, note,
        actText: `Account manager approved "${proposal.title}": ${check.allocations.length} reservation(s) created.`,
        allocs: check.allocations.map((a) => ({
          key: `${decisionId}:${a.commitmentId}`, commitmentId: a.commitmentId,
          editorId: a.editorId, slots: a.slots,
        })),
        tasks,
        deadlineChanges,
      });
    if (rows.length === 0) {
      // A concurrent request with the same idempotency key may have won the race.
      const raced = await findDecisionByIdempotencyKey(g, wk, idempotencyKey, workspaceId);
      if (raced) {
        const after = await requireSnapshot(g, wk, workspaceId);
        return { workspace: after.ws, decision: raced };
      }
      await staleOrMissing(g, wk, meta);
    }
    const actId = `act-${meta.activitySeq + 1}`;
    const actSources = [...new Set(Object.keys(proposal.sourceVersions))].sort();
    if (actSources.length > 0) {
      await run(g, `
        MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(act:Activity {key:$actId})
        WHERE w.revision = $newRev AND w.createdAt = $createdAt
        UNWIND $srcIds AS sid
        MATCH (s:Source {key:sid})
        MERGE (act)-[:MENTIONS_SOURCE]->(s)`,
        { wk, actId, newRev: revision + 1, createdAt: meta.createdAt, srcIds: actSources });
    }
  } catch (err) {
    if (err instanceof PactError) throw err;
    throw unavailable(err);
  }

  const decision: Decision = {
    id: decisionId,
    proposalId,
    title: proposal.title,
    revision,
    createdAt: ts,
    idempotencyKey,
    allocations: check.allocations,
    tasks,
    sourceVersions: proposal.sourceVersions,
    note,
  };
  const after = await requireSnapshot(g, wk, workspaceId);
  return { workspace: after.ws, decision };
}

/* ------------------------------- graph memory ----------------------------------- */

function tokensOf(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9&]+/).filter((t) => t.length >= 4);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

export async function recallMemory(id: string, message: string): Promise<AgentReply> {
  const { g, wk } = await graphFor(id);
  const workspaceId = validateWorkspaceId(id);
  const text = validateMessage(message);
  const { meta, ws } = await requireSnapshot(g, wk, workspaceId);
  const check = checkPlan(ws);
  const lower = text.toLowerCase();

  // The reply reports the workspace revision it was computed at. Remembering a
  // note is an append-only read for the plan: it does NOT bump the revision,
  // so a UI holding the current revision is never staled by memory traffic.
  const lines: string[] = [
    `Plan status: ${check.summary}`,
    `Workspace revision: ${meta.revision} (notes do not change it).`,
  ];

  // Recall earlier notes through the memory chain (most recent first).
  const history = await run(g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory)
     RETURN m.key AS id, m.message AS message, m.seq AS seq
     ORDER BY seq DESC LIMIT 5`, { wk }, true);
  if (history.length > 0) {
    lines.push(
      `Memory: ${history.length} earlier note${history.length === 1 ? '' : 's'} on file; most recent was ` +
      `"${truncate(str(history[0]!.message), 80)}".`,
    );
  }

  const sourceIds = new Set<string>();
  const matchedCampaigns = ws.campaigns
    .filter((c) => {
      const name = c.name.toLowerCase();
      return lower.includes(name) || tokensOf(c.name).some((t) => lower.includes(t));
    })
    .slice(0, 3);
  for (const campaign of matchedCampaigns) {
    if (campaign.sourceId) sourceIds.add(campaign.sourceId);
    const commitments = await run(g,
      `MATCH (c:Campaign {key:$ck})<-[:FOR_CAMPAIGN]-(m:Commitment)
       RETURN m.key AS id, m.title AS title, m.hours AS hours, m.deadlineDay AS deadlineDay, m.flexUntilDay AS flexUntilDay
       ORDER BY id`, { ck: campaign.id }, true);
    const approvals = await run(g,
      `MATCH (c:Campaign {key:$ck})<-[:ABOUT_CAMPAIGN]-(a:Approval)-[:FOR_EDITOR]->(e:Editor),
             (a)-[:FROM_SOURCE]->(s:Source)
       RETURN a.approved AS approved, a.key AS approvalId, s.key AS sourceId,
              e.key AS editorId, e.name AS editorName
       ORDER BY editorId`, { ck: campaign.id }, true);
    const events = await run(g,
      `MATCH (c:Campaign {key:$ck})<-[:FOR_CAMPAIGN]-(v:Event)
       RETURN v.key AS id, v.title AS title, v.start AS start, v.end AS end
       ORDER BY id`, { ck: campaign.id }, true);
    const owner = ws.people.find((p) => p.id === campaign.ownerId);
    lines.push(`${campaign.name} (${campaign.id}) for ${campaign.brand}, owned by ${owner?.name ?? campaign.ownerId}:`);
    for (const c of commitments) {
      const hours = typeof c.hours === 'number' ? `${c.hours}h` : 'unknown hours';
      lines.push(
        ` - "${str(c.title)}": ${hours} due before the end of Day ${num(c.deadlineDay)}, ` +
        `may flex to Day ${num(c.flexUntilDay)}.`,
      );
    }
    for (const a of approvals) {
      const sid = str(a.sourceId);
      if (sid) sourceIds.add(sid);
      lines.push(
        ` - ${str(a.editorName)} (${str(a.editorId)}) is ` +
        `${bool(a.approved) ? `approved (${str(a.approvalId)})` : `recorded as NOT approved (${str(a.approvalId)})`}.`,
      );
    }
    for (const v of events) {
      lines.push(` - Event "${str(v.title)}" runs hours ${num(v.start)}-${num(v.end)}.`);
    }
  }

  const matchedEditors = ws.editors
    .filter((e) => {
      const name = e.name.toLowerCase();
      return lower.includes(name) || tokensOf(e.name).some((t) => lower.includes(t));
    })
    .slice(0, 2);
  for (const editor of matchedEditors) {
    if (editor.sourceId) sourceIds.add(editor.sourceId);
    const rows = await run(g,
      `MATCH (e:Editor {key:$ek})<-[:FOR_EDITOR]-(a:Approval)-[:ABOUT_CAMPAIGN]->(c:Campaign),
             (a)-[:FROM_SOURCE]->(s:Source)
       RETURN c.key AS campaignId, c.name AS campaignName, a.approved AS approved, s.key AS sourceId
       ORDER BY campaignId`, { ek: editor.id }, true);
    const approvals = rows.map((r) => `${str(r.campaignName)}: ${bool(r.approved) ? 'approved' : 'NOT approved'}`);
    lines.push(
      `${editor.name} (${editor.id}) holds slots [${editor.slots.join(', ')}]. Approvals: ` +
      `${approvals.length > 0 ? approvals.join('; ') : 'none on record (unknown eligibility)'}.`,
    );
    for (const r of rows) {
      const sid = str(r.sourceId);
      if (sid) sourceIds.add(sid);
    }
  }

  if (matchedCampaigns.length === 0 && matchedEditors.length === 0) {
    lines.push(
      `No specific task or team member matched your note. The plan currently needs ${check.requiredHours}h ` +
      `with ${check.availableHours}h of eligible team capacity by the tightest deadline. ` +
      `Mention a task (e.g. "${ws.campaigns[0]?.name ?? 'your task'}") or a team member for their graph trail.`,
    );
  }
  for (const issue of check.issues.slice(0, 3)) lines.push(`Open issue: ${issue}`);

  const reply = lines.join('\n');
  const ts = new Date().toISOString();
  const activity: Activity = {
    id: `act-${meta.activitySeq + 1}`,
    role: 'system',
    text: `Producer asked PACT: "${truncate(text, 96)}"`,
    createdAt: ts,
    sourceIds: [...sourceIds].sort(),
  };

  try {
    // Append-only persistence: memory and activity rows are written atomically
    // through their own counters WITHOUT touching w.revision, so recalling
    // memory can never invalidate another writer's optimistic revision.
    const rows = await run(g, `
      MATCH (w:Workspace {key:$wk})
      SET w.activitySeq = w.activitySeq + 1, w.memorySeq = w.memorySeq + 1
      WITH w, w.activitySeq AS aseq, w.memorySeq AS mseq
      CREATE (m:Memory {key:'mem-' + toString(mseq), message:$message, reply:$reply, createdAt:$ts, seq:mseq})
      CREATE (w)-[:HAS_MEMORY]->(m)
      WITH w, m, aseq
      CREATE (act:Activity {key:'act-' + toString(aseq), role:'system', text:$actText, createdAt:$ts, seq:aseq})
      CREATE (w)-[:HAS_ACTIVITY]->(act)
      WITH w, m
      OPTIONAL MATCH (w)-[:HAS_MEMORY]->(prev:Memory) WHERE prev.seq = m.seq - 1
      FOREACH (p IN CASE WHEN prev IS NULL THEN [] ELSE [prev] END | CREATE (p)-[:NEXT]->(m))
      RETURN m.key AS memoryId`,
      {
        wk,
        message: text, reply, ts, actText: activity.text,
      });
    if (rows.length === 0) {
      throw new PactError('Workspace not found.', 'workspace_not_found', 400);
    }
    if (activity.sourceIds.length > 0) {
      await run(g, `
        MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(act:Activity {key:$actId})
        WHERE w.createdAt = $createdAt
        UNWIND $srcIds AS sid
        MATCH (s:Source {key:sid})
        MERGE (act)-[:MENTIONS_SOURCE]->(s)`,
        { wk, actId: activity.id, createdAt: meta.createdAt, srcIds: activity.sourceIds });
    }
  } catch (err) {
    if (err instanceof PactError) throw err;
    throw unavailable(err);
  }

  return {
    text: reply,
    activity: [activity],
    sourceIds: [...sourceIds].sort(),
    mode: 'deterministic',
  };
}

/* ------------------------------------ health ------------------------------------ */

export async function graphHealth(): Promise<boolean> {
  try {
    const client = await getClient();
    const g = client.selectGraph('pact-health');
    const reply = await g.query<{ ok: number }>('RETURN 1 AS ok');
    return (reply.data?.length ?? 0) === 1;
  } catch {
    return false;
  }
}

/**
 * Persist live activity records (with sources) emitted by live agents into the graph.
 */
export async function recordLiveActivities(id: string, activities: Activity[]): Promise<Workspace> {
  if (activities.length === 0) {
    const ws = await readWorkspace(id);
    if (!ws) throw new PactError('Workspace not found.', 'workspace_not_found', 404);
    return ws;
  }
  const { g, wk } = await graphFor(id);
  const workspaceId = validateWorkspaceId(id);
  const { meta } = await requireSnapshot(g, wk, workspaceId);
  const ts = new Date().toISOString();

  for (const act of activities) {
    const actId = `act-${meta.activitySeq + 1}`;
    await run(
      g,
      `MATCH (w:Workspace {key:$wk})
       SET w.activitySeq = w.activitySeq + 1
       WITH w, w.activitySeq AS seq
       CREATE (a:Activity {key:'act-' + toString(seq), role:$role, text:$text, createdAt:$ts, seq:seq})
       CREATE (w)-[:HAS_ACTIVITY]->(a)`,
      { wk, role: act.role, text: act.text, ts },
    );
    meta.activitySeq++;
    if (act.sourceIds && act.sourceIds.length > 0) {
      await run(
        g,
        `MATCH (w:Workspace {key:$wk})-[:HAS_ACTIVITY]->(a:Activity {key:$actId})
         UNWIND $srcIds AS sid
         MATCH (s:Source {key:sid})
         MERGE (a)-[:MENTIONS_SOURCE]->(s)`,
        { wk, actId, srcIds: act.sourceIds },
      );
    }
  }

  const after = await requireSnapshot(g, wk, workspaceId);
  return after.ws;
}


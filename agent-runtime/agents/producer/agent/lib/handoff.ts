/**
 * Tenant-scoped handoff memory store for the runtime tools.
 *
 * Every method takes the workspace id as its first argument, and callers must
 * obtain it from {@link readBoundWorkspaceId} (the authenticated session
 * binding), never from the model. The FalkorDB implementation uses fixed,
 * parameterized Cypher only: the model cannot supply a query and cannot widen
 * the workspace scope.
 */

import { FalkorDB } from "falkordb";

export interface HandoffSummary {
  summary: string;
  sourceIds: string[];
  createdAt: string;
}

export interface HandoffWriteInput {
  summary: string;
  sourceIds: string[];
}

export interface HandoffStore {
  read(workspaceId: string, limit: number): Promise<HandoffSummary[]>;
  write(workspaceId: string, input: HandoffWriteInput): Promise<{ id: string; createdAt: string }>;
}

/** Graph-backed store. Cypher is fixed and always scoped by workspace id. */
export class FalkorHandoffStore implements HandoffStore {
  private dbPromise?: Promise<FalkorDB>;

  constructor(
    private readonly url: string,
    private readonly graphName: string,
  ) {}

  private db(): Promise<FalkorDB> {
    if (!this.dbPromise) {
      this.dbPromise = FalkorDB.connect({ url: this.url }).catch((error: unknown) => {
        this.dbPromise = undefined;
        throw new Error(`FalkorDB connection failed for handoff memory: ${String(error)}`);
      });
    }
    return this.dbPromise;
  }

  async read(workspaceId: string, limit: number): Promise<HandoffSummary[]> {
    const graph = (await this.db()).selectGraph(this.graphName);
    const reply = await graph.query(
      "MATCH (h:PactHandoff {workspaceId: $workspaceId}) RETURN h.summary AS summary, h.sourceIds AS sourceIds, h.createdAt AS createdAt ORDER BY h.createdAt DESC LIMIT $limit",
      { params: { workspaceId, limit } },
    );
    const rows = (reply as { data?: unknown[] }).data ?? [];
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        summary: typeof r.summary === "string" ? r.summary : "",
        sourceIds: Array.isArray(r.sourceIds) ? r.sourceIds.map((s) => String(s)) : [],
        createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
      };
    });
  }

  async write(workspaceId: string, input: HandoffWriteInput): Promise<{ id: string; createdAt: string }> {
    const graph = (await this.db()).selectGraph(this.graphName);
    const id = `handoff_${workspaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    await graph.query(
      "MERGE (h:PactHandoff {id: $id}) SET h.workspaceId = $workspaceId, h.from = 'account_manager', h.to = 'producer', h.summary = $summary, h.sourceIds = $sourceIds, h.createdAt = $createdAt",
      { params: { id, workspaceId, summary: input.summary, sourceIds: input.sourceIds, createdAt } },
    );
    return { id, createdAt };
  }
}

/** In-memory store for tests only; keeps the same workspace-scoped contract. */
export class MemoryHandoffStore implements HandoffStore {
  private readonly records = new Map<string, (HandoffSummary & { id: string })[]>();

  async read(workspaceId: string, limit: number): Promise<HandoffSummary[]> {
    const records = this.records.get(workspaceId) ?? [];
    return [...records]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ summary, sourceIds, createdAt }) => ({ summary, sourceIds, createdAt }));
  }

  async write(workspaceId: string, input: HandoffWriteInput): Promise<{ id: string; createdAt: string }> {
    const id = `handoff_${workspaceId}_${this.records.size}`;
    const createdAt = new Date().toISOString();
    const records = this.records.get(workspaceId) ?? [];
    records.push({ id, summary: input.summary, sourceIds: input.sourceIds, createdAt });
    this.records.set(workspaceId, records);
    return { id, createdAt };
  }
}

let testStore: HandoffStore | undefined;

/** Test-only: replace the durable store (runtime tests use this seam). */
export function setHandoffStoreForTests(store: HandoffStore | undefined): void {
  testStore = store;
}

/**
 * One durable store per role process. The cached FalkorDB connection inside
 * {@link FalkorHandoffStore} is instance-local, so resolving a fresh store on
 * every tool invocation would open (and never close) a connection per call.
 */
let durableStore: HandoffStore | undefined;

/** Resolve the durable store from the environment, or the test seam. */
export function resolveHandoffStore(): HandoffStore {
  if (testStore) return testStore;
  if (!durableStore) {
    const url = process.env.FALKORDB_URL?.trim();
    if (!url) throw new Error("FALKORDB_URL is not configured for handoff memory");
    durableStore = new FalkorHandoffStore(url, process.env.PACT_AGENT_GRAPH?.trim() || "pact_agent");
  }
  return durableStore;
}

/**
 * Runtime-side durable budget gate (per actual model request).
 *
 * This is the enforcement point required by the PACT budget contract: the
 * durable global cap (`PACT_API_BUDGET_USD`, default $5) is checked BEFORE
 * EACH actual provider request, not once per estimated session. The key
 * layout and Lua scripts are byte-compatible with the app-side ledger in
 * `src/lib/budget.ts` (same `pact_budget:<graph>:*` keys), so the app and
 * the runtimes share one global spend budget with no double counting:
 *
 *  - `direct` transport: the app reserves once per provider request.
 *  - `eve` transport: only this in-runtime gate reserves (per model step);
 *    the app performs a read-only pre-flight check and never reserves.
 *
 * Fail-closed rules:
 *  - No `FALKORDB_URL`  -> every model request is rejected (no paid call).
 *  - Reserve rejected   -> the model request is rejected before dispatch.
 *  - Missing/zero usage after a dispatched request -> settle at the full
 *    conservative reservation (never treat a billable request as free).
 *  - Settle failure     -> the reservation stays open (budget stays blocked
 *    for that amount).
 */

import { FalkorDB } from "falkordb";

export class BudgetGateError extends Error {
  constructor(
    readonly code: "budget_unavailable" | "budget_exceeded",
    message: string,
  ) {
    super(message);
    this.name = "BudgetGateError";
  }
}

/** Minimal storage surface the gate needs. Mirrors the app ledger scripts. */
export interface BudgetGateStore {
  reserve(id: string, amountUsd: number): Promise<"reserved" | "rejected">;
  settle(id: string, actualUsd: number): Promise<void>;
  close(): Promise<void>;
}

export interface BudgetGateOptions {
  /** Test seam: swap the durable store for an in-memory one. */
  store?: BudgetGateStore;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Atomically reject a reservation that would cross the global cap. */
const RESERVE_LUA = `
local total = tonumber(redis.call('GET', KEYS[1]) or '0')
local spent = tonumber(redis.call('GET', KEYS[2]) or '0')
local reserved = tonumber(redis.call('GET', KEYS[3]) or '0')
local amount = tonumber(ARGV[1])
local status = redis.call('HGET', KEYS[4], 'status')
if status == 'reserved' then return {2} end
if status == 'settled' then return {3} end
if spent + reserved + amount > total + 0.000000001 then
  return {0}
end
redis.call('INCRBYFLOAT', KEYS[3], ARGV[1])
redis.call('HSET', KEYS[4], 'amount', ARGV[1], 'status', 'reserved', 'createdAt', ARGV[2], 'settledUsd', '-1')
return {1}
`;

const SETTLE_LUA = `
local status = redis.call('HGET', KEYS[4], 'status')
if not status then return {0} end
if status ~= 'reserved' then return {1} end
local amount = tonumber(redis.call('HGET', KEYS[4], 'amount') or '0')
local actual = tonumber(ARGV[1])
redis.call('INCRBYFLOAT', KEYS[3], -amount)
if tonumber(redis.call('GET', KEYS[3]) or '0') < 0 then redis.call('SET', KEYS[3], '0') end
redis.call('INCRBYFLOAT', KEYS[2], actual)
redis.call('HSET', KEYS[4], 'status', 'settled', 'settledUsd', ARGV[1])
return {1}
`;

/** FalkorDB-backed gate store using the exact app-ledger key layout. */
export class FalkorBudgetGateStore implements BudgetGateStore {
  private dbPromise?: Promise<FalkorDB>;
  private readonly prefix: string;

  constructor(
    private readonly url: string,
    graphName: string,
    private readonly totalUsd: number,
  ) {
    this.prefix = `pact_budget:${graphName}`;
  }

  private key(suffix: string): string {
    return `${this.prefix}:${suffix}`;
  }

  private async client() {
    if (!this.dbPromise) {
      this.dbPromise = FalkorDB.connect({ url: this.url }).catch((error: unknown) => {
        this.dbPromise = undefined;
        throw new BudgetGateError(
          "budget_unavailable",
          `Budget gate: FalkorDB connection failed (${String(error)})`,
        );
      });
    }
    const db = await this.dbPromise;
    return db.connection;
  }

  private async ensureLedger(): Promise<void> {
    const client = await this.client();
    await client.set(this.key("total"), String(round6(this.totalUsd)));
    await client.set(this.key("spent"), "0", { NX: true });
    await client.set(this.key("reserved"), "0", { NX: true });
  }

  async reserve(id: string, amountUsd: number): Promise<"reserved" | "rejected"> {
    await this.ensureLedger();
    const client = await this.client();
    const result = (await client.eval(RESERVE_LUA, {
      keys: [this.key("total"), this.key("spent"), this.key("reserved"), this.key(`res:${id}`)],
      arguments: [String(round6(amountUsd)), new Date().toISOString()],
    })) as number[] | string[];
    return Number(result?.[0] ?? 0) === 1 ? "reserved" : "rejected";
  }

  async settle(id: string, actualUsd: number): Promise<void> {
    const client = await this.client();
    await client.eval(SETTLE_LUA, {
      keys: [this.key("total"), this.key("spent"), this.key("reserved"), this.key(`res:${id}`)],
      arguments: [String(round6(actualUsd))],
    });
  }

  async close(): Promise<void> {
    const pending = this.dbPromise;
    this.dbPromise = undefined;
    if (!pending) return;
    const db = await pending.catch(() => undefined);
    await db?.close().catch(() => undefined);
  }
}

/** In-memory gate store for tests only (same atomicity is not required). */
export class MemoryBudgetGateStore implements BudgetGateStore {
  totalUsd: number;
  spentUsd = 0;
  reservedUsd = 0;
  private readonly reservations = new Map<string, number>();

  constructor(totalUsd: number) {
    this.totalUsd = totalUsd;
  }

  async reserve(id: string, amountUsd: number): Promise<"reserved" | "rejected"> {
    if (this.reservations.has(id)) return "reserved";
    if (this.spentUsd + this.reservedUsd + amountUsd > this.totalUsd + 1e-9) return "rejected";
    this.reservedUsd = round6(this.reservedUsd + amountUsd);
    this.reservations.set(id, amountUsd);
    return "reserved";
  }

  async settle(id: string, actualUsd: number): Promise<void> {
    const amount = this.reservations.get(id);
    if (amount === undefined) return;
    this.reservedUsd = round6(Math.max(0, this.reservedUsd - amount));
    this.spentUsd = round6(this.spentUsd + Math.max(0, actualUsd));
    this.reservations.delete(id);
  }

  async close(): Promise<void> {}
}

let testStore: BudgetGateStore | undefined;

/** Test-only: replace the durable store (root tests use this seam). */
export function setBudgetGateStoreForTests(store: BudgetGateStore | undefined): void {
  testStore = store;
}

let storePromise: Promise<BudgetGateStore> | undefined;

function resolveStore(): Promise<BudgetGateStore> {
  if (testStore) return Promise.resolve(testStore);
  if (!storePromise) {
    const url = process.env.FALKORDB_URL?.trim();
    if (!url) {
      storePromise = Promise.reject(
        new BudgetGateError("budget_unavailable", "Budget gate: FALKORDB_URL is not configured; refusing model requests"),
      );
      return storePromise;
    }
    const total = Number(process.env.PACT_API_BUDGET_USD);
    const totalUsd = Number.isFinite(total) && total > 0 ? round6(total) : 5;
    const graph = process.env.PACT_BUDGET_GRAPH?.trim() || "pact_budget";
    storePromise = Promise.resolve(new FalkorBudgetGateStore(url, graph, totalUsd) as BudgetGateStore);
  }
  return storePromise;
}

export interface GateReservation {
  reservationId: string;
  /** Conservative USD amount held for this request. */
  ceilingUsd: number;
  /** Record real spend (>= 0). Missing usage must instead use {@link retainUncertain}. */
  settleActual(actualUsd: number): Promise<void>;
  /** Settle at the full ceiling: the request was dispatched but its real cost is unknown. */
  retainUncertain(): Promise<void>;
}

/**
 * Reserve budget for one actual model request. MUST be called immediately
 * before the provider request is dispatched; a rejection means the request
 * must not happen.
 */
export async function gateModelRequest(role: string, ceilingUsd: number): Promise<GateReservation> {
  const store = await resolveStore();
  const reservationId = `eve:${role}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let outcome: "reserved" | "rejected";
  try {
    outcome = await store.reserve(reservationId, ceilingUsd);
  } catch (error) {
    throw new BudgetGateError(
      "budget_unavailable",
      `Budget gate: durable ledger rejected the reservation (${String(error)})`,
    );
  }
  if (outcome !== "reserved") {
    throw new BudgetGateError(
      "budget_exceeded",
      `Budget gate: global spend cap reached; refusing the ${role} model request`,
    );
  }
  const settleAt = async (usd: number): Promise<void> => {
    // A failed settle leaves the reservation open: fail closed.
    await store.settle(reservationId, usd).catch(() => undefined);
  };
  return {
    reservationId,
    ceilingUsd: round6(ceilingUsd),
    settleActual: (actualUsd) => settleAt(round6(Math.max(0, actualUsd))),
    retainUncertain: () => settleAt(round6(ceilingUsd)),
  };
}

/**
 * PACT persistent spend ledger.
 *
 * Protects every billable agent call. The ledger keeps a durable running total
 * in FalkorDB so restarting the process cannot erase spend, and it reserves
 * budget *before* a call so concurrent callers cannot oversubscribe the cap.
 *
 * Atomicity: every mutation is a single Redis Lua script executed on the
 * FalkorDB connection. Redis runs a script to completion without interleaving,
 * so independent ledger instances sharing a FalkorDB never oversubscribe and
 * no lease/lock can expire mid-transaction. Counters (`spent`, `reserved`) and
 * per-reservation hashes are updated together in the same script.
 *
 * Design notes:
 * - `BudgetLedger` owns the accounting policy and is storage-agnostic.
 * - `FalkorBudgetStore` is the production store (Redis keys + Lua).
 * - `MemoryBudgetStore` is an in-process store used by unit tests.
 */

import { FalkorDB } from 'falkordb';

const DEFAULT_TOTAL_USD = 5;
const EPSILON = 1e-9;

export interface BudgetSnapshot {
  totalUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
}

export type ReservationStatus = 'reserved' | 'settled' | 'released';

export interface Reservation {
  id: string;
  amountUsd: number;
  status: ReservationStatus;
  createdAt: string;
  settledUsd?: number;
}

export type ReserveOutcome = 'reserved' | 'already_reserved' | 'already_settled' | 'rejected';

/** Thrown when a reservation would push committed spend past the cap. */
export class BudgetExceededError extends Error {
  readonly code = 'budget_exceeded';
  constructor(
    message: string,
    readonly snapshot: BudgetSnapshot,
    readonly requestedUsd: number,
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/** Thrown when the durable ledger cannot be reached. Callers must fail closed. */
export class BudgetUnavailableError extends Error {
  readonly code = 'budget_unavailable';
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'BudgetUnavailableError';
  }
}

export interface LedgerCounters {
  totalUsd: number;
  spentUsd: number;
  reservedUsd: number;
}

export interface BudgetStore {
  /** Create or update the cap. Must preserve spent/reserved counters. */
  ensureLedger(totalUsd: number): Promise<void>;
  /** Atomically reserve `amountUsd` for `id`. */
  reserve(id: string, amountUsd: number, createdAt: string): Promise<ReserveOutcome>;
  /** Atomically move a reservation to settled and add the real spend. */
  settle(id: string, actualUsd: number): Promise<void>;
  /** Atomically drop an open reservation without recording spend. */
  release(id: string): Promise<void>;
  /** Atomic read of the counters. */
  counters(): Promise<LedgerCounters>;
  listReservations(): Promise<Reservation[]>;
  /** Release underlying connections. Optional for in-process stores. */
  close?(): Promise<void>;
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function toUsd(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? round6(n) : 0;
}

export class BudgetLedger {
  constructor(
    private readonly store: BudgetStore,
    private readonly totalUsd: number,
  ) {
    if (!(totalUsd > 0)) throw new Error('BudgetLedger requires a positive totalUsd');
  }

  async snapshot(): Promise<BudgetSnapshot> {
    await this.store.ensureLedger(this.totalUsd);
    const counters = await this.store.counters();
    const total = counters.totalUsd > 0 ? counters.totalUsd : this.totalUsd;
    return {
      totalUsd: round6(total),
      spentUsd: round6(counters.spentUsd),
      reservedUsd: round6(counters.reservedUsd),
      remainingUsd: round6(Math.max(0, total - counters.spentUsd - counters.reservedUsd)),
    };
  }

  async listReservations(): Promise<Reservation[]> {
    return this.store.listReservations();
  }

  /**
   * Reserve `amountUsd` for call `id`. Idempotent while the reservation is
   * still open. Throws {@link BudgetExceededError} when the cap would be
   * exceeded, which means the caller must NOT make the paid call.
   */
  async reserve(id: string, amountUsd: number): Promise<Reservation> {
    const amount = round6(amountUsd);
    if (!(amount > 0)) throw new Error('reservation amount must be positive');
    await this.store.ensureLedger(this.totalUsd);
    const createdAt = new Date().toISOString();
    const outcome = await this.store.reserve(id, amount, createdAt);
    if (outcome === 'rejected') {
      const counters = await this.store.counters();
      const total = counters.totalUsd > 0 ? counters.totalUsd : this.totalUsd;
      const snapshot: BudgetSnapshot = {
        totalUsd: round6(total),
        spentUsd: round6(counters.spentUsd),
        reservedUsd: round6(counters.reservedUsd),
        remainingUsd: round6(Math.max(0, total - counters.spentUsd - counters.reservedUsd)),
      };
      throw new BudgetExceededError(
        `Budget gate: requested $${amount.toFixed(4)} exceeds remaining $${snapshot.remainingUsd.toFixed(4)} of $${snapshot.totalUsd.toFixed(2)}.`,
        snapshot,
        amount,
      );
    }
    if (outcome === 'already_settled') throw new Error(`reservation ${id} is already settled`);
    return { id, amountUsd: amount, status: 'reserved', createdAt };
  }

  /** Record the real spend for a reservation and close it. */
  async settle(id: string, actualUsd: number): Promise<void> {
    await this.store.settle(id, toUsd(actualUsd));
  }

  /** Drop a reservation without recording spend (call did not happen). */
  async release(id: string): Promise<void> {
    await this.store.release(id);
  }

  /** Release the underlying store connection, if any. */
  async close(): Promise<void> {
    await this.store.close?.();
  }
}

/* ------------------------------------------------------------------ *
 * In-process store (tests)
 * ------------------------------------------------------------------ */

export class MemoryBudgetStore implements BudgetStore {
  private totalUsd = 0;
  private spentUsd = 0;
  private reservedUsd = 0;
  private readonly reservations = new Map<string, Reservation>();
  private tail: Promise<unknown> = Promise.resolve();

  /** Serialize the async critical sections, mirroring Redis script atomicity. */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(() => fn());
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async ensureLedger(totalUsd: number): Promise<void> {
    await this.withLock(async () => {
      this.totalUsd = round6(totalUsd);
    });
  }

  async reserve(id: string, amountUsd: number, createdAt: string): Promise<ReserveOutcome> {
    return this.withLock(async () => {
      const existing = this.reservations.get(id);
      if (existing?.status === 'reserved') return 'already_reserved';
      if (existing?.status === 'settled') return 'already_settled';
      if (this.spentUsd + this.reservedUsd + amountUsd > this.totalUsd + EPSILON) return 'rejected';
      this.reservedUsd = round6(this.reservedUsd + amountUsd);
      this.reservations.set(id, { id, amountUsd, status: 'reserved', createdAt });
      return 'reserved';
    });
  }

  async settle(id: string, actualUsd: number): Promise<void> {
    await this.withLock(async () => {
      const reservation = this.reservations.get(id);
      if (!reservation || reservation.status !== 'reserved') return;
      this.reservedUsd = round6(Math.max(0, this.reservedUsd - reservation.amountUsd));
      this.spentUsd = round6(this.spentUsd + toUsd(actualUsd));
      this.reservations.set(id, { ...reservation, status: 'settled', settledUsd: toUsd(actualUsd) });
    });
  }

  async release(id: string): Promise<void> {
    await this.withLock(async () => {
      const reservation = this.reservations.get(id);
      if (!reservation || reservation.status !== 'reserved') return;
      this.reservedUsd = round6(Math.max(0, this.reservedUsd - reservation.amountUsd));
      this.reservations.set(id, { ...reservation, status: 'released' });
    });
  }

  async counters(): Promise<LedgerCounters> {
    return this.withLock(async () => ({
      totalUsd: this.totalUsd,
      spentUsd: this.spentUsd,
      reservedUsd: this.reservedUsd,
    }));
  }

  async listReservations(): Promise<Reservation[]> {
    return this.withLock(async () => [...this.reservations.values()].map((r) => ({ ...r })));
  }
}

/* ------------------------------------------------------------------ *
 * FalkorDB store (atomic Lua)
 * ------------------------------------------------------------------ */

export interface FalkorBudgetOptions {
  url: string;
  graphName?: string;
}

/** Redis runs each script atomically, so these read-modify-write as one step. */
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

const RELEASE_LUA = `
local status = redis.call('HGET', KEYS[4], 'status')
if status ~= 'reserved' then return {0} end
local amount = tonumber(redis.call('HGET', KEYS[4], 'amount') or '0')
redis.call('INCRBYFLOAT', KEYS[3], -amount)
if tonumber(redis.call('GET', KEYS[3]) or '0') < 0 then redis.call('SET', KEYS[3], '0') end
redis.call('HSET', KEYS[4], 'status', 'released')
return {1}
`;

export class FalkorBudgetStore implements BudgetStore {
  private dbPromise?: Promise<FalkorDB>;
  private readonly prefix: string;
  private readonly keys = {
    total: '',
    spent: '',
    reserved: '',
  };

  constructor(private readonly options: FalkorBudgetOptions) {
    this.prefix = `pact_budget:${options.graphName ?? 'pact_budget'}`;
    this.keys.total = `${this.prefix}:total`;
    this.keys.spent = `${this.prefix}:spent`;
    this.keys.reserved = `${this.prefix}:reserved`;
  }

  private db(): Promise<FalkorDB> {
    if (!this.dbPromise) {
      this.dbPromise = FalkorDB.connect({ url: this.options.url }).catch((error: unknown) => {
        this.dbPromise = undefined;
        throw new BudgetUnavailableError('FalkorDB connection failed', error);
      });
    }
    return this.dbPromise;
  }

  private async connection() {
    const db = await this.db();
    return db.connection;
  }

  private reservationKey(id: string): string {
    return `${this.prefix}:res:${id}`;
  }

  async ensureLedger(totalUsd: number): Promise<void> {
    const client = await this.connection();
    await client.set(this.keys.total, String(round6(totalUsd)));
    // Seed counters so later GETs never read nil.
    await client.set(this.keys.spent, '0', { NX: true });
    await client.set(this.keys.reserved, '0', { NX: true });
  }

  async reserve(id: string, amountUsd: number, createdAt: string): Promise<ReserveOutcome> {
    const client = await this.connection();
    const result = (await client.eval(RESERVE_LUA, {
      keys: [this.keys.total, this.keys.spent, this.keys.reserved, this.reservationKey(id)],
      arguments: [String(round6(amountUsd)), createdAt],
    })) as number[] | string[];
    const code = Number(result?.[0] ?? 0);
    if (code === 1) return 'reserved';
    if (code === 2) return 'already_reserved';
    if (code === 3) return 'already_settled';
    return 'rejected';
  }

  async settle(id: string, actualUsd: number): Promise<void> {
    const client = await this.connection();
    await client.eval(SETTLE_LUA, {
      keys: [this.keys.total, this.keys.spent, this.keys.reserved, this.reservationKey(id)],
      arguments: [String(round6(actualUsd))],
    });
  }

  async release(id: string): Promise<void> {
    const client = await this.connection();
    await client.eval(RELEASE_LUA, {
      keys: [this.keys.total, this.keys.spent, this.keys.reserved, this.reservationKey(id)],
      arguments: [],
    });
  }

  async counters(): Promise<LedgerCounters> {
    const client = await this.connection();
    const values = await client.mGet([this.keys.total, this.keys.spent, this.keys.reserved]);
    return {
      totalUsd: toUsd(values[0]),
      spentUsd: toUsd(values[1]),
      reservedUsd: toUsd(values[2]),
    };
  }

  async listReservations(): Promise<Reservation[]> {
    const client = await this.connection();
    const keys = await client.keys(`${this.prefix}:res:*`);
    const reservations: Reservation[] = [];
    for (const key of keys) {
      const hash = await client.hGetAll(key);
      if (!hash || !hash.status) continue;
      const settled = Number(hash.settledUsd);
      const reservation: Reservation = {
        id: key.slice(`${this.prefix}:res:`.length),
        amountUsd: toUsd(hash.amount),
        status: hash.status === 'settled' || hash.status === 'released' ? hash.status : 'reserved',
        createdAt: hash.createdAt ?? new Date(0).toISOString(),
      };
      if (Number.isFinite(settled) && settled >= 0) reservation.settledUsd = settled;
      reservations.push(reservation);
    }
    return reservations;
  }

  async close(): Promise<void> {
    const pending = this.dbPromise;
    this.dbPromise = undefined;
    if (!pending) return;
    const db = await pending.catch(() => undefined);
    await db?.close().catch(() => undefined);
  }
}

/** Environment bag. Looser than `NodeJS.ProcessEnv` so tests can inject values. */
export type EnvLike = Record<string, string | undefined>;

export interface BudgetConfig {
  totalUsd: number;
  url?: string;
  graphName: string;
}

export function resolveBudgetConfig(env: EnvLike = process.env): BudgetConfig {
  const raw = Number(env.PACT_API_BUDGET_USD);
  const totalUsd = Number.isFinite(raw) && raw > 0 ? round6(raw) : DEFAULT_TOTAL_USD;
  return {
    totalUsd,
    url: env.FALKORDB_URL?.trim() || undefined,
    graphName: env.PACT_BUDGET_GRAPH?.trim() || 'pact_budget',
  };
}

/**
 * Production ledger factory. Throws {@link BudgetUnavailableError} when the
 * durable store is not configured so callers can fail closed instead of
 * silently allowing spend.
 */
export function createBudgetLedger(env: EnvLike = process.env): BudgetLedger {
  const config = resolveBudgetConfig(env);
  if (!config.url) {
    throw new BudgetUnavailableError('FALKORDB_URL is not set; persistent budget ledger unavailable');
  }
  return new BudgetLedger(new FalkorBudgetStore({ url: config.url, graphName: config.graphName }), config.totalUsd);
}

/** Test helper: an in-process ledger with the same rules. */
export function createMemoryBudgetLedger(
  totalUsd = DEFAULT_TOTAL_USD,
  store: BudgetStore = new MemoryBudgetStore(),
): BudgetLedger {
  return new BudgetLedger(store, totalUsd);
}

import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Neon / PostgreSQL connection pool.
 *
 * Uses the standard `pg` driver over TCP, which Neon supports directly. The
 * app runs as a long-lived Express process, so a normal pool is the right fit
 * (`@neondatabase/serverless` matters for edge/serverless runtimes, and can be
 * swapped in here without touching call sites — it exposes the same `Pool`).
 *
 * The same code therefore runs against a local PostgreSQL during development
 * and against Neon in production; only DATABASE_URL changes.
 */

const connectionString = process.env.DATABASE_URL ?? "";

export const isDatabaseConfigured = connectionString.length > 0;

if (!isDatabaseConfigured) {
  console.warn(
    "[DB] DATABASE_URL is not set. Endpoints backed by the database will " +
      "return 503 until it is configured. See README -> Database.",
  );
}

// Neon terminates TLS at the proxy and its hostnames are *.neon.tech; local
// development typically has no TLS at all.
const needsSsl = /neon\.tech|sslmode=require/.test(connectionString);

export const pool: Pool | null = isDatabaseConfigured
  ? new Pool({
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : null;

// An idle client erroring (Neon scaling to zero, a network blip) must not take
// the process down.
pool?.on("error", (error) => {
  console.error("[DB] idle client error:", error.message);
});

const requirePool = (): Pool => {
  if (!pool) throw new Error("DATABASE_NOT_CONFIGURED");
  return pool;
};

/** Runs a single parameterised query. */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await requirePool().query<T>(text, params as unknown[]);
  return result.rows;
};

/** Runs a query expected to match at most one row. */
export const queryOne = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> => {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
};

/**
 * Runs `fn` inside a transaction, replacing Firestore's `runTransaction`.
 *
 * Commits on success, rolls back on any throw, and always returns the client
 * to the pool. Use this wherever several writes must land together — trades,
 * guild membership changes, purchases.
 */
export const transaction = async <T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await requirePool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[DB] rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
};

/** Liveness check used by /api/health. */
export const ping = async (): Promise<boolean> => {
  if (!pool) return false;
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

export const closePool = async (): Promise<void> => {
  await pool?.end();
};

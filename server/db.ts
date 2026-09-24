import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const digitalOceanUrl = process.env.DIGITALOCEAN_DATABASE_URL;
const replitUrl = process.env.DATABASE_URL;

const useDirectDO = !!digitalOceanUrl;

const databaseUrl = digitalOceanUrl || replitUrl;

if (!databaseUrl) {
  throw new Error(
    "DIGITALOCEAN_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function stripSslMode(url: string): string {
  return url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
}

function createPool(url: string, useSsl: boolean): InstanceType<typeof pg.Pool> {
  const cleanUrl = useSsl ? stripSslMode(url) : url;
  const p = new Pool({
    connectionString: cleanUrl,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 10000,
    max: 5,
    min: 0,
    allowExitOnIdle: true,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
  p.on("error", (err: Error) => {
    console.error("Database pool error:", err.message);
  });
  return p;
}

const state = {
  pool: createPool(databaseUrl, useDirectDO),
  db: null as unknown as NodePgDatabase<typeof schema>,
  source: useDirectDO ? "DigitalOcean" : "Replit",
  reconnecting: false,
};
state.db = drizzle(state.pool, { schema });

console.log(`Database: attempting ${state.source} PostgreSQL...`);

async function reconnect(): Promise<void> {
  if (state.reconnecting) return;
  state.reconnecting = true;
  try {
    const newPool = createPool(databaseUrl!, useDirectDO);
    await newPool.query("SELECT 1");
    const oldPool = state.pool;
    state.pool = newPool;
    state.db = drizzle(newPool, { schema });
    setTimeout(() => {
      oldPool.end().catch(() => {});
    }, 5000);
    console.log("Database: reconnected to DigitalOcean PostgreSQL");
  } catch (reconnectErr: unknown) {
    const msg = reconnectErr instanceof Error ? reconnectErr.message : String(reconnectErr);
    console.error("Database reconnection failed:", msg);
  } finally {
    state.reconnecting = false;
  }
}

if (useDirectDO) {
  setInterval(async () => {
    try {
      await state.pool.query("SELECT 1");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("Database keepalive failed:", message, "— reconnecting...");
      await reconnect();
    }
  }, 15000);
}

async function queryWithRetry(
  fn: () => Promise<any>,
  retries: number = 2
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isConnectionError =
        message.includes("timeout exceeded") ||
        message.includes("Connection terminated") ||
        message.includes("connection refused") ||
        message.includes("cannot use a pool after calling end") ||
        message.includes("ECONNRESET") ||
        message.includes("ECONNREFUSED") ||
        message.includes("Client has encountered a connection error");
      
      if (isConnectionError && attempt < retries) {
        console.warn(`Database query failed (attempt ${attempt + 1}/${retries + 1}): ${message} — retrying...`);
        await reconnect();
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      throw err;
    }
  }
}

const poolHandler: ProxyHandler<InstanceType<typeof pg.Pool>> = {
  get: (_t, prop) => {
    const val = (state.pool as Record<string | symbol, unknown>)[prop];
    if (prop === "query" && typeof val === "function") {
      return (...args: unknown[]) =>
        queryWithRetry(() => (state.pool.query as Function)(...args));
    }
    if (prop === "connect" && typeof val === "function") {
      return (...args: unknown[]) =>
        queryWithRetry(() => (state.pool.connect as Function)(...args));
    }
    if (typeof val === "function") {
      return (val as Function).bind(state.pool);
    }
    return val;
  },
};

export const pool: InstanceType<typeof pg.Pool> = new Proxy(
  {} as InstanceType<typeof pg.Pool>,
  poolHandler
);

export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  { get: (_t, prop) => (state.db as Record<string | symbol, unknown>)[prop] }
);

export function getActiveSource(): string {
  return state.source;
}

export async function ensureDbConnection(): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Database: connection attempt ${attempt}/${maxRetries} to ${state.source}...`);
      await state.pool.query("SELECT 1");
      console.log(`Database: connected to ${state.source} PostgreSQL`);
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Database: attempt ${attempt} failed: ${message}`);
      
      if (attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(`Database: retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        await reconnect();
        continue;
      }
      
      if (useDirectDO && replitUrl) {
        console.warn(`Database: DigitalOcean connection failed after ${maxRetries} attempts. Falling back to Replit PostgreSQL...`);
        const fallbackPool = createPool(replitUrl, false);
        await fallbackPool.query("SELECT 1");
        const oldPool = state.pool;
        state.pool = fallbackPool;
        state.db = drizzle(fallbackPool, { schema });
        setTimeout(() => { oldPool.end().catch(() => {}); }, 5000);
        state.source = "Replit (fallback)";
        console.log("Database: connected to Replit PostgreSQL (fallback)");
      } else {
        throw err;
      }
    }
  }
}

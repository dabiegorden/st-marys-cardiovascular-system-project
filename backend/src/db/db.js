/**
 * db/db.js  –  Drizzle ORM client for Neon serverless PostgreSQL
 * ===============================================================
 * Uses the Neon WebSocket Pool driver (`drizzle-orm/neon-serverless`)
 * because Better Auth and the model-activation flow need transactions,
 * which the stateless HTTP driver does not support.
 */

import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add your Neon connection string to backend/.env.",
  );
}

// Node 22+ ships a global WebSocket implementation.
if (globalThis.WebSocket) neonConfig.webSocketConstructor = globalThis.WebSocket;

export const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
export const db = drizzle({ client: pool, schema });

/** Fail fast at startup if the database is unreachable. */
export async function checkDatabaseConnection() {
  await db.execute(sql`select 1`);
  console.log(`✓ PostgreSQL (Neon) connected: ${new URL(DATABASE_URL).host}`);
}

export async function closeDatabase() {
  await pool.end().catch(() => {});
}

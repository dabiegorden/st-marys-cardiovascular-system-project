/**
 * notifications/queue.js – generic transactional-outbox processor
 * ===============================================================
 * Works for any table with: id, status, attempts, nextAttemptAt, lastError,
 * providerMessageId, sentAt, createdAt, updatedAt (email and SMS outboxes).
 *
 * - Due rows are claimed with SELECT … FOR UPDATE SKIP LOCKED, so several API
 *   instances never process the same row.
 * - `deliver(row)` returns one of:
 *     { status: "sent", providerMessageId }
 *     { status: "skipped", reason }
 *     { status: "error", retryable, message }
 * - Retryable errors back off on `retryDelaysMin`; others fail permanently.
 */

import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";
import { db } from "../db/db.js";

const STALE_SENDING_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createOutboxProcessor({ name, table, deliver, retryDelaysMin, batchSize = 20, gapMs = 150 }) {
  const maxAttempts = retryDelaysMin.length + 1;
  let running = false;
  let rerun = false;

  const update = (id, values) => db.update(table).set(values).where(eq(table.id, id));

  async function claimDue() {
    const due = db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.status, "pending"), lte(table.nextAttemptAt, new Date())))
      .orderBy(asc(table.createdAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    return db.update(table).set({ status: "sending" }).where(inArray(table.id, due)).returning();
  }

  async function handle(row) {
    const attempts = row.attempts + 1;
    let result;
    try {
      result = await deliver(row);
    } catch (err) {
      result = { status: "error", retryable: true, message: `unexpected: ${err.message}` };
    }

    if (result.status === "sent") {
      return update(row.id, { status: "sent", attempts, providerMessageId: result.providerMessageId ?? null, sentAt: new Date(), lastError: null });
    }
    if (result.status === "skipped") {
      return update(row.id, { status: "skipped", lastError: result.reason });
    }
    if (result.retryable && attempts < maxAttempts) {
      const delay = retryDelaysMin[attempts - 1] ?? retryDelaysMin.at(-1);
      return update(row.id, { status: "pending", attempts, lastError: result.message, nextAttemptAt: new Date(Date.now() + delay * 60_000) });
    }
    console.error(`[${name}] permanently failed (${row.kind}): ${result.message}`);
    return update(row.id, { status: "failed", attempts, lastError: result.message });
  }

  async function process() {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      // Rows left in "sending" by a crashed process go back to the queue
      await db
        .update(table)
        .set({ status: "pending" })
        .where(and(eq(table.status, "sending"), lt(table.updatedAt, new Date(Date.now() - STALE_SENDING_MS))));

      for (;;) {
        const batch = await claimDue();
        if (!batch.length) break;
        for (const row of batch) {
          await handle(row).catch((err) => console.error(`[${name}] update error:`, err.message));
          await sleep(gapMs);
        }
        if (batch.length < batchSize) break;
      }
    } catch (err) {
      console.error(`[${name}] processing error:`, err.message);
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        setImmediate(process);
      }
    }
  }

  return { process, kick: () => setImmediate(process), maxAttempts };
}

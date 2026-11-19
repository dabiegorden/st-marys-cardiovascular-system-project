/**
 * services/audit.js – append-only audit trail
 * Never throws: an audit failure must not break the user's action,
 * but it is logged loudly.
 */

import { db } from "../db/db.js";
import { auditLogs } from "../db/schema.js";

export async function writeAudit({
  action,
  userId = null,
  actorEmail = null,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    await db.insert(auditLogs).values({
      action,
      userId,
      actorEmail,
      entityType,
      entityId: entityId == null ? null : String(entityId),
      details,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.error(`[audit] FAILED to write "${action}":`, err.message);
  }
}

/** Convenience wrapper using the authenticated request. */
export function audit(req, action, extra = {}) {
  return writeAudit({
    action,
    userId: req.user?.id ?? null,
    actorEmail: req.user?.email ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.get?.("user-agent") ?? null,
    ...extra,
  });
}

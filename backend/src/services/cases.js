/**
 * services/cases.js – high-risk follow-up workflow
 * ================================================
 *   open ──acknowledge──▶ acknowledged ──review──▶ reviewed ──refer──▶ referred
 *     └──────────────── close (any non-closed state, note required) ─────────▶ closed
 *   closed ──reopen (admin)──▶ acknowledged
 *
 * Cases nobody acknowledges within ESCALATION_HOURS are escalated (email + SMS
 * to admins and the responsible clinician), up to MAX_ESCALATIONS times.
 */

import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { assessments, caseEvents, highRiskCases, patients, users } from "../db/schema.js";
import { config } from "../config.js";
import { HttpError } from "../middleware/errorHandler.js";
import { enqueueEscalationEmail } from "../notifications/outbox.js";
import { enqueueEscalationSms } from "../notifications/sms-outbox.js";
import { writeAudit } from "./audit.js";
import { TRANSITIONS, validateTransition } from "./case-rules.js";

export { TRANSITIONS, validateTransition };

export async function openCaseForAssessment(assessment, assessorId) {
  const [row] = await db
    .insert(highRiskCases)
    .values({ assessmentId: assessment.id, patientId: assessment.patientId, assignedToId: assessorId })
    .onConflictDoNothing({ target: highRiskCases.assessmentId })
    .returning();
  if (row) await db.insert(caseEvents).values({ caseId: row.id, userId: assessorId, action: "created", toStatus: "open" });
  return row ?? null;
}

export async function getCaseForAssessment(assessmentId) {
  const [row] = await db
    .select({ case: highRiskCases, assigneeName: users.name })
    .from(highRiskCases)
    .leftJoin(users, eq(highRiskCases.assignedToId, users.id))
    .where(eq(highRiskCases.assessmentId, assessmentId));
  if (!row) return null;
  const events = await db
    .select({
      id: caseEvents.id,
      action: caseEvents.action,
      fromStatus: caseEvents.fromStatus,
      toStatus: caseEvents.toStatus,
      note: caseEvents.note,
      createdAt: caseEvents.createdAt,
      userName: users.name,
    })
    .from(caseEvents)
    .leftJoin(users, eq(caseEvents.userId, users.id))
    .where(eq(caseEvents.caseId, row.case.id))
    .orderBy(caseEvents.createdAt);
  return { ...row.case, assigneeName: row.assigneeName, events, overdue: isOverdue(row.case) };
}

export function isOverdue(c, now = Date.now()) {
  return c.status === "open" && now - new Date(c.createdAt).getTime() > config.followUp.escalationHours * 3600_000;
}

export async function applyCaseAction(caseId, action, user, note) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(highRiskCases).where(eq(highRiskCases.id, caseId)).for("update");
    if (!c) throw new HttpError(404, "Case not found.");
    if (action === "note") {
      if (!String(note ?? "").trim()) throw new HttpError(400, "Note is empty.");
      await tx.insert(caseEvents).values({ caseId, userId: user.id, action: "note", note: note.trim() });
      return c;
    }
    const error = validateTransition(action, c.status, { note, role: user.role });
    if (error) throw new HttpError(400, error);
    const to = TRANSITIONS[action].to;
    const now = new Date();
    const patch = { status: to };
    if (to === "acknowledged" && !c.acknowledgedAt) Object.assign(patch, { acknowledgedAt: now, acknowledgedById: user.id });
    if (["reviewed", "referred", "closed"].includes(to) && !c.acknowledgedAt) Object.assign(patch, { acknowledgedAt: now, acknowledgedById: user.id });
    if (to === "closed") Object.assign(patch, { closedAt: now, closedById: user.id });
    if (action === "reopen") Object.assign(patch, { closedAt: null, closedById: null });
    const [updated] = await tx.update(highRiskCases).set(patch).where(eq(highRiskCases.id, caseId)).returning();
    await tx.insert(caseEvents).values({ caseId, userId: user.id, action, fromStatus: c.status, toStatus: to, note: note?.trim() || null });
    return updated;
  });
}

const caseListColumns = {
  id: highRiskCases.id,
  status: highRiskCases.status,
  createdAt: highRiskCases.createdAt,
  acknowledgedAt: highRiskCases.acknowledgedAt,
  closedAt: highRiskCases.closedAt,
  escalationCount: highRiskCases.escalationCount,
  assessmentId: highRiskCases.assessmentId,
  assignedToId: highRiskCases.assignedToId,
  assigneeName: users.name,
  hospitalNumber: patients.hospitalNumber,
  probability: assessments.probability,
  outcome: assessments.outcome,
};

export async function listCases({ status, mine, userId, page, pageSize }) {
  const conds = [];
  if (status === "active") conds.push(inArray(highRiskCases.status, ["open", "acknowledged", "reviewed", "referred"]));
  else if (status === "overdue")
    conds.push(eq(highRiskCases.status, "open"), lt(highRiskCases.createdAt, new Date(Date.now() - config.followUp.escalationHours * 3600_000)));
  else if (status) conds.push(eq(highRiskCases.status, status));
  if (mine) conds.push(eq(highRiskCases.assignedToId, userId));
  const where = conds.length ? and(...conds) : undefined;

  const base = db
    .select(caseListColumns)
    .from(highRiskCases)
    .innerJoin(assessments, eq(highRiskCases.assessmentId, assessments.id))
    .innerJoin(patients, eq(highRiskCases.patientId, patients.id))
    .leftJoin(users, eq(highRiskCases.assignedToId, users.id));

  const [items, [{ total }], counts, [timing]] = await Promise.all([
    base.where(where).orderBy(sql`case when ${highRiskCases.status} = 'open' then 0 when ${highRiskCases.status} = 'closed' then 2 else 1 end`, desc(highRiskCases.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql`count(*)`.mapWith(Number) }).from(highRiskCases).where(where),
    db.select({ status: highRiskCases.status, total: sql`count(*)`.mapWith(Number) }).from(highRiskCases).groupBy(highRiskCases.status),
    db
      .select({
        medianAckMinutes: sql`percentile_cont(0.5) within group (order by extract(epoch from (${highRiskCases.acknowledgedAt} - ${highRiskCases.createdAt})) / 60)`.mapWith(Number),
        acknowledged: sql`count(${highRiskCases.acknowledgedAt})`.mapWith(Number),
        overdue: sql`count(*) filter (where ${highRiskCases.status} = 'open' and ${highRiskCases.createdAt} < ${new Date(Date.now() - config.followUp.escalationHours * 3600_000)})`.mapWith(Number),
      })
      .from(highRiskCases),
  ]);

  return {
    items: items.map((i) => ({ ...i, overdue: isOverdue(i) })),
    total,
    page,
    pageSize,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.total])),
    timing,
    escalationHours: config.followUp.escalationHours,
  };
}

/** Background job: escalate cases that nobody has acknowledged in time. */
export async function escalateOverdueCases(now = new Date()) {
  const hours = config.followUp.escalationHours;
  const due = await db
    .select({ case: highRiskCases, assessment: assessments, hospitalNumber: patients.hospitalNumber, assigneeName: users.name })
    .from(highRiskCases)
    .innerJoin(assessments, eq(highRiskCases.assessmentId, assessments.id))
    .innerJoin(patients, eq(highRiskCases.patientId, patients.id))
    .leftJoin(users, eq(highRiskCases.assignedToId, users.id))
    .where(
      and(
        eq(highRiskCases.status, "open"),
        lt(highRiskCases.escalationCount, config.followUp.maxEscalations),
        lt(highRiskCases.createdAt, new Date(now.getTime() - hours * 3600_000)),
        // first escalation, or the previous one was at least `hours` ago
        or(isNull(highRiskCases.escalatedAt), lt(highRiskCases.escalatedAt, new Date(now.getTime() - hours * 3600_000))),
      ),
    );

  for (const d of due) {
    const level = d.case.escalationCount + 1;
    const [claimed] = await db
      .update(highRiskCases)
      .set({ escalationCount: level, escalatedAt: now })
      .where(and(eq(highRiskCases.id, d.case.id), eq(highRiskCases.escalationCount, d.case.escalationCount)))
      .returning({ id: highRiskCases.id });
    if (!claimed) continue; // another instance escalated it

    const payload = {
      caseRow: d.case,
      assessment: d.assessment,
      hospitalNumber: d.hospitalNumber,
      assigneeId: d.case.assignedToId,
      assigneeName: d.assigneeName,
      level,
      hours,
    };
    const [emails, sms] = await Promise.all([enqueueEscalationEmail(payload), enqueueEscalationSms(payload)]);
    await db.insert(caseEvents).values({
      caseId: d.case.id,
      action: "escalated",
      note: `Not acknowledged after ${hours} h – escalation #${level} sent (${emails} email, ${sms} SMS).`,
    });
    await writeAudit({ action: "case.escalated", entityType: "high_risk_case", entityId: d.case.id, details: { level, emails, sms } });
  }
  if (due.length) console.log(`[follow-up] escalated ${due.length} overdue case(s)`);
  return due.length;
}

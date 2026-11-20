/** Follow-up case state machine (pure, unit-tested). */

export const TRANSITIONS = {
  acknowledge: { from: ["open"], to: "acknowledged", noteRequired: false },
  review: { from: ["open", "acknowledged"], to: "reviewed", noteRequired: true },
  refer: { from: ["open", "acknowledged", "reviewed"], to: "referred", noteRequired: true },
  close: { from: ["open", "acknowledged", "reviewed", "referred"], to: "closed", noteRequired: true },
  reopen: { from: ["closed"], to: "acknowledged", noteRequired: true, adminOnly: true },
};

/** Pure check (unit-tested). Returns an error message or null. */
export function validateTransition(action, status, { note, role } = {}) {
  const t = TRANSITIONS[action];
  if (!t) return `Unknown action "${action}".`;
  if (t.adminOnly && role !== "admin") return "Only administrators can reopen a case.";
  if (!t.from.includes(status)) return `Cannot ${action} a case that is ${status}.`;
  if (t.noteRequired && !String(note ?? "").trim()) return "Please add a note describing the action taken.";
  return null;
}

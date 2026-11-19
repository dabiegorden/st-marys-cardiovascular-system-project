/**
 * Access-control tests – the session lookup is injected, so no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { loadSession, requireAuth, requireRole } from "../src/middleware/auth.js";

const USERS = {
  admin: { id: "a1", role: "admin", email: "a@x", mustChangePassword: false },
  clinician: { id: "c1", role: "clinician", email: "c@x", mustChangePassword: false },
  newbie: { id: "n1", role: "clinician", email: "n@x", mustChangePassword: true },
  banned: { id: "b1", role: "clinician", email: "b@x", banned: true },
};

function app() {
  const a = express();
  a.use(loadSession(async (req) => {
    const u = USERS[req.get("x-test-user")];
    return u ? { user: u, session: { id: "s" } } : null;
  }));
  a.get("/api/me", requireAuth, (req, res) => res.json({ id: req.user.id }));
  a.get("/api/assessments", requireAuth, (_req, res) => res.json({ ok: true }));
  a.get("/api/admin/users", requireRole("admin"), (_req, res) => res.json({ ok: true }));
  return a;
}

const get = (path, user) => {
  const r = request(app()).get(path);
  return user ? r.set("x-test-user", user) : r;
};

test("anonymous requests get 401", async () => {
  assert.equal((await get("/api/assessments")).status, 401);
  assert.equal((await get("/api/admin/users")).status, 401);
});

test("banned users get 401", async () => {
  assert.equal((await get("/api/assessments", "banned")).status, 401);
});

test("clinicians can use clinical routes but not admin routes", async () => {
  assert.equal((await get("/api/assessments", "clinician")).status, 200);
  const r = await get("/api/admin/users", "clinician");
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "FORBIDDEN");
});

test("admins can use admin routes", async () => {
  assert.equal((await get("/api/admin/users", "admin")).status, 200);
});

test("a pending password change blocks everything except /api/me", async () => {
  assert.equal((await get("/api/me", "newbie")).status, 200);
  const r = await get("/api/assessments", "newbie");
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "PASSWORD_CHANGE_REQUIRED");
});

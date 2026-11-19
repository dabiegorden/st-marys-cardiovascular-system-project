/**
 * auth/auth.js – Better Auth configuration
 * ========================================
 * - Email + password only, NO public sign-up (admins create accounts)
 * - Passwords hashed with scrypt by Better Auth; stored in accounts.password
 * - Server-side sessions in Postgres, httpOnly cookie, 8 h lifetime
 * - Roles via the admin plugin: "admin" (full user management) and
 *   "clinician" (no user-management permissions)
 * - Login attempts are rate limited and written to the audit log
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "../db/db.js";
import { users, sessions, accounts, verifications } from "../db/schema.js";
import { config } from "../config.js";
import { writeAudit } from "../services/audit.js";

const ac = createAccessControl(defaultStatements);
export const roles = {
  admin: ac.newRole({ ...adminAc.statements }),
  clinician: ac.newRole({ user: [], session: [] }),
};
export const ROLE_NAMES = Object.keys(roles);

export const auth = betterAuth({
  appName: "St. Mary's CVD Support",
  secret: config.authSecret,
  baseURL: config.authUrl,
  basePath: "/api/auth",
  trustedOrigins: [config.frontendOrigin],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: false,
  },

  user: {
    additionalFields: {
      mustChangePassword: { type: "boolean", defaultValue: false, input: false },
      highRiskAlerts: { type: "boolean", defaultValue: true, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 8, // 8 hours (one shift)
    updateAge: 60 * 60, // extend at most once per hour while active
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/change-password": { window: 15 * 60, max: 10 },
    },
  },

  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },

  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "clinician",
      adminRoles: ["admin"],
    }),
  ],

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const headers = ctx.headers ?? ctx.request?.headers;
      const meta = {
        ipAddress: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers?.get("x-real-ip") ?? null,
        userAgent: headers?.get("user-agent") ?? null,
      };

      if (ctx.path === "/sign-in/email") {
        const newSession = ctx.context.newSession;
        await writeAudit({
          action: newSession ? "auth.login" : "auth.login_failed",
          userId: newSession?.user.id ?? null,
          actorEmail: newSession?.user.email ?? ctx.body?.email ?? null,
          ...meta,
        });
      }

      if (ctx.path === "/sign-out") {
        await writeAudit({ action: "auth.logout", ...meta });
      }

      // A successful password change clears the "must change" flag
      if (ctx.path === "/change-password" && ctx.context.returned && !(ctx.context.returned instanceof Error)) {
        const userId = ctx.context.session?.user.id ?? ctx.context.returned?.user?.id;
        if (userId) {
          await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));
          await writeAudit({ action: "auth.password_changed", userId, ...meta });
        }
      }
    }),
  },
});

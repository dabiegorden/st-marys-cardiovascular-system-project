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
import { admin, twoFactor } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "../db/db.js";
import { users, sessions, accounts, verifications, twoFactors } from "../db/schema.js";
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
    schema: { user: users, session: sessions, account: accounts, verification: verifications, twoFactor: twoFactors },
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
      smsAlerts: { type: "boolean", defaultValue: true, input: false },
      phoneNumber: { type: "string", required: false, input: false },
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
      "/two-factor/verify-totp": { window: 15 * 60, max: 10 },
      "/two-factor/verify-backup-code": { window: 15 * 60, max: 10 },
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
    // Authenticator-app (TOTP) second factor + one-time backup codes
    twoFactor({ issuer: "St Marys CVD Support" }),
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
        const challenged = ctx.context.returned?.twoFactorRedirect === true;
        await writeAudit({
          action: newSession ? "auth.login" : challenged ? "auth.login_2fa_challenge" : "auth.login_failed",
          userId: newSession?.user.id ?? null,
          actorEmail: newSession?.user.email ?? ctx.body?.email ?? null,
          ...meta,
        });
      }

      if (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code") {
        const newSession = ctx.context.newSession;
        const ok = newSession || (ctx.context.returned && !(ctx.context.returned instanceof Error) && ctx.context.returned?.token);
        await writeAudit({
          action: ok ? (ctx.path.endsWith("backup-code") ? "auth.login_2fa_backup_code" : "auth.login_2fa") : "auth.2fa_failed",
          userId: newSession?.user.id ?? ctx.context.session?.user.id ?? null,
          actorEmail: newSession?.user.email ?? ctx.context.session?.user.email ?? null,
          ...meta,
        });
      }

      if (ctx.path === "/two-factor/disable" && ctx.context.session) {
        await writeAudit({ action: "auth.2fa_disabled", userId: ctx.context.session.user.id, ...meta });
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

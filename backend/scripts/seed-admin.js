/**
 * scripts/seed-admin.js – create the FIRST administrator account
 * =============================================================
 *   npm run seed:admin -- --email admin@stmarys.local --name "System Administrator"
 *
 * - Does nothing if an admin already exists.
 * - Prints a one-time temporary password (or uses SEED_ADMIN_PASSWORD);
 *   the admin must change it at first login.
 */

import crypto from "crypto";
import { parseArgs } from "util";
import { eq } from "drizzle-orm";
import { auth } from "../src/auth/auth.js";
import { db, closeDatabase } from "../src/db/db.js";
import { users } from "../src/db/schema.js";

const { values } = parseArgs({
  options: {
    email: { type: "string", default: process.env.SEED_ADMIN_EMAIL ?? "admin@stmarys.local" },
    name: { type: "string", default: process.env.SEED_ADMIN_NAME ?? "System Administrator" },
  },
});

try {
  const [existing] = await db.select({ email: users.email }).from(users).where(eq(users.role, "admin")).limit(1);
  if (existing) {
    console.log(`An administrator already exists (${existing.email}). Nothing to do.`);
  } else {
    const password =
      process.env.SEED_ADMIN_PASSWORD ??
      Array.from(crypto.randomBytes(16), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[b % 56]).join("");

    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser({
      email: values.email.toLowerCase(),
      name: values.name,
      emailVerified: true,
      role: "admin",
      mustChangePassword: true,
    });
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(password),
    });
    await db.update(users).set({ role: "admin", mustChangePassword: true }).where(eq(users.id, user.id));

    console.log("\n✓ Administrator created");
    console.log(`  Email:              ${values.email.toLowerCase()}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`  Temporary password: ${password}`);
    console.log("  You will be asked to change the password at first login.\n");
  }
} finally {
  await closeDatabase();
}

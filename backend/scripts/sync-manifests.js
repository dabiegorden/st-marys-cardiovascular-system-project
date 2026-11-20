/**
 * scripts/sync-manifests.js – copy model_store/<version>/manifest.json into
 * model_versions.manifest (after model_training/augment_manifest.py).
 *   npm run models:sync
 */
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../src/db/db.js";
import { modelVersions } from "../src/db/schema.js";
import { config } from "../src/config.js";

try {
  const rows = await db.select({ id: modelVersions.id, version: modelVersions.version, artifactDir: modelVersions.artifactDir }).from(modelVersions);
  for (const r of rows) {
    const file = path.join(config.modelStoreDir, r.artifactDir, "manifest.json");
    if (!fs.existsSync(file)) {
      console.warn(`- ${r.version}: manifest not found, skipped`);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(file, "utf-8"));
    await db.update(modelVersions).set({ manifest }).where(eq(modelVersions.id, r.id));
    console.log(`✓ ${r.version}: manifest synced`);
  }
} finally {
  await closeDatabase();
}

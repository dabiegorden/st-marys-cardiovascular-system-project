import { config } from "./config.js";
import { checkDatabaseConnection, closeDatabase } from "./db/db.js";
import { initModelRegistry, getActiveModel } from "./ml/registry.js";
import { failStaleJobs } from "./services/training.js";
import { createApp } from "./app.js";

try {
  await checkDatabaseConnection();
  await initModelRegistry();
  await failStaleJobs();
} catch (err) {
  console.error("❌ Startup failed:", err.message);
  await closeDatabase();
  process.exit(1);
}

const server = createApp().listen(config.port, () => {
  console.log(`
  🏥  St. Mary's CVD Support API
      http://localhost:${config.port}   (${config.env})
      Active model: ${getActiveModel()?.row.version ?? "none"}
`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received – shutting down…`);
  server.close();
  await closeDatabase();
  process.exit(0);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

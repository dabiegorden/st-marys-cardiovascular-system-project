/**
 * app.js – Express application (no listening, no startup side-effects)
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";

import { config } from "./config.js";
import { auth } from "./auth/auth.js";
import { loadSession, requireRole, setRequireAdmin2fa } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { getActiveModel } from "./ml/registry.js";
import clinicalRouter from "./routes/clinical.js";
import adminRouter from "./routes/admin.js";

export function createApp() {
  const app = express();
  setRequireAdmin2fa(config.security.requireAdmin2fa);

  // Requests arrive through the Next.js proxy (and later a reverse proxy)
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use(morgan(config.isProduction ? "combined" : "dev"));

  // Better Auth must be mounted BEFORE body parsers
  app.all("/api/auth/*splat", toNodeHandler(auth));

  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", model: getActiveModel()?.row.version ?? null, time: new Date().toISOString() });
  });

  // Attach req.user / req.session for every API route
  app.use(
    "/api",
    loadSession((req) => auth.api.getSession({ headers: fromNodeHeaders(req.headers) })),
  );

  app.use("/api/admin", requireRole("admin"), adminRouter);
  app.use("/api", clinicalRouter);

  app.use((req, res) => {
    res.status(404).json({ success: false, error: "Endpoint not found.", path: req.path });
  });
  app.use(errorHandler);
  return app;
}

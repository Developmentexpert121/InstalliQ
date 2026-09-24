import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { config, printEnvReport, isProduction } from "./config";
import { pool, ensureDbConnection } from "./db";
import { autoMigrate } from "./auto-migrate";
import { runSeeders } from "./seeders";
import { startScheduler } from "./scheduler";

const app = express();
let appReady = false;
const startTime = Date.now();

app.use(compression());

const httpServer = createServer(app);

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, keeping alive...");
});
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  process.exit(0);
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.get("/health", async (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  let dbOk = false;
  try {
    const result = await pool.query("SELECT 1");
    dbOk = result.rowCount === 1;
  } catch {
    dbOk = false;
  }

  const status = appReady && dbOk ? "healthy" : "degraded";
  const code = status === "healthy" ? 200 : 503;

  res.status(code).json({
    status,
    version: process.env.npm_package_version || "1.0.0",
    environment: config.nodeEnv,
    uptime,
    checks: {
      app: appReady ? "ok" : "initializing",
      database: dbOk ? "ok" : "unreachable",
    },
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

printEnvReport();

const port = config.port;
httpServer.listen(port, "0.0.0.0", () => {
  log(`serving on port ${port}`);
});

(async () => {
  try {
    await ensureDbConnection();
  } catch (err) {
    console.error("Failed to connect to any database:", err);
  }

  try {
    const dbUrl = process.env.DIGITALOCEAN_DATABASE_URL || process.env.DATABASE_URL;
    if (dbUrl) {
      await autoMigrate(dbUrl, !!process.env.DIGITALOCEAN_DATABASE_URL);
    }
  } catch (err) {
    console.error("[AutoMigrate] Failed (non-fatal):", err);
  }

  try {
    await runSeeders();
  } catch (err) {
    console.error("Seeders failed (non-fatal):", err);
  }

  try {
    const { clearAllCompanyCamSyncStates } = await import("./asset-manager/storage");
    await clearAllCompanyCamSyncStates();
    console.log("[Startup] Cleared any stale CompanyCam sync states");
  } catch (err) {
    console.error("[Startup] Failed to clear stale sync states (non-fatal):", err);
  }

  try {
    await registerRoutes(httpServer, app);
  } catch (err) {
    console.error("Failed to register routes (database may be unreachable):", err);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  appReady = true;
  log("Application fully initialized");
  startScheduler();
})();

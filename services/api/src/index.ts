import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { config } from "./config.js";
import { closeDb, query } from "./db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { getRedis } from "./redis.js";
import { analyticsRouter } from "./routes/analytics.js";
import { matchesRouter } from "./routes/matches.js";
import { oddsRouter } from "./routes/odds.js";
import { officialRouter } from "./routes/official.js";
import { simulationRouter } from "./routes/simulation.js";
import { syncRouter } from "./routes/sync.js";
import { matchRepository } from "./repositories/matchRepository.js";
import { attachLiveSocket, startLiveSimulator } from "./services/liveSimulator.js";
import { predictionService } from "./services/predictionService.js";
import { asyncHandler } from "./utils/asyncHandler.js";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: false
  })
);

app.get(
  "/health",
  asyncHandler(async (_req, res) => {
    if (!config.demoMode) {
      await query("SELECT 1");
    }
    const redis = await getRedis();

    res.json({
      status: "ok",
      mode: config.demoMode ? "demo" : "database",
      postgres: config.demoMode ? "demo" : "ok",
      redis: config.demoMode ? "demo" : redis?.isOpen ? "ok" : "degraded",
      aiServiceUrl: config.aiServiceUrl,
      features: {
        apiFeatureVersion: "2026-07-07-beijing-day-real-bracket-v3",
        lineupValidationDiagnostics: true,
        lineupValidationRefresh: true,
        officialTruthLayer: true,
        exactScorePoissonFifaPrior: true,
        scoreProbabilityMatrix: true
      }
    });
  })
);

app.use("/api/matches", matchesRouter);
app.use("/matches", matchesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/odds", oddsRouter);
app.use("/odds", oddsRouter);
app.use("/api/official", officialRouter);
app.use("/official", officialRouter);
app.use("/api/simulation", simulationRouter);
app.use("/simulate", simulationRouter);
app.use("/api/sync", syncRouter);
app.use("/sync", syncRouter);
app.get(
  "/live",
  asyncHandler(async (_req, res) => {
    const matches = await matchRepository.findMatches({ status: ["live", "halftime"] });
    const data = await predictionService.enrichMatches(matches);
    res.json({ data, refreshSeconds: 30 });
  })
);
app.use(errorHandler);

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/live" });
attachLiveSocket(wss);
const stopLiveSimulator = startLiveSimulator(wss);

server.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", message: "API server listening", port: config.port }));
});

async function shutdown(): Promise<void> {
  stopLiveSimulator();
  wss.close();
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

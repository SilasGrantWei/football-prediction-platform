import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { Router } from "express";

import { config } from "../config.js";
import { syncTournamentScoresOnce } from "../services/liveSimulator.js";
import { predictionService } from "../services/predictionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(currentDir, "../../../../backend");
const schedulerPath = resolve(backendDir, "scheduler.py");

export const syncRouter = Router();

syncRouter.post(
  "/manual",
  asyncHandler(async (req, res) => {
    const job = parseJob(req.query.job);

    if (config.demoMode) {
      const result = await syncTournamentScoresOnce({ forcePredictionRefresh: true });
      const predictionRefresh = result.predictionRefresh;
      res.json({ data: { mode: "demo", job: "tournament", result, predictionRefresh } });
      return;
    }

    const pythonBin = process.env.PYTHON ?? "python";
    const { stdout, stderr } = await execFileAsync(pythonBin, [schedulerPath, "--run-once", job], {
      cwd: backendDir,
      env: process.env,
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 5
    });

    const predictionRefresh = await predictionService.refreshUpcomingPredictions();

    res.json({
      data: {
        mode: "database",
        job,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        predictionRefresh
      }
    });
  })
);

syncRouter.post(
  "/recalculate-upcoming",
  asyncHandler(async (_req, res) => {
    const predictionRefresh = await predictionService.refreshUpcomingPredictions();
    res.json({ data: predictionRefresh });
  })
);

function parseJob(value: unknown): "all" | "fixtures" | "live" | "odds" | "results" | "train" {
  if (value === undefined) return "all";
  if (
    value === "all" ||
    value === "fixtures" ||
    value === "live" ||
    value === "odds" ||
    value === "results" ||
    value === "train"
  ) {
    return value;
  }
  return "all";
}

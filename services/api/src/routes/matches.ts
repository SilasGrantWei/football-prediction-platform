import { Router } from "express";

import { ApiError } from "../middleware/errorHandler.js";
import type { LineupValidationProviderAttempt, Match, MatchEvent, MatchStatus } from "../models.js";
import { matchRepository } from "../repositories/matchRepository.js";
import {
  describeExternalMatchDetailSources,
  fetchExternalMatchDetail,
  fetchExternalMatchDetailWithDiagnostics
} from "../services/externalMatchDetailProvider.js";
import type { ExternalDetailFixture } from "../services/espnMatchDetailProvider.js";
import { buildMatchLineupProjection } from "../services/lineupProjectionService.js";
import { buildLineupValidation } from "../services/lineupValidationService.js";
import { isFutureScheduledPredictionTarget, predictionService } from "../services/predictionService.js";
import { buildTeamRecordComparison, buildTeamRecordMatchDetail } from "../services/teamRecordService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const matchesRouter = Router();

matchesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = parseStatus(req.query.status);
    const competition = typeof req.query.competition === "string" ? req.query.competition : undefined;
    const period = parsePeriod(req.query.period);
    const matches = await matchRepository.findMatches({ status, competition, period });
    const data = await predictionService.enrichMatches(matches);

    res.json({ data });
  })
);

matchesRouter.get(
  "/live",
  asyncHandler(async (_req, res) => {
    const matches = await matchRepository.findMatches({ status: ["live", "halftime"] });
    const data = await predictionService.enrichMatches(matches);
    res.json({ data, refreshSeconds: 30 });
  })
);

matchesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const prediction = await predictionService.getPrediction(match);
    res.json({ data: { ...match, prediction } });
  })
);

matchesRouter.get(
  "/:id/events",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const storedEvents = await matchRepository.findEvents(req.params.id);
    const externalDetail =
      match.status === "scheduled" && new Date(match.startTime).getTime() - Date.now() > 2 * 60 * 60 * 1000
        ? null
        : await withTimeout(fetchExternalMatchDetail(buildExternalFixture(match)), 4_000);
    const events = mergeMatchEvents(storedEvents, externalDetail?.events ?? []);
    res.json({ data: events });
  })
);

matchesRouter.get(
  "/:id/team-records",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const data = await buildTeamRecordComparison(match);
    res.json({ data });
  })
);

matchesRouter.get(
  "/:id/team-records/:recordMatchId",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const data = await buildTeamRecordMatchDetail(match, req.params.recordMatchId);
    if (!data) throw new ApiError(404, "Team record match not found", "team_record_match_not_found");

    res.json({ data });
  })
);

matchesRouter.get(
  "/:id/trend",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const data = await matchRepository.buildTrend(req.params.id);
    res.json({ data });
  })
);

matchesRouter.get(
  "/:id/prediction",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const prediction = await predictionService.getPrediction(match);
    res.json({ data: prediction ?? null });
  })
);

matchesRouter.get(
  "/:id/projected-lineup",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    res.json({ data: buildMatchLineupProjection(match) });
  })
);

matchesRouter.get(
  "/:id/lineup-validation",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const data = await buildLineupValidationResponse(match, false);
    res.json({ data });
  })
);

matchesRouter.post(
  "/:id/lineup-validation/refresh",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");

    const data = await buildLineupValidationResponse(match, true);
    res.json({ data });
  })
);

matchesRouter.post(
  "/:id/recalculate",
  asyncHandler(async (req, res) => {
    const match = await matchRepository.findById(req.params.id);
    if (!match) throw new ApiError(404, "Match not found", "match_not_found");
    if (match.status === "finished") {
      throw new ApiError(
        409,
        "Finished matches keep their pre-match prediction snapshot and cannot be recalculated.",
        "finished_prediction_locked"
      );
    }
    if (!isFutureScheduledPredictionTarget(match)) {
      throw new ApiError(
        409,
        "Only future scheduled matches can be recalculated. Live and stale scheduled matches keep their pre-match snapshot.",
        "prediction_recalculation_not_allowed"
      );
    }

    const prediction = await predictionService.getPrediction(match, true);
    res.json({ data: prediction ?? null });
  })
);

async function buildLineupValidationResponse(match: Match, forceRefresh: boolean) {
  const projection = buildMatchLineupProjection(match);
  const skipForPreMatchWindow =
    !forceRefresh && match.status === "scheduled" && new Date(match.startTime).getTime() - Date.now() > 2 * 60 * 60 * 1000;
  const skippedAttempts: LineupValidationProviderAttempt[] = [
    {
      provider: "pre_match_window",
      label: "赛前验证窗口",
      status: "skipped",
      reason: "开赛前超过 2 小时，默认不频繁请求真实首发；点击重新验证可强制尝试公开和授权数据源。",
      verifiedAt: new Date().toISOString()
    }
  ];

  const diagnostics = skipForPreMatchWindow
    ? { detail: null, attempts: skippedAttempts }
    : await withTimeout(fetchExternalMatchDetailWithDiagnostics(buildExternalFixture(match)), 6_000);
  const attempts = diagnostics?.attempts.length
    ? diagnostics.attempts
    : [
        {
          provider: "timeout",
          label: "真实首发验证接口",
          status: "error" as const,
          reason: "请求超过 6 秒仍未返回，已中止本次验证。",
          verifiedAt: new Date().toISOString()
        }
      ];
  const externalDetail = diagnostics?.detail ?? null;
  const sourceLabel = externalDetail
    ? externalDetail.sourceLabel
    : attempts.length
      ? summarizeAttempts(attempts)
      : describeExternalMatchDetailSources();

  return buildLineupValidation(
    match,
    projection,
    externalDetail?.lineups ?? null,
    externalDetail
      ? {
          label: sourceLabel,
          url: externalDetail.sourceUrl,
          verifiedAt: externalDetail.verifiedAt,
          providerAttempts: attempts
        }
      : {
          label: sourceLabel,
          verifiedAt: new Date().toISOString(),
          providerAttempts: attempts
        }
  );
}

function buildExternalFixture(match: Match): ExternalDetailFixture {
  return {
    id: match.id,
    startTime: match.startTime,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    externalLeague: "fifa.world"
  };
}

function summarizeAttempts(attempts: LineupValidationProviderAttempt[]): string {
  return attempts.map((attempt) => `${attempt.label}：${attempt.reason}`).join("；");
}

function parseStatus(value: unknown): MatchStatus | undefined {
  if (value === undefined) return undefined;
  if (value === "scheduled" || value === "live" || value === "halftime" || value === "finished") return value;
  throw new ApiError(400, "status must be scheduled, live, halftime, or finished", "invalid_status");
}

function parsePeriod(value: unknown): "today" | "tomorrow" | undefined {
  if (value === undefined) return undefined;
  if (value === "today" || value === "tomorrow") return value;
  throw new ApiError(400, "period must be today or tomorrow", "invalid_period");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function mergeMatchEvents(storedEvents: MatchEvent[], externalEvents: MatchEvent[]): MatchEvent[] {
  const byKey = new Map<string, MatchEvent>();
  for (const event of [...storedEvents, ...externalEvents]) {
    byKey.set(`${event.minute}:${event.type}:${event.team}:${event.player}`, event);
  }
  return Array.from(byKey.values()).sort((a, b) => a.minute - b.minute || a.id - b.id);
}

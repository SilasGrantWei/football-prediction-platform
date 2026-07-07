import { z } from "zod";

import { config } from "../config.js";
import type {
  GameStyle,
  Match,
  PreMatchContext,
  PostMatchCalibration,
  Prediction,
  Team,
  TeamRecordComparison,
  TeamRecordSummary,
  UpsetRisk
} from "../models.js";
import { cacheGet, cacheSet } from "../redis.js";
import { matchRepository } from "../repositories/matchRepository.js";
import { buildLineupImpactSignal, buildMatchLineupProjection } from "./lineupProjectionService.js";
import { buildPredictionEvaluation, buildPredictionLiveReview } from "./predictionEvaluation.js";
import { buildPredictionExplanation } from "./predictionExplanation.js";
import {
  buildExternalFixtureFromMatch,
  fetchExternalMatchDetail,
  mergeExternalMatchEvents
} from "./externalMatchDetailProvider.js";
import { buildExactScoreDistribution, poissonOutcomeProbabilities } from "./exactScorePoisson.js";
import { buildPreMatchContextSignal } from "./preMatchContextService.js";
import { buildPostMatchCalibration } from "./postMatchCalibrationService.js";
import { buildTeamRecordComparison } from "./teamRecordService.js";
import { attachWorldCupScoreEnhancement } from "./worldCupScoreEnhancer.js";
import { buildWorldCupFactors, type TeamTournamentFactors, type WorldCupFactors } from "./worldCupFactors.js";

export const LOCAL_MODEL_VERSION = "poisson-elo-fifa-prior-distribution-v2";
const AI_MODEL_VERSION = "worldcup-90min-lightgbm-elo-poisson-causal-v8";
const DEFAULT_DIXON_COLES_RHO = -0.1;

export const PREDICTION_MODEL_INFO = {
  name: "世界杯九十分钟因果融合模型",
  version: "第十七版",
  type: "赛前大数据推算、等级分模型、泊松比分矩阵、世界杯历史画像后处理和世界杯上下文规则校准",
  description:
    "只推算90分钟比赛结果（包含裁判加计的伤停补时），不计入加时赛与点球大战。第十六版禁止使用实时比分、分钟和本场赛果作为比分输入：小组赛按赛前因果快照处理，淘汰赛才使用已经发生的小组赛表现；同时把开赛前已结束的本年世界杯赛果、公开赛事数据源已完赛国际友谊赛、赛前气候/温度、休息旅行、赛程阶段压力、非官方推算首发和赛后错题本校准作为赛前可用特征。新版本把平局保护被打穿、强队零封假设被打破、大比分幅度高估/低估拆成独立误差信号，只影响后续未开赛比赛，不回写已结束预测。",
  dimensions: [
    "等级分和国际足联评分综合实力",
    "本届小组赛积分与净胜球",
    "最近状态与攻防均值",
    "预期进球和预期失球与射门质量",
    "主客场/东道主环境",
    "休息天数与旅行疲劳",
    "淘汰赛90分钟压力与平局倾向",
    "关键球员/伤停/阵容可用性",
    "转换速度与定位球威胁",
    "波动性与爆冷弹性",
    "赛前因果快照与防未来函数校验",
    "方向校准比分矩阵",
    "同年赛前战绩和公开赛事友谊赛因果校准",
    "赛前气候/温度/湿度/风速基线",
    "休息差、旅行消耗和主办地环境",
    "推算首发/球星影响因子（非官方阵容，低权重校准）",
    "赛后误差错题本校准（只影响后续未开赛比赛）",
    "平局陷阱、零封假设和大比分幅度误差的因果校准",
    "世界杯历史90分钟比分画像后处理"
  ]
};

const aiPredictionSchema = z.object({
  match_id: z.string().optional(),
  win_prob: z.number().optional(),
  home_win_prob: z.number().optional(),
  draw_prob: z.number(),
  lose_prob: z.number().optional(),
  away_win_prob: z.number().optional(),
  top_scores: z
    .array(
      z.object({
        score: z.string(),
        probability: z.number()
      })
    )
    .min(3),
  game_style: z.enum(["defensive", "balanced", "open"]),
  upset_risk: z.enum(["low", "medium", "high"]),
  expected_home_goals: z.number(),
  expected_away_goals: z.number(),
  generated_at: z.string().optional(),
  model_version: z.string().optional()
});

interface ScoreProbability {
  score: string;
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

interface OutcomeProbability {
  home: number;
  draw: number;
  away: number;
}

interface TeamRecordSignal {
  homeStrengthDelta: number;
  awayStrengthDelta: number;
  homeGoalFactor: number;
  awayGoalFactor: number;
  drawLift: number;
  favoriteConfidenceBoost: number;
  sampleWeight: number;
  formDelta: number;
}

interface PredictionOptions {
  force?: boolean;
  detail?: boolean;
}

export interface UpcomingPredictionRefreshResult {
  generatedAt: string;
  considered: number;
  recalculated: number;
  failed: number;
  skipped: {
    alreadyStarted: number;
    finishedLocked: number;
    invalidKickoff: number;
  };
  matches: Array<{
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    kickoffTime: string;
    predictedScore: string;
    predictedScoreProbability: number;
    modelVersion?: string;
    calibrationSignature?: string;
  }>;
  failures: Array<{
    matchId: string;
    reason: string;
  }>;
}

export class PredictionService {
  async enrichMatches(matches: Match[], options: PredictionOptions = {}): Promise<Match[]> {
    return Promise.all(
      matches.map(async (match) => ({
        ...match,
        prediction: await this.getPrediction(match, { detail: false, ...options })
      }))
    );
  }

  async getPrediction(match: Match, forceOrOptions: boolean | PredictionOptions = {}): Promise<Prediction | undefined> {
    const options: PredictionOptions =
      typeof forceOrOptions === "boolean" ? { force: forceOrOptions, detail: true } : { detail: true, ...forceOrOptions };
    const force = options.force ?? false;
    const detail = options.detail ?? true;
    const cacheKey = `prediction:${match.id}`;

    if (match.status === "finished" && !detail) {
      const frozenPrediction = isCausalPredictionSnapshot(match, match.prediction) ? match.prediction : undefined;
      const prediction = frozenPrediction ?? (config.demoMode ? reconstructDemoPreMatchPrediction(match) : undefined);
      return prediction ? withFinishedListContext(match, prediction) : undefined;
    }

    const factors = buildWorldCupFactors(match);
    const postMatchCalibration =
      match.status === "finished"
        ? undefined
        : await buildPostMatchCalibration(match, config.demoMode ? reconstructDemoPreMatchPrediction : undefined).catch(
            () => undefined
          );
    let recordComparison: TeamRecordComparison | undefined;
    const attachContext = async (prediction: Prediction): Promise<Prediction> => {
      if (!detail) return withListContext(match, prediction);
      recordComparison = recordComparison ?? (await buildTeamRecordComparison(match).catch(() => undefined));
      return withExplanation(match, prediction, factors, recordComparison);
    };

    if (match.status === "finished") {
      const frozenPrediction = isCausalPredictionSnapshot(match, match.prediction) ? match.prediction : undefined;
      const prediction = frozenPrediction ?? (config.demoMode ? reconstructDemoPreMatchPrediction(match) : undefined);
      return prediction ? attachContext(prediction) : undefined;
    }

    if (!force) {
      const cached = await cacheGet<Prediction>(cacheKey);
      if (
        (cached?.modelVersion === LOCAL_MODEL_VERSION || cached?.modelVersion === AI_MODEL_VERSION) &&
        hasCurrentCalibrationSignature(cached, postMatchCalibration)
      ) {
        return attachContext(cached);
      }

      if (
        (match.prediction?.modelVersion === LOCAL_MODEL_VERSION || match.prediction?.modelVersion === AI_MODEL_VERSION) &&
        hasCurrentCalibrationSignature(match.prediction, postMatchCalibration)
      ) {
        return attachContext(match.prediction);
      }
    }

    if (!detail) {
      recordComparison = await buildTeamRecordComparison(match).catch(() => undefined);
      const prediction = await attachContext(calculateLocalPrediction(match, recordComparison, postMatchCalibration));
      await persistPreMatchPredictionSnapshot(match, prediction, cacheKey);
      return prediction;
    }

    recordComparison = await buildTeamRecordComparison(match).catch(() => undefined);
    const prediction = await this.requestAiPrediction(match, factors, recordComparison).catch((error) => {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "智能推算服务不可用，使用本地兜底模型",
          matchId: match.id,
          error: String(error)
        })
      );
      return calculateLocalPrediction(match, recordComparison, postMatchCalibration);
    });

    const explainedPrediction = await attachContext(prediction);
    await persistPreMatchPredictionSnapshot(match, explainedPrediction, cacheKey);
    return explainedPrediction;
  }

  async refreshUpcomingPredictions(now = new Date()): Promise<UpcomingPredictionRefreshResult> {
    const matches = await matchRepository.findMatches();
    const result: UpcomingPredictionRefreshResult = {
      generatedAt: now.toISOString(),
      considered: matches.length,
      recalculated: 0,
      failed: 0,
      skipped: {
        alreadyStarted: 0,
        finishedLocked: 0,
        invalidKickoff: 0
      },
      matches: [],
      failures: []
    };

    for (const match of matches) {
      const eligibility = predictionRefreshEligibility(match, now);
      if (!eligibility.allowed) {
        result.skipped[eligibility.reason] += 1;
        continue;
      }

      try {
        const prediction = await this.getPrediction(match, { force: true, detail: false });
        if (!prediction?.topScores[0]) {
          result.failed += 1;
          result.failures.push({ matchId: match.id, reason: "prediction_unavailable" });
          continue;
        }

        result.recalculated += 1;
        result.matches.push({
          matchId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          kickoffTime: match.startTime,
          predictedScore: prediction.topScores[0].score,
          predictedScoreProbability: prediction.topScores[0].probability,
          modelVersion: prediction.modelVersion,
          calibrationSignature: prediction.postMatchCalibration?.sampleSignature
        });
      } catch (error) {
        result.failed += 1;
        result.failures.push({ matchId: match.id, reason: String(error) });
      }
    }

    return result;
  }

  private async requestAiPrediction(
    match: Match,
    factors: WorldCupFactors,
    recordComparison?: TeamRecordComparison
  ): Promise<Prediction> {
    const response = await fetch(`${config.aiServiceUrl}/predict_match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(matchPayload(match, factors, recordComparison)),
      signal: AbortSignal.timeout(2_500)
    });

    if (!response.ok) {
      throw new Error(`智能推算服务返回异常状态 ${response.status}`);
    }

    const parsed = aiPredictionSchema.parse(await response.json());
    const homeWinProb = parsed.home_win_prob ?? parsed.win_prob;
    const awayWinProb = parsed.away_win_prob ?? parsed.lose_prob;
    if (homeWinProb === undefined || awayWinProb === undefined) {
      throw new Error("智能推算服务响应缺少主队或客队概率");
    }

    const [normalizedHome, normalizedDraw, normalizedAway] = normalize([homeWinProb, parsed.draw_prob, awayWinProb]);
    const poissonOutcome = poissonOutcomeProbabilities(parsed.expected_home_goals, parsed.expected_away_goals);
    const exactScore = buildExactScoreDistribution({
      homeLambda: parsed.expected_home_goals,
      awayLambda: parsed.expected_away_goals,
      homeElo: fifaToElo(match.homeTeam.fifaRating),
      awayElo: fifaToElo(match.awayTeam.fifaRating),
      stage: match.competition,
      calibratedOutcome: { home: normalizedHome, draw: normalizedDraw, away: normalizedAway },
      poissonOutcome
    });

    return {
      matchId: parsed.match_id ?? match.id,
      homeWinProb: round4(exactScore.outcome.home),
      drawProb: round4(exactScore.outcome.draw),
      awayWinProb: round4(exactScore.outcome.away),
      topScores: exactScore.top3Scores,
      scoreProbabilityMatrix: exactScore.probabilityMatrix,
      gameStyle: classifyStyle(exactScore.expectedGoalsHome + exactScore.expectedGoalsAway) ?? parsed.game_style,
      upsetRisk: parsed.upset_risk,
      expectedHomeGoals: round2(exactScore.expectedGoalsHome),
      expectedAwayGoals: round2(exactScore.expectedGoalsAway),
      generatedAt: parsed.generated_at ?? new Date().toISOString(),
      modelVersion: LOCAL_MODEL_VERSION
    };
  }
}

export function isFutureScheduledPredictionTarget(match: Match, now = new Date()): boolean {
  return predictionRefreshEligibility(match, now).allowed;
}

function predictionRefreshEligibility(
  match: Match,
  now: Date
):
  | { allowed: true }
  | { allowed: false; reason: keyof UpcomingPredictionRefreshResult["skipped"] } {
  if (match.status === "finished") return { allowed: false, reason: "finishedLocked" };
  if (match.status === "live" || match.status === "halftime") return { allowed: false, reason: "alreadyStarted" };

  const kickoffAt = new Date(match.startTime).getTime();
  const nowAt = now.getTime();
  if (!Number.isFinite(kickoffAt) || !Number.isFinite(nowAt)) return { allowed: false, reason: "invalidKickoff" };
  if (kickoffAt <= nowAt) return { allowed: false, reason: "alreadyStarted" };

  return { allowed: true };
}

async function withExplanation(
  match: Match,
  prediction: Prediction,
  factors: WorldCupFactors,
  recordComparison?: TeamRecordComparison
): Promise<Prediction> {
  const lineupProjection = prediction.lineupProjection ?? buildMatchLineupProjection(match);
  const predictionWithLineup = {
    ...prediction,
    lineupProjection,
    preMatchContext: prediction.preMatchContext ?? buildPreMatchContextSignal(match, factors, lineupProjection)
  };
  const enhancedPrediction = attachWorldCupScoreEnhancement(match, predictionWithLineup);
  const evaluation = await buildEvaluationWithEvents(match, enhancedPrediction);

  return {
    ...enhancedPrediction,
    explanation: buildPredictionExplanation(match, enhancedPrediction, factors, recordComparison),
    liveReview: prediction.liveReview ?? buildPredictionLiveReview(match, enhancedPrediction),
    evaluation: evaluation ?? (match.status === "finished" ? undefined : enhancedPrediction.evaluation)
  };
}

async function withListContext(match: Match, prediction: Prediction): Promise<Prediction> {
  const lineupProjection = prediction.lineupProjection ?? buildMatchLineupProjection(match);
  const factors = buildWorldCupFactors(match);
  const predictionWithLineup = {
    ...prediction,
    lineupProjection,
    preMatchContext: prediction.preMatchContext ?? buildPreMatchContextSignal(match, factors, lineupProjection)
  };
  const enhancedPrediction = attachWorldCupScoreEnhancement(match, predictionWithLineup);
  const evaluation = buildPredictionEvaluation(match, enhancedPrediction);

  return {
    ...enhancedPrediction,
    liveReview: prediction.liveReview ?? buildPredictionLiveReview(match, enhancedPrediction),
    evaluation: evaluation ?? (match.status === "finished" ? undefined : enhancedPrediction.evaluation)
  };
}

function withFinishedListContext(match: Match, prediction: Prediction): Prediction {
  const evaluation = buildPredictionEvaluation(match, prediction);

  return {
    ...prediction,
    liveReview: prediction.liveReview ?? buildPredictionLiveReview(match, prediction),
    evaluation: evaluation ?? prediction.evaluation
  };
}

async function buildEvaluationWithEvents(match: Match, prediction: Prediction): Promise<Prediction["evaluation"]> {
  if (match.status !== "finished") {
    return buildPredictionEvaluation(match, prediction);
  }

  const storedEvents = await matchRepository.findEvents(match.id).catch(() => []);
  const externalDetail = await withEvaluationTimeout(fetchExternalMatchDetail(buildExternalFixtureFromMatch(match)), 4_000);
  const events = mergeExternalMatchEvents(storedEvents, externalDetail?.events ?? []);

  return buildPredictionEvaluation(match, prediction, events, {
    stats: externalDetail?.stats ?? null,
    sourceLabel: externalDetail?.sourceLabel,
    sourceUrl: externalDetail?.sourceUrl
  });
}

async function withEvaluationTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
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

function isCausalPredictionSnapshot(match: Match, prediction: Prediction | undefined | null): prediction is Prediction {
  if (!prediction) return false;
  const generatedAt = new Date(prediction.generatedAt).getTime();
  const kickoffAt = new Date(match.startTime).getTime();
  return Number.isFinite(generatedAt) && Number.isFinite(kickoffAt) && generatedAt <= kickoffAt;
}

function hasCurrentCalibrationSignature(
  prediction: Prediction | undefined,
  calibration: PostMatchCalibration | undefined
): boolean {
  if (!prediction) return false;
  if (prediction.modelVersion === LOCAL_MODEL_VERSION && (prediction.scoreProbabilityMatrix?.length ?? 0) < 36) return false;
  if (!calibration) return !prediction.postMatchCalibration;
  return prediction.postMatchCalibration?.sampleSignature === calibration.sampleSignature;
}

async function persistPreMatchPredictionSnapshot(match: Match, prediction: Prediction, cacheKey: string): Promise<void> {
  const generatedAt = new Date(prediction.generatedAt).getTime();
  const kickoffAt = new Date(match.startTime).getTime();
  if (match.status !== "scheduled" || !Number.isFinite(generatedAt) || !Number.isFinite(kickoffAt) || generatedAt > kickoffAt) {
    return;
  }

  await matchRepository.upsertPrediction(prediction);
  await cacheSet(cacheKey, prediction, 60);
}

function reconstructDemoPreMatchPrediction(match: Match): Prediction | undefined {
  const generatedAt = preKickoffTimestamp(match.startTime);
  if (!generatedAt) return undefined;

  const preMatch: Match = {
    ...match,
    homeScore: 0,
    awayScore: 0,
    status: "scheduled",
    minute: 0,
    prediction: undefined
  };

  return {
    ...calculateLocalPrediction(preMatch),
    generatedAt
  };
}

function preKickoffTimestamp(startTime: string): string | undefined {
  const kickoffAt = new Date(startTime).getTime();
  if (!Number.isFinite(kickoffAt)) return undefined;
  return new Date(kickoffAt - 2 * 60 * 60 * 1000).toISOString();
}

function matchPayload(match: Match, factors: WorldCupFactors, recordComparison?: TeamRecordComparison) {
  const lineupProjection = buildMatchLineupProjection(match);
  const preMatchContext = buildPreMatchContextSignal(match, factors, lineupProjection);
  const homeAttack = match.homeTeam.attackAvg * factors.home.goalMultiplier;
  const awayAttack = match.awayTeam.attackAvg * factors.away.goalMultiplier;
  const homePossession = possessionEstimate(match.homeTeam, match.awayTeam, factors.home, factors.away);
  const awayPossession = 100 - homePossession;

  return {
    match_id: match.id,
    input_mode: "pre_match_only",
    observed_score_available: false,
    home_team: match.homeTeam.name,
    away_team: match.awayTeam.name,
    home_goals: 0,
    away_goals: 0,
    home_xg: round2(homeAttack),
    away_xg: round2(awayAttack),
    home_xga: round2(match.homeTeam.xga * factors.home.defensiveMultiplier),
    away_xga: round2(match.awayTeam.xga * factors.away.defensiveMultiplier),
    shots_home: shotEstimate(match.homeTeam, factors.home),
    shots_away: shotEstimate(match.awayTeam, factors.away),
    possession_home: homePossession,
    possession_away: awayPossession,
    yellow_cards_home: 0,
    yellow_cards_away: 0,
    red_cards_home: 0,
    red_cards_away: 0,
    rest_days_home: factors.home.restDays,
    rest_days_away: factors.away.restDays,
    home_fifa_rating: match.homeTeam.fifaRating,
    away_fifa_rating: match.awayTeam.fifaRating,
    home_elo: fifaToElo(match.homeTeam.fifaRating),
    away_elo: fifaToElo(match.awayTeam.fifaRating),
    recent5_form_home: factors.home.formScore,
    recent5_form_away: factors.away.formScore,
    home_advantage: clamp(1 + factors.home.hostAdvantage - factors.away.hostAdvantage, 0.85, 1.18),
    group_points_home: factors.home.groupPoints,
    group_points_away: factors.away.groupPoints,
    group_goal_diff_home: factors.home.groupGoalDiff,
    group_goal_diff_away: factors.away.groupGoalDiff,
    travel_fatigue_home: factors.home.travelFatigue,
    travel_fatigue_away: factors.away.travelFatigue,
    knockout_pressure_home: factors.home.knockoutPressure,
    knockout_pressure_away: factors.away.knockoutPressure,
    squad_availability_home: factors.home.squadAvailability,
    squad_availability_away: factors.away.squadAvailability,
    tactical_transition_home: factors.home.tacticalTransition,
    tactical_transition_away: factors.away.tacticalTransition,
    set_piece_home: factors.home.setPiece,
    set_piece_away: factors.away.setPiece,
    volatility_home: factors.home.volatility,
    volatility_away: factors.away.volatility,
    team_record_home_played: recordComparison?.home.played ?? 0,
    team_record_away_played: recordComparison?.away.played ?? 0,
    team_record_home_win_rate: recordComparison?.home.winRate ?? 0,
    team_record_away_win_rate: recordComparison?.away.winRate ?? 0,
    team_record_home_goal_diff: recordComparison?.home.goalDifference ?? 0,
    team_record_away_goal_diff: recordComparison?.away.goalDifference ?? 0,
    team_record_h2h_played: recordComparison?.headToHead.played ?? 0,
    climate_temperature_c: preMatchContext.weather.temperatureC,
    climate_humidity: preMatchContext.weather.humidity,
    climate_wind_kph: preMatchContext.weather.windKph,
    climate_confidence: preMatchContext.weather.confidence,
    tempo_multiplier: preMatchContext.tempoMultiplier,
    draw_modifier: preMatchContext.drawModifier,
    volatility_modifier: preMatchContext.volatilityModifier,
    pre_match_context_home_strength_delta: preMatchContext.home.strengthDelta,
    pre_match_context_away_strength_delta: preMatchContext.away.strengthDelta,
    pre_match_context_home_goal_multiplier: preMatchContext.home.goalMultiplier,
    pre_match_context_away_goal_multiplier: preMatchContext.away.goalMultiplier,
    pre_match_context_home_concede_multiplier: preMatchContext.home.concedeMultiplier,
    pre_match_context_away_concede_multiplier: preMatchContext.away.concedeMultiplier
  };
}

function shotEstimate(team: Team, factors: TeamTournamentFactors): number {
  return Math.max(
    6,
    Math.round(team.attackAvg * factors.goalMultiplier * 8 + factors.tacticalTransition * 2 + factors.setPiece * 1.5)
  );
}

function possessionEstimate(
  team: Team,
  opponent: Team,
  teamFactors: TeamTournamentFactors,
  opponentFactors: TeamTournamentFactors
): number {
  const raw =
    50 +
    (team.fifaRating - opponent.fifaRating) * 0.42 +
    (teamFactors.formScore - opponentFactors.formScore) * 8 +
    (teamFactors.hostAdvantage - opponentFactors.hostAdvantage) * 4 -
    (teamFactors.travelFatigue - opponentFactors.travelFatigue) * 3;
  return Math.round(clamp(raw, 35, 65));
}

function fifaToElo(rating: number): number {
  return 1350 + rating * 6.3;
}

export function calculateLocalPrediction(
  match: Match,
  recordComparison?: TeamRecordComparison,
  postMatchCalibration?: PostMatchCalibration
): Prediction {
  const factors = buildWorldCupFactors(match);
  const recordSignal = buildTeamRecordSignal(recordComparison);
  const lineupProjection = buildMatchLineupProjection(match);
  const lineupSignal = buildLineupImpactSignal(lineupProjection);
  const preMatchContext = buildPreMatchContextSignal(match, factors, lineupProjection);
  const homeStrength =
    adjustedTeamStrength(match.homeTeam, factors.home) +
    recordSignal.homeStrengthDelta +
    lineupSignal.homeStrengthDelta +
    preMatchContext.home.strengthDelta;
  const awayStrength =
    adjustedTeamStrength(match.awayTeam, factors.away) +
    recordSignal.awayStrengthDelta +
    lineupSignal.awayStrengthDelta +
    preMatchContext.away.strengthDelta;
  const baseHomeExpectedGoals = clamp(
    expectedGoals(match.homeTeam, match.awayTeam, homeStrength, awayStrength, factors.home, factors.away, factors) *
      recordSignal.homeGoalFactor *
      lineupSignal.homeGoalFactor *
      preMatchContext.home.goalMultiplier *
      preMatchContext.away.concedeMultiplier *
      preMatchContext.tempoMultiplier,
    0.18,
    5.4
  );
  const baseAwayExpectedGoals = clamp(
    expectedGoals(match.awayTeam, match.homeTeam, awayStrength, homeStrength, factors.away, factors.home, factors) *
      recordSignal.awayGoalFactor *
      lineupSignal.awayGoalFactor *
      preMatchContext.away.goalMultiplier *
      preMatchContext.home.concedeMultiplier *
      preMatchContext.tempoMultiplier,
    0.18,
    5.4
  );
  const [homeExpectedGoals, awayExpectedGoals] = calibrateExpectedGoalsByPostMatchErrors(
    match,
    baseHomeExpectedGoals,
    baseAwayExpectedGoals,
    homeStrength,
    awayStrength,
    postMatchCalibration
  );
  const poissonOutcome = poissonOutcomeProbabilities(homeExpectedGoals, awayExpectedGoals);
  const priorOutcome = strengthOutcomePrior(homeStrength, awayStrength, factors);
  const rawOutcome = normalize([
    poissonOutcome.home * 0.74 + priorOutcome.home * 0.26,
    poissonOutcome.draw * 0.78 + priorOutcome.draw * 0.22,
    poissonOutcome.away * 0.74 + priorOutcome.away * 0.26
  ]);
  const calibratedOutcome = calibrateOutcomeForTournament(
    { home: rawOutcome[0], draw: rawOutcome[1], away: rawOutcome[2] },
    factors,
    recordSignal,
    postMatchCalibration
  );
  const contextualOutcome = calibrateOutcomeForPreMatchContext(calibratedOutcome, preMatchContext);
  const exactScore = buildExactScoreDistribution({
    homeLambda: homeExpectedGoals,
    awayLambda: awayExpectedGoals,
    homeElo: fifaToElo(match.homeTeam.fifaRating),
    awayElo: fifaToElo(match.awayTeam.fifaRating),
    stage: match.competition,
    isHome: factors.home.hostAdvantage > 0,
    calibratedOutcome: contextualOutcome,
    poissonOutcome,
    scoreAdjuster: (score) => postMatchScoreCalibrationMultiplier(score, contextualOutcome, postMatchCalibration)
  });
  const { home: homeWinProb, draw: drawProb, away: awayWinProb } = exactScore.outcome;
  const upsetRisk = classifyUpsetRisk(match, homeStrength, awayStrength, homeWinProb, awayWinProb, factors);

  return {
    matchId: match.id,
    homeWinProb: round4(homeWinProb),
    drawProb: round4(drawProb),
    awayWinProb: round4(awayWinProb),
    topScores: exactScore.top3Scores,
    scoreProbabilityMatrix: exactScore.probabilityMatrix,
    gameStyle: classifyStyle(exactScore.expectedGoalsHome + exactScore.expectedGoalsAway),
    upsetRisk,
    expectedHomeGoals: round2(exactScore.expectedGoalsHome),
    expectedAwayGoals: round2(exactScore.expectedGoalsAway),
    generatedAt: new Date().toISOString(),
    modelVersion: LOCAL_MODEL_VERSION,
    lineupProjection,
    preMatchContext,
    postMatchCalibration
  };
}

export function teamStrength(team: Team): number {
  return team.fifaRating * 0.36 + team.recentForm * 0.24 + team.defenseAvg * 0.16 + team.attackAvg * 8.5 + (2.1 - team.xga) * 5.5;
}

function adjustedTeamStrength(team: Team, factors: TeamTournamentFactors): number {
  return (
    teamStrength(team) +
    factors.strengthAdjustment +
    factors.tacticalTransition * 1.1 +
    factors.setPiece * 0.7 -
    factors.volatility * 1.2
  );
}

function buildTeamRecordSignal(recordComparison?: TeamRecordComparison): TeamRecordSignal {
  if (!recordComparison || recordComparison.home.played < 2 || recordComparison.away.played < 2) {
    return neutralTeamRecordSignal();
  }

  const home = recordComparison.home;
  const away = recordComparison.away;
  const sampleWeight = clamp(Math.min(home.played, away.played) / 5, 0.35, 1);
  const formDelta = (pointsRate(home) - pointsRate(away)) * sampleWeight;
  const goalDiffDelta = clamp((perGame(home.goalDifference, home.played) - perGame(away.goalDifference, away.played)) / 4, -0.22, 0.22);
  const attackDelta = clamp((home.avgGoalsFor - away.avgGoalsFor) / 4, -0.16, 0.16);
  const defenseDelta = clamp((away.avgGoalsAgainst - home.avgGoalsAgainst) / 4, -0.16, 0.16);
  const h2hDelta = headToHeadDelta(recordComparison) * sampleWeight;
  const combined = clamp(
    formDelta * 0.42 + goalDiffDelta * 0.24 + attackDelta * 0.16 + defenseDelta * 0.14 + h2hDelta * 0.04,
    -0.24,
    0.24
  );
  const goalTilt = clamp(combined * 0.24 + attackDelta * 0.14 + defenseDelta * 0.10, -0.10, 0.10);
  const recordConsensus = Math.abs(combined) * sampleWeight;
  const goalConsensus = Math.abs(goalDiffDelta) * 0.45 + Math.abs(attackDelta) * 0.30 + Math.abs(defenseDelta) * 0.25;
  const favoriteConfidenceBoost = clamp((recordConsensus * 0.16 + goalConsensus * 0.10) * (sampleWeight >= 0.75 ? 1.18 : 1), 0, 0.05);
  const drawLift = clamp(
    (((drawRate(home) + drawRate(away)) / 2) * 0.038 * sampleWeight + Math.max(0, 0.07 - Math.abs(combined)) * 0.018) *
      (1 - favoriteConfidenceBoost * 2.5),
    0,
    0.03
  );

  return {
    homeStrengthDelta: combined * 10,
    awayStrengthDelta: -combined * 10,
    homeGoalFactor: clamp(1 + goalTilt, 0.90, 1.10),
    awayGoalFactor: clamp(1 - goalTilt, 0.90, 1.10),
    drawLift,
    favoriteConfidenceBoost,
    sampleWeight,
    formDelta
  };
}

function neutralTeamRecordSignal(): TeamRecordSignal {
  return {
    homeStrengthDelta: 0,
    awayStrengthDelta: 0,
    homeGoalFactor: 1,
    awayGoalFactor: 1,
    drawLift: 0,
    favoriteConfidenceBoost: 0,
    sampleWeight: 0,
    formDelta: 0
  };
}

function pointsRate(summary: TeamRecordSummary): number {
  return summary.played ? (summary.wins * 3 + summary.draws) / (summary.played * 3) : 0.5;
}

function drawRate(summary: TeamRecordSummary): number {
  return summary.played ? summary.draws / summary.played : 0;
}

function perGame(value: number, played: number): number {
  return played ? value / played : 0;
}

function headToHeadDelta(recordComparison: TeamRecordComparison): number {
  const h2h = recordComparison.headToHead;
  if (!h2h.played) return 0;
  return clamp((h2h.homeWins - h2h.awayWins) / Math.max(h2h.played, 1), -0.12, 0.12);
}

function expectedGoals(
  attacker: Team,
  defender: Team,
  attackStrength: number,
  defenseStrength: number,
  attackFactors: TeamTournamentFactors,
  defenseFactors: TeamTournamentFactors,
  worldCupFactors: WorldCupFactors
): number {
  const attackIndex =
    1 +
    (attacker.attackAvg - 1.45) * 0.26 +
    (attackFactors.formScore - 0.5) * 0.18 +
    attackFactors.tacticalTransition * 0.06 +
    attackFactors.setPiece * 0.04 +
    (attackFactors.squadAvailability - 0.82) * 0.10;
  const defenseLeak =
    1 +
    (100 - defender.defenseAvg) * 0.01 +
    (defender.xga - 1.1) * 0.30 +
    defenseFactors.volatility * 0.06 -
    defenseFactors.squadAvailability * 0.05;
  const strengthFactor = clamp(1 + (attackStrength - defenseStrength) / 155, 0.78, 1.30);
  const pressureFactor = worldCupFactors.isKnockout ? 1 - attackFactors.knockoutPressure * 0.045 : 1.02;
  const venueFactor = 1 + attackFactors.hostAdvantage * 0.10;
  const stageGoalFactor = worldCupFactors.isKnockout ? 0.95 : 1.02;
  const underdogConversionFactor =
    attackStrength < defenseStrength
      ? 1 - clamp((defenseStrength - attackStrength) / 210, 0, 0.08)
      : 1 + clamp((attackStrength - defenseStrength) / 245, 0, 0.07);
  const defensiveResistance =
    1 -
    clamp(
      Math.max(0, defender.defenseAvg - 74) / 260 +
        Math.max(0, 1.18 - defender.xga) * 0.05 +
        defenseFactors.squadAvailability * 0.025,
      0,
      0.12
    );
  const knockoutConservatism = worldCupFactors.isKnockout
    ? 1 - worldCupFactors.extraTimeRisk * 0.07 - defenseFactors.knockoutPressure * 0.025
    : 1;

  return clamp(
    attacker.attackAvg *
      attackIndex *
      defenseLeak *
      strengthFactor *
      pressureFactor *
      venueFactor *
      stageGoalFactor *
      underdogConversionFactor *
      defensiveResistance *
      knockoutConservatism *
      attackFactors.goalMultiplier *
      defenseFactors.defensiveMultiplier,
    0.18,
    5.4
  );
}

function calibrateExpectedGoalsByPostMatchErrors(
  match: Match,
  homeExpectedGoals: number,
  awayExpectedGoals: number,
  homeStrength: number,
  awayStrength: number,
  calibration?: PostMatchCalibration
): [number, number] {
  if (!calibration || calibration.learnedMatchCount < 1) return [homeExpectedGoals, awayExpectedGoals];

  const favorite = favoriteSideForGoalCalibration(match, homeExpectedGoals, awayExpectedGoals, homeStrength, awayStrength);
  const expectedGap = Math.abs(homeExpectedGoals - awayExpectedGoals);
  const strengthGap = Math.abs(homeStrength - awayStrength);
  const dominance = clamp(expectedGap * 0.55 + strengthGap / 36, 0.25, 1);
  const favoritePenalty = calibration.favoriteOverconfidencePenalty ?? 0;
  const underdogBoost = calibration.underdogResilienceBoost ?? 0;
  const favoriteDrawMiss = calibration.favoriteDrawMissRate ?? 0;
  const marginOverestimate = calibration.favoriteMarginOverestimate ?? 0;
  const favoriteBreakthrough = calibration.drawProtectedFavoriteWinRate ?? 0;
  const marginUnderestimate = calibration.favoriteMarginUnderestimate ?? 0;
  const drawTrapBreakthrough = calibration.drawTrapBreakthroughRate ?? 0;
  const drawTrapMarginUnderestimate = calibration.drawTrapMarginUnderestimate ?? 0;
  const cleanSheetBust = calibration.favoriteCleanSheetBustRate ?? 0;
  const favoriteBreakthroughSignal = favoriteBreakthrough + drawTrapBreakthrough * 0.75;
  const marginUnderestimateSignal = marginUnderestimate + drawTrapMarginUnderestimate * 0.65;
  const effectiveFavoritePenalty = Math.max(0, favoritePenalty - favoriteBreakthroughSignal * 0.08 - marginUnderestimateSignal * 0.02);
  const effectiveUnderdogBoost = Math.max(0, underdogBoost - favoriteBreakthroughSignal * 0.08 - marginUnderestimateSignal * 0.02);
  const breakthroughGoalLift =
    favoriteBreakthroughSignal * clamp(0.05 + dominance * 0.04, 0.05, 0.10) +
    marginUnderestimateSignal * clamp(0.012 + dominance * 0.012, 0.012, 0.035);
  const favoriteLift = Math.max(0, calibration.favoriteGoalLift - effectiveFavoritePenalty * 0.45 + breakthroughGoalLift) * dominance;
  const underdogSuppression = Math.max(0, calibration.underdogGoalSuppression - effectiveUnderdogBoost * 0.50) * dominance;
  const favoriteGoalPenalty =
    effectiveFavoritePenalty * clamp(dominance * 0.55, 0.18, 0.70) +
    favoriteDrawMiss * clamp(0.08 + dominance * 0.04, 0.08, 0.13) +
    marginOverestimate * clamp(0.015 + dominance * 0.01, 0.015, 0.04) +
    cleanSheetBust * clamp(0.05 + dominance * 0.03, 0.04, 0.08);
  const underdogGoalLift = Math.max(
    0,
    effectiveUnderdogBoost * clamp(1.08 - dominance * 0.38, 0.50, 0.95) +
      favoriteDrawMiss * clamp(0.035 + (1 - dominance) * 0.04, 0.03, 0.08) -
      favoriteBreakthroughSignal * clamp(0.02 + dominance * 0.02, 0.02, 0.05) -
      marginUnderestimateSignal * 0.012 +
      cleanSheetBust * clamp(0.10 - dominance * 0.03, 0.05, 0.10)
  );
  const volatilityLift =
    calibration.volatilityLift * clamp(1.05 - dominance * 0.35, 0.28, 0.75) +
    cleanSheetBust * clamp(0.04 + (1 - dominance) * 0.03, 0.025, 0.07);

  let home = homeExpectedGoals;
  let away = awayExpectedGoals;

  if (favorite === "home") {
    home *= clamp(1 + favoriteLift - favoriteGoalPenalty, 0.84, 1.18);
    away *= clamp(1 - underdogSuppression + underdogGoalLift, 0.82, 1.16);
  } else {
    away *= clamp(1 + favoriteLift - favoriteGoalPenalty, 0.84, 1.18);
    home *= clamp(1 - underdogSuppression + underdogGoalLift, 0.82, 1.16);
  }

  if (volatilityLift > 0 && (expectedGap < 0.75 || underdogBoost >= 0.08)) {
    home *= 1 + volatilityLift;
    away *= 1 + volatilityLift;
  }

  return [round2(clamp(home, 0.18, 5.4)), round2(clamp(away, 0.18, 5.4))];
}

function favoriteSideForGoalCalibration(
  match: Match,
  homeExpectedGoals: number,
  awayExpectedGoals: number,
  homeStrength: number,
  awayStrength: number
): "home" | "away" {
  const expectedGoalEdge = homeExpectedGoals - awayExpectedGoals;
  if (Math.abs(expectedGoalEdge) >= 0.18) return expectedGoalEdge >= 0 ? "home" : "away";

  const strengthEdge = homeStrength - awayStrength;
  if (Math.abs(strengthEdge) >= 1.8) return strengthEdge >= 0 ? "home" : "away";

  return teamStrength(match.homeTeam) >= teamStrength(match.awayTeam) ? "home" : "away";
}

function strengthOutcomePrior(homeStrength: number, awayStrength: number, worldCupFactors: WorldCupFactors) {
  const diff = homeStrength - awayStrength;
  const drawBase = worldCupFactors.isKnockout ? 0.22 + worldCupFactors.extraTimeRisk * 0.10 : 0.18;
  const draw = clamp(drawBase - Math.min(Math.abs(diff), 9) * 0.010, 0.10, 0.30);
  const homeShare = clamp(0.5 + diff / 18, 0.16, 0.84);
  const nonDraw = 1 - draw;
  return { home: nonDraw * homeShare, draw, away: nonDraw * (1 - homeShare) };
}

function calibrateOutcomeForTournament(
  outcome: OutcomeProbability,
  worldCupFactors: WorldCupFactors,
  recordSignal: TeamRecordSignal = neutralTeamRecordSignal(),
  postMatchCalibration?: PostMatchCalibration
): OutcomeProbability {
  if (!worldCupFactors.isKnockout && recordSignal.drawLift <= 0 && recordSignal.favoriteConfidenceBoost <= 0) {
    return calibrateOutcomeByPostMatchErrors(outcome, postMatchCalibration);
  }

  const drawLift = worldCupFactors.isKnockout
    ? clamp((worldCupFactors.extraTimeRisk * 0.10 + recordSignal.drawLift) * (1 - recordSignal.favoriteConfidenceBoost * 1.8), 0.01, 0.052)
    : recordSignal.drawLift;
  const favoriteGap = Math.abs(outcome.home - outcome.away);
  const favoriteDampener = favoriteGap > 0.28 ? 0.985 : 1;
  const home = outcome.home * (1 - drawLift) * (outcome.home > outcome.away ? favoriteDampener : 1);
  const away = outcome.away * (1 - drawLift) * (outcome.away > outcome.home ? favoriteDampener : 1);
  const draw = outcome.draw + drawLift * (outcome.home + outcome.away);
  const [normalizedHome, normalizedDraw, normalizedAway] = normalize([home, draw, away]);
  const recordCalibrated = sharpenFavoriteByRecordSignal(
    { home: normalizedHome, draw: normalizedDraw, away: normalizedAway },
    recordSignal.favoriteConfidenceBoost
  );
  return calibrateOutcomeByPostMatchErrors(recordCalibrated, postMatchCalibration);
}

function calibrateOutcomeForPreMatchContext(outcome: OutcomeProbability, context: PreMatchContext): OutcomeProbability {
  const drawLift = context.drawModifier;
  const homeEdge = context.home.strengthDelta - context.away.strengthDelta;
  const edgeTilt = clamp(homeEdge / 70, -0.045, 0.045);
  const volatilityLift = context.volatilityModifier;
  let home = outcome.home * (1 + edgeTilt);
  let away = outcome.away * (1 - edgeTilt);
  let draw = outcome.draw + drawLift * (home + away);

  home *= 1 - drawLift * 0.65;
  away *= 1 - drawLift * 0.65;

  if (volatilityLift > 0) {
    const favorite = home >= away ? "home" : "away";
    const source = favorite === "home" ? home : away;
    const shift = source * volatilityLift * 0.45;

    if (favorite === "home") {
      home -= shift;
      away += shift * 0.48;
    } else {
      away -= shift;
      home += shift * 0.48;
    }

    draw += shift * 0.52;
  }

  const [normalizedHome, normalizedDraw, normalizedAway] = normalize([home, Math.max(0.08, draw), away]);
  return { home: normalizedHome, draw: normalizedDraw, away: normalizedAway };
}

function sharpenFavoriteByRecordSignal(outcome: OutcomeProbability, boost: number): OutcomeProbability {
  if (boost <= 0) return outcome;

  const favorite = outcome.home >= outcome.away ? "home" : "away";
  const home = outcome.home * (favorite === "home" ? 1 + boost : 1 - boost * 0.35);
  const away = outcome.away * (favorite === "away" ? 1 + boost : 1 - boost * 0.35);
  const draw = outcome.draw * (1 - boost * 0.55);
  const [normalizedHome, normalizedDraw, normalizedAway] = normalize([home, draw, away]);
  return { home: normalizedHome, draw: normalizedDraw, away: normalizedAway };
}

function calibrateOutcomeByPostMatchErrors(
  outcome: OutcomeProbability,
  calibration?: PostMatchCalibration
): OutcomeProbability {
  if (!calibration || calibration.learnedMatchCount < 1) return outcome;

  const favorite = outcome.home >= outcome.away ? "home" : "away";
  const favoriteGap = Math.abs(outcome.home - outcome.away);
  const favoritePenalty = calibration.favoriteOverconfidencePenalty ?? 0;
  const underdogBoost = calibration.underdogResilienceBoost ?? 0;
  const drawProtection = calibration.drawProtectionBoost ?? 0;
  const favoriteDrawMiss = calibration.favoriteDrawMissRate ?? 0;
  const marginOverestimate = calibration.favoriteMarginOverestimate ?? 0;
  const favoriteBreakthrough = calibration.drawProtectedFavoriteWinRate ?? 0;
  const marginUnderestimate = calibration.favoriteMarginUnderestimate ?? 0;
  const drawTrapBreakthrough = calibration.drawTrapBreakthroughRate ?? 0;
  const drawTrapMarginUnderestimate = calibration.drawTrapMarginUnderestimate ?? 0;
  const cleanSheetBust = calibration.favoriteCleanSheetBustRate ?? 0;
  const favoriteBreakthroughSignal = favoriteBreakthrough + drawTrapBreakthrough * 0.75;
  const marginUnderestimateSignal = marginUnderestimate + drawTrapMarginUnderestimate * 0.65;
  const effectiveFavoritePenalty = Math.max(0, favoritePenalty - favoriteBreakthroughSignal * 0.08 - marginUnderestimateSignal * 0.02);
  const effectiveUnderdogBoost = Math.max(0, underdogBoost - favoriteBreakthroughSignal * 0.08 - marginUnderestimateSignal * 0.02);
  const effectiveDrawProtection = Math.max(0, drawProtection - favoriteBreakthroughSignal * 0.12 - marginUnderestimateSignal * 0.035);
  if (
    favoriteGap < 0.08 &&
    effectiveFavoritePenalty <= 0 &&
    effectiveDrawProtection <= 0 &&
    favoriteDrawMiss <= 0 &&
    marginOverestimate <= 0 &&
    favoriteBreakthroughSignal <= 0 &&
    marginUnderestimateSignal <= 0 &&
    cleanSheetBust <= 0
  )
    return outcome;

  let home = outcome.home;
  let draw = outcome.draw;
  let away = outcome.away;

  if (effectiveFavoritePenalty > 0) {
    const source = favorite === "home" ? home : away;
    const shift = source * effectiveFavoritePenalty * clamp(favoriteGap * 1.6, 0.25, 1);

    if (favorite === "home") {
      home -= shift;
      away += shift * (0.42 + effectiveUnderdogBoost * 0.8);
    } else {
      away -= shift;
      home += shift * (0.42 + effectiveUnderdogBoost * 0.8);
    }
    draw += shift * (0.58 + effectiveDrawProtection * 0.8);
  }

  const netDrawDampener = Math.max(0, calibration.drawDampener - effectiveFavoritePenalty * 0.55 - effectiveDrawProtection * 0.35);
  if (favoriteGap >= 0.08 && netDrawDampener > 0) {
    const drawShift = draw * netDrawDampener * clamp(favoriteGap * 2.4, 0.35, 1);
    if (favorite === "home") {
      home += drawShift;
      away += drawShift * 0.18;
    } else {
      away += drawShift;
      home += drawShift * 0.18;
    }
    draw -= drawShift * 1.18;
  }

  if (effectiveDrawProtection > 0 && favoriteGap < 0.22) {
    const source = favorite === "home" ? home : away;
    const drawShift = source * effectiveDrawProtection * clamp(0.24 - favoriteGap, 0.04, 0.16);
    if (favorite === "home") home -= drawShift;
    else away -= drawShift;
    draw += drawShift;
  }

  const breakthroughRate =
    favoriteBreakthrough * 0.10 +
    marginUnderestimate * 0.02 +
    drawTrapBreakthrough * 0.18 +
    drawTrapMarginUnderestimate * 0.022;
  if (breakthroughRate > 0) {
    const drawShift = draw * breakthroughRate * clamp(0.30 + favoriteGap * 2.1, 0.30, 1);
    if (favorite === "home") {
      home += drawShift * 1.08;
      away += drawShift * 0.10;
    } else {
      away += drawShift * 1.08;
      home += drawShift * 0.10;
    }
    draw -= drawShift * 1.18;
  }

  if (cleanSheetBust > 0 && favoriteGap >= 0.16) {
    const source = favorite === "home" ? home : away;
    const shift = source * cleanSheetBust * clamp(favoriteGap * 0.55, 0.05, 0.16);
    if (favorite === "home") {
      home -= shift;
      away += shift * 0.55;
    } else {
      away -= shift;
      home += shift * 0.55;
    }
    draw += shift * 0.45;
  }

  const drawSlipRate = favoriteDrawMiss * 0.10 + marginOverestimate * 0.018;
  if (drawSlipRate > 0 && favoriteGap >= 0.12) {
    const source = favorite === "home" ? home : away;
    const drawShift = source * drawSlipRate * clamp(favoriteGap * 1.35, 0.25, 1);
    if (favorite === "home") {
      home -= drawShift;
      away += drawShift * 0.18;
    } else {
      away -= drawShift;
      home += drawShift * 0.18;
    }
    draw += drawShift * 0.82;
  }

  const [normalizedHome, normalizedDraw, normalizedAway] = normalize([home, Math.max(0.08, draw), away]);

  return { home: normalizedHome, draw: normalizedDraw, away: normalizedAway };
}

function poisson(k: number, lambda: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n: number): number {
  let value = 1;
  for (let i = 2; i <= n; i += 1) value *= i;
  return value;
}

export function calculateDixonColesScoreMatrix(
  homeLambda: number,
  awayLambda: number,
  maxGoals: number,
  rho = DEFAULT_DIXON_COLES_RHO
): ScoreProbability[] {
  const scores: ScoreProbability[] = [];

  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      scores.push({
        score: `${home}-${away}`,
        homeGoals: home,
        awayGoals: away,
        probability: poisson(home, homeLambda) * poisson(away, awayLambda) * dixonColesTau(home, away, homeLambda, awayLambda, rho)
      });
    }
  }

  return scores;
}

function dixonColesTau(homeGoals: number, awayGoals: number, homeLambda: number, awayLambda: number, rho: number): number {
  if (homeGoals === 0 && awayGoals === 0) return clamp(1 - homeLambda * awayLambda * rho, 0.01, 2);
  if (homeGoals === 0 && awayGoals === 1) return clamp(1 + homeLambda * rho, 0.01, 2);
  if (homeGoals === 1 && awayGoals === 0) return clamp(1 + awayLambda * rho, 0.01, 2);
  if (homeGoals === 1 && awayGoals === 1) return clamp(1 - rho, 0.01, 2);
  return 1;
}

function dixonColesRho(
  homeLambda: number,
  awayLambda: number,
  worldCupFactors?: WorldCupFactors,
  postMatchCalibration?: PostMatchCalibration
): number {
  const totalGoals = homeLambda + awayLambda;
  const goalGap = Math.abs(homeLambda - awayLambda);
  let rho = DEFAULT_DIXON_COLES_RHO;

  if (worldCupFactors?.isKnockout) {
    rho -= clamp(worldCupFactors.extraTimeRisk, 0, 0.45) * 0.08;
  }

  rho -= (postMatchCalibration?.drawProtectionBoost ?? 0) * 0.25;
  rho -= (postMatchCalibration?.favoriteOverconfidencePenalty ?? 0) * 0.12;
  rho -= (postMatchCalibration?.favoriteDrawMissRate ?? 0) * 0.08;
  rho += (postMatchCalibration?.drawProtectedFavoriteWinRate ?? 0) * 0.06;
  rho += (postMatchCalibration?.drawTrapBreakthroughRate ?? 0) * 0.05;
  rho += (postMatchCalibration?.favoriteCleanSheetBustRate ?? 0) * 0.03;

  if (totalGoals > 3.4) rho += 0.035;
  if (goalGap > 1.05) rho += 0.025;

  return clamp(rho, -0.18, -0.03);
}

function postMatchScoreCalibrationMultiplier(
  item: ScoreProbability,
  calibratedOutcome?: OutcomeProbability,
  calibration?: PostMatchCalibration
): number {
  if (!calibration || calibration.learnedMatchCount < 1 || !calibratedOutcome) return 1;

  const favorite = calibratedOutcome.home >= calibratedOutcome.away ? "home" : "away";
  const favoriteGap = Math.abs(calibratedOutcome.home - calibratedOutcome.away);
  const scoreDirectionValue = scoreDirection(item);
  const loserGoals = favorite === "home" ? item.awayGoals : item.homeGoals;
  const winnerGoals = favorite === "home" ? item.homeGoals : item.awayGoals;
  const margin = winnerGoals - loserGoals;
  const favoritePenalty = calibration.favoriteOverconfidencePenalty ?? 0;
  const underdogBoost = calibration.underdogResilienceBoost ?? 0;
  const drawProtection = calibration.drawProtectionBoost ?? 0;
  const favoriteDrawMiss = calibration.favoriteDrawMissRate ?? 0;
  const marginOverestimate = calibration.favoriteMarginOverestimate ?? 0;
  const favoriteBreakthrough = calibration.drawProtectedFavoriteWinRate ?? 0;
  const marginUnderestimate = calibration.favoriteMarginUnderestimate ?? 0;
  const drawTrapBreakthrough = calibration.drawTrapBreakthroughRate ?? 0;
  const drawTrapMarginUnderestimate = calibration.drawTrapMarginUnderestimate ?? 0;
  const cleanSheetBust = calibration.favoriteCleanSheetBustRate ?? 0;
  let multiplier = 1;

  if (scoreDirectionValue === favorite && loserGoals === 0 && margin >= 1 && margin <= 3) {
    const cleanSheetLift = Math.max(0, calibration.favoriteCleanSheetBoost - favoritePenalty * 0.55) * clamp(favoriteGap * 2.2, 0.45, 1.2);
    multiplier *= 1 + cleanSheetLift * (margin >= 2 ? 1.2 : 0.8);
  }

  if (scoreDirectionValue === favorite && loserGoals === 0 && underdogBoost > 0) {
    multiplier *= 1 - underdogBoost * 0.25;
  }

  if (scoreDirectionValue === favorite && loserGoals === 0 && cleanSheetBust > 0) {
    multiplier *= 1 - cleanSheetBust * 0.38 * clamp(favoriteGap * 1.8, 0.35, 1.15);
  }

  if (scoreDirectionValue === favorite && loserGoals >= 1 && margin >= 1) {
    const bothTeamsScoreLift =
      underdogBoost * clamp(loserGoals / 1.8, 0.45, 1.35) +
      calibration.volatilityLift * clamp((winnerGoals + loserGoals) / 5, 0.25, 1.1) +
      cleanSheetBust * clamp(loserGoals / 1.7, 0.45, 1.25);
    multiplier *= 1 + bothTeamsScoreLift * (loserGoals >= 2 ? 1.15 : 0.65);
  }

  if (scoreDirectionValue === favorite && winnerGoals + loserGoals >= 5 && calibration.volatilityLift > 0) {
    multiplier *= 1 + calibration.volatilityLift * 0.55;
  }

  if (scoreDirectionValue === favorite && margin >= 2 && favoritePenalty > 0) {
    multiplier *= 1 - favoritePenalty * clamp(margin / 2.4, 0.45, 1.15);
  }

  if (scoreDirectionValue === favorite && margin >= 3) {
    const blowoutPenalty = (favoriteDrawMiss * 0.55 + marginOverestimate * 0.12) * clamp(margin / 4, 0.65, 1.15);
    multiplier *= clamp(1 - blowoutPenalty, 0.12, 1);
  }

  if (scoreDirectionValue === favorite && margin >= 2) {
    const breakthroughLift =
      favoriteBreakthrough * 0.65 +
      marginUnderestimate * 0.10 +
      drawTrapBreakthrough * 0.45 +
      drawTrapMarginUnderestimate * 0.08;
    multiplier *= 1 + breakthroughLift * clamp(margin / 3, 0.55, 1.1);
  }

  if (scoreDirectionValue === "draw" && favoriteGap >= 0.14 && calibration.drawDampener > 0) {
    const netDrawDampener = Math.max(0, calibration.drawDampener - favoritePenalty * 0.55 - drawProtection * 0.35);
    multiplier *= 1 - netDrawDampener * clamp(favoriteGap * 2, 0.35, 1);
  }

  if (scoreDirectionValue === "draw" && favoriteBreakthrough > 0) {
    multiplier *= 1 - (favoriteBreakthrough * 0.45 + marginUnderestimate * 0.08) * clamp(0.30 + favoriteGap * 2, 0.35, 1);
  }

  if (scoreDirectionValue === "draw" && drawTrapBreakthrough > 0) {
    const lowScoreDrawShape = item.homeGoals === item.awayGoals && item.homeGoals <= 1 ? 1.25 : 0.75;
    multiplier *=
      1 -
      (drawTrapBreakthrough * 0.68 + drawTrapMarginUnderestimate * 0.08) *
        clamp(0.34 + favoriteGap * 2.1, 0.34, 1) *
        lowScoreDrawShape;
  }

  if (scoreDirectionValue === "draw" && drawProtection > 0) {
    multiplier *= 1 + drawProtection * clamp(1 - favoriteGap, 0.35, 0.90);
  }

  const effectiveFavoriteDrawMiss = Math.max(0, favoriteDrawMiss - drawTrapBreakthrough * 0.55 - favoriteBreakthrough * 0.35);
  if (scoreDirectionValue === "draw" && effectiveFavoriteDrawMiss > 0) {
    const totalGoals = item.homeGoals + item.awayGoals;
    const drawShape = totalGoals <= 4 ? 1 : 0.45;
    multiplier *= 1 + effectiveFavoriteDrawMiss * 0.95 * drawShape + marginOverestimate * 0.12 * drawShape;
  }

  if (scoreDirectionValue !== favorite && scoreDirectionValue !== "draw" && favoriteGap >= 0.22) {
    const underdogMargin = Math.abs(item.homeGoals - item.awayGoals);
    multiplier *= 1 + calibration.volatilityLift * 0.35 + underdogBoost * (underdogMargin <= 1 ? 0.85 : 0.35);
  }

  return clamp(multiplier, 0.20, 1.55);
}

function scoreDirection(score: Pick<ScoreProbability, "homeGoals" | "awayGoals">): keyof OutcomeProbability {
  if (score.homeGoals > score.awayGoals) return "home";
  if (score.homeGoals < score.awayGoals) return "away";
  return "draw";
}

function classifyStyle(totalExpectedGoals: number): GameStyle {
  if (totalExpectedGoals < 2.25) return "defensive";
  if (totalExpectedGoals > 3.15) return "open";
  return "balanced";
}

function classifyUpsetRisk(
  match: Match,
  homeStrength: number,
  awayStrength: number,
  homeWinProb: number,
  awayWinProb: number,
  factors: WorldCupFactors
): UpsetRisk {
  const strongerIsHome = homeStrength >= awayStrength;
  const strongerWinProb = strongerIsHome ? homeWinProb : awayWinProb;
  const underdog = strongerIsHome ? match.awayTeam : match.homeTeam;
  const underdogFactors = strongerIsHome ? factors.away : factors.home;
  const underdogCanDefend = underdog.xga < 1.05 || underdog.defenseAvg >= 78;
  const underdogCanBreak = underdog.attackAvg >= 1.35 || underdogFactors.tacticalTransition >= 0.60 || underdogFactors.setPiece >= 0.48;
  const strongerFatigue = strongerIsHome ? factors.home.travelFatigue : factors.away.travelFatigue;

  if (strongerWinProb < 0.46 || (underdogCanDefend && underdogCanBreak) || strongerFatigue > 0.52) return "high";
  if (strongerWinProb < 0.58 || underdogCanDefend || underdogCanBreak || underdogFactors.volatility > 0.50) return "medium";
  return "low";
}

function normalize(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export const predictionService = new PredictionService();

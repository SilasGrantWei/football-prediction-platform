import type { Match, Prediction, PredictionEvaluation, PredictionLiveReview, PredictionLiveReviewStatus } from "../models.js";

type MatchResult = "home" | "draw" | "away";

const resultLabels: Record<MatchResult, string> = {
  home: "主胜",
  draw: "平局",
  away: "客胜"
};

const evaluationScope = "90分钟（含伤停补时）";

export function buildPredictionEvaluation(match: Match, prediction: Prediction): PredictionEvaluation | undefined {
  if (match.status !== "finished" || !prediction.topScores[0]) return undefined;
  // Do not score model accuracy against extra-time or penalty outcomes unless a separate 90-minute score is stored.
  if (match.minute >= 120) return undefined;

  const actualScore = `${match.homeScore}-${match.awayScore}`;
  const predictedScore = prediction.topScores[0].score;
  const [predictedHomeGoals, predictedAwayGoals] = predictedScore.split("-").map(Number);
  const actualResult = resultOf(match.homeScore, match.awayScore);
  const predictedResult = resultOf(predictedHomeGoals, predictedAwayGoals);
  const top3Index = prediction.topScores.findIndex((item) => item.score === actualScore);
  const top3ScoreHit = top3Index >= 0;
  const top3Rank = top3ScoreHit ? top3Index + 1 : undefined;
  const exactScoreHit = top3Rank === 1;
  const resultHit = actualResult === predictedResult;
  const homeError = match.homeScore - predictedHomeGoals;
  const awayError = match.awayScore - predictedAwayGoals;

  return {
    status: top3ScoreHit ? "success" : "failed",
    actualScore,
    predictedScore,
    predictedProbability: prediction.topScores[0].probability,
    exactScoreHit,
    top3ScoreHit,
    top3Rank,
    resultHit,
    conclusion: buildConclusion({
      actualScore,
      predictedScore,
      top3Rank,
      resultHit,
      actualResult,
      predictedResult
    }),
    goalError: {
      home: homeError,
      away: awayError,
      total: Math.abs(homeError) + Math.abs(awayError)
    },
    failureReasons: top3ScoreHit
      ? []
      : buildFailureReasons(match, prediction, predictedHomeGoals, predictedAwayGoals, actualResult, predictedResult),
    learningActions: buildLearningActions(match, prediction, homeError, awayError, resultHit, top3Rank),
    reviewedAt: new Date().toISOString()
  };
}

export function buildPredictionLiveReview(match: Match, prediction: Prediction): PredictionLiveReview | undefined {
  if ((match.status !== "live" && match.status !== "halftime") || !prediction.topScores[0]) return undefined;

  const minute = clamp(match.minute || (match.status === "halftime" ? 45 : 1), 1, 90);
  const currentScore = `${match.homeScore}-${match.awayScore}`;
  const predictedScore = prediction.topScores[0].score;
  const [predictedHomeGoals, predictedAwayGoals] = parseScore(predictedScore);
  const predictedDirection = resultOf(predictedHomeGoals, predictedAwayGoals);
  const resultDirectionNow = resultOf(match.homeScore, match.awayScore);
  const pace = matchPace(minute);
  const expectedHomeByNow = round2(prediction.expectedHomeGoals * pace);
  const expectedAwayByNow = round2(prediction.expectedAwayGoals * pace);
  const expectedScoreByNow = `${expectedHomeByNow}-${expectedAwayByNow}`;
  const expectedTotalByNow = expectedHomeByNow + expectedAwayByNow;
  const actualTotal = match.homeScore + match.awayScore;
  const totalPaceError = Math.abs(actualTotal - expectedTotalByNow);
  const top3StillPlausible = isTop3StillPlausible(match, prediction, minute);
  const directionMismatch = resultDirectionNow !== predictedDirection;
  const strongDirectionMismatch =
    (predictedDirection === "home" && match.awayScore - match.homeScore >= 2) ||
    (predictedDirection === "away" && match.homeScore - match.awayScore >= 2);
  const status = classifyLiveReviewStatus({
    minute,
    actualTotal,
    totalPaceError,
    top3StillPlausible,
    directionMismatch,
    strongDirectionMismatch
  });

  return {
    status,
    minute,
    currentScore,
    predictedScore,
    expectedScoreByNow,
    top3StillPlausible,
    resultDirectionNow,
    predictedDirection,
    conclusion: buildLiveConclusion(status, match, predictedScore, currentScore, minute),
    reasons: buildLiveReasons({
      match,
      prediction,
      minute,
      currentScore,
      predictedScore,
      expectedScoreByNow,
      expectedTotalByNow,
      actualTotal,
      totalPaceError,
      top3StillPlausible,
      predictedDirection,
      resultDirectionNow
    }),
    optimizationActions: buildLiveOptimizationActions({
      match,
      prediction,
      totalPaceError,
      expectedTotalByNow,
      actualTotal,
      top3StillPlausible,
      directionMismatch,
      strongDirectionMismatch
    }),
    reviewedAt: new Date().toISOString()
  };
}

function buildConclusion({
  actualScore,
  predictedScore,
  top3Rank,
  resultHit,
  actualResult,
  predictedResult
}: {
  actualScore: string;
  predictedScore: string;
  top3Rank?: number;
  resultHit: boolean;
  actualResult: MatchResult;
  predictedResult: MatchResult;
}): string {
  if (top3Rank === 1) {
    return `推算成功：赛前首选比分 ${predictedScore} 与${evaluationScope}实际比分 ${actualScore} 完全一致。`;
  }

  if (top3Rank) {
    return `推算成功：${evaluationScope}实际比分 ${actualScore} 命中前三候选第 ${top3Rank} 位，但首选比分 ${predictedScore} 的排序还需要继续校准。`;
  }

  if (resultHit) {
    return `推算失败：首选比分 ${predictedScore} 未覆盖${evaluationScope}实际比分 ${actualScore}，胜平负方向命中，但进球数估计有偏差。`;
  }

  return `推算失败：首选比分 ${predictedScore} 未覆盖${evaluationScope}实际比分 ${actualScore}，方向从 ${resultLabels[predictedResult]} 偏到 ${resultLabels[actualResult]}，需要重新校准强弱、状态和常规时间临场变量权重。`;
}

function resultOf(homeGoals: number, awayGoals: number): MatchResult {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

function parseScore(score: string): [number, number] {
  const [home, away] = score.split("-").map((value) => Number.parseInt(value, 10));
  return [Number.isFinite(home) ? home : 0, Number.isFinite(away) ? away : 0];
}

function matchPace(minute: number): number {
  const linear = clamp(minute / 90, 0.03, 1);
  // Early World Cup knockout matches are often slower than a linear 90-minute pace.
  if (minute <= 15) return linear * 0.78;
  if (minute <= 45) return linear * 0.90;
  return clamp(linear * 1.04, 0, 1);
}

function isTop3StillPlausible(match: Match, prediction: Prediction, minute: number): boolean {
  const remainingMinutes = Math.max(0, 90 - minute);
  const realisticRemainingGoals = Math.max(1, Math.ceil(remainingMinutes / 18));

  return prediction.topScores.slice(0, 3).some((item) => {
    const [homeGoals, awayGoals] = parseScore(item.score);
    const remainingHome = homeGoals - match.homeScore;
    const remainingAway = awayGoals - match.awayScore;
    return remainingHome >= 0 && remainingAway >= 0 && remainingHome + remainingAway <= realisticRemainingGoals + 1;
  });
}

function classifyLiveReviewStatus({
  minute,
  actualTotal,
  totalPaceError,
  top3StillPlausible,
  directionMismatch,
  strongDirectionMismatch
}: {
  minute: number;
  actualTotal: number;
  totalPaceError: number;
  top3StillPlausible: boolean;
  directionMismatch: boolean;
  strongDirectionMismatch: boolean;
}): PredictionLiveReviewStatus {
  if (minute < 12 && actualTotal === 0) return "pending";
  if (minute >= 60 && (strongDirectionMismatch || !top3StillPlausible || totalPaceError >= 2.2)) return "off_track";
  if ((minute >= 30 && directionMismatch) || !top3StillPlausible || totalPaceError >= 1.2) return "drifting";
  return "tracking";
}

function buildLiveConclusion(
  status: PredictionLiveReviewStatus,
  match: Match,
  predictedScore: string,
  currentScore: string,
  minute: number
): string {
  if (status === "pending") {
    return `比赛第 ${minute} 分钟，当前 ${currentScore}，样本还太早；先监控节奏，不把开场状态当作推算成功或失败。`;
  }

  if (status === "tracking") {
    return `比赛第 ${minute} 分钟，当前 ${currentScore}，走势仍接近赛前首选 ${predictedScore} 或前三候选区间。`;
  }

  if (status === "drifting") {
    return `比赛第 ${minute} 分钟，当前 ${currentScore} 已开始偏离赛前首选 ${predictedScore}，需要记录偏差原因，赛后再进入校准。`;
  }

  return `比赛第 ${minute} 分钟，当前 ${currentScore} 与赛前首选 ${predictedScore} 明显偏离，本场应进入赛后重点复盘队列。`;
}

function buildLiveReasons({
  match,
  prediction,
  minute,
  currentScore,
  predictedScore,
  expectedScoreByNow,
  expectedTotalByNow,
  actualTotal,
  totalPaceError,
  top3StillPlausible,
  predictedDirection,
  resultDirectionNow
}: {
  match: Match;
  prediction: Prediction;
  minute: number;
  currentScore: string;
  predictedScore: string;
  expectedScoreByNow: string;
  expectedTotalByNow: number;
  actualTotal: number;
  totalPaceError: number;
  top3StillPlausible: boolean;
  predictedDirection: MatchResult;
  resultDirectionNow: MatchResult;
}): string[] {
  const reasons: string[] = [
    `赛前首选比分是 ${predictedScore}，当前第 ${minute} 分钟比分是 ${currentScore}。`,
    `按赛前预期进球节奏，此时大约应到 ${expectedScoreByNow}；当前总进球 ${actualTotal}，节奏偏差 ${round2(totalPaceError)}。`
  ];

  if (predictedDirection !== resultDirectionNow && minute >= 30) {
    reasons.push(`当前方向是 ${resultLabels[resultDirectionNow]}，赛前首选方向是 ${resultLabels[predictedDirection]}，方向已经出现可观察偏差。`);
  } else {
    reasons.push(`当前方向与赛前方向尚未形成强冲突，不能提前判定最终失败。`);
  }

  reasons.push(
    top3StillPlausible
      ? "当前比分仍可落入赛前三候选的合理路径，继续观察射门质量、红黄牌和换人。"
      : "当前比分已经很难回到赛前三候选路径，需要赛后复盘是否低估弱势方进球或高估强队转化。"
  );

  if (actualTotal > expectedTotalByNow + 0.9) {
    reasons.push("实际进球节奏明显快于模型预期，可能是早段压迫、定位球、失误或攻防转换速度被低估。");
  }

  if (actualTotal < expectedTotalByNow - 0.9 && minute >= 35) {
    reasons.push("实际进球节奏低于模型预期，可能是淘汰赛谨慎、防守站位、射门质量或临门一脚被高估。");
  }

  if (prediction.lineupProjection?.home.sourceType === "projected" || prediction.lineupProjection?.away.sourceType === "projected") {
    reasons.push("当前首发仍是模型推算阵容，不是官方实时阵容；官方首发接入后要比较推算首发命中率，再调整球星影响权重。");
  }

  return reasons;
}

function buildLiveOptimizationActions({
  match,
  prediction,
  totalPaceError,
  expectedTotalByNow,
  actualTotal,
  top3StillPlausible,
  directionMismatch,
  strongDirectionMismatch
}: {
  match: Match;
  prediction: Prediction;
  totalPaceError: number;
  expectedTotalByNow: number;
  actualTotal: number;
  top3StillPlausible: boolean;
  directionMismatch: boolean;
  strongDirectionMismatch: boolean;
}): string[] {
  const actions: string[] = [];

  if (!top3StillPlausible) {
    actions.push("赛后确认后，把本场加入比分矩阵排序校准队列，提高相似强弱差下的小比分/反向比分候选覆盖。");
  }

  if (actualTotal > expectedTotalByNow + 0.9 || totalPaceError >= 1.2) {
    actions.push("复盘早段进球来源：如果来自压迫、定位球或后场失误，下一版提高这些事件对前30分钟进球节奏的影响。");
  }

  if (actualTotal < expectedTotalByNow - 0.9) {
    actions.push("若90分钟最终仍低于预期，降低本场双方射门转化和开放度权重，避免纸面攻击力过度放大。");
  }

  if (directionMismatch || strongDirectionMismatch) {
    actions.push(`复核 ${match.homeTeam.name} 与 ${match.awayTeam.name} 的强弱权重、近期状态、伤停和比赛策略，方向偏差只在赛后用90分钟结果校准。`);
  }

  if (prediction.lineupProjection) {
    actions.push("官方首发/换人数据接入后，比较推算首发命中率和球星实际上场时间，修正阵容因子的可信度。");
  }

  actions.push("禁止把赛中比分回填为赛前推算；本场只生成偏差日志，赛后用90分钟最终结果进入训练/校准样本。");
  return actions;
}

function buildFailureReasons(
  match: Match,
  prediction: Prediction,
  predictedHomeGoals: number,
  predictedAwayGoals: number,
  actualResult: MatchResult,
  predictedResult: MatchResult
): string[] {
  const reasons: string[] = [];
  const actualTotal = match.homeScore + match.awayScore;
  const expectedTotal = prediction.expectedHomeGoals + prediction.expectedAwayGoals;

  if (actualResult !== predictedResult) {
    reasons.push(`90分钟胜平负方向判断错误：模型赛前偏向 ${resultLabels[predictedResult]}，常规时间实际结果是 ${resultLabels[actualResult]}。`);
  }

  if (match.homeScore > predictedHomeGoals) {
    reasons.push(`低估了 ${match.homeTeam.name} 在90分钟内的进球输出，实际比首选推算多进 ${match.homeScore - predictedHomeGoals} 球。`);
  }

  if (match.homeScore < predictedHomeGoals) {
    reasons.push(`高估了 ${match.homeTeam.name} 在90分钟内的进攻转化，实际比首选推算少进 ${predictedHomeGoals - match.homeScore} 球。`);
  }

  if (match.awayScore > predictedAwayGoals) {
    reasons.push(`低估了 ${match.awayTeam.name} 在90分钟内的反击、定位球或转换威胁，实际比首选推算多进 ${match.awayScore - predictedAwayGoals} 球。`);
  }

  if (match.awayScore < predictedAwayGoals) {
    reasons.push(`高估了 ${match.awayTeam.name} 在90分钟内的进攻输出，实际比首选推算少进 ${predictedAwayGoals - match.awayScore} 球。`);
  }

  if (actualTotal >= expectedTotal + 1) {
    reasons.push("90分钟总进球明显高于预期进球，模型对开放程度、转换速度或下半场体能波动估计偏保守。");
  }

  if (actualTotal <= expectedTotal - 1) {
    reasons.push("90分钟总进球明显低于预期进球，模型对防守强度、射门质量或淘汰赛谨慎程度估计不足。");
  }

  if (prediction.upsetRisk !== "low") {
    reasons.push("模型已经标记冷门风险，但前三候选比分仍偏向常规强弱格局，需要让弱势方90分钟不败和小比分场景进入更高候选排名。");
  }

  return reasons;
}

function buildLearningActions(
  match: Match,
  prediction: Prediction,
  homeError: number,
  awayError: number,
  resultHit: boolean,
  top3Rank?: number
): string[] {
  const actions: string[] = [];

  if (top3Rank === 1) {
    actions.push(`保留 ${match.homeTeam.name} 对 ${match.awayTeam.name} 这类90分钟强弱差与攻防均值组合，作为正样本继续观察。`);
  } else if (top3Rank) {
    actions.push(`90分钟实际比分已在前三候选第 ${top3Rank} 位，下一轮应提高该比分场景的排序权重，而不是重算整个方向。`);
  }

  if (!resultHit) {
    actions.push("降低单一国际足联评分权重，提高最近状态、伤停、淘汰赛常规时间压力和临场走势权重。");
  }

  if (homeError > 0 || awayError > 0) {
    actions.push("对90分钟实际进球更多的一方提高下一轮进攻均值校准值，并记录其高压、反击或定位球进球能力。");
  }

  if (homeError < 0 || awayError < 0) {
    actions.push("对90分钟实际进球低于推算的一方降低射门转化率权重，避免只按纸面进攻能力高估比分。");
  }

  if (prediction.upsetRisk !== "low") {
    actions.push("冷门风险为中/高时，不只显示风险提示，还要把弱势方90分钟不败和小比分拖入更高候选排名。");
  }

  actions.push("只把90分钟比分写入赛后样本；加时赛和点球大战结果单独保存为备注，不参与胜平负和比分命中率统计。");
  return actions;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

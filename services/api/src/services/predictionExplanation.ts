import type {
  Match,
  Prediction,
  PredictionExplanation,
  PredictionFactor,
  ScorePrediction,
  TeamRecordComparison,
  TeamLineupProjection,
  TeamRecordSummary
} from "../models.js";
import { buildWorldCupFactors, type WorldCupFactors } from "./worldCupFactors.js";

export function buildPredictionExplanation(
  match: Match,
  prediction: Prediction,
  worldCupFactors: WorldCupFactors = buildWorldCupFactors(match),
  recordComparison?: TeamRecordComparison
): PredictionExplanation {
  const { home, away } = worldCupFactors;
  const factors: PredictionFactor[] = [
    factor(
      "国际足联评分/综合实力",
      `${match.homeTeam.fifaRating}`,
      `${match.awayTeam.fifaRating}`,
      match.homeTeam.fifaRating,
      match.awayTeam.fifaRating,
      "排名和基础实力决定赛前底盘，但不会单独决定比分。"
    ),
    factor(
      "本届小组赛积分",
      `${home.groupPoints}分`,
      `${away.groupPoints}分`,
      home.groupPoints,
      away.groupPoints,
      "今年世界杯已经踢过的小组赛结果会进入状态和强度校准。"
    ),
    factor(
      "本届净胜球",
      signed(home.groupGoalDiff),
      signed(away.groupGoalDiff),
      home.groupGoalDiff,
      away.groupGoalDiff,
      "净胜球反映阶段性攻防兑现质量，能修正纸面强弱。"
    ),
    factor(
      "近期/本届状态",
      formatPercent(home.formScore),
      formatPercent(away.formScore),
      home.formScore,
      away.formScore,
      "融合小组赛积分、净胜球、近期状态、阵容可用性和赛程消耗。"
    ),
    ...(recordComparison
      ? [
          factor(
            "同年赛前战绩校准",
            recordSummaryValue(recordComparison.home),
            recordSummaryValue(recordComparison.away),
            recordScore(recordComparison.home),
            recordScore(recordComparison.away),
            "只统计本场开赛前已经结束的同年世界杯相关比赛；样本不足会自动降低权重，不会用本场赛果回填。"
          )
        ]
      : []),
    ...(prediction.postMatchCalibration
      ? [
          factor(
            "赛后错题本校准",
            calibrationFactorValue(prediction.postMatchCalibration),
            "只影响后续比赛",
            calibrationFactorScore(prediction.postMatchCalibration),
            0,
            "只使用本场开赛前已经结束、且当时已有赛前推算快照的比赛做误差校准；不会读取本场赛果，也不会回填已经开赛的推算。"
          )
        ]
      : []),
    ...(prediction.lineupProjection
      ? [
          factor(
            "推算首发/球星影响",
            lineupImpactValue(prediction.lineupProjection.home),
            lineupImpactValue(prediction.lineupProjection.away),
            lineupImpactScore(prediction.lineupProjection.home),
            lineupImpactScore(prediction.lineupProjection.away),
            "这是赛前模型推算首发，不是官方实时阵容；预计上场的高影响力前锋、前腰和核心组织者会小幅抬高进球期望，强防守阵容会压低对方进球期望。"
          )
        ]
      : []),
    ...(prediction.preMatchContext
      ? prediction.preMatchContext.factors.map((contextFactor) => ({
          name: contextFactor.name,
          homeValue: contextFactor.homeValue,
          awayValue: contextFactor.awayValue,
          edge: contextFactor.edge,
          explanation: contextFactor.explanation
        }))
      : []),
    factor(
      "休息天数",
      `${home.restDays}天`,
      `${away.restDays}天`,
      home.restDays,
      away.restDays,
      "休息时间影响90分钟后段强度、逼抢持续性和常规时间打平倾向。"
    ),
    factor(
      "旅行/体能消耗",
      formatPercent(home.travelFatigue),
      formatPercent(away.travelFatigue),
      home.travelFatigue,
      away.travelFatigue,
      "东道主和赛程距离会改变体能消耗，数值越低越有利。",
      true
    ),
    factor(
      "淘汰赛压力",
      formatPercent(home.knockoutPressure),
      formatPercent(away.knockoutPressure),
      home.knockoutPressure,
      away.knockoutPressure,
      "大赛经验、心理压力和淘汰赛容错率会影响领先/落后后的选择。",
      true
    ),
    factor(
      "阵容可用性",
      formatPercent(home.squadAvailability),
      formatPercent(away.squadAvailability),
      home.squadAvailability,
      away.squadAvailability,
      "关键球员健康度和替补深度会改变预期进球与防线稳定性。"
    ),
    factor(
      "转换速度",
      formatPercent(home.tacticalTransition),
      formatPercent(away.tacticalTransition),
      home.tacticalTransition,
      away.tacticalTransition,
      "转换速度高的一方更容易在强弱差不大时制造冷门或扩大比分。"
    ),
    factor(
      "定位球威胁",
      formatPercent(home.setPiece),
      formatPercent(away.setPiece),
      home.setPiece,
      away.setPiece,
      "定位球会提高低比分比赛中的单点破局概率。"
    ),
    factor(
      "波动性/爆冷弹性",
      formatPercent(home.volatility),
      formatPercent(away.volatility),
      home.volatility,
      away.volatility,
      "波动越高，强队稳定兑现概率越低，弱队爆冷路径越多。",
      true
    ),
    factor(
      "预期进球",
      `${prediction.expectedHomeGoals.toFixed(2)}球`,
      `${prediction.expectedAwayGoals.toFixed(2)}球`,
      prediction.expectedHomeGoals,
      prediction.expectedAwayGoals,
      "等级分模型、梯度提升模型、世界杯上下文和泊松比分矩阵共同给出的进球期望。"
    )
  ];

  return {
    summary:
      `模型只推算90分钟结果（含伤停补时），不计入加时赛与点球大战；输入只使用开赛前已可见的数据，包含本届世界杯已发生表现、赛前气候/温度、赛程休息、东道主/旅行、淘汰赛压力、阵容可用性、战术转换、定位球与波动性。` +
      ` 当前预期进球为 ${match.homeTeam.name} ${prediction.expectedHomeGoals.toFixed(2)}，${match.awayTeam.name} ${prediction.expectedAwayGoals.toFixed(2)}，` +
      `再用泊松分布枚举90分钟比分并按概率排序。`,
    h2hSummary: worldCupFactors.h2hSummary,
    recentFormSummary: `${match.homeTeam.name}：${home.tournamentSummary} ${match.awayTeam.name}：${away.tournamentSummary}`,
    playerSummary:
      `${match.homeTeam.name}关键点：${home.keyPlayers.join("、")}。${home.availability} ` +
      `${match.awayTeam.name}关键点：${away.keyPlayers.join("、")}。${away.availability}`,
    tacticalSummary:
      `${worldCupFactors.stageLabel}，90分钟打平并进入加时的倾向约 ${formatPercent(worldCupFactors.extraTimeRisk)}，但推算结果不计算加时和点球。` +
      `${match.homeTeam.name}：${home.tacticalNote} ${match.awayTeam.name}：${away.tacticalNote}`,
    factors,
    scoreRationales: prediction.topScores.map((score, index, scores) => ({
      score: score.score,
      probability: score.probability,
      reasons: buildScoreReasons(match, prediction, score, index, scores, worldCupFactors)
    })),
    sources: [...worldCupFactors.sources, ...(prediction.preMatchContext?.sources ?? [])]
  };
}

function factor(
  name: string,
  homeValue: string,
  awayValue: string,
  homeMetric: number,
  awayMetric: number,
  explanation: string,
  lowerIsBetter = false
): PredictionFactor {
  const diff = lowerIsBetter ? awayMetric - homeMetric : homeMetric - awayMetric;
  return {
    name,
    homeValue,
    awayValue,
    edge: Math.abs(diff) < 0.03 ? "even" : diff > 0 ? "home" : "away",
    explanation
  };
}

function recordSummaryValue(summary: TeamRecordSummary): string {
  if (!summary.played) return "0场";
  return `${summary.played}场 ${summary.wins}胜${summary.draws}平${summary.losses}负 / 净胜${signed(summary.goalDifference)} / 场均失球${summary.avgGoalsAgainst.toFixed(2)}`;
}

function lineupImpactValue(lineup: TeamLineupProjection): string {
  if (!lineup.starters.length) return "未接入可验证球员池";
  return `进攻+${formatPercent(lineup.attackImpact)} / 创造+${formatPercent(lineup.creationImpact)} / 防守+${formatPercent(lineup.defensiveImpact)}`;
}

function lineupImpactScore(lineup: TeamLineupProjection): number {
  return lineup.starters.length ? lineup.attackImpact * 0.46 + lineup.creationImpact * 0.34 + lineup.defensiveImpact * 0.2 : 0;
}

function recordScore(summary: TeamRecordSummary): number {
  if (!summary.played) return 0;
  const pointsRate = (summary.wins * 3 + summary.draws) / (summary.played * 3);
  const goalDiffPerGame = summary.goalDifference / summary.played;
  const defenseValue = 1 / (1 + summary.avgGoalsAgainst);
  return pointsRate * 0.52 + goalDiffPerGame * 0.16 + defenseValue * 0.18 + summary.cleanSheets / summary.played * 0.14;
}

function calibrationFactorValue(calibration: NonNullable<Prediction["postMatchCalibration"]>): string {
  return `${calibration.learnedMatchCount}场样本 / 前三候选漏判${formatProbability(calibration.scoreMissRate)} / 方向漏判${formatProbability(calibration.directionMissRate)}`;
}

function calibrationFactorScore(calibration: NonNullable<Prediction["postMatchCalibration"]>): number {
  return (
    calibration.favoriteCleanSheetBoost * 1.4 +
    calibration.favoriteGoalLift +
    calibration.underdogGoalSuppression +
    calibration.drawDampener +
    calibration.volatilityLift * 0.6 +
    (calibration.favoriteOverconfidencePenalty ?? 0) +
    (calibration.underdogResilienceBoost ?? 0) +
    (calibration.drawProtectionBoost ?? 0)
  );
}

function buildScoreReasons(
  match: Match,
  prediction: Prediction,
  scorePrediction: ScorePrediction,
  index: number,
  allScores: ScorePrediction[],
  worldCupFactors: WorldCupFactors
): string[] {
  const [homeGoals, awayGoals] = scorePrediction.score.split("-").map(Number);
  const reasons: string[] = [];
  const { home, away } = worldCupFactors;
  const totalGoals = homeGoals + awayGoals;
  const expectedTotal = prediction.expectedHomeGoals + prediction.expectedAwayGoals;
  const homeGap = Math.abs(homeGoals - prediction.expectedHomeGoals);
  const awayGap = Math.abs(awayGoals - prediction.expectedAwayGoals);
  const totalGap = Math.abs(totalGoals - expectedTotal);
  const topProbability = allScores[0]?.probability ?? scorePrediction.probability;
  const probabilityGap = Math.max(0, topProbability - scorePrediction.probability);
  const resultLabel = homeGoals > awayGoals ? "主胜" : homeGoals < awayGoals ? "客胜" : "平局";
  const resultProbability =
    homeGoals > awayGoals
      ? prediction.homeWinProb
      : homeGoals < awayGoals
        ? prediction.awayWinProb
        : prediction.drawProb;

  reasons.push(
    `排序第 ${index + 1}：该比分的泊松+方向校准矩阵概率为 ${formatProbability(scorePrediction.probability)}，` +
      (index === 0
        ? "是当前比分矩阵里的最高值。"
        : `比第1名低 ${formatPercentagePoint(probabilityGap)}，所以虽然同样四舍五入后接近，但排序仍有先后。`)
  );

  if (homeGoals > awayGoals) {
    reasons.push(
      `方向解释：${scorePrediction.score} 属于${resultLabel}，与胜平负模型里 ${match.homeTeam.name} ${formatProbability(resultProbability)} 的方向一致；因此主胜比分会优先于客胜比分进入候选。`
    );
  } else if (homeGoals < awayGoals) {
    reasons.push(
      `方向解释：${scorePrediction.score} 属于${resultLabel}，虽然客胜基础概率是 ${formatProbability(resultProbability)}，但 ${match.awayTeam.name} 的转换、定位球或爆冷弹性会给客胜比分保留候选权重。`
    );
  } else {
    reasons.push(
      `方向解释：${scorePrediction.score} 属于${resultLabel}，平局概率为 ${formatProbability(resultProbability)}；淘汰赛90分钟模型会保留平局场景，但不会把加时赛或点球计入比分。`
    );
  }

  reasons.push(
    `进球贴合度：${match.homeTeam.name} ${homeGoals} 球对比预期进球 ${prediction.expectedHomeGoals.toFixed(2)}，偏差 ${homeGap.toFixed(2)}；` +
      `${match.awayTeam.name} ${awayGoals} 球对比预期进球 ${prediction.expectedAwayGoals.toFixed(2)}，偏差 ${awayGap.toFixed(2)}。` +
      buildFitComment(homeGap, awayGap, index)
  );

  reasons.push(
    `总进球解释：该比分总进球 ${totalGoals}，模型总预期 ${expectedTotal.toFixed(2)}，差 ${totalGap.toFixed(2)}；` +
      buildTotalGoalComment(totalGoals, expectedTotal, prediction.gameStyle)
  );

  if (prediction.postMatchCalibration) {
    const calibration = prediction.postMatchCalibration;
    reasons.push(
      `赛后错题本校准：只学习本场开赛前已有赛前推算快照的 ${calibration.learnedMatchCount} 场已结束比赛；` +
        `近期前三候选漏判率 ${formatProbability(calibration.scoreMissRate)}，方向漏判率 ${formatProbability(calibration.directionMissRate)}。` +
        `本场因此对强队零封比分加权 ${formatProbability(calibration.favoriteCleanSheetBoost)}，` +
        `胜方进球期望上调 ${formatProbability(calibration.favoriteGoalLift)}，` +
        `弱势方进球期望压低 ${formatProbability(calibration.underdogGoalSuppression)}，` +
        `平局权重压低 ${formatProbability(calibration.drawDampener)}。` +
        `高置信热门被拖平样本 ${formatProbability(calibration.favoriteDrawMissRate ?? 0)}，` +
        `热门大胜幅度平均高估 ${(calibration.favoriteMarginOverestimate ?? 0).toFixed(2)} 球；` +
        `后续未开赛比赛会降低单边大胜权重，并把90分钟平局和小比分候选提前；不读取本场赛果。`
    );
  }

  const lineupComment = buildLineupScoreComment(match, prediction, homeGoals, awayGoals);
  if (lineupComment) reasons.push(lineupComment);

  const contextComment = buildPreMatchContextScoreComment(prediction);
  if (contextComment) reasons.push(contextComment);

  reasons.push(buildTeamEdgeComment(match, prediction, homeGoals, awayGoals, home, away));

  if (home.setPiece > 0.48 || away.setPiece > 0.48) {
    const setPieceLeader =
      home.setPiece >= away.setPiece ? `${match.homeTeam.name} ${formatProbability(home.setPiece)}` : `${match.awayTeam.name} ${formatProbability(away.setPiece)}`;
    reasons.push(`定位球因素：较高一方为 ${setPieceLeader}，会抬高 1 球差、2-1、1-1 这类由定位球改变比分的路径。`);
  }

  if (worldCupFactors.extraTimeRisk >= 0.26) {
    reasons.push(
      `赛制因素：${worldCupFactors.stageLabel} 的90分钟打平倾向约 ${formatProbability(worldCupFactors.extraTimeRisk)}，所以模型会同时保留平局和一球差比分；加时赛与点球不参与排序。`
    );
  }

  if (prediction.upsetRisk !== "low") {
    reasons.push(
      `爆冷校准：当前爆冷风险为${prediction.upsetRisk === "high" ? "高" : "中"}，弱势方防守、转换或定位球会压低强队大胜权重，并提高小胜/平局/反向比分的候选概率。`
    );
  }

  return reasons;
}

function buildFitComment(homeGap: number, awayGap: number, index: number): string {
  const combinedGap = homeGap + awayGap;
  if (index === 0) return " 两队进球数都在 λ 的常见波动范围内，联合概率相乘后成为当前最高比分。";
  if (combinedGap < 0.8) return " 两队进球数都非常接近期望值，因此这是高排序的核心原因。";
  if (combinedGap < 1.6) return " 至少一方接近期望值，另一方仍在泊松常见波动范围内。";
  return " 该比分依赖更强的临场转化或防线波动，因此排序会落在更稳的候选之后。";
}

function buildTotalGoalComment(totalGoals: number, expectedTotal: number, style: Prediction["gameStyle"]): string {
  if (Math.abs(totalGoals - expectedTotal) <= 0.6) return "总进球落在模型中心区间。";
  if (totalGoals > expectedTotal) return `这是偏开放的比分，匹配当前 ${styleLabel(style)} 风格下的上沿场景。`;
  return `这是偏保守的比分，匹配当前 ${styleLabel(style)} 风格下的下沿场景。`;
}

function buildLineupScoreComment(match: Match, prediction: Prediction, homeGoals: number, awayGoals: number): string | undefined {
  const projection = prediction.lineupProjection;
  if (!projection) return undefined;
  const scoringSide =
    homeGoals > awayGoals ? projection.home : homeGoals < awayGoals ? projection.away : lineupImpactScore(projection.home) >= lineupImpactScore(projection.away) ? projection.home : projection.away;
  if (!scoringSide.starters.length) return undefined;

  const impactPlayers = scoringSide.starters
    .filter((item) => item.goalImpact >= 0.06 || item.assistImpact >= 0.06 || item.starRating >= 88)
    .slice(0, 4)
    .map((item) => `${item.name}${Math.round(item.startProbability * 100)}%`);
  const teamName = scoringSide.teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;

  if (!impactPlayers.length) {
    return `阵容校准：${teamName} 推算首发没有单一超高权重得分点，因此比分仍主要由球队整体强度、赛前战绩和 λ 进球期望决定；该阵容不是官方实时首发。`;
  }

  return (
    `阵容校准：${teamName} 推算首发里 ${impactPlayers.join("、")} 的进球/助攻影响较高，` +
    `会把该队进球 λ 小幅上调；这解释了 ${teamName} 得分候选靠前，但该阵容仍是赛前推算，不是官方实时首发。`
  );
}

function buildPreMatchContextScoreComment(prediction: Prediction): string | undefined {
  const context = prediction.preMatchContext;
  if (!context) return undefined;

  return (
    `赛前上下文校准：${context.summary} ` +
    `气候/温度节奏系数 ${context.tempoMultiplier.toFixed(2)}，` +
    `90分钟平局修正 ${(context.drawModifier * 100).toFixed(1)} 个百分点，` +
    `波动修正 ${(context.volatilityModifier * 100).toFixed(1)} 个百分点；这些只来自开赛前可用或气候基线数据，不读取本场比分。`
  );
}

function buildTeamEdgeComment(
  match: Match,
  prediction: Prediction,
  homeGoals: number,
  awayGoals: number,
  home: WorldCupFactors["home"],
  away: WorldCupFactors["away"]
): string {
  const homeEdge =
    (match.homeTeam.fifaRating - match.awayTeam.fifaRating) * 0.01 +
    (home.formScore - away.formScore) +
    (home.groupGoalDiff - away.groupGoalDiff) * 0.04 -
    (home.travelFatigue - away.travelFatigue) * 0.4;
  const homeEdgeLabel =
    Math.abs(homeEdge) < 0.08 ? "双方综合差距不大" : homeEdge > 0 ? `${match.homeTeam.name}综合优势更明显` : `${match.awayTeam.name}综合优势更明显`;
  const scoreDirection =
    homeGoals > awayGoals ? `${match.homeTeam.name}领先` : homeGoals < awayGoals ? `${match.awayTeam.name}领先` : "双方打平";

  return (
    `强弱校准：${homeEdgeLabel}，比分方向是${scoreDirection}；` +
    `主胜/平/客胜分别为 ${formatProbability(prediction.homeWinProb)} / ${formatProbability(prediction.drawProb)} / ${formatProbability(prediction.awayWinProb)}，` +
    "所以比分排序不是只看哪队今年战绩更好，而是同时看90分钟方向概率和每个进球数的联合概率。"
  );
}

function styleLabel(style: Prediction["gameStyle"]): string {
  if (style === "open") return "开放型";
  if (style === "defensive") return "防守型";
  return "平衡型";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatProbability(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

function formatPercentagePoint(value: number): string {
  return `${(value * 100).toFixed(1)} 个百分点`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

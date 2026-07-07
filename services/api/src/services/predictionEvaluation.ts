import type {
  EventType,
  Match,
  MatchEvent,
  Prediction,
  PredictionEvaluation,
  PredictionFailureBreakdown,
  PredictionLiveReview,
  PredictionLiveReviewStatus,
  TeamRecordTeamStats
} from "../models.js";

type Outcome = "home" | "draw" | "away";
type TeamSide = "home" | "away";

interface PredictionEvaluationContext {
  stats?: {
    home: TeamRecordTeamStats;
    away: TeamRecordTeamStats;
  } | null;
  sourceLabel?: string;
  sourceUrl?: string;
}

interface ParsedScore {
  home: number;
  away: number;
}

interface TeamFlowSummary {
  team: string;
  goals: MatchEvent[];
  penalties: MatchEvent[];
  shots: MatchEvent[];
  blockedShots: MatchEvent[];
  corners: MatchEvent[];
  offsides: MatchEvent[];
  fouls: MatchEvent[];
  cards: MatchEvent[];
  substitutions: MatchEvent[];
}

interface MatchFlowSummary {
  events: MatchEvent[];
  home: TeamFlowSummary;
  away: TeamFlowSummary;
  keyMoments: string[];
}

const evaluationScope = "90分钟（含伤停补时，不含加时赛和点球大战）";

const outcomeLabels: Record<Outcome, string> = {
  home: "主胜",
  draw: "平局",
  away: "客胜"
};

const eventLabels: Record<EventType, string> = {
  goal: "进球",
  penalty: "点球",
  yellow_card: "黄牌",
  red_card: "红牌",
  substitution: "换人",
  foul: "犯规",
  offside: "越位",
  corner: "角球",
  shot_on_target: "射正",
  shot_off_target: "射偏",
  shot_blocked: "射门被封堵",
  var_review: "VAR复核",
  free_kick: "任意球",
  kickoff: "开球",
  halftime: "半场"
};

export function buildPredictionEvaluation(
  match: Match,
  prediction: Prediction,
  events: MatchEvent[] = [],
  context: PredictionEvaluationContext = {}
): PredictionEvaluation | undefined {
  if (match.status !== "finished" || prediction.topScores.length === 0) {
    return undefined;
  }

  const predicted = parseScore(prediction.topScores[0]?.score);
  if (!predicted) {
    return undefined;
  }

  const actual = {
    home: match.homeScore,
    away: match.awayScore
  };
  const actualScore = `${actual.home}-${actual.away}`;
  const top3Rank = prediction.topScores.findIndex((item) => item.score === actualScore);
  const exactScoreHit = prediction.topScores[0]?.score === actualScore;
  const top3ScoreHit = top3Rank >= 0;
  const resultHit = resultOf(predicted.home, predicted.away) === resultOf(actual.home, actual.away);
  const status = top3ScoreHit ? "success" : "failed";
  const flow = buildMatchFlow(match, events);
  const dataGaps = buildDataGaps(context, flow);
  const failureBreakdown =
    status === "failed"
      ? buildFailureBreakdown(match, prediction, predicted, actual, flow, context)
      : [];

  return {
    status,
    actualScore,
    predictedScore: prediction.topScores[0].score,
    predictedProbability: prediction.topScores[0].probability,
    exactScoreHit,
    top3ScoreHit,
    top3Rank: top3ScoreHit ? top3Rank + 1 : undefined,
    resultHit,
    conclusion: buildConclusion(match, prediction, predicted, actual, top3ScoreHit, resultHit),
    matchSummary: buildMatchSummary(match, prediction, predicted, actual, flow, context),
    failureBreakdown,
    dataGaps,
    goalError: {
      home: predicted.home - actual.home,
      away: predicted.away - actual.away,
      total: predicted.home + predicted.away - actual.home - actual.away
    },
    failureReasons: failureBreakdown.map((item) => `${item.title}：${item.detail}`),
    learningActions: buildLearningActions(prediction, predicted, actual, flow, context, status),
    reviewedAt: new Date().toISOString()
  };
}

export function buildPredictionLiveReview(match: Match, prediction: Prediction): PredictionLiveReview | undefined {
  if (match.status !== "live" && match.status !== "halftime") {
    return undefined;
  }

  const predicted = parseScore(prediction.topScores[0]?.score);
  if (!predicted) {
    return undefined;
  }

  const current = {
    home: match.homeScore,
    away: match.awayScore
  };
  const minute = clamp(match.minute, 0, 120);
  const expectedHome = round2((prediction.expectedHomeGoals * Math.min(minute, 90)) / 90);
  const expectedAway = round2((prediction.expectedAwayGoals * Math.min(minute, 90)) / 90);
  const top3StillPlausible = isTop3StillPlausible(current, prediction.topScores.map((item) => item.score));
  const resultDirectionNow = resultOf(current.home, current.away);
  const predictedDirection = resultOf(predicted.home, predicted.away);
  const status = classifyLiveReviewStatus(minute, top3StillPlausible, resultDirectionNow, predictedDirection);

  return {
    status,
    minute,
    currentScore: `${current.home}-${current.away}`,
    predictedScore: prediction.topScores[0].score,
    expectedScoreByNow: `${expectedHome} : ${expectedAway}`,
    top3StillPlausible,
    resultDirectionNow,
    predictedDirection,
    conclusion: buildLiveConclusion(match, prediction, status, current, predicted),
    reasons: buildLiveReasons(match, prediction, current, predicted, top3StillPlausible),
    optimizationActions: [
      "禁止把赛中比分回填为赛前推算；赛中信息只生成偏差日志，赛后再用90分钟最终结果进入校准样本。",
      "实时比分只用于提示风险变化，不改变赛前冻结的首选比分、前三候选和胜平负概率。",
      "若赛中事件显示早段红牌、连续越位或射门被封堵，赛后只作为下一轮特征权重调整依据。"
    ],
    reviewedAt: new Date().toISOString()
  };
}

function buildConclusion(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  top3ScoreHit: boolean,
  resultHit: boolean
): string {
  const predictedOutcome = resultOf(predicted.home, predicted.away);
  const actualOutcome = resultOf(actual.home, actual.away);
  if (top3ScoreHit) {
    return `推算命中：${evaluationScope}实际比分 ${actual.home}-${actual.away} 进入赛前前三候选；方向为${outcomeLabels[actualOutcome]}，${resultHit ? "方向也命中" : "但方向判断需要复查"}。`;
  }

  return `推算失败：赛前首选 ${prediction.topScores[0].score} 未覆盖${evaluationScope}实际比分 ${actual.home}-${actual.away}；赛前方向为${outcomeLabels[predictedOutcome]}，实际方向为${outcomeLabels[actualOutcome]}。`;
}

function buildMatchSummary(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  flow: MatchFlowSummary,
  context: PredictionEvaluationContext
): string[] {
  const summary = [
    `比赛口径：只复盘${evaluationScope}，不把加时赛和点球大战写入命中率。`,
    `赛前模型：首选 ${prediction.topScores[0].score}，预期进球 ${round2(prediction.expectedHomeGoals)}:${round2(prediction.expectedAwayGoals)}，风格为${formatGameStyle(prediction.gameStyle)}，冷门风险为${formatUpsetRisk(prediction.upsetRisk)}。`,
    `实际结果：${match.homeTeam.name} ${actual.home}-${actual.away} ${match.awayTeam.name}，与首选比分的主队偏差 ${signed(actual.home - predicted.home)} 球，客队偏差 ${signed(actual.away - predicted.away)} 球。`
  ];

  if (context.stats) {
    summary.push(`技术统计：${formatStatsLine(match.homeTeam.name, context.stats.home)}；${formatStatsLine(match.awayTeam.name, context.stats.away)}。`);
  }

  if (flow.events.length > 0) {
    summary.push(`事件链概览：共 ${flow.events.length} 条真实事件；${formatTeamFlow(flow.home)}；${formatTeamFlow(flow.away)}。`);
    summary.push(`关键节点：${flow.keyMoments.length ? flow.keyMoments.slice(0, 6).join("；") : "数据源未返回可解释的关键节点" }。`);
  }

  return summary;
}

function buildFailureBreakdown(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  flow: MatchFlowSummary,
  context: PredictionEvaluationContext
): PredictionFailureBreakdown[] {
  const systematicBreakdown = buildSystematicPatternBreakdown(match, prediction, predicted, actual);
  const breakdown: PredictionFailureBreakdown[] = [
    ...(systematicBreakdown ? [systematicBreakdown] : []),
    buildScoreScriptBreakdown(match, prediction, predicted, actual)
  ];

  const eventBreakdown = buildEventChainBreakdown(match, predicted, actual, flow);
  if (eventBreakdown) breakdown.push(eventBreakdown);

  const statsBreakdown = buildStatsBreakdown(match, prediction, predicted, actual, context);
  if (statsBreakdown) breakdown.push(statsBreakdown);

  if (resultOf(predicted.home, predicted.away) !== resultOf(actual.home, actual.away)) {
    breakdown.push(buildDirectionBreakdown(match, prediction, predicted, actual));
  }

  const totalGoalBreakdown = buildTotalGoalBreakdown(match, prediction, predicted, actual, context);
  if (totalGoalBreakdown) breakdown.push(totalGoalBreakdown);

  if (prediction.upsetRisk !== "low") {
    breakdown.push({
      title: "冷门风险处理不足",
      detail: "赛前已经标记冷门风险，但前三候选仍然过度集中在常规强弱方向。",
      evidence: [
        `冷门风险等级：${formatUpsetRisk(prediction.upsetRisk)}。`,
        "下一轮需要把弱势方90分钟不败、小比分和平局路径提升到更高候选层级，而不是只显示风险标签。"
      ]
    });
  }

  return breakdown.slice(0, 6);
}

function buildSystematicPatternBreakdown(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore
): PredictionFailureBreakdown | undefined {
  const predictedOutcome = resultOf(predicted.home, predicted.away);
  const actualOutcome = resultOf(actual.home, actual.away);
  const probabilityLeader = strongestProbabilityDirection(prediction);
  const predictedTotal = predicted.home + predicted.away;
  const actualTotal = actual.home + actual.away;
  const strengthGap = match.homeTeam.fifaRating - match.awayTeam.fifaRating;

  if (predictedOutcome === "draw" && actualOutcome !== "draw") {
    return {
      title: "平局锚定过强",
      detail:
        "首选比分落在平局，但真实结果被一方打穿；说明淘汰赛低比分先验和1-1集中度压过了强弱差、客胜概率或临场进攻波动。",
      evidence: [
        `首选比分 ${predicted.home}-${predicted.away}，实际比分 ${actual.home}-${actual.away}。`,
        `胜平负概率：主胜 ${formatPercent(prediction.homeWinProb)}，平局 ${formatPercent(prediction.drawProb)}，客胜 ${formatPercent(prediction.awayWinProb)}。`,
        `概率最高方向为${outcomeLabels[probabilityLeader]}，但精确比分首选为${outcomeLabels[predictedOutcome]}。`
      ]
    };
  }

  if (actualOutcome === "away" && predictedOutcome !== "away" && prediction.awayWinProb >= Math.max(prediction.homeWinProb, prediction.drawProb) - 0.03) {
    return {
      title: "客胜未进入比分首选",
      detail:
        "客胜概率已经接近或领先，但Top比分仍被平局/主胜脚本占住；说明胜平负概率没有充分传导到泊松比分矩阵。",
      evidence: [
        `客胜概率 ${formatPercent(prediction.awayWinProb)}，首选比分 ${predicted.home}-${predicted.away}，实际客队进 ${actual.away} 球。`,
        "后续需要保证客胜占优时，Top3至少覆盖一个客胜比分路径，并降低1-1对强客队场景的吸附。"
      ]
    };
  }

  if (predictedOutcome === actualOutcome && prediction.topScores.every((score) => score.score !== `${actual.home}-${actual.away}`)) {
    return {
      title: "方向层与比分层脱节",
      detail:
        "胜平负方向判断正确，但实际比分没有进入前三候选；说明模型会判断哪边更可能赢，却没有把进球数分布校准到同一层。",
      evidence: [
        `方向同为${outcomeLabels[actualOutcome]}，首选比分 ${predicted.home}-${predicted.away}，实际比分 ${actual.home}-${actual.away}。`,
        `预期进球 ${round2(prediction.expectedHomeGoals)}:${round2(prediction.expectedAwayGoals)}，实际总进球 ${actualTotal}。`
      ]
    };
  }

  if (
    ((strengthGap >= 6 && predictedOutcome === "home") || (strengthGap <= -6 && predictedOutcome === "away")) &&
    predictedOutcome !== actualOutcome
  ) {
    return {
      title: "强弱评分过拟合",
      detail:
        "模型过度相信纸面强队方向，弱势方进球兑现和淘汰赛波动没有被抬到足够权重，导致热门方向被打穿。",
      evidence: [
        `FIFA评分差 ${signed(strengthGap)}，首选方向为${outcomeLabels[predictedOutcome]}，实际为${outcomeLabels[actualOutcome]}。`,
        "下一轮应降低单一强弱评分权重，提高近期状态、真实首发、定位球和反击效率对比分矩阵的约束。"
      ]
    };
  }

  if (Math.abs(actualTotal - predictedTotal) >= 2) {
    return {
      title: "总进球温度偏移",
      detail:
        actualTotal > predictedTotal
          ? "真实比赛比首选脚本更开放，模型低估了转换速度、定位球或防线波动。"
          : "真实比赛比首选脚本更收缩，模型高估了进攻输出或射门质量。",
      evidence: [
        `首选总进球 ${predictedTotal}，实际总进球 ${actualTotal}。`,
        "总进球偏移需要单独校准，不能只靠胜平负方向修正。"
      ]
    };
  }

  return undefined;
}

function buildScoreScriptBreakdown(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore
): PredictionFailureBreakdown {
  const homeDiff = actual.home - predicted.home;
  const awayDiff = actual.away - predicted.away;
  const totalDiff = actual.home + actual.away - predicted.home - predicted.away;

  return {
    title: "比分脚本偏差",
    detail: `首选 ${prediction.topScores[0].score} 与实际 ${actual.home}-${actual.away} 偏差 ${Math.abs(homeDiff) + Math.abs(awayDiff)} 球，说明赛前对双方进球兑现路径估计不准。`,
    evidence: [
      `${match.homeTeam.name}实际进球比首选${homeDiff >= 0 ? "多" : "少"} ${Math.abs(homeDiff)} 球。`,
      `${match.awayTeam.name}实际进球比首选${awayDiff >= 0 ? "多" : "少"} ${Math.abs(awayDiff)} 球。`,
      `总进球相对首选${totalDiff >= 0 ? "增加" : "减少"} ${Math.abs(totalDiff)} 球。`
    ]
  };
}

function buildEventChainBreakdown(
  match: Match,
  predicted: ParsedScore,
  actual: ParsedScore,
  flow: MatchFlowSummary
): PredictionFailureBreakdown | undefined {
  if (flow.events.length === 0) {
    return undefined;
  }

  const expectedSide = pickOverestimatedSide(match, predicted, actual);
  const expectedFlow = expectedSide === "home" ? flow.home : flow.away;
  const expectedTeamName = expectedFlow.team;
  const opponentFlow = expectedSide === "home" ? flow.away : flow.home;
  const stalledEvents = [
    ...expectedFlow.offsides.slice(0, 3),
    ...expectedFlow.blockedShots.slice(0, 3),
    ...expectedFlow.corners.slice(0, 2),
    ...expectedFlow.fouls.slice(0, 2)
  ].sort((a, b) => a.minute - b.minute);
  const scoringEvents = [...flow.home.goals, ...flow.away.goals, ...flow.home.penalties, ...flow.away.penalties].sort(
    (a, b) => a.minute - b.minute
  );

  const evidence = [
    ...scoringEvents.slice(0, 5).map((event) => keyEventEvidence(event)),
    ...stalledEvents.slice(0, 5).map((event) => keyEventEvidence(event))
  ];

  return {
    title: "事件链根因",
    detail: buildEventChainDiagnosis(expectedSide, expectedFlow, opponentFlow, predicted, actual, evidence.length > 0),
    evidence:
      evidence.length > 0
        ? [
            ...buildEventPeriodEvidence(flow, expectedFlow.team),
            ...evidence
          ]
        : ["事件源缺少可解释字段，无法继续拆解具体回合。"]
  };
}

function buildStatsBreakdown(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  context: PredictionEvaluationContext
): PredictionFailureBreakdown | undefined {
  if (!context.stats) {
    return undefined;
  }

  const { home, away } = context.stats;
  const homeConversion = ratio(actual.home, home.shotsOnTarget);
  const awayConversion = ratio(actual.away, away.shotsOnTarget);
  const predictedHomeShare = ratio(prediction.expectedHomeGoals, prediction.expectedHomeGoals + prediction.expectedAwayGoals);
  const actualHomeShotShare = ratio(home.shotsOnTarget, home.shotsOnTarget + away.shotsOnTarget);
  const shotGap = home.shotsOnTarget - away.shotsOnTarget;
  const statDiagnosis = buildStatsDiagnosis(match, prediction, predicted, actual, home, away);
  const xgLine =
    home.xg !== null && away.xg !== null
      ? `xG为 ${round2(home.xg)}:${round2(away.xg)}，与实际进球差为 ${signed(actual.home - home.xg)}:${signed(actual.away - away.xg)}。`
      : "数据源未返回xG，无法判断射门质量与进球兑现差异。";

  return {
    title: "技术统计根因",
    detail: statDiagnosis,
    evidence: [
      `${match.homeTeam.name}射门/射正 ${home.shots}/${home.shotsOnTarget}，转换率 ${formatPercent(homeConversion)}；${match.awayTeam.name}射门/射正 ${away.shots}/${away.shotsOnTarget}，转换率 ${formatPercent(awayConversion)}。`,
      `赛前预期主队进球占比 ${formatPercent(predictedHomeShare)}，实际射正占比 ${formatPercent(actualHomeShotShare)}，射正差 ${signed(shotGap)}。`,
      `${match.homeTeam.name}角球/犯规 ${home.corners}/${home.fouls}，${match.awayTeam.name}角球/犯规 ${away.corners}/${away.fouls}，这会影响定位球和比赛中断节奏。`,
      xgLine,
      ...buildStatsEvidence(match, home, away, actual),
      `实际比分为 ${actual.home}-${actual.away}，首选为 ${predicted.home}-${predicted.away}。`
    ]
  };
}

function pickOverestimatedSide(
  match: Match,
  predicted: ParsedScore,
  actual: ParsedScore
): TeamSide {
  const homeOver = predicted.home - actual.home;
  const awayOver = predicted.away - actual.away;
  if (homeOver > 0 || awayOver > 0) {
    return homeOver >= awayOver ? "home" : "away";
  }

  const predictedWinner = resultOf(predicted.home, predicted.away);
  if (predictedWinner === "home") return "home";
  if (predictedWinner === "away") return "away";

  const actualWinner = resultOf(actual.home, actual.away);
  if (actualWinner === "home") return "away";
  if (actualWinner === "away") return "home";

  return match.homeTeam.fifaRating >= match.awayTeam.fifaRating ? "home" : "away";
}

function buildEventChainDiagnosis(
  expectedSide: TeamSide,
  expectedFlow: TeamFlowSummary,
  opponentFlow: TeamFlowSummary,
  predicted: ParsedScore,
  actual: ParsedScore,
  hasEvidence: boolean
): string {
  if (!hasEvidence) {
    return "数据源返回了事件数量，但缺少可解释的球员、类型或描述字段；系统不会用空字段编造原因。";
  }

  const expectedGoals = expectedSide === "home" ? predicted.home : predicted.away;
  const actualGoals = expectedFlow.goals.length + expectedFlow.penalties.length;
  const opponentGoals = opponentFlow.goals.length + opponentFlow.penalties.length;
  const stalledCount = expectedFlow.offsides.length + expectedFlow.blockedShots.length;
  const pressureCount = expectedFlow.corners.length + expectedFlow.shots.length;
  const fragments: string[] = [];

  fragments.push(
    `${expectedFlow.team}是本次复盘里被模型高估的一方，赛前脚本给到 ${expectedGoals} 球，90分钟真实事件中兑现 ${actualGoals} 球；下面按时间线、推进中断和机会转化拆开看。`
  );

  if (stalledCount > 0) {
    fragments.push(
      `${expectedFlow.team}出现 ${expectedFlow.offsides.length} 次越位和 ${expectedFlow.blockedShots.length} 次封堵，说明推进能到危险区，但传跑时机或最后一脚被对方防线切断。`
    );
  }

  if (expectedFlow.corners.length > 0) {
    fragments.push(
      `${expectedFlow.team}获得 ${expectedFlow.corners.length} 次角球，代表边路和定位球有压力；若没有同步转化为进球，核心问题通常是二点球、落点争抢或禁区内射正质量不足。`
    );
  }

  if (expectedFlow.fouls.length + expectedFlow.cards.length >= 4) {
    fragments.push(
      `${expectedFlow.team}犯规和牌数事件较多，比赛被切碎后连续进攻节奏下降，赛前按稳定压制推算的进球路径会被削弱。`
    );
  }

  if (opponentGoals > 0) {
    fragments.push(
      `${opponentFlow.team}实际打进 ${opponentGoals} 球，说明弱势方或非首选方向至少兑现了一次关键转换机会，模型需要提高反击、定位球和单次高质量机会的权重。`
    );
  }

  if (pressureCount > 0 && actualGoals < expectedGoals) {
    fragments.push(
      `${expectedFlow.team}事件压力存在，但实际进球少于赛前脚本，失败不是“没有进攻”，而是进攻从事件数量到有效射正、再到进球的转化链条断开。`
    );
  }

  if (actual.home + actual.away !== predicted.home + predicted.away) {
    fragments.push(
      `总进球从赛前首选 ${predicted.home + predicted.away} 球变成 ${actual.home + actual.away} 球，说明比赛节奏与赛前脚本不同，需要按时间段重估开放度。`
    );
  }

  return fragments.length > 0
    ? fragments.join(" ")
    : "事件时间线没有明显单一事故，偏差更可能来自双方机会质量、射正转化和比赛节奏的组合误差。";
}

function buildEventPeriodEvidence(flow: MatchFlowSummary, expectedTeamName: string): string[] {
  const early = countPeriodEvents(flow.events, 0, 30);
  const middle = countPeriodEvents(flow.events, 31, 60);
  const late = countPeriodEvents(flow.events, 61, 120);
  const expectedEvents = flow.events.filter((event) => sameTeam(event.team, expectedTeamName)).length;
  const opponentEvents = flow.events.length - expectedEvents;

  return [
    `事件时间段：前30分钟 ${early} 条，31-60分钟 ${middle} 条，61分钟后 ${late} 条；用于判断比赛是早段被打乱、下半场失控，还是常规节奏偏差。`,
    `事件归属：${expectedTeamName}相关事件 ${expectedEvents} 条，对手相关事件 ${opponentEvents} 条；用来区分“有场面但没兑现”和“对手关键效率更高”。`
  ];
}

function countPeriodEvents(events: MatchEvent[], start: number, end: number): number {
  return events.filter((event) => event.minute >= start && event.minute <= end).length;
}

function buildStatsDiagnosis(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  home: TeamRecordTeamStats,
  away: TeamRecordTeamStats
): string {
  const homeOver = predicted.home - actual.home;
  const awayOver = predicted.away - actual.away;
  const overSide = homeOver >= awayOver ? "home" : "away";
  const overTeam = overSide === "home" ? match.homeTeam.name : match.awayTeam.name;
  const overStats = overSide === "home" ? home : away;
  const otherTeam = overSide === "home" ? match.awayTeam.name : match.homeTeam.name;
  const otherStats = overSide === "home" ? away : home;
  const overActualGoals = overSide === "home" ? actual.home : actual.away;
  const otherActualGoals = overSide === "home" ? actual.away : actual.home;
  const overConversion = ratio(overActualGoals, overStats.shotsOnTarget);
  const otherConversion = ratio(otherActualGoals, otherStats.shotsOnTarget);
  const fragments: string[] = [];

  if (overStats.possession >= otherStats.possession + 8 && overStats.shotsOnTarget <= otherStats.shotsOnTarget) {
    fragments.push(
      `${overTeam}控球占优但射正没有占优，说明球权更多停留在安全区域或外围推进，不能直接等同于高质量进球机会。`
    );
  }

  if (overStats.shots >= 10 && overStats.shotsOnTarget <= 3) {
    fragments.push(
      `${overTeam}射门不少但射正偏低，核心不是“射门低”，而是被迫在低角度、远射或防守干扰下完成终结，机会质量低于模型赛前估计。`
    );
  }

  if (overStats.corners >= otherStats.corners + 3 && overActualGoals <= 1) {
    fragments.push(
      `${overTeam}角球压力没有转化成进球，说明定位球落点、二点保护或禁区抢点效率不足，模型不能只按角球数量抬高比分。`
    );
  }

  if (otherConversion >= overConversion + 0.2 && otherStats.shotsOnTarget > 0) {
    fragments.push(
      `${otherTeam}射正转化率更高，说明对手机会更集中或临门质量更好；赛前模型低估了这种少量但高价值的转换进攻。`
    );
  }

  if (overStats.fouls + overStats.yellowCards + overStats.redCards >= otherStats.fouls + otherStats.yellowCards + otherStats.redCards + 4) {
    fragments.push(
      `${overTeam}犯规和牌数压力更高，比赛节奏被中断，连续压迫难以形成稳定射正链条。`
    );
  }

  if (home.xg !== null && away.xg !== null) {
    const overXg = overSide === "home" ? home.xg : away.xg;
    if (overXg - overActualGoals >= 0.7) {
      fragments.push(
        `${overTeam}实际进球明显低于xG，主要偏差来自终结效率或门将/封堵质量，而不是单纯攻势不足。`
      );
    }
  }

  if (fragments.length === 0) {
    const predictedHomeShare = ratio(prediction.expectedHomeGoals, prediction.expectedHomeGoals + prediction.expectedAwayGoals);
    const actualHomeShotShare = ratio(home.shotsOnTarget, home.shotsOnTarget + away.shotsOnTarget);
    fragments.push(
      `赛前主队进球占比 ${formatPercent(predictedHomeShare)}，真实射正占比 ${formatPercent(actualHomeShotShare)}；偏差来自射正质量、转换率、定位球和比赛中断的综合作用。`
    );
  }

  return fragments.join(" ");
}

function buildStatsEvidence(
  match: Match,
  home: TeamRecordTeamStats,
  away: TeamRecordTeamStats,
  actual: ParsedScore
): string[] {
  const evidence = [
    `射正转化：${match.homeTeam.name} ${home.shotsOnTarget} 次射正进 ${actual.home} 球，${match.awayTeam.name} ${away.shotsOnTarget} 次射正进 ${actual.away} 球。`,
    `定位球压力：${match.homeTeam.name} ${home.corners} 个角球，${match.awayTeam.name} ${away.corners} 个角球；角球只代表压力，不等于稳定进球。`,
    `比赛中断：${match.homeTeam.name}犯规/黄红牌 ${home.fouls}/${home.yellowCards + home.redCards}，${match.awayTeam.name}犯规/黄红牌 ${away.fouls}/${away.yellowCards + away.redCards}。`
  ];

  if (home.xg !== null && away.xg !== null) {
    evidence.push(
      `机会质量：${match.homeTeam.name} xG ${round2(home.xg)} 对实际 ${actual.home} 球，${match.awayTeam.name} xG ${round2(away.xg)} 对实际 ${actual.away} 球。`
    );
  }

  return evidence;
}

function buildDirectionBreakdown(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore
): PredictionFailureBreakdown {
  const predictedDirection = resultOf(predicted.home, predicted.away);
  const actualDirection = resultOf(actual.home, actual.away);

  return {
    title: "胜平负方向误判",
    detail: `赛前方向偏向${outcomeLabels[predictedDirection]}，实际为${outcomeLabels[actualDirection]}，说明强弱权重或平局保护不足。`,
    evidence: [
      `胜平负概率：主胜 ${formatPercent(prediction.homeWinProb)}，平局 ${formatPercent(prediction.drawProb)}，客胜 ${formatPercent(prediction.awayWinProb)}。`,
      `球队评分：${match.homeTeam.name} FIFA ${match.homeTeam.fifaRating}，${match.awayTeam.name} FIFA ${match.awayTeam.fifaRating}。`,
      "下一轮需要降低单一强弱评分权重，提高近期状态、真实首发、淘汰赛谨慎度和市场概率的共同约束。"
    ]
  };
}

function buildTotalGoalBreakdown(
  match: Match,
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  context: PredictionEvaluationContext
): PredictionFailureBreakdown | undefined {
  const predictedTotal = predicted.home + predicted.away;
  const actualTotal = actual.home + actual.away;
  if (Math.abs(predictedTotal - actualTotal) < 2) {
    return undefined;
  }

  return {
    title: "总进球节奏误判",
    detail:
      actualTotal > predictedTotal
        ? "实际比赛更开放，模型低估了转换速度、定位球或防线波动。"
        : "实际比赛更收缩，模型高估了进攻输出、射门质量或淘汰赛谨慎程度。",
    evidence: [
      `预期进球为 ${round2(prediction.expectedHomeGoals)}:${round2(prediction.expectedAwayGoals)}，首选总进球 ${predictedTotal}，实际总进球 ${actualTotal}。`,
      context.stats
        ? `真实射门合计 ${context.stats.home.shots + context.stats.away.shots}，射正合计 ${
            context.stats.home.shotsOnTarget + context.stats.away.shotsOnTarget
          }。`
        : "缺少真实射门/xG统计，当前只能从比分和事件链判断节奏。"
    ]
  };
}

function buildDataGaps(context: PredictionEvaluationContext, flow: MatchFlowSummary): string[] {
  const gaps: string[] = [];
  if (!context.stats) {
    gaps.push("缺少真实技术统计：无法量化控球率、射门、射正、xG、角球、犯规和牌数对失败的贡献。");
  } else if (context.stats.home.xg === null || context.stats.away.xg === null) {
    gaps.push("缺少xG字段：可以复盘射门数量，但无法判断机会质量。");
  }

  if (flow.events.length === 0) {
    gaps.push("缺少真实事件时间线：无法定位进球、越位、封堵、角球、犯规和换人的具体分钟。");
  }

  if (!context.sourceLabel) {
    gaps.push("缺少复盘数据源标签：无法向用户说明本次赛后复盘来自哪个外部或本地数据源。");
  }

  return gaps;
}

function buildLearningActions(
  prediction: Prediction,
  predicted: ParsedScore,
  actual: ParsedScore,
  flow: MatchFlowSummary,
  context: PredictionEvaluationContext,
  status: PredictionEvaluation["status"]
): string[] {
  const actions = [
    "继续冻结赛前推算快照：赛中比分、赛后结果只进入复盘和下一轮训练样本，禁止回填修改已发布预测。",
    "只把90分钟比分写入命中率；加时赛和点球大战单独保存为备注，不参与胜平负和比分命中统计。"
  ];

  if (status === "failed") {
    actions.push("把比分脚本偏差写入误差样本，分别记录主队进球偏差、客队进球偏差和总进球偏差。");
  }

  if (flow.events.length > 0) {
    actions.push("新增事件链特征：早段越位、连续封堵、角球转化、犯规中断和关键进球分钟将进入下一轮校准。");
  }

  if (context.stats) {
    actions.push("新增技术统计校准：用射正占比、射门转化率、角球压力、犯规中断和xG偏差修正Poisson进球均值。");
  }

  if (Math.abs(predicted.home + predicted.away - actual.home - actual.away) >= 2) {
    actions.push("总进球偏差超过2球时，自动降低同类比赛的大比分或低比分权重，避免连续在同一节奏上犯错。");
  }

  if (prediction.upsetRisk !== "low") {
    actions.push("冷门风险为中/高时，不只显示风险提示，还要把弱势方不败、小比分和平局路径抬入候选排序。");
  }

  return actions;
}

function buildLiveConclusion(
  match: Match,
  prediction: Prediction,
  status: PredictionLiveReviewStatus,
  current: ParsedScore,
  predicted: ParsedScore
): string {
  const label =
    status === "off_track"
      ? "已经明显偏离"
      : status === "drifting"
        ? "正在偏离"
        : status === "tracking"
          ? "仍在跟踪"
          : "等待更多样本";

  return `${match.homeTeam.name} 对 ${match.awayTeam.name} 当前 ${current.home}-${current.away}，赛前首选 ${predicted.home}-${predicted.away} ${label}；此结论只用于赛中偏差监控，不改写赛前推算。`;
}

function buildLiveReasons(
  match: Match,
  prediction: Prediction,
  current: ParsedScore,
  predicted: ParsedScore,
  top3StillPlausible: boolean
): string[] {
  return [
    `当前比分 ${current.home}-${current.away}，赛前首选 ${predicted.home}-${predicted.away}。`,
    `前三候选${top3StillPlausible ? "仍可覆盖当前比分路径" : "已经无法覆盖当前比分路径"}。`,
    `赛前预期进球 ${round2(prediction.expectedHomeGoals)}:${round2(prediction.expectedAwayGoals)}，比赛双方为 ${match.homeTeam.name} 和 ${match.awayTeam.name}。`
  ];
}

function buildMatchFlow(match: Match, events: MatchEvent[]): MatchFlowSummary {
  const sorted = [...events]
    .filter((event) => Number.isFinite(event.minute) && event.minute >= 0 && event.minute <= 120)
    .sort((a, b) => a.minute - b.minute || a.id - b.id);

  return {
    events: sorted,
    home: buildTeamFlow(match.homeTeam.name, sorted),
    away: buildTeamFlow(match.awayTeam.name, sorted),
    keyMoments: sorted
      .filter((event) =>
        ["goal", "penalty", "red_card", "var_review", "offside", "corner", "shot_blocked", "shot_on_target"].includes(event.type)
      )
      .slice(0, 10)
      .map((event) => keyEventEvidence(event))
  };
}

function buildTeamFlow(teamName: string, events: MatchEvent[]): TeamFlowSummary {
  const teamEvents = events.filter((event) => sameTeam(event.team, teamName));
  return {
    team: teamName,
    goals: teamEvents.filter((event) => event.type === "goal"),
    penalties: teamEvents.filter((event) => event.type === "penalty"),
    shots: teamEvents.filter((event) => ["shot_on_target", "shot_off_target", "shot_blocked"].includes(event.type)),
    blockedShots: teamEvents.filter((event) => event.type === "shot_blocked"),
    corners: teamEvents.filter((event) => event.type === "corner"),
    offsides: teamEvents.filter((event) => event.type === "offside"),
    fouls: teamEvents.filter((event) => event.type === "foul"),
    cards: teamEvents.filter((event) => event.type === "yellow_card" || event.type === "red_card"),
    substitutions: teamEvents.filter((event) => event.type === "substitution")
  };
}

function keyEventEvidence(event: MatchEvent): string {
  const player = eventPlayer(event);
  const description = event.description?.trim();
  return `${formatEventMinute(event.minute)} ${eventLabels[event.type]}：${event.team}${player ? `，关联球员 ${player}` : ""}${
    description ? `，细节：${description}` : ""
  }`;
}

function formatTeamFlow(flow: TeamFlowSummary): string {
  return `${flow.team}进球 ${flow.goals.length}，射门事件 ${flow.shots.length}，封堵 ${flow.blockedShots.length}，越位 ${flow.offsides.length}，角球 ${flow.corners.length}，犯规 ${flow.fouls.length}，牌 ${flow.cards.length}`;
}

function formatStatsLine(team: string, stats: TeamRecordTeamStats): string {
  return `${team}控球 ${formatStatPercent(stats.possession)}，射门/射正 ${stats.shots}/${stats.shotsOnTarget}，角球 ${stats.corners}，犯规 ${stats.fouls}，黄/红牌 ${stats.yellowCards}/${stats.redCards}，xG ${
    stats.xg === null ? "未返回" : round2(stats.xg)
  }`;
}

function formatStatPercent(value: number): string {
  return value <= 1 ? formatPercent(value) : `${round2(value)}%`;
}

function formatEventMinute(minute: number): string {
  if (minute > 90) return `90+${minute - 90}分`;
  return `${minute}分`;
}

function eventPlayer(event: MatchEvent): string {
  const player = event.player?.trim();
  if (!player || player === "-" || player === "未知球员" || player === "未接入中文名") {
    return "";
  }
  return player;
}

function isTop3StillPlausible(current: ParsedScore, topScores: string[]): boolean {
  return topScores.some((score) => {
    const parsed = parseScore(score);
    return parsed ? parsed.home >= current.home && parsed.away >= current.away : false;
  });
}

function classifyLiveReviewStatus(
  minute: number,
  top3StillPlausible: boolean,
  resultDirectionNow: Outcome,
  predictedDirection: Outcome
): PredictionLiveReviewStatus {
  if (minute < 15) return "pending";
  if (!top3StillPlausible && minute >= 60) return "off_track";
  if (resultDirectionNow !== predictedDirection && minute >= 45) return "drifting";
  return "tracking";
}

function resultOf(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function parseScore(score: string | undefined): ParsedScore | null {
  if (!score) return null;
  const match = score.trim().match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    home: Number.parseInt(match[1], 10),
    away: Number.parseInt(match[2], 10)
  };
}

function sameTeam(left: string, right: string): boolean {
  return normalizeTeamKey(left) === normalizeTeamKey(right);
}

function normalizeTeamKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function ratio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatGameStyle(value: Prediction["gameStyle"]): string {
  if (value === "defensive") return "防守型";
  if (value === "open") return "开放型";
  return "平衡型";
}

function formatUpsetRisk(value: Prediction["upsetRisk"]): string {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  return "低";
}

function strongestProbabilityDirection(prediction: Prediction): Outcome {
  const entries: Array<[Outcome, number]> = [
    ["home", prediction.homeWinProb],
    ["draw", prediction.drawProb],
    ["away", prediction.awayWinProb]
  ];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function signed(value: number): string {
  const rounded = round2(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

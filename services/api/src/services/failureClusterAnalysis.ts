import type { Match, Prediction } from "../models.js";
import { teamStrength } from "./predictionService.js";

type Outcome = "home" | "draw" | "away";
type ClusterKey =
  | "draw_anchor"
  | "away_breakthrough"
  | "score_outcome_decoupling"
  | "favorite_overfit"
  | "total_goals_underestimated"
  | "total_goals_overestimated"
  | "data_gap";

interface ParsedScore {
  home: number;
  away: number;
}

interface ClusterDefinition {
  key: ClusterKey;
  label: string;
  detail: string;
}

export interface FailureClusterTag extends ClusterDefinition {
  count: number;
  severity: "high" | "medium" | "low";
  matchIds: string[];
}

export interface FailureClusterMatch {
  id: string;
  title: string;
  kickoffTime: string;
  actualScore: string;
  predictedScore: string;
  resultHit: boolean;
  top3ScoreHit: boolean;
  tags: Array<{
    key: ClusterKey;
    label: string;
  }>;
}

export interface FailureClusterAnalysis {
  inspectedFailureCount: number;
  recentFinishedWindowCount: number;
  summary: string;
  tags: FailureClusterTag[];
  matches: FailureClusterMatch[];
  recommendedActions: string[];
}

const DEFAULT_FAILURE_LIMIT = 8;

const CLUSTERS: Record<ClusterKey, ClusterDefinition> = {
  draw_anchor: {
    key: "draw_anchor",
    label: "平局/低比分锚定过强",
    detail: "Top比分被1-1、低比分平局吸住，但真实比赛被一方打穿。"
  },
  away_breakthrough: {
    key: "away_breakthrough",
    label: "客胜打穿未进首选",
    detail: "客队真实赢球，模型没有把客胜路径抬到足够靠前。"
  },
  score_outcome_decoupling: {
    key: "score_outcome_decoupling",
    label: "胜平负层和比分层脱节",
    detail: "方向概率或方向判断可用，但具体比分Top3没有覆盖真实比分。"
  },
  favorite_overfit: {
    key: "favorite_overfit",
    label: "强弱评分过拟合",
    detail: "纸面强队权重过高，低估了淘汰赛波动、反击和定位球。"
  },
  total_goals_underestimated: {
    key: "total_goals_underestimated",
    label: "总进球被低估",
    detail: "真实比赛更开放，实际总进球明显高于首选脚本。"
  },
  total_goals_overestimated: {
    key: "total_goals_overestimated",
    label: "总进球被高估",
    detail: "真实比赛更收缩，实际总进球明显低于首选脚本。"
  },
  data_gap: {
    key: "data_gap",
    label: "真实首发/技术统计缺口",
    detail: "复盘缺少完整事件链、首发或技术统计，无法解释临场转化差异。"
  }
};

export function buildFailureClusterAnalysis(
  matches: Match[],
  causalSampleIds?: Set<string>,
  failureLimit = DEFAULT_FAILURE_LIMIT
): FailureClusterAnalysis {
  const finishedWindow = matches
    .filter((match) => match.status === "finished" && match.minute < 120 && match.prediction?.evaluation)
    .filter((match) => !causalSampleIds || causalSampleIds.has(match.id))
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const failedMatches = finishedWindow
    .filter((match) => match.prediction?.evaluation?.status === "failed")
    .slice(0, failureLimit);
  const tagCounts = new Map<ClusterKey, FailureClusterTag>();
  const matchAnalyses = failedMatches.map((match) => {
    const tags = classifyFailure(match);
    for (const tag of tags) {
      const existing = tagCounts.get(tag.key);
      if (existing) {
        existing.count += 1;
        existing.matchIds.push(match.id);
      } else {
        tagCounts.set(tag.key, {
          ...tag,
          count: 1,
          severity: "low",
          matchIds: [match.id]
        });
      }
    }

    return {
      id: match.id,
      title: `${match.homeTeam.name} 对 ${match.awayTeam.name}`,
      kickoffTime: match.startTime,
      actualScore: match.prediction?.evaluation?.actualScore ?? `${match.homeScore}-${match.awayScore}`,
      predictedScore: match.prediction?.evaluation?.predictedScore ?? match.prediction?.topScores[0]?.score ?? "-",
      resultHit: Boolean(match.prediction?.evaluation?.resultHit),
      top3ScoreHit: Boolean(match.prediction?.evaluation?.top3ScoreHit),
      tags: tags.map((tag) => ({ key: tag.key, label: tag.label }))
    };
  });
  const tags = [...tagCounts.values()]
    .map((tag) => ({ ...tag, severity: severityFor(tag.count, failedMatches.length) }))
    .sort((a, b) => b.count - a.count || severityRank(b.severity) - severityRank(a.severity));

  return {
    inspectedFailureCount: failedMatches.length,
    recentFinishedWindowCount: finishedWindow.length,
    summary: buildSummary(failedMatches.length, tags),
    tags,
    matches: matchAnalyses,
    recommendedActions: buildRecommendedActions(tags)
  };
}

function classifyFailure(match: Match): ClusterDefinition[] {
  const prediction = match.prediction;
  if (!prediction) return [];

  const predicted = parseScore(prediction.evaluation?.predictedScore ?? prediction.topScores[0]?.score);
  const actual = parseScore(prediction.evaluation?.actualScore ?? `${match.homeScore}-${match.awayScore}`);
  if (!predicted || !actual) return [CLUSTERS.data_gap];

  const tags: ClusterDefinition[] = [];
  const predictedOutcome = resultOf(predicted.home, predicted.away);
  const actualOutcome = resultOf(actual.home, actual.away);
  const leader = probabilityLeader(prediction);
  const predictedTotal = predicted.home + predicted.away;
  const actualTotal = actual.home + actual.away;
  const actualScore = `${actual.home}-${actual.away}`;

  if (predictedOutcome === "draw" && actualOutcome !== "draw") {
    tags.push(CLUSTERS.draw_anchor);
  }

  if (actualOutcome === "away" && predictedOutcome !== "away") {
    tags.push(CLUSTERS.away_breakthrough);
  }

  if (
    (prediction.evaluation?.resultHit && !prediction.evaluation.top3ScoreHit) ||
    (leader !== predictedOutcome && probabilityFor(prediction, leader) >= 0.4) ||
    !prediction.topScores.slice(0, 3).some((score) => score.score === actualScore)
  ) {
    tags.push(CLUSTERS.score_outcome_decoupling);
  }

  if (predictedOutcome !== actualOutcome && predictedOutcome === strongerSide(match)) {
    tags.push(CLUSTERS.favorite_overfit);
  }

  if (actualTotal - predictedTotal >= 2) {
    tags.push(CLUSTERS.total_goals_underestimated);
  } else if (predictedTotal - actualTotal >= 2) {
    tags.push(CLUSTERS.total_goals_overestimated);
  }

  if (prediction.evaluation?.dataGaps?.length) {
    tags.push(CLUSTERS.data_gap);
  }

  return uniqueByKey(tags.length ? tags : [CLUSTERS.score_outcome_decoupling]);
}

function buildSummary(failedCount: number, tags: FailureClusterTag[]): string {
  if (failedCount === 0) {
    return "最近窗口没有可归因的失败样本；继续用冻结赛前快照监控，不回填已结束比赛。";
  }

  const top = tags.slice(0, 3).map((tag) => `${tag.label} ${tag.count} 场`);
  return `最近 ${failedCount} 个失败样本已经归成同一误差簇：${top.join("，")}。核心问题不是赛程日期，而是低比分/平局先验、客胜路径传导和比分矩阵校准没有跟上真实淘汰赛节奏；这些只用于未来模型权重，不覆盖已发布预测。`;
}

function buildRecommendedActions(tags: FailureClusterTag[]): string[] {
  const keys = new Set(tags.map((tag) => tag.key));
  const actions: string[] = [];

  if (keys.has("draw_anchor")) {
    actions.push("淘汰赛阶段降低1-1和平局吸附；当强弱差或客胜概率领先时，不允许平局比分长期占据首选。");
  }

  if (keys.has("away_breakthrough") || keys.has("score_outcome_decoupling")) {
    actions.push("把胜平负概率强制传导到精确比分矩阵：客胜占优时，Top3必须保留至少一个客胜比分路径。");
  }

  if (keys.has("total_goals_underestimated") || keys.has("total_goals_overestimated")) {
    actions.push("把总进球温度从胜平负方向中拆出来单独校准，按开放/收缩两类样本分别调整Poisson lambda。");
  }

  if (keys.has("favorite_overfit")) {
    actions.push("降低单一FIFA评分和纸面强队权重，提高真实首发、近期状态、定位球、反击效率和市场概率的约束。");
  }

  if (keys.has("data_gap")) {
    actions.push("自动补拉官方/准官方首发、技术统计和事件链；缺失时降低模型置信度并显示数据缺口。");
  }

  return actions.length
    ? actions
    : ["继续冻结赛前快照，只把赛后结果写入复盘样本和下一轮权重校准。"];
}

function severityFor(count: number, failedCount: number): FailureClusterTag["severity"] {
  if (failedCount > 0 && count / failedCount >= 0.5) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function severityRank(severity: FailureClusterTag["severity"]): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function strongerSide(match: Match): Outcome {
  const gap = teamStrength(match.homeTeam) - teamStrength(match.awayTeam);
  if (Math.abs(gap) < 2.5) return "draw";
  return gap > 0 ? "home" : "away";
}

function probabilityLeader(prediction: Prediction): Outcome {
  const entries: Array<[Outcome, number]> = [
    ["home", prediction.homeWinProb],
    ["draw", prediction.drawProb],
    ["away", prediction.awayWinProb]
  ];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function probabilityFor(prediction: Prediction, outcome: Outcome): number {
  if (outcome === "home") return prediction.homeWinProb;
  if (outcome === "away") return prediction.awayWinProb;
  return prediction.drawProb;
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

function uniqueByKey(items: ClusterDefinition[]): ClusterDefinition[] {
  const seen = new Set<ClusterKey>();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

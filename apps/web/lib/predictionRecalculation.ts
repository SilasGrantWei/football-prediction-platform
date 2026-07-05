import type { Match } from "./types";

export interface PredictionRecalculateState {
  allowed: boolean;
  reason: string;
}

export function getRecalculateState(match: Pick<Match, "status" | "startTime">): PredictionRecalculateState {
  if (match.status === "finished") {
    return {
      allowed: false,
      reason: "已结束比赛保留开赛前冻结推算，不能用赛后结果反向重算。"
    };
  }

  if (match.status === "live" || match.status === "halftime") {
    return {
      allowed: false,
      reason: "比赛已经开始，不能把实时比分带回赛前推算，避免未来函数。"
    };
  }

  const kickoffTime = new Date(match.startTime).getTime();
  if (!Number.isFinite(kickoffTime)) {
    return {
      allowed: false,
      reason: "开球时间无效，暂不能重新推算。"
    };
  }

  if (kickoffTime <= Date.now()) {
    return {
      allowed: false,
      reason: "开球时间已过但状态未同步，先同步赛程/比分后再处理。"
    };
  }

  return {
    allowed: true,
    reason: "会删除缓存并用当前赛前数据重新计算，不读取赛果。"
  };
}

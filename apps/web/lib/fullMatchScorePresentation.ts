import type { MatchDecision, MatchStatus } from "./types";

export interface FullMatchScorePresentation {
  score: string;
  suffix: string;
  penaltyScore?: string;
}

interface FullMatchScoreInput {
  status: MatchStatus;
  fullMatchHomeScore?: number;
  fullMatchAwayScore?: number;
  penaltyShootoutHomeScore?: number;
  penaltyShootoutAwayScore?: number;
  resultDecision?: MatchDecision;
}

const decisionLabels: Record<MatchDecision, string> = {
  regulation: "90分钟结束",
  extra_time: "加时后",
  penalties: "点球后"
};

export function getFullMatchScorePresentation(input: FullMatchScoreInput): FullMatchScorePresentation | null {
  if (input.status !== "finished" || !input.resultDecision) return null;
  if (!isScore(input.fullMatchHomeScore) || !isScore(input.fullMatchAwayScore)) return null;

  const hasPenaltyScore =
    input.resultDecision === "penalties" &&
    isScore(input.penaltyShootoutHomeScore) &&
    isScore(input.penaltyShootoutAwayScore);

  return {
    score: `${input.fullMatchHomeScore}-${input.fullMatchAwayScore}`,
    suffix: decisionLabels[input.resultDecision],
    ...(hasPenaltyScore
      ? { penaltyScore: `${input.penaltyShootoutHomeScore}-${input.penaltyShootoutAwayScore}` }
      : {})
  };
}

export function formatFullMatchOutcome(presentation: FullMatchScorePresentation): string {
  return presentation.penaltyScore ? `点球 ${presentation.penaltyScore}` : presentation.suffix;
}

function isScore(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0;
}

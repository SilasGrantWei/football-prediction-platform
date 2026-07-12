import type { MatchStatus } from "./types";

export type MatchCardTone = "scheduled" | "live" | "halftime" | "finished";

export interface MatchCardPresentation {
  primary: string;
  secondary: string;
  showRealScore: boolean;
  tone: MatchCardTone;
}

interface MatchCardPresentationInput {
  status: MatchStatus;
  kickoffLabel: string;
  homeScore: number;
  awayScore: number;
  minute: number;
}

export function getMatchCardPresentation(input: MatchCardPresentationInput): MatchCardPresentation {
  if (input.status === "scheduled") {
    const normalized = input.kickoffLabel.replace("北京时间", "").trim();
    const [date = "--/--", time = "--:--"] = normalized.split(/\s+/);

    return {
      primary: time,
      secondary: `${date} · 北京时间`,
      showRealScore: false,
      tone: "scheduled"
    };
  }

  return {
    primary: `${input.homeScore}-${input.awayScore}`,
    secondary:
      input.status === "finished"
        ? "90 分钟"
        : input.status === "halftime"
          ? "中场"
          : `${input.minute}'`,
    showRealScore: true,
    tone: input.status
  };
}

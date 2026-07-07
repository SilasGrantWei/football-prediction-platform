import type { Match } from "./types";

export function formatOfficialKickoffTime(match: Pick<Match, "id" | "startTime"> | string): string {
  const startTime = typeof match === "string" ? match : match.startTime;
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(startTime));

  return `${time} 北京时间`;
}

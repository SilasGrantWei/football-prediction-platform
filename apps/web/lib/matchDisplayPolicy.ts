import type { Match } from "./types";

const staleScheduledDisplayCutoffMs = 150 * 60 * 1000;
const matchDisplayTimeZone = "Asia/Shanghai";

const beijingDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: matchDisplayTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function isStaleScheduledPlaceholder(match: Pick<Match, "status" | "startTime">, now = new Date()): boolean {
  if (match.status !== "scheduled") return false;

  const kickoffAt = new Date(match.startTime).getTime();
  const nowAt = now.getTime();
  if (!Number.isFinite(kickoffAt) || !Number.isFinite(nowAt)) return false;

  return kickoffAt < nowAt - staleScheduledDisplayCutoffMs;
}

export function filterDisplayableMatches<T extends Pick<Match, "status" | "startTime">>(matches: T[], now = new Date()): T[] {
  return matches.filter((match) => !isStaleScheduledPlaceholder(match, now));
}

export function isOutsideBeijingTodayAndTomorrow(value: string | Date, now = new Date()): boolean {
  const targetKey = beijingDayKey(value);
  const todayKey = beijingDayKey(now);
  if (!targetKey || !todayKey) return false;

  return targetKey !== todayKey && targetKey !== addDaysToDayKey(todayKey, 1);
}

function beijingDayKey(value: string | Date): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = beijingDayFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}

function addDaysToDayKey(dayKey: string, days: number): string | null {
  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  if (![year, month, day].every(Number.isFinite)) return null;

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

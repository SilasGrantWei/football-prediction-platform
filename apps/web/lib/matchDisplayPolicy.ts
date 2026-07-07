import type { Match } from "./types";

const staleScheduledDisplayCutoffMs = 150 * 60 * 1000;

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

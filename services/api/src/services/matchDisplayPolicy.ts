import type { Match } from "../models.js";

export const staleScheduledDisplayCutoffMs = 150 * 60 * 1000;

export function isStaleScheduledPlaceholder(match: Match, now = new Date()): boolean {
  if (match.status !== "scheduled") return false;

  const kickoffAt = new Date(match.startTime).getTime();
  const nowAt = now.getTime();
  if (!Number.isFinite(kickoffAt) || !Number.isFinite(nowAt)) return false;

  return kickoffAt < nowAt - staleScheduledDisplayCutoffMs;
}

export function filterDisplayableMatches(matches: Match[], now = new Date()): Match[] {
  return matches.filter((match) => !isStaleScheduledPlaceholder(match, now));
}

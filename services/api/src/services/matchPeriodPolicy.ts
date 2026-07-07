export const matchDisplayTimeZone = "Asia/Shanghai";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: matchDisplayTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function tournamentDayKey(value: string | Date): string | null {
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;

  const parts = dayFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}

export function isTournamentToday(value: string | Date, now = new Date()): boolean {
  return tournamentDayKey(value) === tournamentDayKey(now);
}

export function isTournamentTomorrow(value: string | Date, now = new Date()): boolean {
  const todayKey = tournamentDayKey(now);
  if (!todayKey) return false;

  return tournamentDayKey(value) === addDaysToDayKey(todayKey, 1);
}

function addDaysToDayKey(dayKey: string, days: number): string | null {
  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  if (![year, month, day].every(Number.isFinite)) return null;

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

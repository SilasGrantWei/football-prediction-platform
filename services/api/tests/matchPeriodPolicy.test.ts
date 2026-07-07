import { describe, expect, it } from "vitest";

import { isTournamentToday, isTournamentTomorrow, tournamentDayKey } from "../src/services/matchPeriodPolicy.js";

describe("matchPeriodPolicy", () => {
  const now = new Date("2026-07-07T03:00:00.000Z");

  it("groups matches by the user's Beijing display date", () => {
    expect(tournamentDayKey("2026-07-07T16:00:00.000Z")).toBe("2026-07-08");
    expect(isTournamentToday("2026-07-07T00:00:00.000Z", now)).toBe(true);
    expect(isTournamentToday("2026-07-07T16:00:00.000Z", now)).toBe(false);
    expect(isTournamentToday("2026-07-07T20:00:00.000Z", now)).toBe(false);
  });

  it("puts the 00:00 and 04:00 Beijing kickoffs into tomorrow", () => {
    expect(isTournamentTomorrow("2026-07-07T16:00:00.000Z", now)).toBe(true);
    expect(isTournamentTomorrow("2026-07-07T20:00:00.000Z", now)).toBe(true);
  });

  it("does not drift around Asia/Shanghai midnight", () => {
    const afterShanghaiMidnight = new Date("2026-07-07T16:30:00.000Z");

    expect(tournamentDayKey(afterShanghaiMidnight)).toBe("2026-07-08");
    expect(isTournamentToday("2026-07-07T16:00:00.000Z", afterShanghaiMidnight)).toBe(true);
    expect(isTournamentTomorrow("2026-07-08T16:00:00.000Z", afterShanghaiMidnight)).toBe(true);
  });
});

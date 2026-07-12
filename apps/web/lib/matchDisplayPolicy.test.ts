import { describe, expect, it } from "vitest";

import { isOutsideBeijingTodayAndTomorrow } from "./matchDisplayPolicy.js";

describe("isOutsideBeijingTodayAndTomorrow", () => {
  it("keeps an early Beijing kickoff out of the later-fixtures section", () => {
    const beijingMorning = new Date("2026-07-11T03:00:00.000Z");

    expect(isOutsideBeijingTodayAndTomorrow("2026-07-10T16:00:00.000Z", beijingMorning)).toBe(false);
  });

  it("keeps only fixtures after Beijing tomorrow", () => {
    const beijingMorning = new Date("2026-07-11T03:00:00.000Z");

    expect(isOutsideBeijingTodayAndTomorrow("2026-07-11T16:00:00.000Z", beijingMorning)).toBe(false);
    expect(isOutsideBeijingTodayAndTomorrow("2026-07-12T16:00:00.000Z", beijingMorning)).toBe(true);
  });
});

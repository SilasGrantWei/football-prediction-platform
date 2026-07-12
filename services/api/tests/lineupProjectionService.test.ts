import { describe, expect, it } from "vitest";

import type { Match, TeamRecordLineup } from "../src/models.js";
import { describeLineupQuality } from "../src/services/externalMatchDetailProvider.js";
import { buildLineupImpactSignal, buildMatchLineupProjection } from "../src/services/lineupProjectionService.js";
import { buildLineupValidation } from "../src/services/lineupValidationService.js";

const portugalCroatia: Match = {
  id: "lineup-test",
  competition: "2026世界杯淘汰赛",
  homeTeam: {
    id: "portugal",
    name: "葡萄牙",
    fifaRating: 88,
    recentForm: 84,
    attackAvg: 1.82,
    defenseAvg: 84,
    xga: 0.92
  },
  awayTeam: {
    id: "croatia",
    name: "克罗地亚",
    fifaRating: 82,
    recentForm: 81,
    attackAvg: 1.42,
    defenseAvg: 80,
    xga: 1.05
  },
  homeScore: 0,
  awayScore: 0,
  status: "scheduled",
  startTime: "2026-07-02T23:00:00.000Z",
  minute: 0
};

describe("lineupProjectionService", () => {
  it("builds clearly labeled projected lineups with real player names from the local player pool", () => {
    const projection = buildMatchLineupProjection(portugalCroatia);

    expect(projection.home.sourceType).toBe("projected");
    expect(projection.away.sourceLabel).toContain("非官方");
    expect(projection.note).toContain("不是官方实时阵容");
    expect(projection.home.starters).toHaveLength(11);
    expect(projection.away.starters).toHaveLength(11);
    expect(projection.home.starters.some((player) => player.name === "克里斯蒂亚诺·罗纳尔多")).toBe(true);
    expect(projection.away.starters.some((player) => player.name === "卢卡-莫德里奇")).toBe(true);
    expect(projection.home.starters.every((player) => !player.name.includes("一号"))).toBe(true);
  });

  it("produces bounded goal and strength impact factors", () => {
    const projection = buildMatchLineupProjection(portugalCroatia);
    const signal = buildLineupImpactSignal(projection);

    expect(signal.homeGoalFactor).toBeGreaterThanOrEqual(0.94);
    expect(signal.homeGoalFactor).toBeLessThanOrEqual(1.1);
    expect(signal.awayGoalFactor).toBeGreaterThanOrEqual(0.94);
    expect(signal.awayGoalFactor).toBeLessThanOrEqual(1.1);
    expect(Math.abs(signal.homeStrengthDelta)).toBeLessThanOrEqual(2.4);
    expect(signal.awayStrengthDelta).toBeCloseTo(-signal.homeStrengthDelta);
  });

  it("keeps non-official projected lineups as low-weight player signals", () => {
    const projection = buildMatchLineupProjection(portugalCroatia);
    const signal = buildLineupImpactSignal(projection);

    expect(projection.home.sourceType).toBe("projected");
    expect(projection.away.sourceType).toBe("projected");
    expect(Math.abs(signal.homeStrengthDelta)).toBeLessThan(0.4);
    expect(Math.abs(signal.homeGoalFactor - 1)).toBeLessThan(0.04);
    expect(Math.abs(signal.awayGoalFactor - 1)).toBeLessThan(0.04);
  });

  it("keeps unknown teams neutral instead of inventing players", () => {
    const projection = buildMatchLineupProjection({
      ...portugalCroatia,
      homeTeam: {
        ...portugalCroatia.homeTeam,
        id: "winner_m101",
        name: "待定胜者"
      }
    });
    const signal = buildLineupImpactSignal(projection);

    expect(projection.home.starters).toHaveLength(0);
    expect(projection.home.summary).toContain("暂无可验证球员池");
    expect(signal.homeGoalFactor).toBeGreaterThanOrEqual(0.94);
    expect(signal.awayGoalFactor).toBeLessThanOrEqual(1.1);
  });

  it("marks projected players as pending when no official lineup is available", () => {
    const projection = buildMatchLineupProjection(portugalCroatia);
    const validation = buildLineupValidation(portugalCroatia, projection);

    expect(validation.status).toBe("pending");
    expect(validation.overallHitRate).toBeNull();
    expect(validation.home.playerResults).toHaveLength(11);
    expect(validation.home.playerResults.every((player) => player.actualStatus === "unknown")).toBe(true);
    expect(validation.learningActions.join(" ")).toContain("不用模型推算名单反证模型自己");
  });

  it("marks live or halftime matches without real lineups as unavailable instead of pending", () => {
    const halftimeMatch: Match = {
      ...portugalCroatia,
      status: "halftime",
      homeScore: 0,
      awayScore: 0,
      minute: 45
    };
    const projection = buildMatchLineupProjection(halftimeMatch);
    const validation = buildLineupValidation(halftimeMatch, projection);

    expect(validation.status).toBe("unavailable");
    expect(validation.overallHitRate).toBeNull();
    expect(validation.summary).toContain("比赛已经开始");
    expect(validation.home.status).toBe("unavailable");
    expect(validation.home.sourceLabel).toContain("缺少真实首发");
    expect(validation.home.playerResults.every((player) => player.actualStatus === "unknown")).toBe(true);
    expect(validation.home.playerResults.every((player) => player.note.includes("无法验证"))).toBe(true);
  });

  it("marks finished matches without real lineups as unavailable instead of pending", () => {
    const finishedMatch: Match = {
      ...portugalCroatia,
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      minute: 90
    };
    const projection = buildMatchLineupProjection(finishedMatch);
    const validation = buildLineupValidation(finishedMatch, projection);

    expect(validation.status).toBe("unavailable");
    expect(validation.overallHitRate).toBeNull();
    expect(validation.summary).toContain("比赛已结束");
    expect(validation.home.status).toBe("unavailable");
    expect(validation.home.sourceLabel).toContain("缺少真实首发");
    expect(validation.home.playerResults.every((player) => player.actualStatus === "unknown")).toBe(true);
    expect(validation.home.playerResults.every((player) => player.note.includes("无法验证"))).toBe(true);
    expect(validation.learningActions.join(" ")).toContain("不用模型推算名单反证模型自己");
  });

  it("does not treat placeholder actual lineups as verified real starters", () => {
    const finishedMatch: Match = {
      ...portugalCroatia,
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      minute: 90
    };
    const projection = buildMatchLineupProjection(finishedMatch);
    const placeholderHome: TeamRecordLineup = {
      teamId: "portugal",
      teamName: "葡萄牙",
      formation: "4-3-3",
      starters: Array.from({ length: 11 }, () => appearance("未知球员")),
      substitutes: Array.from({ length: 5 }, () => appearance("未知球员", "substitute")),
      confidence: "reported"
    };
    const placeholderAway: TeamRecordLineup = {
      ...placeholderHome,
      teamId: "croatia",
      teamName: "克罗地亚"
    };

    const validation = buildLineupValidation(
      finishedMatch,
      projection,
      { home: placeholderHome, away: placeholderAway },
      { label: "公开赛事数据源世界杯数据", verifiedAt: "2026-07-05T04:47:00.000Z" }
    );

    expect(validation.status).toBe("unavailable");
    expect(validation.overallHitRate).toBeNull();
    expect(validation.home.actualStarterCount).toBe(0);
    expect(validation.home.actualStarters).toEqual([]);
    expect(validation.home.playerResults.every((player) => player.actualStatus === "unknown")).toBe(true);
    expect(validation.home.reasons.join(" ")).toContain("占位");
    expect(validation.summary).toContain("没有真实首发名单");
  });

  it("does not accept external match details whose starters are only placeholder names", () => {
    const placeholderPlayers = Array.from({ length: 11 }, (_, index) => ({
      id: `placeholder-${index}`,
      name: `${index + 1}号未知球员`,
      position: "未知",
      number: index + 1,
      status: "starter" as const
    }));

    const quality = describeLineupQuality({
      source: "espn",
      sourceLabel: "公开赛事数据源",
      sourceUrl: "https://example.test/match",
      verifiedAt: "2026-07-06T00:00:00.000Z",
      events: [],
      statistics: null,
      lineups: {
        home: {
          teamId: "brazil",
          teamName: "巴西",
          formation: "待定",
          starters: placeholderPlayers,
          substitutes: []
        },
        away: {
          teamId: "norway",
          teamName: "挪威",
          formation: "待定",
          starters: placeholderPlayers,
          substitutes: []
        }
      }
    });

    expect(quality.credible).toBe(false);
    expect(quality.reason).toContain("占位");
    expect(quality.reason).toContain("0 人");
  });

  it("exposes real reported starters even when a team has no projected player pool", () => {
    const finishedMatch: Match = {
      ...portugalCroatia,
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      minute: 90,
      homeTeam: {
        ...portugalCroatia.homeTeam,
        id: "winner_m101",
        name: "Brazil"
      },
      awayTeam: {
        ...portugalCroatia.awayTeam,
        id: "winner_m102",
        name: "Norway"
      }
    };
    const projection = buildMatchLineupProjection(finishedMatch);
    const actualHome: TeamRecordLineup = {
      teamId: "winner_m101",
      teamName: "Brazil",
      formation: "4-3-3",
      starters: [
        "Alisson Becker",
        "Danilo",
        "Marquinhos",
        "Gabriel Magalhaes",
        "Alex Sandro",
        "Casemiro",
        "Bruno Guimaraes",
        "Lucas Paqueta",
        "Raphinha",
        "Richarlison",
        "Vinicius Junior"
      ].map((name) => appearance(name)),
      substitutes: ["Endrick", "Rodrygo"].map((name) => appearance(name, "substitute")),
      confidence: "reported"
    };
    const actualAway: TeamRecordLineup = {
      teamId: "winner_m102",
      teamName: "Norway",
      formation: "4-4-2",
      starters: [
        "Orjan Nyland",
        "Julian Ryerson",
        "Kristoffer Ajer",
        "Leo Ostigard",
        "David Moller Wolfe",
        "Martin Odegaard",
        "Sander Berge",
        "Patrick Berg",
        "Antonio Nusa",
        "Erling Haaland",
        "Alexander Sorloth"
      ].map((name) => appearance(name)),
      substitutes: ["Oscar Bobb"].map((name) => appearance(name, "substitute")),
      confidence: "reported"
    };

    const validation = buildLineupValidation(
      finishedMatch,
      projection,
      { home: actualHome, away: actualAway },
      { label: "ESPN public lineup", verifiedAt: "2026-07-06T00:00:00.000Z" }
    );

    expect(projection.home.starters).toHaveLength(0);
    expect(projection.away.starters).toHaveLength(0);
    expect(validation.status).toBe("partial");
    expect(validation.overallHitRate).toBeNull();
    expect(validation.home.status).toBe("partial");
    expect(validation.home.actualStarterCount).toBe(11);
    expect(validation.home.hitRate).toBeNull();
    expect(validation.home.actualStarters).toContain("Alisson Becker");
    expect(validation.home.unexpectedStarters).toContain("Alisson Becker");
    expect(validation.home.actualSubstitutes).toContain("Endrick");
    expect(validation.away.status).toBe("partial");
    expect(validation.away.actualStarterCount).toBe(11);
    expect(validation.away.actualStarters).toContain("Erling Haaland");
  });

  it("has local projected player pools for France and Paraguay", () => {
    const projection = buildMatchLineupProjection({
      ...portugalCroatia,
      id: "paraguay-france-lineup",
      homeTeam: {
        id: "paraguay",
        name: "巴拉圭",
        fifaRating: 78,
        recentForm: 80,
        attackAvg: 1.26,
        defenseAvg: 77,
        xga: 1.18
      },
      awayTeam: {
        id: "france",
        name: "法国",
        fifaRating: 92,
        recentForm: 86,
        attackAvg: 2.05,
        defenseAvg: 88,
        xga: 0.82
      }
    });

    expect(projection.home.starters).toHaveLength(11);
    expect(projection.away.starters).toHaveLength(11);
    expect(projection.home.sourceLabel).not.toContain("未接入");
    expect(projection.away.sourceLabel).not.toContain("未接入");
    expect(projection.home.starters.map((player) => player.name)).toContain("米格尔-阿尔米隆");
    expect(projection.away.starters.map((player) => player.name)).toContain("基利安-姆巴佩");
    expect([...projection.home.starters, ...projection.away.starters].every((player) => !player.name.includes("未知"))).toBe(true);
  });

  it("compares projected starters against reported starters without rewriting the prediction", () => {
    const projection = buildMatchLineupProjection(portugalCroatia);
    const actualHome: TeamRecordLineup = {
      teamId: "portugal",
      teamName: "葡萄牙",
      formation: "4-3-3",
      starters: [
        appearance("迪奥戈-科斯塔"),
        appearance("若昂-坎塞洛"),
        appearance("鲁本-迪亚斯"),
        appearance("安东尼奥-席尔瓦"),
        appearance("努诺-门德斯"),
        appearance("维蒂尼亚"),
        appearance("布鲁诺-费尔南德斯"),
        appearance("贝尔纳多-席尔瓦"),
        appearance("拉斐尔-莱奥"),
        appearance("迪奥戈-若塔"),
        appearance("贡萨洛-拉莫斯")
      ],
      substitutes: [appearance("克里斯蒂亚诺·罗纳尔多", "substitute")],
      confidence: "reported"
    };
    const actualAway: TeamRecordLineup = {
      teamId: "croatia",
      teamName: "克罗地亚",
      formation: "4-3-3",
      starters: projection.away.starters.map((player) => appearance(player.name)),
      substitutes: [],
      confidence: "reported"
    };
    const originalHomeStarters = projection.home.starters.map((player) => player.name);

    const validation = buildLineupValidation(
      portugalCroatia,
      projection,
      { home: actualHome, away: actualAway },
      { label: "单元测试真实阵容", verifiedAt: "2026-07-03T00:00:00.000Z" }
    );

    expect(validation.status).toBe("verified");
    expect(validation.home.hitRate).toBeCloseTo(9 / 11);
    expect(validation.home.actualStarters).toContain("迪奥戈-科斯塔");
    expect(validation.home.actualSubstitutes).toContain("克里斯蒂亚诺·罗纳尔多");
    expect(validation.home.missedPlayers).toContain("克里斯蒂亚诺·罗纳尔多");
    expect(validation.home.unexpectedStarters).toContain("迪奥戈-若塔");
    expect(validation.home.playerResults.find((player) => player.name === "克里斯蒂亚诺·罗纳尔多")?.actualStatus).toBe("substitute");
    expect(validation.away.hitRate).toBe(1);
    expect(projection.home.starters.map((player) => player.name)).toEqual(originalHomeStarters);
  });

  it("matches Chinese projected names against English provider names", () => {
    const projection = buildMatchLineupProjection(portugalCroatia);
    const actualAway: TeamRecordLineup = {
      teamId: "croatia",
      teamName: "克罗地亚",
      formation: "4-3-3",
      starters: [
        appearance("Dominik Livakovic"),
        appearance("Josip Stanisic"),
        appearance("Marin Pongracic"),
        appearance("Josko Gvardiol"),
        appearance("Borna Sosa"),
        appearance("Marcelo Brozovic"),
        appearance("Mateo Kovacic"),
        appearance("Luka Modric"),
        appearance("Ivan Perisic"),
        appearance("Andrej Kramaric"),
        appearance("Bruno Petkovic")
      ],
      substitutes: [],
      confidence: "reported"
    };

    const validation = buildLineupValidation(
      portugalCroatia,
      projection,
      { home: actualAway, away: actualAway },
      { label: "公开赛事数据源名称", verifiedAt: "2026-07-03T00:00:00.000Z" }
    );

    expect(validation.away.hitRate).toBe(1);
    expect(validation.away.missedPlayers).toHaveLength(0);
    expect(validation.away.unexpectedStarters).toHaveLength(0);
    expect(validation.away.playerResults.every((player) => player.actualStatus === "starter")).toBe(true);
  });

  it("applies post-match Croatia lineup learning only to future fixtures", () => {
    const frozenProjection = buildMatchLineupProjection(portugalCroatia);
    const futureProjection = buildMatchLineupProjection({
      ...portugalCroatia,
      id: "future-croatia-lineup",
      status: "scheduled",
      startTime: "2026-07-03T02:00:00.000Z"
    });

    expect(frozenProjection.away.calibration).toBeUndefined();
    expect(futureProjection.away.calibration?.learningMatchId).toBe("match-003");
    expect(futureProjection.away.calibration?.reason).toContain("6/11");
    expect(futureProjection.away.sourceLabel).toContain("赛后校准");

    const futureStarterNames = futureProjection.away.starters.map((player) => player.name);
    expect(futureStarterNames).toContain("佩塔尔-苏契奇");
    expect(futureStarterNames).toContain("约瑟普-舒塔洛");
    expect(futureStarterNames).toContain("安特-布迪米尔");
    expect(futureStarterNames).toContain("马丁-巴图里纳");
    expect(futureStarterNames).toContain("尼古拉-弗拉希奇");
    expect(futureStarterNames).not.toContain("博尔纳-索萨");
    expect(futureStarterNames).not.toContain("布鲁诺-佩特科维奇");

    const futureSignal = buildLineupImpactSignal(futureProjection);
    expect(futureSignal.awayGoalFactor).toBeGreaterThanOrEqual(0.94);
    expect(futureSignal.awayGoalFactor).toBeLessThanOrEqual(1.1);
  });
});

function appearance(name: string, role: "starter" | "substitute" = "starter") {
  return {
    number: 0,
    name,
    position: "待定",
    role,
    minutesPlayed: null
  };
}

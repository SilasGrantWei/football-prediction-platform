import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EventType, Match, MatchEvent, MatchStatus, Prediction, Team, TrendPoint } from "./models.js";
import type { MatchFilters, MatchStateUpdate } from "./repositories/matchRepository.js";
import { filterDisplayableMatches } from "./services/matchDisplayPolicy.js";
import { isTournamentToday, isTournamentTomorrow } from "./services/matchPeriodPolicy.js";

// Verified snapshot: FIFA official match schedule PDF v22, ESPN fixtures/results,
// and Guardian live report for Belgium 2-2 Senegal after 90 minutes (Belgium advanced after extra time).

const teams: Record<string, Team> = {
  mexico: team("mexico", "墨西哥", 78, 78, 1.34, 75, 1.18),
  south_africa: team("south_africa", "南非", 74, 72, 1.18, 71, 1.33),
  south_korea: team("south_korea", "韩国", 77, 73, 1.30, 74, 1.22),
  czechia: team("czechia", "捷克", 76, 71, 1.22, 73, 1.28),
  canada: team("canada", "加拿大", 78, 77, 1.42, 74, 1.20),
  bosnia: team("bosnia", "波黑", 76, 73, 1.29, 72, 1.28),
  usa: team("usa", "美国", 79, 78, 1.45, 74, 1.18),
  paraguay: team("paraguay", "巴拉圭", 77, 76, 1.24, 77, 1.08),
  qatar: team("qatar", "卡塔尔", 74, 70, 1.18, 70, 1.34),
  switzerland: team("switzerland", "瑞士", 80, 80, 1.42, 79, 1.08),
  brazil: team("brazil", "巴西", 91, 82, 1.92, 82, 1.02),
  morocco: team("morocco", "摩洛哥", 80, 82, 1.35, 86, 0.88),
  haiti: team("haiti", "海地", 70, 65, 0.96, 68, 1.50),
  scotland: team("scotland", "苏格兰", 77, 74, 1.25, 76, 1.17),
  australia: team("australia", "澳大利亚", 76, 73, 1.24, 73, 1.30),
  turkey: team("turkey", "土耳其", 80, 74, 1.46, 75, 1.22),
  germany: team("germany", "德国", 86, 75, 1.82, 76, 1.20),
  curacao: team("curacao", "库拉索", 69, 64, 0.94, 66, 1.62),
  netherlands: team("netherlands", "荷兰", 87, 79, 1.76, 81, 1.04),
  japan: team("japan", "日本", 80, 83, 1.46, 77, 1.12),
  ivory_coast: team("ivory_coast", "科特迪瓦", 76, 75, 1.36, 72, 1.25),
  ecuador: team("ecuador", "厄瓜多尔", 78, 74, 1.30, 75, 1.18),
  sweden: team("sweden", "瑞典", 79, 73, 1.32, 76, 1.17),
  tunisia: team("tunisia", "突尼斯", 76, 69, 1.14, 73, 1.24),
  spain: team("spain", "西班牙", 89, 86, 1.95, 80, 1.05),
  cape_verde: team("cape_verde", "佛得角", 74, 78, 1.24, 73, 1.20),
  saudi_arabia: team("saudi_arabia", "沙特阿拉伯", 75, 70, 1.16, 71, 1.32),
  uruguay: team("uruguay", "乌拉圭", 83, 76, 1.52, 79, 1.10),
  belgium: team("belgium", "比利时", 86, 80, 1.74, 78, 1.12),
  egypt: team("egypt", "埃及", 80, 78, 1.49, 76, 1.15),
  iran: team("iran", "伊朗", 78, 72, 1.28, 76, 1.14),
  new_zealand: team("new_zealand", "新西兰", 71, 68, 1.05, 68, 1.48),
  france: team("france", "法国", 93, 88, 2.05, 84, 0.94),
  senegal: team("senegal", "塞内加尔", 79, 77, 1.35, 77, 1.16),
  iraq: team("iraq", "伊拉克", 72, 66, 0.95, 67, 1.55),
  norway: team("norway", "挪威", 82, 82, 1.82, 76, 1.18),
  argentina: team("argentina", "阿根廷", 94, 88, 2.10, 87, 0.82),
  algeria: team("algeria", "阿尔及利亚", 78, 78, 1.42, 75, 1.19),
  austria: team("austria", "奥地利", 81, 80, 1.55, 78, 1.11),
  jordan: team("jordan", "约旦", 72, 71, 1.12, 70, 1.36),
  portugal: team("portugal", "葡萄牙", 88, 82, 1.98, 79, 1.08),
  dr_congo: team("dr_congo", "民主刚果", 75, 73, 1.25, 72, 1.29),
  uzbekistan: team("uzbekistan", "乌兹别克斯坦", 74, 72, 1.20, 72, 1.26),
  colombia: team("colombia", "哥伦比亚", 84, 82, 1.72, 79, 1.06),
  england: team("england", "英格兰", 90, 81, 1.88, 83, 0.96),
  croatia: team("croatia", "克罗地亚", 82, 78, 1.48, 80, 1.05),
  ghana: team("ghana", "加纳", 77, 74, 1.33, 73, 1.23),
  panama: team("panama", "巴拿马", 73, 69, 1.12, 69, 1.38),
  winner_m83: team("winner_m83", "胜者M83（葡萄牙/克罗地亚）", 85, 80, 1.73, 80, 1.06),
  winner_m84: team("winner_m84", "胜者M84（西班牙/奥地利）", 85, 83, 1.75, 79, 1.08),
  winner_m85: team("winner_m85", "胜者M85（瑞士/阿尔及利亚）", 79, 79, 1.42, 77, 1.14),
  winner_m86: team("winner_m86", "胜者M86（阿根廷/佛得角）", 84, 83, 1.67, 80, 1.01),
  winner_m87: team("winner_m87", "胜者M87（哥伦比亚/加纳）", 81, 78, 1.53, 76, 1.15),
  winner_m88: team("winner_m88", "胜者M88（澳大利亚/埃及）", 78, 76, 1.37, 75, 1.22),
  winner_m89: team("winner_m89", "胜者M89（巴拉圭/法国）", 85, 82, 1.62, 82, 1.02),
  winner_m90: team("winner_m90", "胜者M90（加拿大/摩洛哥）", 79, 80, 1.39, 80, 1.04),
  winner_m91: team("winner_m91", "胜者M91（巴西/挪威）", 87, 82, 1.87, 79, 1.10),
  winner_m92: team("winner_m92", "胜者M92（墨西哥/英格兰）", 84, 80, 1.61, 79, 1.08),
  winner_m93: team("winner_m93", "胜者M93（葡萄牙/西班牙）", 85, 82, 1.74, 80, 1.07),
  winner_m94: team("winner_m94", "胜者M94（美国/比利时）", 83, 80, 1.60, 76, 1.15),
  winner_m95: team("winner_m95", "胜者M95（阿根廷/埃及）", 82, 81, 1.61, 78, 1.11),
  winner_m96: team("winner_m96", "胜者M96（瑞士/哥伦比亚）", 80, 78, 1.48, 76, 1.18),
  winner_m97: team("winner_m97", "胜者M97", 83, 81, 1.55, 81, 1.03),
  winner_m98: team("winner_m98", "胜者M98", 84, 81, 1.67, 79, 1.09),
  winner_m99: team("winner_m99", "胜者M99", 86, 82, 1.74, 80, 1.08),
  winner_m100: team("winner_m100", "胜者M100", 82, 80, 1.55, 77, 1.16),
  loser_m101: team("loser_m101", "负者M101", 82, 78, 1.50, 78, 1.15),
  loser_m102: team("loser_m102", "负者M102", 82, 78, 1.50, 78, 1.15),
  winner_m101: team("winner_m101", "胜者M101", 86, 83, 1.78, 81, 1.04),
  winner_m102: team("winner_m102", "胜者M102", 86, 83, 1.78, 81, 1.04)
};

const matches: Match[] = [
  ...groupStageMatches(),
  ...roundOf32Matches(),
  ...roundOf16Matches(),
  ...quarterFinalMatches(),
  ...semiFinalMatches(),
  ...medalMatches()
];

type DemoMatchStateSnapshot = MatchStateUpdate & { matchId: string };

const matchStateSnapshots = loadMatchStateSnapshots();
applyMatchStateSnapshots(matchStateSnapshots);

type BracketSlotResult = "winner" | "loser";

const bracketSlots: Record<string, { sourceMatchId: string; result: BracketSlotResult }> = {
  winner_m89: { sourceMatchId: "r16-089", result: "winner" },
  winner_m90: { sourceMatchId: "r16-090", result: "winner" },
  winner_m91: { sourceMatchId: "r16-091", result: "winner" },
  winner_m92: { sourceMatchId: "r16-092", result: "winner" },
  winner_m93: { sourceMatchId: "r16-093", result: "winner" },
  winner_m94: { sourceMatchId: "r16-094", result: "winner" },
  winner_m95: { sourceMatchId: "r16-095", result: "winner" },
  winner_m96: { sourceMatchId: "r16-096", result: "winner" },
  winner_m97: { sourceMatchId: "qf-097", result: "winner" },
  winner_m98: { sourceMatchId: "qf-098", result: "winner" },
  winner_m99: { sourceMatchId: "qf-099", result: "winner" },
  winner_m100: { sourceMatchId: "qf-100", result: "winner" },
  winner_m101: { sourceMatchId: "sf-101", result: "winner" },
  winner_m102: { sourceMatchId: "sf-102", result: "winner" },
  loser_m101: { sourceMatchId: "sf-101", result: "loser" },
  loser_m102: { sourceMatchId: "sf-102", result: "loser" }
};

let nextEventId = 100;
const events: MatchEvent[] = [
  event(1, "match-001", 25, "goal", "塞内加尔", "迪亚拉"),
  event(2, "match-001", 51, "goal", "塞内加尔", "萨尔"),
  event(3, "match-001", 86, "goal", "比利时", "卢卡库"),
  event(4, "match-001", 89, "goal", "比利时", "蒂勒曼斯"),
  event(6, "match-016", 7, "goal", "民主刚果", "西拉斯"),
  event(7, "match-016", 75, "goal", "英格兰", "凯恩"),
  event(8, "match-016", 86, "goal", "英格兰", "凯恩"),
  event(9, "match-014", 12, "goal", "法国", "姆巴佩"),
  event(10, "match-014", 48, "goal", "法国", "格列兹曼"),
  event(11, "match-014", 69, "goal", "法国", "登贝莱"),
  event(12, "match-010", 74, "goal", "巴西", "马丁内利"),
  event(13, "match-010", 81, "goal", "日本", "南野拓实"),
  event(14, "match-010", 88, "goal", "巴西", "罗德里戈")
];

const predictions = loadPredictionSnapshots();

export const demoStore = {
  findMatches(filters: MatchFilters = {}): Match[] {
    const visibleMatches = filters.displayable ? filterDisplayableMatches(matches) : matches;
    return visibleMatches
      .filter((item) => {
        if (filters.status) {
          const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
          if (!statuses.includes(item.status)) return false;
        }
        if (filters.competition && item.competition !== filters.competition) return false;
        if (filters.period === "today") return isTournamentToday(item.startTime);
        if (filters.period === "tomorrow") return isTournamentTomorrow(item.startTime);
        return true;
      })
      .map(withPrediction)
      .sort(sortMatches);
  },

  findById(id: string): Match | null {
    const item = matches.find((candidate) => candidate.id === id);
    return item ? withPrediction(item) : null;
  },

  findEvents(matchId: string): MatchEvent[] {
    return events
      .filter((item) => item.matchId === matchId)
      .sort((a, b) => a.minute - b.minute || a.id - b.id)
      .map((item) => ({ ...item }));
  },

  eventExists(matchId: string, minute: number, type: EventType): boolean {
    return events.some((item) => item.matchId === matchId && item.minute === minute && item.type === type);
  },

  createEvent(matchId: string, minute: number, type: EventType, teamId: string, player: string): void {
    const selectedTeam = teams[teamId];
    events.push(event(nextEventId, matchId, minute, type, selectedTeam?.name ?? teamId, player));
    nextEventId += 1;
  },

  updateMatchState(matchId: string, state: MatchStateUpdate): void {
    const item = matches.find((candidate) => candidate.id === matchId);
    if (!item) return;
    if (state.homeTeamId) item.homeTeam = resolveTeam(state.homeTeamId, matchId);
    if (state.awayTeamId) item.awayTeam = resolveTeam(state.awayTeamId, matchId);
    if (state.startTime) item.startTime = new Date(state.startTime).toISOString();
    if (state.winnerTeamId) item.winnerTeamId = resolveTeam(state.winnerTeamId, matchId).id;
    item.minute = state.minute;
    item.homeScore = state.homeScore;
    item.awayScore = state.awayScore;
    if (state.fullMatchHomeScore !== undefined) item.fullMatchHomeScore = state.fullMatchHomeScore;
    if (state.fullMatchAwayScore !== undefined) item.fullMatchAwayScore = state.fullMatchAwayScore;
    if (state.penaltyShootoutHomeScore !== undefined) {
      item.penaltyShootoutHomeScore = state.penaltyShootoutHomeScore;
    }
    if (state.penaltyShootoutAwayScore !== undefined) {
      item.penaltyShootoutAwayScore = state.penaltyShootoutAwayScore;
    }
    if (state.resultDecision !== undefined) {
      item.resultDecision = state.resultDecision;
      if (state.resultDecision !== "penalties") {
        delete item.penaltyShootoutHomeScore;
        delete item.penaltyShootoutAwayScore;
      }
    }
    item.status = state.status;
    matchStateSnapshots.set(matchId, {
      matchId,
      homeTeamId: item.homeTeam.id,
      awayTeamId: item.awayTeam.id,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      fullMatchHomeScore: item.fullMatchHomeScore,
      fullMatchAwayScore: item.fullMatchAwayScore,
      penaltyShootoutHomeScore: item.penaltyShootoutHomeScore,
      penaltyShootoutAwayScore: item.penaltyShootoutAwayScore,
      resultDecision: item.resultDecision,
      winnerTeamId: item.winnerTeamId,
      status: item.status,
      startTime: item.startTime,
      minute: item.minute
    });
    persistMatchStateSnapshots(matchStateSnapshots);
  },

  upsertPrediction(prediction: Prediction): void {
    predictions.set(prediction.matchId, prediction);
    persistPredictionSnapshots(predictions);
  },

  buildTrend(matchId: string): TrendPoint[] {
    const item = this.findById(matchId);
    if (!item) return [];

    const matchEvents = this.findEvents(matchId);
    const maxMinute = item.status === "scheduled" ? 90 : Math.max(15, item.minute);
    const homeBase = item.prediction ? 50 + (item.prediction.homeWinProb - item.prediction.awayWinProb) * 32 : 50;
    const points: TrendPoint[] = [];

    for (let minute = 0; minute <= maxMinute; minute += 15) {
      const eventImpact = matchEvents
        .filter((matchEvent) => matchEvent.minute <= minute)
        .reduce((impact, matchEvent) => {
          const isHome = matchEvent.team === item.homeTeam.name;
          const direction = isHome ? 1 : -1;
          if (matchEvent.type === "goal" || matchEvent.type === "penalty") return impact + direction * 12;
          if (matchEvent.type === "red_card") return impact - direction * 10;
          return impact - direction * 4;
        }, 0);

      const homeMomentum = clamp(homeBase + eventImpact + Math.sin(minute / 14) * 6, 5, 95);
      points.push({
        minute,
        homeMomentum: Math.round(homeMomentum),
        awayMomentum: Math.round(100 - homeMomentum)
      });
    }

    return points;
  }
};

function predictionSnapshotPath(): string | undefined {
  const configured = process.env.DEMO_PREDICTION_SNAPSHOT_PATH?.trim();
  if (configured) return resolve(configured);
  if (process.env.NODE_ENV === "test") return undefined;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/runtime/demo-predictions.json");
}

function matchStateSnapshotPath(): string | undefined {
  const configured = process.env.DEMO_MATCH_STATE_SNAPSHOT_PATH?.trim();
  if (configured) return resolve(configured);
  if (process.env.NODE_ENV === "test") return undefined;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/runtime/demo-match-state.json");
}

function loadMatchStateSnapshots(): Map<string, DemoMatchStateSnapshot> {
  const path = matchStateSnapshotPath();
  if (!path || !existsSync(path)) return new Map();

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(isMatchStateSnapshot)
        .map((snapshot) => [snapshot.matchId, snapshot] as const)
    );
  } catch {
    return new Map();
  }
}

function applyMatchStateSnapshots(items: Map<string, DemoMatchStateSnapshot>): void {
  for (const snapshot of items.values()) {
    const match = matches.find((candidate) => candidate.id === snapshot.matchId);
    const homeTeam = snapshot.homeTeamId ? teams[snapshot.homeTeamId] : match?.homeTeam;
    const awayTeam = snapshot.awayTeamId ? teams[snapshot.awayTeamId] : match?.awayTeam;
    if (!match || !homeTeam || !awayTeam) continue;

    match.homeTeam = homeTeam;
    match.awayTeam = awayTeam;
    match.homeScore = snapshot.homeScore;
    match.awayScore = snapshot.awayScore;
    if (snapshot.fullMatchHomeScore !== undefined) match.fullMatchHomeScore = snapshot.fullMatchHomeScore;
    if (snapshot.fullMatchAwayScore !== undefined) match.fullMatchAwayScore = snapshot.fullMatchAwayScore;
    if (snapshot.penaltyShootoutHomeScore !== undefined) {
      match.penaltyShootoutHomeScore = snapshot.penaltyShootoutHomeScore;
    }
    if (snapshot.penaltyShootoutAwayScore !== undefined) {
      match.penaltyShootoutAwayScore = snapshot.penaltyShootoutAwayScore;
    }
    if (snapshot.resultDecision !== undefined) match.resultDecision = snapshot.resultDecision;
    match.status = snapshot.status;
    match.startTime = new Date(snapshot.startTime ?? match.startTime).toISOString();
    match.minute = snapshot.minute;
    if (snapshot.winnerTeamId && teams[snapshot.winnerTeamId]) {
      match.winnerTeamId = snapshot.winnerTeamId;
    }
  }
}

function persistMatchStateSnapshots(items: Map<string, DemoMatchStateSnapshot>): void {
  const path = matchStateSnapshotPath();
  if (!path) return;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify([...items.values()], null, 2)}\n`, "utf8");
}

function isMatchStateSnapshot(value: unknown): value is DemoMatchStateSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoMatchStateSnapshot>;
  return (
    typeof candidate.matchId === "string" &&
    typeof candidate.homeScore === "number" &&
    typeof candidate.awayScore === "number" &&
    isOptionalScore(candidate.fullMatchHomeScore) &&
    isOptionalScore(candidate.fullMatchAwayScore) &&
    isOptionalScore(candidate.penaltyShootoutHomeScore) &&
    isOptionalScore(candidate.penaltyShootoutAwayScore) &&
    (candidate.resultDecision === undefined ||
      candidate.resultDecision === "regulation" ||
      candidate.resultDecision === "extra_time" ||
      candidate.resultDecision === "penalties") &&
    typeof candidate.minute === "number" &&
    typeof candidate.startTime === "string" &&
    (candidate.status === "scheduled" ||
      candidate.status === "live" ||
      candidate.status === "halftime" ||
      candidate.status === "finished")
  );
}

function isOptionalScore(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function loadPredictionSnapshots(): Map<string, Prediction> {
  const path = predictionSnapshotPath();
  if (!path || !existsSync(path)) return new Map();

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(isPredictionSnapshot)
        .map((prediction) => [prediction.matchId, prediction] as const)
    );
  } catch {
    return new Map();
  }
}

function persistPredictionSnapshots(items: Map<string, Prediction>): void {
  const path = predictionSnapshotPath();
  if (!path) return;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify([...items.values()], null, 2)}\n`, "utf8");
}

function isPredictionSnapshot(value: unknown): value is Prediction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Prediction>;
  return (
    typeof candidate.matchId === "string" &&
    typeof candidate.generatedAt === "string" &&
    typeof candidate.homeWinProb === "number" &&
    typeof candidate.drawProb === "number" &&
    typeof candidate.awayWinProb === "number" &&
    Array.isArray(candidate.topScores)
  );
}

function groupStageMatches(): Match[] {
  return [
    completed("g-a-001", "2026世界杯小组赛 A组", "mexico", "south_africa", 2, 0, "2026-06-11T19:00:00.000Z"),
    completed("g-a-002", "2026世界杯小组赛 A组", "south_korea", "czechia", 2, 1, "2026-06-12T02:00:00.000Z"),
    completed("g-b-001", "2026世界杯小组赛 B组", "canada", "bosnia", 1, 1, "2026-06-12T19:00:00.000Z"),
    completed("g-d-001", "2026世界杯小组赛 D组", "usa", "paraguay", 4, 1, "2026-06-13T01:00:00.000Z"),
    completed("g-b-002", "2026世界杯小组赛 B组", "qatar", "switzerland", 1, 1, "2026-06-13T19:00:00.000Z"),
    completed("g-c-001", "2026世界杯小组赛 C组", "brazil", "morocco", 1, 1, "2026-06-13T22:00:00.000Z"),
    completed("g-c-002", "2026世界杯小组赛 C组", "haiti", "scotland", 0, 1, "2026-06-14T01:00:00.000Z"),
    completed("g-d-002", "2026世界杯小组赛 D组", "australia", "turkey", 2, 0, "2026-06-14T04:00:00.000Z"),
    completed("g-e-001", "2026世界杯小组赛 E组", "germany", "curacao", 7, 1, "2026-06-14T17:00:00.000Z"),
    completed("g-f-001", "2026世界杯小组赛 F组", "netherlands", "japan", 2, 2, "2026-06-14T20:00:00.000Z"),
    completed("g-e-002", "2026世界杯小组赛 E组", "ivory_coast", "ecuador", 1, 0, "2026-06-14T23:00:00.000Z"),
    completed("g-f-002", "2026世界杯小组赛 F组", "sweden", "tunisia", 5, 1, "2026-06-15T02:00:00.000Z"),
    completed("g-h-001", "2026世界杯小组赛 H组", "spain", "cape_verde", 0, 0, "2026-06-15T16:00:00.000Z"),
    completed("g-g-001", "2026世界杯小组赛 G组", "belgium", "egypt", 1, 1, "2026-06-15T19:00:00.000Z"),
    completed("g-h-002", "2026世界杯小组赛 H组", "saudi_arabia", "uruguay", 1, 1, "2026-06-15T22:00:00.000Z"),
    completed("g-g-002", "2026世界杯小组赛 G组", "iran", "new_zealand", 2, 2, "2026-06-16T01:00:00.000Z"),
    completed("g-i-001", "2026世界杯小组赛 I组", "france", "senegal", 3, 1, "2026-06-16T19:00:00.000Z"),
    completed("g-i-002", "2026世界杯小组赛 I组", "iraq", "norway", 1, 4, "2026-06-16T22:00:00.000Z"),
    completed("g-j-001", "2026世界杯小组赛 J组", "argentina", "algeria", 3, 0, "2026-06-17T01:00:00.000Z"),
    completed("g-j-002", "2026世界杯小组赛 J组", "austria", "jordan", 3, 1, "2026-06-17T04:00:00.000Z"),
    completed("g-k-001", "2026世界杯小组赛 K组", "portugal", "dr_congo", 1, 1, "2026-06-17T17:00:00.000Z"),
    completed("g-l-001", "2026世界杯小组赛 L组", "england", "croatia", 4, 2, "2026-06-17T20:00:00.000Z"),
    completed("g-l-002", "2026世界杯小组赛 L组", "ghana", "panama", 1, 0, "2026-06-17T23:00:00.000Z"),
    completed("g-k-002", "2026世界杯小组赛 K组", "uzbekistan", "colombia", 1, 3, "2026-06-18T02:00:00.000Z"),
    completed("g-a-003", "2026世界杯小组赛 A组", "czechia", "south_africa", 1, 1, "2026-06-18T19:00:00.000Z"),
    completed("g-b-003", "2026世界杯小组赛 B组", "switzerland", "bosnia", 4, 1, "2026-06-18T22:00:00.000Z"),
    completed("g-b-004", "2026世界杯小组赛 B组", "canada", "qatar", 6, 0, "2026-06-19T01:00:00.000Z"),
    completed("g-a-004", "2026世界杯小组赛 A组", "mexico", "south_korea", 1, 0, "2026-06-19T04:00:00.000Z"),
    completed("g-d-003", "2026世界杯小组赛 D组", "usa", "australia", 2, 0, "2026-06-19T19:00:00.000Z"),
    completed("g-c-003", "2026世界杯小组赛 C组", "scotland", "morocco", 0, 1, "2026-06-19T22:00:00.000Z"),
    completed("g-c-004", "2026世界杯小组赛 C组", "brazil", "haiti", 3, 0, "2026-06-20T01:00:00.000Z"),
    completed("g-d-004", "2026世界杯小组赛 D组", "turkey", "paraguay", 0, 1, "2026-06-20T04:00:00.000Z"),
    completed("g-f-003", "2026世界杯小组赛 F组", "netherlands", "sweden", 5, 1, "2026-06-20T19:00:00.000Z"),
    completed("g-e-003", "2026世界杯小组赛 E组", "germany", "ivory_coast", 2, 1, "2026-06-20T22:00:00.000Z"),
    completed("g-e-004", "2026世界杯小组赛 E组", "ecuador", "curacao", 0, 0, "2026-06-21T01:00:00.000Z"),
    completed("g-f-004", "2026世界杯小组赛 F组", "tunisia", "japan", 0, 4, "2026-06-21T04:00:00.000Z"),
    completed("g-h-003", "2026世界杯小组赛 H组", "spain", "saudi_arabia", 4, 0, "2026-06-21T17:00:00.000Z"),
    completed("g-g-003", "2026世界杯小组赛 G组", "belgium", "iran", 0, 0, "2026-06-21T20:00:00.000Z"),
    completed("g-h-004", "2026世界杯小组赛 H组", "uruguay", "cape_verde", 2, 2, "2026-06-21T23:00:00.000Z"),
    completed("g-g-004", "2026世界杯小组赛 G组", "new_zealand", "egypt", 1, 3, "2026-06-22T02:00:00.000Z"),
    completed("g-j-003", "2026世界杯小组赛 J组", "argentina", "austria", 2, 0, "2026-06-22T17:00:00.000Z"),
    completed("g-i-003", "2026世界杯小组赛 I组", "france", "iraq", 3, 0, "2026-06-22T20:00:00.000Z"),
    completed("g-i-004", "2026世界杯小组赛 I组", "norway", "senegal", 3, 2, "2026-06-22T23:00:00.000Z"),
    completed("g-j-004", "2026世界杯小组赛 J组", "jordan", "algeria", 1, 2, "2026-06-23T02:00:00.000Z"),
    completed("g-k-003", "2026世界杯小组赛 K组", "portugal", "uzbekistan", 5, 0, "2026-06-23T17:00:00.000Z"),
    completed("g-l-003", "2026世界杯小组赛 L组", "england", "ghana", 0, 0, "2026-06-23T20:00:00.000Z"),
    completed("g-l-004", "2026世界杯小组赛 L组", "panama", "croatia", 0, 1, "2026-06-23T23:00:00.000Z"),
    completed("g-k-004", "2026世界杯小组赛 K组", "colombia", "dr_congo", 1, 0, "2026-06-24T02:00:00.000Z"),
    completed("g-b-005", "2026世界杯小组赛 B组", "switzerland", "canada", 2, 1, "2026-06-24T17:00:00.000Z"),
    completed("g-b-006", "2026世界杯小组赛 B组", "bosnia", "qatar", 3, 1, "2026-06-24T17:00:00.000Z"),
    completed("g-c-005", "2026世界杯小组赛 C组", "scotland", "brazil", 0, 3, "2026-06-24T21:00:00.000Z"),
    completed("g-c-006", "2026世界杯小组赛 C组", "morocco", "haiti", 4, 2, "2026-06-24T21:00:00.000Z"),
    completed("g-a-005", "2026世界杯小组赛 A组", "czechia", "mexico", 0, 3, "2026-06-25T01:00:00.000Z"),
    completed("g-a-006", "2026世界杯小组赛 A组", "south_africa", "south_korea", 1, 0, "2026-06-25T01:00:00.000Z"),
    completed("g-e-005", "2026世界杯小组赛 E组", "ecuador", "germany", 2, 1, "2026-06-25T17:00:00.000Z"),
    completed("g-e-006", "2026世界杯小组赛 E组", "curacao", "ivory_coast", 0, 2, "2026-06-25T17:00:00.000Z"),
    completed("g-f-005", "2026世界杯小组赛 F组", "japan", "sweden", 1, 1, "2026-06-25T21:00:00.000Z"),
    completed("g-f-006", "2026世界杯小组赛 F组", "tunisia", "netherlands", 1, 3, "2026-06-25T21:00:00.000Z"),
    completed("g-d-005", "2026世界杯小组赛 D组", "turkey", "usa", 3, 2, "2026-06-26T01:00:00.000Z"),
    completed("g-d-006", "2026世界杯小组赛 D组", "paraguay", "australia", 0, 0, "2026-06-26T01:00:00.000Z"),
    completed("g-i-005", "2026世界杯小组赛 I组", "norway", "france", 1, 4, "2026-06-26T19:00:00.000Z"),
    completed("g-i-006", "2026世界杯小组赛 I组", "senegal", "iraq", 5, 0, "2026-06-26T19:00:00.000Z"),
    completed("g-h-005", "2026世界杯小组赛 H组", "cape_verde", "saudi_arabia", 0, 0, "2026-06-27T00:00:00.000Z"),
    completed("g-h-006", "2026世界杯小组赛 H组", "uruguay", "spain", 0, 1, "2026-06-27T00:00:00.000Z"),
    completed("g-g-005", "2026世界杯小组赛 G组", "egypt", "iran", 1, 1, "2026-06-27T03:00:00.000Z"),
    completed("g-g-006", "2026世界杯小组赛 G组", "new_zealand", "belgium", 1, 5, "2026-06-27T03:00:00.000Z"),
    completed("g-l-005", "2026世界杯小组赛 L组", "panama", "england", 0, 2, "2026-06-27T19:00:00.000Z"),
    completed("g-l-006", "2026世界杯小组赛 L组", "croatia", "ghana", 2, 1, "2026-06-27T19:00:00.000Z"),
    completed("g-k-005", "2026世界杯小组赛 K组", "colombia", "portugal", 0, 0, "2026-06-27T23:00:00.000Z"),
    completed("g-k-006", "2026世界杯小组赛 K组", "dr_congo", "uzbekistan", 3, 1, "2026-06-27T23:00:00.000Z"),
    completed("g-j-005", "2026世界杯小组赛 J组", "algeria", "austria", 3, 3, "2026-06-28T02:30:00.000Z"),
    completed("g-j-006", "2026世界杯小组赛 J组", "jordan", "argentina", 1, 3, "2026-06-28T02:30:00.000Z")
  ];
}

function roundOf32Matches(): Match[] {
  return [
    completed("match-009", "2026世界杯淘汰赛 · 1/16决赛", "south_africa", "canada", 0, 1, "2026-06-28T19:00:00.000Z"),
    completed("match-010", "2026世界杯淘汰赛 · 1/16决赛", "brazil", "japan", 2, 1, "2026-06-29T17:00:00.000Z"),
    completed("match-011", "2026世界杯淘汰赛 · 1/16决赛", "paraguay", "germany", 1, 1, "2026-06-29T20:30:00.000Z"),
    completed("match-012", "2026世界杯淘汰赛 · 1/16决赛", "morocco", "netherlands", 1, 1, "2026-06-30T01:00:00.000Z"),
    completed("match-013", "2026世界杯淘汰赛 · 1/16决赛", "ivory_coast", "norway", 1, 2, "2026-06-30T17:00:00.000Z"),
    completed("match-014", "2026世界杯淘汰赛 · 1/16决赛", "france", "sweden", 3, 0, "2026-06-30T21:00:00.000Z"),
    completed("match-015", "2026世界杯淘汰赛 · 1/16决赛", "mexico", "ecuador", 2, 0, "2026-07-01T01:00:00.000Z"),
    completed("match-016", "2026世界杯淘汰赛 · 1/16决赛", "england", "dr_congo", 2, 1, "2026-07-01T16:00:00.000Z"),
    completed("match-001", "2026世界杯淘汰赛 · 1/16决赛", "belgium", "senegal", 2, 2, "2026-07-01T20:00:00.000Z", 90, "belgium"),
    completed("match-002", "2026世界杯淘汰赛 · 1/16决赛", "usa", "bosnia", 2, 0, "2026-07-02T00:00:00.000Z"),
    scheduled("match-004", "2026世界杯淘汰赛 · 1/16决赛", "spain", "austria", "2026-07-02T19:00:00.000Z"),
    scheduled("match-003", "2026世界杯淘汰赛 · 1/16决赛", "portugal", "croatia", "2026-07-02T23:00:00.000Z"),
    scheduled("match-005", "2026世界杯淘汰赛 · 1/16决赛", "switzerland", "algeria", "2026-07-03T03:00:00.000Z"),
    scheduled("match-008", "2026世界杯淘汰赛 · 1/16决赛", "australia", "egypt", "2026-07-03T18:00:00.000Z"),
    scheduled("match-006", "2026世界杯淘汰赛 · 1/16决赛", "argentina", "cape_verde", "2026-07-03T22:00:00.000Z"),
    scheduled("match-007", "2026世界杯淘汰赛 · 1/16决赛", "colombia", "ghana", "2026-07-04T01:30:00.000Z")
  ];
}

function roundOf16Matches(): Match[] {
  return [
    completed("r16-090", "2026世界杯淘汰赛 · 1/8决赛", "canada", "morocco", 0, 3, "2026-07-04T17:00:00.000Z"),
    completed("r16-089", "2026世界杯淘汰赛 · 1/8决赛", "paraguay", "france", 0, 1, "2026-07-04T21:00:00.000Z"),
    completed("r16-091", "2026世界杯淘汰赛 · 1/8决赛", "brazil", "norway", 1, 2, "2026-07-05T20:00:00.000Z"),
    completed("r16-092", "2026世界杯淘汰赛 · 1/8决赛", "mexico", "england", 2, 3, "2026-07-06T01:00:00.000Z"),
    completed("r16-093", "2026世界杯淘汰赛 · 1/8决赛", "portugal", "spain", 0, 1, "2026-07-06T19:00:00.000Z"),
    completed("r16-094", "2026世界杯淘汰赛 · 1/8决赛", "usa", "belgium", 1, 4, "2026-07-07T00:00:00.000Z"),
    completed("r16-095", "2026世界杯淘汰赛 · 1/8决赛", "argentina", "egypt", 3, 2, "2026-07-07T16:00:00.000Z"),
    completed("r16-096", "2026世界杯淘汰赛 · 1/8决赛", "switzerland", "colombia", 0, 0, "2026-07-07T20:00:00.000Z", 90, "switzerland")
  ];
}

function quarterFinalMatches(): Match[] {
  return [
    scheduled("qf-097", "2026世界杯淘汰赛 · 1/4决赛", "winner_m89", "winner_m90", "2026-07-09T20:00:00.000Z"),
    scheduled("qf-098", "2026世界杯淘汰赛 · 1/4决赛", "spain", "belgium", "2026-07-10T19:00:00.000Z"),
    scheduled("qf-099", "2026世界杯淘汰赛 · 1/4决赛", "winner_m91", "winner_m92", "2026-07-11T21:00:00.000Z"),
    scheduled("qf-100", "2026世界杯淘汰赛 · 1/4决赛", "winner_m95", "winner_m96", "2026-07-12T01:00:00.000Z")
  ];
}

function semiFinalMatches(): Match[] {
  return [
    scheduled("sf-101", "2026世界杯淘汰赛 · 半决赛", "winner_m97", "winner_m98", "2026-07-14T19:00:00.000Z"),
    scheduled("sf-102", "2026世界杯淘汰赛 · 半决赛", "winner_m99", "winner_m100", "2026-07-15T19:00:00.000Z")
  ];
}

function medalMatches(): Match[] {
  return [
    scheduled("third-103", "2026世界杯淘汰赛 · 三四名决赛", "loser_m101", "loser_m102", "2026-07-18T21:00:00.000Z"),
    scheduled("final-104", "2026世界杯淘汰赛 · 决赛", "winner_m101", "winner_m102", "2026-07-19T19:00:00.000Z")
  ];
}

function team(id: string, name: string, fifaRating: number, recentForm: number, attackAvg: number, defenseAvg: number, xga: number): Team {
  return { id, name, fifaRating, recentForm, attackAvg, defenseAvg, xga };
}

function scheduled(id: string, competition: string, homeTeamId: string, awayTeamId: string, startTime: string): Match {
  return buildMatch(id, competition, homeTeamId, awayTeamId, 0, 0, "scheduled", startTime, 0);
}

function completed(
  id: string,
  competition: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  startTime: string,
  minute = 90,
  winnerTeamId?: string
): Match {
  return buildMatch(id, competition, homeTeamId, awayTeamId, homeScore, awayScore, "finished", startTime, minute, winnerTeamId);
}

function buildMatch(
  id: string,
  competition: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  status: MatchStatus,
  startTime: string,
  minute: number,
  winnerTeamId?: string
): Match {
  const homeTeam = teams[homeTeamId];
  const awayTeam = teams[awayTeamId];
  if (!homeTeam || !awayTeam) {
    throw new Error(`Unknown team in demo match ${id}: ${homeTeamId} vs ${awayTeamId}`);
  }
  return {
    id,
    competition,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    status,
    startTime,
    minute,
    ...(winnerTeamId ? { winnerTeamId } : {})
  };
}

function resolveTeam(teamId: string, matchId: string): Team {
  const selectedTeam = teams[teamId];
  if (!selectedTeam) {
    throw new Error(`Unknown team in external score sync for ${matchId}: ${teamId}`);
  }
  return selectedTeam;
}

function event(id: number, matchId: string, minute: number, type: EventType, teamName: string, player: string): MatchEvent {
  return {
    id,
    matchId,
    minute,
    type,
    team: teamName,
    player,
    createdAt: new Date().toISOString()
  };
}

function withPrediction(item: Match): Match {
  const resolved = resolveBracketMatch(item);
  return {
    ...resolved,
    prediction: predictions.get(item.id)
  };
}

function resolveBracketMatch(item: Match, visited = new Set<string>()): Match {
  if (visited.has(item.id)) return cloneMatch(item);
  const nextVisited = new Set(visited);
  nextVisited.add(item.id);
  return {
    ...item,
    homeTeam: resolveBracketTeam(item.homeTeam, nextVisited),
    awayTeam: resolveBracketTeam(item.awayTeam, nextVisited)
  };
}

function resolveBracketTeam(team: Team, visited: Set<string>): Team {
  const slot = bracketSlots[team.id];
  if (!slot) return { ...team };

  const sourceMatch = matches.find((candidate) => candidate.id === slot.sourceMatchId);
  if (!sourceMatch || sourceMatch.status !== "finished") {
    return { ...team };
  }

  const resolvedSource = resolveBracketMatch(sourceMatch, visited);
  const homeAdvanced = resolveHomeAdvanced(sourceMatch, resolvedSource);
  if (homeAdvanced === null) return { ...team };
  const selectedTeam =
    slot.result === "winner"
      ? homeAdvanced
        ? resolvedSource.homeTeam
        : resolvedSource.awayTeam
      : homeAdvanced
        ? resolvedSource.awayTeam
        : resolvedSource.homeTeam;
  return { ...selectedTeam };
}

function resolveHomeAdvanced(sourceMatch: Match, resolvedSource: Match): boolean | null {
  if (sourceMatch.winnerTeamId) {
    if (resolvedSource.homeTeam.id === sourceMatch.winnerTeamId) return true;
    if (resolvedSource.awayTeam.id === sourceMatch.winnerTeamId) return false;
  }

  if (sourceMatch.homeScore === sourceMatch.awayScore) return null;
  return sourceMatch.homeScore > sourceMatch.awayScore;
}

function cloneMatch(item: Match): Match {
  return {
    ...item,
    homeTeam: { ...item.homeTeam },
    awayTeam: { ...item.awayTeam }
  };
}

function sortMatches(a: Match, b: Match): number {
  const statusOrder = { live: 1, halftime: 2, scheduled: 3, finished: 4 };
  const statusDelta = statusOrder[a.status] - statusOrder[b.status];
  if (statusDelta !== 0) return statusDelta;

  const timeDelta = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  if (timeDelta !== 0) return a.status === "finished" ? -timeDelta : timeDelta;

  return a.homeTeam.name.localeCompare(b.homeTeam.name, "zh-CN") || a.awayTeam.name.localeCompare(b.awayTeam.name, "zh-CN");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

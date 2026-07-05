import type {
  HeadToHeadRecord,
  Match,
  MatchEvent,
  MatchResult,
  TeamRecordComparison,
  TeamRecordBasicFacts,
  TeamRecordMatch,
  TeamRecordMatchDetail,
  TeamRecordSummary,
  Venue
} from "../models.js";
import { matchRepository } from "../repositories/matchRepository.js";
import {
  fetchEspnFriendlyRecordFixtures,
  type ExternalRecordFixture
} from "./espnFriendlyRecordProvider.js";
import { fetchExternalMatchDetail } from "./externalMatchDetailProvider.js";

type RecordFixture = {
  id: string;
  competition: string;
  startTime: string;
  homeTeam: {
    id: string;
    name: string;
  };
  awayTeam: {
    id: string;
    name: string;
  };
  homeScore: number;
  awayScore: number;
  source: "database" | "external";
  sourceLabel?: string;
  sourceUrl?: string;
  externalEventId?: string;
  externalLeague?: "fifa.world" | "fifa.friendly";
};

export async function buildTeamRecordComparison(match: Match): Promise<TeamRecordComparison> {
  const seasonYear = new Date(match.startTime).getUTCFullYear();
  const cutoffTime = new Date(match.startTime).getTime();
  const recordFixtures = await findEligibleRecordFixtures(match);
  const homeMatches = recordFixtures.filter((candidate) => hasTeam(candidate, match.homeTeam.id));
  const awayMatches = recordFixtures.filter((candidate) => hasTeam(candidate, match.awayTeam.id));
  const h2hMatches = recordFixtures.filter(
    (candidate) => hasTeam(candidate, match.homeTeam.id) && hasTeam(candidate, match.awayTeam.id)
  );

  return {
    matchId: match.id,
    seasonYear,
    cutoffTime: new Date(cutoffTime).toISOString(),
    note:
      "只统计本场开赛前已经结束的真实比赛：本地赛果库和公开赛事数据源已完赛国际友谊赛；会自动补入真实友谊赛，但不会伪造缺失比赛，不包含本场赛果、加时赛和点球结果。",
    home: summarizeTeam(match.homeTeam.id, match.homeTeam.name, homeMatches),
    away: summarizeTeam(match.awayTeam.id, match.awayTeam.name, awayMatches),
    headToHead: summarizeHeadToHead(match.homeTeam.id, match.awayTeam.id, h2hMatches)
  };
}

export async function buildTeamRecordMatchDetail(
  match: Match,
  recordMatchId: string
): Promise<TeamRecordMatchDetail | null> {
  const recordFixtures = await findEligibleRecordFixtures(match);
  const fixture = recordFixtures.find(
    (candidate) =>
      candidate.id === recordMatchId && (hasTeam(candidate, match.homeTeam.id) || hasTeam(candidate, match.awayTeam.id))
  );

  if (!fixture) return null;

  const storedEvents = fixture.source === "database" ? await matchRepository.findEvents(fixture.id) : [];
  const externalDetail = await fetchExternalMatchDetail(fixture);
  const events = mergeEvents(storedEvents, externalDetail?.events ?? []);
  const stats = externalDetail?.stats ?? null;
  const lineups = externalDetail?.lineups ?? null;
  const dataCompleteness = {
    events: events.length > 0,
    stats: Boolean(stats),
    lineups: Boolean(lineups)
  };

  return {
    matchId: fixture.id,
    competition: fixture.competition,
    startTime: fixture.startTime,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    status: "finished",
    source: externalDetail ? "external" : fixture.source,
    sourceLabel: externalDetail?.sourceLabel ?? fixture.sourceLabel ?? "本地赛果库",
    sourceUrl: externalDetail?.sourceUrl ?? fixture.sourceUrl,
    verifiedAt: externalDetail?.verifiedAt,
    summary: buildMatchSummary(fixture, Boolean(externalDetail)),
    basicFacts: buildBasicFacts(fixture, dataCompleteness),
    missingDataReasons: buildMissingDataReasons(fixture, Boolean(externalDetail), dataCompleteness),
    stats,
    lineups,
    events,
    dataCompleteness
  };
}

async function findEligibleRecordFixtures(match: Match): Promise<RecordFixture[]> {
  const seasonYear = new Date(match.startTime).getUTCFullYear();
  const cutoffTime = new Date(match.startTime).getTime();

  const databaseFixtures = (await matchRepository.findMatches())
    .filter((candidate) => candidate.status === "finished")
    .filter((candidate) => candidate.id !== match.id)
    .map((candidate) => ({
      id: candidate.id,
      competition: candidate.competition,
      startTime: candidate.startTime,
      homeTeam: {
        id: candidate.homeTeam.id,
        name: candidate.homeTeam.name
      },
      awayTeam: {
        id: candidate.awayTeam.id,
        name: candidate.awayTeam.name
      },
      homeScore: candidate.homeScore,
      awayScore: candidate.awayScore,
      source: "database" as const
    }))
    .filter((candidate) => new Date(candidate.startTime).getUTCFullYear() === seasonYear)
    .filter((candidate) => new Date(candidate.startTime).getTime() < cutoffTime)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const friendlyFixtures = await fetchEspnFriendlyRecordFixtures(seasonYear, cutoffTime, [
    match.homeTeam,
    match.awayTeam
  ]);

  return mergeRecordFixtures(databaseFixtures, friendlyFixtures).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

function mergeRecordFixtures(databaseFixtures: RecordFixture[], externalFixtures: ExternalRecordFixture[]): RecordFixture[] {
  const merged: RecordFixture[] = [];
  for (const fixture of [...databaseFixtures, ...externalFixtures]) {
    const duplicateIndex = merged.findIndex((candidate) => isSameRealWorldFixture(candidate, fixture));
    if (duplicateIndex === -1) {
      merged.push(fixture);
      continue;
    }

    if (shouldPreferRecordFixture(fixture, merged[duplicateIndex])) {
      merged[duplicateIndex] = fixture;
    }
  }
  return merged;
}

function shouldPreferRecordFixture(candidate: RecordFixture, existing: RecordFixture): boolean {
  if (candidate.source === "external" && existing.source === "database") return true;
  if (Boolean(candidate.externalEventId) && !existing.externalEventId) return true;
  return false;
}

function isSameRealWorldFixture(left: RecordFixture, right: RecordFixture): boolean {
  if (left.id === right.id) return true;

  const directTeams =
    left.homeTeam.id === right.homeTeam.id &&
    left.awayTeam.id === right.awayTeam.id &&
    left.homeScore === right.homeScore &&
    left.awayScore === right.awayScore;
  const swappedTeams =
    left.homeTeam.id === right.awayTeam.id &&
    left.awayTeam.id === right.homeTeam.id &&
    left.homeScore === right.awayScore &&
    left.awayScore === right.homeScore;

  if (!directTeams && !swappedTeams) return false;

  const timeDistanceMs = Math.abs(new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  return timeDistanceMs <= 36 * 60 * 60 * 1000;
}

function summarizeTeam(teamId: string, teamName: string, matches: RecordFixture[]): TeamRecordSummary {
  const records = matches.map((match) => toTeamRecordMatch(match, teamId));
  const wins = records.filter((record) => record.result === "win").length;
  const draws = records.filter((record) => record.result === "draw").length;
  const losses = records.filter((record) => record.result === "loss").length;
  const goalsFor = records.reduce((sum, record) => sum + goalsForFromScore(record.score, record.venue), 0);
  const goalsAgainst = records.reduce((sum, record) => sum + goalsAgainstFromScore(record.score, record.venue), 0);
  const cleanSheets = records.filter((record) => goalsAgainstFromScore(record.score, record.venue) === 0).length;
  const played = records.length;

  return {
    teamId,
    teamName,
    played,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    winRate: played ? round4(wins / played) : 0,
    cleanSheets,
    avgGoalsFor: played ? round2(goalsFor / played) : 0,
    avgGoalsAgainst: played ? round2(goalsAgainst / played) : 0,
    recentForm: records.slice(-5).map((record) => record.result),
    recentMatches: records.slice(-5).reverse()
  };
}

function summarizeHeadToHead(homeTeamId: string, awayTeamId: string, matches: RecordFixture[]): HeadToHeadRecord {
  const records = matches.map((match) => toTeamRecordMatch(match, homeTeamId));
  return {
    played: records.length,
    homeWins: records.filter((record) => record.result === "win").length,
    draws: records.filter((record) => record.result === "draw").length,
    awayWins: records.filter((record) => record.result === "loss").length,
    matches: records
      .map((record, index) => ({
        ...record,
        opponent: record.opponent || awayTeamId,
        matchId: matches[index]?.id ?? record.matchId
      }))
      .slice(-5)
      .reverse()
  };
}

function toTeamRecordMatch(match: RecordFixture, teamId: string): TeamRecordMatch {
  const isHome = match.homeTeam.id === teamId;
  const teamGoals = isHome ? match.homeScore : match.awayScore;
  const opponentGoals = isHome ? match.awayScore : match.homeScore;

  return {
    matchId: match.id,
    date: match.startTime,
    competition: match.competition,
    opponent: isHome ? match.awayTeam.name : match.homeTeam.name,
    venue: isHome ? "home" : "away",
    score: `${match.homeScore}-${match.awayScore}`,
    result: resultFromGoals(teamGoals, opponentGoals)
  };
}

function buildMatchSummary(fixture: RecordFixture, hasExternalDetail = false): string {
  const winner =
    fixture.homeScore === fixture.awayScore
      ? "双方战平"
      : fixture.homeScore > fixture.awayScore
        ? `${fixture.homeTeam.name}取胜`
        : `${fixture.awayTeam.name}取胜`;

  if (hasExternalDetail) {
    return `${winner}，90分钟比分 ${fixture.homeScore}-${fixture.awayScore}。该记录已接入外部公开比赛数据源，详情中的技术统计、事件和阵容只展示来源返回的真实字段。`;
  }

  const sourceText =
    fixture.source === "external"
      ? `该记录来自 ${fixture.sourceLabel ?? "外部公开赛果源"}，仅使用已完赛的真实赛果字段`
      : "该记录来自本地赛果库，仅作为本场赛前已结束比赛样本";

  return `${winner}，90分钟比分 ${fixture.homeScore}-${fixture.awayScore}。${sourceText}；未接入真实技术统计、预期进球和首发阵容时，不展示估算数据。`;
}

function buildBasicFacts(
  fixture: RecordFixture,
  dataCompleteness: { events: boolean; stats: boolean; lineups: boolean }
): TeamRecordBasicFacts {
  const homeResult = resultFromGoals(fixture.homeScore, fixture.awayScore);
  const awayResult = resultFromGoals(fixture.awayScore, fixture.homeScore);
  const externalFieldCount = [dataCompleteness.events, dataCompleteness.stats, dataCompleteness.lineups].filter(Boolean).length;
  const dataIntegrity =
    externalFieldCount === 3 ? "complete_external" : externalFieldCount > 0 ? "partial_external" : "score_only";

  return {
    kickoffTime: fixture.startTime,
    fullTimeScore: `${fixture.homeScore}-${fixture.awayScore}`,
    resultText: buildResultText(fixture),
    homeResult,
    awayResult,
    dataIntegrity
  };
}

function buildResultText(fixture: RecordFixture): string {
  if (fixture.homeScore === fixture.awayScore) return "双方战平";
  return fixture.homeScore > fixture.awayScore ? `${fixture.homeTeam.name}取胜` : `${fixture.awayTeam.name}取胜`;
}

function buildMissingDataReasons(
  fixture: RecordFixture,
  hasExternalDetail: boolean,
  dataCompleteness: { events: boolean; stats: boolean; lineups: boolean }
): string[] {
  const reasons: string[] = [];

  if (!hasExternalDetail) {
    reasons.push(
      fixture.source === "database"
        ? "这场比赛当前只在本地赛果库中有基础比分，尚未匹配到公开赛事数据源、接口足球数据源或体育数据源的真实比赛详情。"
        : "外部赛果源只返回了基础比分，详情接口没有返回可用字段。"
    );
  }

  if (!dataCompleteness.stats) {
    reasons.push("缺少真实技术统计：未返回控球率、射门、射正、预期进球、角球、犯规和黄红牌等官方字段。");
  }

  if (!dataCompleteness.events) {
    reasons.push("缺少真实事件时间线：未返回进球、点球、犯规、越位、黄红牌、角球、射门和换人时间。");
  }

  if (!dataCompleteness.lineups) {
    reasons.push("缺少真实上场队员：未返回首发、替补、换人或比赛报告阵容。");
  }

  return reasons;
}

function mergeEvents(storedEvents: MatchEvent[], externalEvents: MatchEvent[]): MatchEvent[] {
  const byKey = new Map<string, MatchEvent>();
  for (const event of [...storedEvents, ...externalEvents]) {
    byKey.set(`${event.minute}:${event.type}:${event.team}:${event.player}`, event);
  }
  return Array.from(byKey.values()).sort((a, b) => a.minute - b.minute || a.id - b.id);
}

function hasTeam(match: RecordFixture, teamId: string): boolean {
  return match.homeTeam.id === teamId || match.awayTeam.id === teamId;
}

function resultFromGoals(goalsFor: number, goalsAgainst: number): MatchResult {
  if (goalsFor > goalsAgainst) return "win";
  if (goalsFor < goalsAgainst) return "loss";
  return "draw";
}

function goalsForFromScore(score: string, venue: Venue): number {
  const [home, away] = score.split("-").map(Number);
  return venue === "home" ? home : away;
}

function goalsAgainstFromScore(score: string, venue: Venue): number {
  const [home, away] = score.split("-").map(Number);
  return venue === "home" ? away : home;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

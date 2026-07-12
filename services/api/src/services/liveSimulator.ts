import { WebSocket, WebSocketServer } from "ws";

import { config } from "../config.js";
import type { Match } from "../models.js";
import { cacheGet, cacheSet } from "../redis.js";
import { matchRepository } from "../repositories/matchRepository.js";
import {
  fetchWorldCupScoreboardScores,
  fetchWorldCupTournamentScoreboardScores,
  type ExternalScoreSnapshot
} from "./liveScoreProvider.js";
import { PredictionRefreshCheckpoint } from "./predictionRefreshCheckpoint.js";
import { predictionService } from "./predictionService.js";

interface LivePayload {
  type: "live_snapshot";
  updatedAt: string;
  data: Match[];
}

type ScoreSnapshotMatchMode = "known-event-id" | "team-time";

interface ScoreSnapshotApplyResult {
  updated: number;
  bracketOutcomesUpdated: number;
}

interface ScoreSnapshotMatch {
  match: Match;
  mode: ScoreSnapshotMatchMode;
}

type PredictionRefreshResult = Awaited<ReturnType<typeof predictionService.refreshUpcomingPredictions>>;

type TournamentSyncOptions = {
  forcePredictionRefresh?: boolean;
};

const predictionRefreshCheckpoint = new PredictionRefreshCheckpoint();
let predictionRefreshInFlight: Promise<PredictionRefreshResult | undefined> | null = null;

const knownEspnEventIdsByMatchId: Record<string, string> = {
  "r16-090": "760502",
  "r16-089": "760503",
  "r16-091": "760504",
  "r16-092": "760505",
  "r16-093": "760506",
  "r16-094": "760507",
  "r16-096": "760508",
  "r16-095": "760509",
  "qf-099": "760512",
  "qf-100": "760513"
};

export function attachLiveSocket(wss: WebSocketServer): void {
  wss.on("connection", (socket) => {
    getLiveSnapshot(false)
      .then((payload) => socket.send(JSON.stringify(payload)))
      .catch((error) => {
        socket.send(JSON.stringify({ type: "error", message: String(error) }));
      });
  });
}

export function startLiveSimulator(wss: WebSocketServer): () => void {
  const runWindowSync = async () => {
    try {
      await syncLiveScoresOnce();
      const payload = await getLiveSnapshot(true);
      broadcast(wss, payload);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "Live simulator failed", error: String(error) }));
    }
  };

  const runTournamentSync = async () => {
    try {
      await syncTournamentScoresOnce();
      const payload = await getLiveSnapshot(true);
      broadcast(wss, payload);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "Tournament scoreboard sync failed", error: String(error) }));
    }
  };

  void runTournamentSync();
  const windowTimer = setInterval(runWindowSync, config.liveRefreshMs);
  const tournamentTimer = setInterval(runTournamentSync, config.fullScoreboardRefreshMs);
  return () => {
    clearInterval(windowTimer);
    clearInterval(tournamentTimer);
  };
}

export async function syncLiveScoresOnce(): Promise<{
  provider: "espn";
  scope: "window";
  snapshots: number;
  updated: number;
  predictionRefresh?: PredictionRefreshResult;
}> {
  let snapshotsCount = 0;
  let updated = 0;
  let bracketOutcomesUpdated = 0;
  try {
    const snapshots = await fetchWorldCupScoreboardScores();
    snapshotsCount = snapshots.length;
    const result = await applyScoreSnapshotsDetailed(snapshots);
    updated = result.updated;
    bracketOutcomesUpdated = result.bracketOutcomesUpdated;
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Live score sync failed", error: String(error) }));
  }

  if (bracketOutcomesUpdated > 0) predictionRefreshCheckpoint.request();
  const predictionRefresh = await refreshPendingPredictions(bracketOutcomesUpdated);
  return {
    provider: "espn",
    scope: "window",
    snapshots: snapshotsCount,
    updated,
    ...(predictionRefresh ? { predictionRefresh } : {})
  };
}

export async function syncTournamentScoresOnce(options: TournamentSyncOptions = {}): Promise<{
  provider: "espn";
  scope: "tournament";
  snapshots: number;
  updated: number;
  predictionRefresh?: PredictionRefreshResult;
}> {
  let snapshotsCount = 0;
  let updated = 0;
  let bracketOutcomesUpdated = 0;
  try {
    const snapshots = await fetchWorldCupTournamentScoreboardScores();
    snapshotsCount = snapshots.length;
    const result = await applyScoreSnapshotsDetailed(snapshots);
    updated = result.updated;
    bracketOutcomesUpdated = result.bracketOutcomesUpdated;
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Tournament score sync failed", error: String(error) }));
  }

  if (bracketOutcomesUpdated > 0 || options.forcePredictionRefresh) predictionRefreshCheckpoint.request();
  const predictionRefresh = await refreshPendingPredictions(bracketOutcomesUpdated);
  return {
    provider: "espn",
    scope: "tournament",
    snapshots: snapshotsCount,
    updated,
    ...(predictionRefresh ? { predictionRefresh } : {})
  };
}

export async function applyScoreSnapshots(snapshots: ExternalScoreSnapshot[]): Promise<number> {
  return (await applyScoreSnapshotsDetailed(snapshots)).updated;
}

async function applyScoreSnapshotsDetailed(snapshots: ExternalScoreSnapshot[]): Promise<ScoreSnapshotApplyResult> {
  if (!snapshots.length) return { updated: 0, bracketOutcomesUpdated: 0 };

  const localMatches = await matchRepository.findMatches();
  let updated = 0;
  let bracketOutcomesUpdated = 0;

  for (const snapshot of snapshots) {
    const matched = findMatchingLocalMatch(localMatches, snapshot);
    if (!matched) continue;

    const { match } = matched;
    const sameOrder = match.homeTeam.id === snapshot.homeTeamId && match.awayTeam.id === snapshot.awayTeamId;
    const reverseOrder = match.homeTeam.id === snapshot.awayTeamId && match.awayTeam.id === snapshot.homeTeamId;
    const useProviderOrder = matched.mode === "known-event-id" && !sameOrder && !reverseOrder;
    if (!sameOrder && !reverseOrder && !useProviderOrder) continue;

    const localHomeTeamId = reverseOrder ? snapshot.awayTeamId : snapshot.homeTeamId;
    const localAwayTeamId = reverseOrder ? snapshot.homeTeamId : snapshot.awayTeamId;
    const nextWinnerTeamId =
      snapshot.winnerTeamId === localHomeTeamId || snapshot.winnerTeamId === localAwayTeamId
        ? snapshot.winnerTeamId
        : match.winnerTeamId;
    const nextState = {
      minute: snapshot.minute,
      homeScore:
        snapshot.score90Verified === false
          ? match.homeScore
          : reverseOrder
            ? snapshot.awayScore
            : snapshot.homeScore,
      awayScore:
        snapshot.score90Verified === false
          ? match.awayScore
          : reverseOrder
            ? snapshot.homeScore
            : snapshot.awayScore,
      fullMatchHomeScore: reverseOrder ? snapshot.fullMatchAwayScore : snapshot.fullMatchHomeScore,
      fullMatchAwayScore: reverseOrder ? snapshot.fullMatchHomeScore : snapshot.fullMatchAwayScore,
      penaltyShootoutHomeScore: reverseOrder
        ? snapshot.penaltyShootoutAwayScore
        : snapshot.penaltyShootoutHomeScore,
      penaltyShootoutAwayScore: reverseOrder
        ? snapshot.penaltyShootoutHomeScore
        : snapshot.penaltyShootoutAwayScore,
      resultDecision: snapshot.resultDecision,
      status: snapshot.status,
      homeTeamId: localHomeTeamId,
      awayTeamId: localAwayTeamId,
      startTime: snapshot.startTime,
      winnerTeamId: nextWinnerTeamId
    };

    const previousAdvancingTeamId = resolveAdvancingTeamId({
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeTeamId: match.homeTeam.id,
      awayTeamId: match.awayTeam.id,
      winnerTeamId: match.winnerTeamId
    });
    const nextAdvancingTeamId = resolveAdvancingTeamId(nextState);

    if (
      match.minute !== nextState.minute ||
      match.homeScore !== nextState.homeScore ||
      match.awayScore !== nextState.awayScore ||
      match.fullMatchHomeScore !== nextState.fullMatchHomeScore ||
      match.fullMatchAwayScore !== nextState.fullMatchAwayScore ||
      match.penaltyShootoutHomeScore !== nextState.penaltyShootoutHomeScore ||
      match.penaltyShootoutAwayScore !== nextState.penaltyShootoutAwayScore ||
      match.resultDecision !== nextState.resultDecision ||
      match.status !== nextState.status ||
      match.homeTeam.id !== nextState.homeTeamId ||
      match.awayTeam.id !== nextState.awayTeamId ||
      match.winnerTeamId !== nextState.winnerTeamId ||
      new Date(match.startTime).getTime() !== new Date(nextState.startTime).getTime()
    ) {
      await matchRepository.updateMatchState(match.id, nextState);
      updated += 1;
      if (nextAdvancingTeamId && nextAdvancingTeamId !== previousAdvancingTeamId) {
        bracketOutcomesUpdated += 1;
      }
    }
  }

  if (updated > 0) {
    console.log(JSON.stringify({ level: "info", message: "Scores synced", provider: "espn", updated }));
  }
  return { updated, bracketOutcomesUpdated };
}

function resolveAdvancingTeamId(input: {
  status: Match["status"];
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId?: string;
}): string | undefined {
  if (input.status !== "finished") return undefined;
  if (input.winnerTeamId === input.homeTeamId || input.winnerTeamId === input.awayTeamId) return input.winnerTeamId;
  if (input.homeScore > input.awayScore) return input.homeTeamId;
  if (input.awayScore > input.homeScore) return input.awayTeamId;
  return undefined;
}

async function refreshPendingPredictions(bracketOutcomesUpdated: number): Promise<PredictionRefreshResult | undefined> {
  if (!predictionRefreshCheckpoint.hasPending()) return undefined;
  if (predictionRefreshInFlight) return predictionRefreshInFlight;

  const requestedVersion = predictionRefreshCheckpoint.requestedVersion();
  predictionRefreshInFlight = (async () => {
    try {
      const result = await predictionService.refreshUpcomingPredictions();
      if (result.failed === 0) {
        predictionRefreshCheckpoint.complete(requestedVersion);
        console.log(
          JSON.stringify({
            level: "info",
            message: "Upcoming predictions refreshed after bracket update",
            bracketOutcomesUpdated,
            requestedVersion,
            recalculated: result.recalculated
          })
        );
      } else {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "Upcoming prediction refresh remains pending after partial failure",
            bracketOutcomesUpdated,
            requestedVersion,
            failed: result.failed
          })
        );
      }
      return result;
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "Upcoming prediction refresh after bracket update failed",
          bracketOutcomesUpdated,
          requestedVersion,
          error: String(error)
        })
      );
      return undefined;
    } finally {
      predictionRefreshInFlight = null;
    }
  })();

  return predictionRefreshInFlight;
}

function findMatchingLocalMatch(matches: Match[], snapshot: ExternalScoreSnapshot): ScoreSnapshotMatch | null {
  const byKnownEventId = matches
    .map((match) => {
      if (knownEspnEventIdsByMatchId[match.id] !== snapshot.externalId) return null;
      const timeDelta = Math.abs(new Date(match.startTime).getTime() - new Date(snapshot.startTime).getTime());
      return { match, timeDelta };
    })
    .filter((item): item is { match: Match; timeDelta: number } => item !== null)
    .filter((item) => item.timeDelta <= 48 * 60 * 60 * 1000)
    .sort((a, b) => a.timeDelta - b.timeDelta);

  if (byKnownEventId[0]) {
    return { match: byKnownEventId[0].match, mode: "known-event-id" };
  }

  const candidates = matches
    .map((match) => {
      const sameOrder = match.homeTeam.id === snapshot.homeTeamId && match.awayTeam.id === snapshot.awayTeamId;
      const reverseOrder = match.homeTeam.id === snapshot.awayTeamId && match.awayTeam.id === snapshot.homeTeamId;
      if (!sameOrder && !reverseOrder) return null;

      const timeDelta = Math.abs(new Date(match.startTime).getTime() - new Date(snapshot.startTime).getTime());
      return { match, timeDelta };
    })
    .filter((item): item is { match: Match; timeDelta: number } => item !== null)
    .filter((item) => item.timeDelta <= 36 * 60 * 60 * 1000)
    .sort((a, b) => a.timeDelta - b.timeDelta);

  return candidates[0] ? { match: candidates[0].match, mode: "team-time" } : null;
}

async function getLiveSnapshot(force: boolean): Promise<LivePayload> {
  if (!force) {
    const cached = await cacheGet<LivePayload>("live:snapshot");
    if (cached) return cached;
  }

  const matches = await predictionService.enrichMatches(await matchRepository.findMatches({ status: ["live", "halftime"] }));
  const payload: LivePayload = {
    type: "live_snapshot",
    updatedAt: new Date().toISOString(),
    data: matches
  };

  await cacheSet("live:snapshot", payload, 15);
  return payload;
}

function broadcast(wss: WebSocketServer, payload: LivePayload): void {
  const serialized = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

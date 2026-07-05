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
import { predictionService } from "./predictionService.js";

interface LivePayload {
  type: "live_snapshot";
  updatedAt: string;
  data: Match[];
}

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

export async function syncLiveScoresOnce(): Promise<{ provider: "espn"; scope: "window"; snapshots: number; updated: number }> {
  try {
    const snapshots = await fetchWorldCupScoreboardScores();
    const updated = await applyScoreSnapshots(snapshots);
    return { provider: "espn", scope: "window", snapshots: snapshots.length, updated };
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Live score sync failed", error: String(error) }));
    return { provider: "espn", scope: "window", snapshots: 0, updated: 0 };
  }
}

export async function syncTournamentScoresOnce(): Promise<{
  provider: "espn";
  scope: "tournament";
  snapshots: number;
  updated: number;
}> {
  try {
    const snapshots = await fetchWorldCupTournamentScoreboardScores();
    const updated = await applyScoreSnapshots(snapshots);
    return { provider: "espn", scope: "tournament", snapshots: snapshots.length, updated };
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Tournament score sync failed", error: String(error) }));
    return { provider: "espn", scope: "tournament", snapshots: 0, updated: 0 };
  }
}

async function applyScoreSnapshots(snapshots: ExternalScoreSnapshot[]): Promise<number> {
  if (!snapshots.length) return 0;

  const localMatches = await matchRepository.findMatches();
  let updated = 0;

  for (const snapshot of snapshots) {
    const match = findMatchingLocalMatch(localMatches, snapshot);
    if (!match) continue;
    if (snapshot.minute >= 120) {
      continue;
    }

    const sameOrder = match.homeTeam.id === snapshot.homeTeamId && match.awayTeam.id === snapshot.awayTeamId;
    const nextState = {
      minute: snapshot.minute,
      homeScore: sameOrder ? snapshot.homeScore : snapshot.awayScore,
      awayScore: sameOrder ? snapshot.awayScore : snapshot.homeScore,
      status: snapshot.status
    };

    if (
      match.minute !== nextState.minute ||
      match.homeScore !== nextState.homeScore ||
      match.awayScore !== nextState.awayScore ||
      match.status !== nextState.status
    ) {
      await matchRepository.updateMatchState(match.id, nextState);
      updated += 1;
    }
  }

  if (updated > 0) {
    console.log(JSON.stringify({ level: "info", message: "Scores synced", provider: "espn", updated }));
  }
  return updated;
}

function findMatchingLocalMatch(matches: Match[], snapshot: ExternalScoreSnapshot): Match | null {
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

  return candidates[0]?.match ?? null;
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

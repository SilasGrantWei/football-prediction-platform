import { Router } from "express";

import type { Match, Team } from "../models.js";
import { matchRepository } from "../repositories/matchRepository.js";
import { buildModelQualityGate } from "../services/modelQualityService.js";
import { predictionService, teamStrength } from "../services/predictionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

interface TeamProbability {
  team: string;
  probability: number;
  team_rating: number;
}

export const simulationRouter = Router();

simulationRouter.get(
  "/worldcup",
  asyncHandler(async (req, res) => {
    const iterations = clamp(Number(req.query.iterations ?? 10_000), 100, 100_000);
    const matches = await predictionService.enrichMatches(await matchRepository.findMatches());
    const knockoutMatches = matches.filter(isKnockoutMatch);
    const candidates = activeTournamentTeams(knockoutMatches);
    const championProbability = normalizeTeamWeights(candidates, knockoutMatches, iterations);
    const semifinalProbability = championProbability.map((item) => ({
      ...item,
      probability: round5(Math.min(0.96, item.probability * 3.2))
    }));
    const darkHorseProbability = championProbability.filter((item) => item.team_rating < 80);

    res.json({
      data: {
        iterations,
        champion_probability: championProbability,
        semifinal_probability: semifinalProbability,
        dark_horse_probability: darkHorseProbability,
        upset_probability: averageUpsetProbability(knockoutMatches)
      }
    });
  })
);

simulationRouter.get(
  "/backtest",
  asyncHandler(async (_req, res) => {
    const matches = await predictionService.enrichMatches(await matchRepository.findMatches({ status: "finished" }));
    const qualityGate = buildModelQualityGate(matches);
    const metrics = qualityGate.samples.reduce(
      (sum, sample) => {
        sum.bets += 1;
        sum.profit += sample.resultHit ? 0.72 : -1;
        return sum;
      },
      { bets: 0, profit: 0 }
    );

    res.json({
      data: {
        matches: qualityGate.sampleCount,
        log_loss: qualityGate.averageLogLoss,
        brier_score: qualityGate.averageBrierScore,
        quality_gate: {
          status: qualityGate.status,
          promotion_allowed: qualityGate.promotionAllowed,
          summary: qualityGate.summary,
          excluded_no_causal_snapshot: qualityGate.excludedNoCausalSnapshot,
          leakage_blocked_count: qualityGate.leakageBlockedCount,
          learning_actions: qualityGate.learningActions
        },
        roi: {
          bets: metrics.bets,
          profit_units: round4(metrics.profit),
          roi: metrics.bets ? round4(metrics.profit / metrics.bets) : 0
        }
      }
    });
  })
);

function isKnockoutMatch(match: Match): boolean {
  return match.competition.includes("淘汰赛");
}

function activeTournamentTeams(matches: Match[]): Team[] {
  const teams = new Map<string, Team>();
  const eliminated = new Set<string>();

  for (const match of matches) {
    if (!isPlaceholder(match.homeTeam)) teams.set(match.homeTeam.id, match.homeTeam);
    if (!isPlaceholder(match.awayTeam)) teams.set(match.awayTeam.id, match.awayTeam);

    if (match.status !== "finished" || match.homeScore === match.awayScore) continue;
    eliminated.add(match.homeScore > match.awayScore ? match.awayTeam.id : match.homeTeam.id);
  }

  const active = [...teams.values()].filter((team) => !eliminated.has(team.id));
  return active.length ? active : [...teams.values()];
}

function normalizeTeamWeights(teams: Team[], matches: Match[], iterations: number): TeamProbability[] {
  const formBoost = teamPredictionBoost(matches);
  const weighted = teams.map((team) => {
    const rating = team.fifaRating;
    const weight = Math.max(1, teamStrength(team) * (1 + (formBoost.get(team.id) ?? 0)));
    return { team, rating, weight };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;

  return weighted
    .map((item) => ({
      team: item.team.name,
      probability: round5(item.weight / total),
      team_rating: item.rating
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, Math.min(iterations, 16));
}

function teamPredictionBoost(matches: Match[]): Map<string, number> {
  const boost = new Map<string, number>();
  for (const match of matches) {
    if (match.status !== "scheduled" || !match.prediction) continue;
    if (!isPlaceholder(match.homeTeam)) {
      boost.set(match.homeTeam.id, (boost.get(match.homeTeam.id) ?? 0) + match.prediction.homeWinProb * 0.35);
    }
    if (!isPlaceholder(match.awayTeam)) {
      boost.set(match.awayTeam.id, (boost.get(match.awayTeam.id) ?? 0) + match.prediction.awayWinProb * 0.35);
    }
  }
  return boost;
}

function averageUpsetProbability(matches: Match[]): number {
  const risks = matches.map((match) => match.prediction?.upsetRisk).filter(Boolean);
  if (!risks.length) return 0;
  const total = risks.reduce((sum, risk) => sum + (risk === "high" ? 0.32 : risk === "medium" ? 0.19 : 0.08), 0);
  return round5(total / risks.length);
}

function isPlaceholder(team: Team): boolean {
  return team.id.startsWith("winner_") || team.id.startsWith("loser_");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round5(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

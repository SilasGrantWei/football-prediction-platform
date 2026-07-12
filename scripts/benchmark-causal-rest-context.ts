import { config } from "../services/api/src/config.js";
import type { Match, Prediction, TeamRecordComparison } from "../services/api/src/models.js";
import { matchRepository } from "../services/api/src/repositories/matchRepository.js";
import { buildPostMatchCalibration } from "../services/api/src/services/postMatchCalibrationService.js";
import { calculateLocalPrediction } from "../services/api/src/services/predictionService.js";
import { buildTeamRecordComparison } from "../services/api/src/services/teamRecordService.js";
import { buildWorldCupFactors } from "../services/api/src/services/worldCupFactors.js";

type Direction = "home" | "draw" | "away";

type BenchmarkSample = {
  matchId: string;
  kickoff: string;
  teams: string;
  actualScore: string;
  actualDirection: Direction;
  staticRest: string;
  causalRest: string;
  staticPrediction: Prediction;
  causalPrediction: Prediction;
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  config.demoMode = true;
  config.externalFriendlyRecordsEnabled = false;

  const finishedMatches = (await matchRepository.findMatches({ status: "finished" })).sort(
    (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );

  const samples: BenchmarkSample[] = [];
  for (const actualMatch of finishedMatches) {
    const target = asPreMatchTarget(actualMatch);
    const records = await buildTeamRecordComparison(target);
    const calibration = await buildPostMatchCalibration(target);
    const staticRecordSignal = disableCausalRestOnly(records);
    const staticFactors = buildWorldCupFactors(target, staticRecordSignal);
    const causalFactors = buildWorldCupFactors(target, records);

    samples.push({
      matchId: actualMatch.id,
      kickoff: actualMatch.startTime,
      teams: `${actualMatch.homeTeam.name} vs ${actualMatch.awayTeam.name}`,
      actualScore: `${actualMatch.homeScore}-${actualMatch.awayScore}`,
      actualDirection: direction(actualMatch.homeScore, actualMatch.awayScore),
      staticRest: `${staticFactors.home.restDays}/${staticFactors.away.restDays}`,
      causalRest: `${causalFactors.home.restDays}/${causalFactors.away.restDays}`,
      staticPrediction: calculateLocalPrediction(target, staticRecordSignal, calibration),
      causalPrediction: calculateLocalPrediction(target, records, calibration)
    });
  }

  const changedSamples = samples.filter((sample) => sample.staticRest !== sample.causalRest);
  const report = {
    generatedAt: new Date().toISOString(),
    sampleCount: samples.length,
    restContextChangedCount: changedSamples.length,
    allMatches: {
      staticProfileDate: metrics(samples, (sample) => sample.staticPrediction),
      causalLatestCompletedMatch: metrics(samples, (sample) => sample.causalPrediction)
    },
    changedRestSubset: {
      staticProfileDate: metrics(changedSamples, (sample) => sample.staticPrediction),
      causalLatestCompletedMatch: metrics(changedSamples, (sample) => sample.causalPrediction)
    },
    recentChangedMatches: changedSamples.slice(-12).map((sample) => ({
      matchId: sample.matchId,
      kickoff: sample.kickoff,
      teams: sample.teams,
      actualScore: sample.actualScore,
      restDays: `${sample.staticRest} -> ${sample.causalRest}`,
      static: compactPrediction(sample.staticPrediction),
      causal: compactPrediction(sample.causalPrediction)
    }))
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function asPreMatchTarget(match: Match): Match {
  return {
    ...match,
    homeScore: 0,
    awayScore: 0,
    minute: 0,
    status: "scheduled",
    prediction: undefined
  };
}

function disableCausalRestOnly(records: TeamRecordComparison): TeamRecordComparison {
  return {
    ...records,
    matchId: `static-rest:${records.matchId}`
  };
}

function metrics(items: BenchmarkSample[], select: (sample: BenchmarkSample) => Prediction) {
  if (!items.length) {
    return {
      sampleCount: 0,
      directionAccuracy: 0,
      top1ScoreAccuracy: 0,
      top3ScoreAccuracy: 0,
      brierScore: 0,
      logLoss: 0
    };
  }

  let directionHits = 0;
  let top1Hits = 0;
  let top3Hits = 0;
  let brierTotal = 0;
  let logLossTotal = 0;

  for (const sample of items) {
    const prediction = select(sample);
    const predictedDirection = topDirection(prediction);
    const actualVector = sample.actualDirection === "home" ? [1, 0, 0] : sample.actualDirection === "draw" ? [0, 1, 0] : [0, 0, 1];
    const probabilities = [prediction.homeWinProb, prediction.drawProb, prediction.awayWinProb];
    const actualProbability = probabilities[sample.actualDirection === "home" ? 0 : sample.actualDirection === "draw" ? 1 : 2];

    directionHits += Number(predictedDirection === sample.actualDirection);
    top1Hits += Number(prediction.topScores[0]?.score === sample.actualScore);
    top3Hits += Number(prediction.topScores.some((score) => score.score === sample.actualScore));
    brierTotal += probabilities.reduce((sum, probability, index) => sum + Math.pow(probability - actualVector[index], 2), 0);
    logLossTotal += -Math.log(Math.max(actualProbability, 1e-9));
  }

  return {
    sampleCount: items.length,
    directionAccuracy: round(directionHits / items.length),
    top1ScoreAccuracy: round(top1Hits / items.length),
    top3ScoreAccuracy: round(top3Hits / items.length),
    brierScore: round(brierTotal / items.length),
    logLoss: round(logLossTotal / items.length)
  };
}

function compactPrediction(prediction: Prediction) {
  return {
    outcome: [prediction.homeWinProb, prediction.drawProb, prediction.awayWinProb],
    top3: prediction.topScores.map((score) => `${score.score}:${score.probability}`),
    expectedGoals: [prediction.expectedHomeGoals, prediction.expectedAwayGoals]
  };
}

function topDirection(prediction: Prediction): Direction {
  const probabilities: Array<[Direction, number]> = [
    ["home", prediction.homeWinProb],
    ["draw", prediction.drawProb],
    ["away", prediction.awayWinProb]
  ];
  return probabilities.sort((left, right) => right[1] - left[1])[0][0];
}

function direction(homeScore: number, awayScore: number): Direction {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

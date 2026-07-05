export type MatchStatus = "scheduled" | "live" | "halftime" | "finished";
export type EventType =
  | "goal"
  | "penalty"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "foul"
  | "offside"
  | "corner"
  | "shot_on_target"
  | "shot_off_target"
  | "shot_blocked"
  | "var_review"
  | "free_kick"
  | "kickoff"
  | "halftime";
export type GameStyle = "defensive" | "balanced" | "open";
export type UpsetRisk = "low" | "medium" | "high";

export interface ScorePrediction {
  score: string;
  probability: number;
}

export interface PredictionFactor {
  name: string;
  homeValue: string;
  awayValue: string;
  edge: "home" | "away" | "even";
  explanation: string;
}

export interface ScoreRationale {
  score: string;
  probability: number;
  reasons: string[];
}

export interface PredictionSource {
  label: string;
  url: string;
}

export interface PredictionExplanation {
  summary: string;
  h2hSummary: string;
  recentFormSummary: string;
  playerSummary: string;
  tacticalSummary: string;
  factors: PredictionFactor[];
  scoreRationales: ScoreRationale[];
  sources: PredictionSource[];
}

export type PredictionEvaluationStatus = "pending" | "success" | "failed";

export interface PredictionEvaluation {
  status: PredictionEvaluationStatus;
  actualScore: string;
  predictedScore: string;
  predictedProbability: number;
  exactScoreHit: boolean;
  top3ScoreHit: boolean;
  top3Rank?: number;
  resultHit: boolean;
  conclusion: string;
  goalError: {
    home: number;
    away: number;
    total: number;
  };
  failureReasons: string[];
  learningActions: string[];
  reviewedAt: string;
}

export interface PostMatchCalibration {
  version: string;
  sampleSignature: string;
  learnedMatchCount: number;
  scoreMissRate: number;
  directionMissRate: number;
  favoriteMissRate?: number;
  favoriteCleanSheetBoost: number;
  favoriteGoalLift: number;
  underdogGoalSuppression: number;
  drawDampener: number;
  volatilityLift: number;
  favoriteOverconfidencePenalty?: number;
  underdogResilienceBoost?: number;
  drawProtectionBoost?: number;
  favoriteDrawMissRate?: number;
  favoriteMarginOverestimate?: number;
  drawProtectedFavoriteWinRate?: number;
  favoriteMarginUnderestimate?: number;
  generatedAt: string;
  notes: string[];
}

export type PredictionLiveReviewStatus = "pending" | "tracking" | "drifting" | "off_track";

export interface PredictionLiveReview {
  status: PredictionLiveReviewStatus;
  minute: number;
  currentScore: string;
  predictedScore: string;
  expectedScoreByNow: string;
  top3StillPlausible: boolean;
  resultDirectionNow: "home" | "draw" | "away";
  predictedDirection: "home" | "draw" | "away";
  conclusion: string;
  reasons: string[];
  optimizationActions: string[];
  reviewedAt: string;
}

export interface Team {
  id: string;
  name: string;
  fifaRating: number;
  recentForm: number;
  attackAvg: number;
  defenseAvg: number;
  xga: number;
}

export type ProjectedLineupSourceType = "official" | "projected";
export type ProjectedPlayerRole = "starter" | "key_substitute";

export interface ProjectedPlayer {
  name: string;
  position: string;
  role: ProjectedPlayerRole;
  startProbability: number;
  starRating: number;
  goalImpact: number;
  assistImpact: number;
  source: "player_pool" | "key_player_profile";
}

export interface TeamLineupProjection {
  teamId: string;
  teamName: string;
  formation: string;
  sourceType: ProjectedLineupSourceType;
  sourceLabel: string;
  confidence: "low" | "medium" | "high";
  calibration?: {
    status: "post_match_adjusted";
    learningMatchId: string;
    effectiveFrom: string;
    reason: string;
  };
  starters: ProjectedPlayer[];
  keySubstitutes: ProjectedPlayer[];
  attackImpact: number;
  creationImpact: number;
  defensiveImpact: number;
  summary: string;
}

export interface MatchLineupProjection {
  matchId: string;
  generatedAt: string;
  note: string;
  home: TeamLineupProjection;
  away: TeamLineupProjection;
}

export type LineupValidationStatus = "pending" | "verified" | "partial" | "unavailable";
export type LineupActualStatus = "starter" | "substitute" | "absent" | "unknown";
export type LineupValidationProviderStatus = "success" | "no_data" | "skipped" | "error";

export interface LineupValidationProviderAttempt {
  provider: string;
  label: string;
  status: LineupValidationProviderStatus;
  reason: string;
  sourceUrl?: string;
  verifiedAt: string;
}

export interface LineupPlayerValidation {
  name: string;
  predictedPosition: string;
  startProbability: number;
  actualStatus: LineupActualStatus;
  matched: boolean;
  note: string;
}

export interface TeamLineupValidation {
  teamId: string;
  teamName: string;
  status: LineupValidationStatus;
  sourceLabel: string;
  sourceUrl?: string;
  verifiedAt?: string;
  predictedStarterCount: number;
  actualStarterCount: number;
  matchedStarterCount: number;
  hitRate: number | null;
  matchedPlayers: string[];
  missedPlayers: string[];
  unexpectedStarters: string[];
  actualStarters: string[];
  actualSubstitutes: string[];
  playerResults: LineupPlayerValidation[];
  summary: string;
  reasons: string[];
}

export interface MatchLineupValidation {
  matchId: string;
  status: LineupValidationStatus;
  sourceLabel: string;
  sourceUrl?: string;
  verifiedAt?: string;
  providerAttempts?: LineupValidationProviderAttempt[];
  overallHitRate: number | null;
  home: TeamLineupValidation;
  away: TeamLineupValidation;
  summary: string;
  learningActions: string[];
}

export interface PreMatchWeatherContext {
  venueLabel: string;
  climateBand: string;
  temperatureC: number;
  humidity: number;
  windKph: number;
  sourceLabel: string;
  confidence: "low" | "medium" | "high";
  summary: string;
}

export interface PreMatchTeamContext {
  teamId: string;
  teamName: string;
  goalMultiplier: number;
  concedeMultiplier: number;
  strengthDelta: number;
  notes: string[];
}

export interface PreMatchContextFactor {
  name: string;
  homeValue: string;
  awayValue: string;
  edge: "home" | "away" | "even";
  explanation: string;
}

export interface PreMatchContext {
  matchId: string;
  generatedAt: string;
  inputMode: "pre_match_only";
  weather: PreMatchWeatherContext;
  tempoMultiplier: number;
  drawModifier: number;
  volatilityModifier: number;
  home: PreMatchTeamContext;
  away: PreMatchTeamContext;
  factors: PreMatchContextFactor[];
  summary: string;
  sources: PredictionSource[];
}

export interface Prediction {
  matchId: string;
  modelVersion?: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  topScores: ScorePrediction[];
  gameStyle: GameStyle;
  upsetRisk: UpsetRisk;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  generatedAt: string;
  lineupProjection?: MatchLineupProjection;
  preMatchContext?: PreMatchContext;
  postMatchCalibration?: PostMatchCalibration;
  explanation?: PredictionExplanation;
  liveReview?: PredictionLiveReview;
  evaluation?: PredictionEvaluation;
}

export interface Match {
  id: string;
  competition: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  startTime: string;
  minute: number;
  prediction?: Prediction;
}

export interface MatchEvent {
  id: number;
  matchId: string;
  minute: number;
  type: EventType;
  team: string;
  player: string;
  description?: string;
  createdAt: string;
}

export interface TrendPoint {
  minute: number;
  homeMomentum: number;
  awayMomentum: number;
}

export type MatchResult = "win" | "draw" | "loss";
export type Venue = "home" | "away";

export interface TeamRecordMatch {
  matchId: string;
  date: string;
  competition: string;
  opponent: string;
  venue: Venue;
  score: string;
  result: MatchResult;
}

export interface TeamRecordSummary {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winRate: number;
  cleanSheets: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  recentForm: MatchResult[];
  recentMatches: TeamRecordMatch[];
}

export interface HeadToHeadRecord {
  played: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  matches: TeamRecordMatch[];
}

export interface TeamRecordComparison {
  matchId: string;
  seasonYear: number;
  cutoffTime: string;
  note: string;
  home: TeamRecordSummary;
  away: TeamRecordSummary;
  headToHead: HeadToHeadRecord;
}

export type TeamRecordDetailSource = "database" | "external";
export type PlayerRole = "starter" | "substitute";

export interface TeamRecordPlayerAppearance {
  number: number;
  name: string;
  position: string;
  role: PlayerRole;
  minutesPlayed: number | null;
}

export interface TeamRecordLineup {
  teamId: string;
  teamName: string;
  formation: string;
  starters: TeamRecordPlayerAppearance[];
  substitutes: TeamRecordPlayerAppearance[];
  confidence: "reported";
}

export interface TeamRecordTeamStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  xg: number | null;
}

export type TeamRecordDataIntegrity = "score_only" | "partial_external" | "complete_external";

export interface TeamRecordBasicFacts {
  kickoffTime: string;
  fullTimeScore: string;
  resultText: string;
  homeResult: MatchResult;
  awayResult: MatchResult;
  dataIntegrity: TeamRecordDataIntegrity;
}

export interface TeamRecordMatchDetail {
  matchId: string;
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
  status: "finished";
  source: TeamRecordDetailSource;
  sourceLabel: string;
  sourceUrl?: string;
  verifiedAt?: string;
  summary: string;
  basicFacts: TeamRecordBasicFacts;
  missingDataReasons: string[];
  stats: {
    home: TeamRecordTeamStats;
    away: TeamRecordTeamStats;
  } | null;
  lineups: {
    home: TeamRecordLineup;
    away: TeamRecordLineup;
  } | null;
  events: MatchEvent[];
  dataCompleteness: {
    events: boolean;
    stats: boolean;
    lineups: boolean;
  };
}

export interface OddsData {
  matchId: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  marketProbabilities: {
    home: number;
    draw: number;
    away: number;
  };
  timestamp: string;
}

export interface SimulationTeamProbability {
  team: string;
  probability: number;
  team_rating: number;
}

export interface WorldCupSimulation {
  iterations: number;
  champion_probability: SimulationTeamProbability[];
  semifinal_probability: SimulationTeamProbability[];
  dark_horse_probability: SimulationTeamProbability[];
  upset_probability: number;
}

export interface BacktestResult {
  matches: number;
  log_loss: number | null;
  brier_score: number | null;
  quality_gate?: {
    status: "pass" | "fail" | "insufficient_data";
    promotion_allowed: boolean;
    summary: string;
    excluded_no_causal_snapshot: number;
    leakage_blocked_count: number;
    learning_actions: string[];
  };
  roi:
    | number
    | {
        bets: number;
        profit_units: number;
        roi: number;
      };
}

export interface ModelQualitySample {
  matchId: string;
  title: string;
  kickoffTime: string;
  generatedAt: string;
  actualScore: string;
  predictedScore: string;
  actualResult: "home" | "draw" | "away";
  predictedResult: "home" | "draw" | "away";
  baselineResult: "home" | "draw" | "away";
  probabilityOfActualResult: number;
  brierScore: number;
  logLoss: number;
  resultHit: boolean;
  baselineHit: boolean;
  top1ScoreHit: boolean;
  top3ScoreHit: boolean;
  favoriteDirection: "home" | "draw" | "away" | null;
  favoriteMissed: boolean;
}

export interface ModelQualityGate {
  status: "pass" | "fail" | "insufficient_data";
  promotionAllowed: boolean;
  evaluatedFinishedMatches: number;
  sampleCount: number;
  excludedNoCausalSnapshot: number;
  excludedExtraTimeOrPenalty: number;
  leakageBlockedCount: number;
  resultAccuracy: number | null;
  baselineAccuracy: number | null;
  top1ScoreAccuracy: number | null;
  top3ScoreAccuracy: number | null;
  averageBrierScore: number | null;
  averageLogLoss: number | null;
  favoriteMissRate: number | null;
  thresholds: {
    minSamples: number;
    minResultAccuracy: number;
    minTop3ScoreAccuracy: number;
    maxBrierScore: number;
    maxLogLoss: number;
    maxFavoriteMissRate: number;
    baselineTolerance: number;
  };
  gateFailures: string[];
  learningActions: string[];
  summary: string;
  samples: ModelQualitySample[];
}

export interface AnalyticsOverview {
  totalMatches: number;
  statusCounts: Array<{ name: MatchStatus; value: number }>;
  styleCounts: Array<{ name: GameStyle; value: number }>;
  upsetCounts: Array<{ name: UpsetRisk; value: number }>;
  competitionCounts: Array<{ name: string; value: number }>;
  probabilityAverages: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  evaluationSummary: {
    finishedCount: number;
    top1Hits: number;
    top3Hits: number;
    resultHits: number;
    failures: number;
    top1HitRate: number;
    top3HitRate: number;
    resultHitRate: number;
    excludedWithoutCausalSnapshot?: number;
    leakageBlockedCount?: number;
    extraTimeExcluded?: number;
    rawFinishedWithEvaluation?: number;
  };
  qualityGate: ModelQualityGate;
  modelInfo: {
    name: string;
    version: string;
    type: string;
    description: string;
    dimensions: string[];
  };
  failureReview: {
    summary: string;
    directionFailures: number;
    scoreOnlyFailures: number;
    topReasons: Array<{ reason: string; count: number }>;
    recommendedActions: string[];
    failedMatches: Array<{
      id: string;
      title: string;
      competition: string;
      actualScore: string;
      predictedScore: string;
      resultHit: boolean;
      primaryReason: string;
    }>;
  };
  topUpsets: Array<{
    id: string;
    title: string;
    competition: string;
    upsetRisk: UpsetRisk;
    strongerTeam: string;
  }>;
}

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

export interface ScoreProbabilityMatrixItem extends ScorePrediction {
  homeGoals: number;
  awayGoals: number;
}

export interface EnhancedScorePrediction {
  score: string;
  probability: number;
  modelProbability?: number;
  historicalProbability?: number;
  impliedProbability?: number;
  edge?: number;
}

export interface WorldCupScoreEnhancement {
  rawTop3: EnhancedScorePrediction[];
  adjustedTop3: EnhancedScorePrediction[];
  keep: boolean;
  rejectReasons: string[];
  mass3: number;
  entropy3: number;
  scenarioSpan: number;
  histBucket: string;
  histTop3Mass: number;
  histTop3: EnhancedScorePrediction[];
  matchScore: number;
  calibratedTop3Hit: boolean | null;
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

export interface PredictionFailureBreakdown {
  title: string;
  detail: string;
  evidence: string[];
}

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
  matchSummary?: string[];
  failureBreakdown?: PredictionFailureBreakdown[];
  dataGaps?: string[];
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
  drawTrapBreakthroughRate?: number;
  drawTrapMarginUnderestimate?: number;
  favoriteCleanSheetBustRate?: number;
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
  scoreProbabilityMatrix?: ScoreProbabilityMatrixItem[];
  gameStyle: GameStyle;
  upsetRisk: UpsetRisk;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  generatedAt: string;
  lineupProjection?: MatchLineupProjection;
  preMatchContext?: PreMatchContext;
  postMatchCalibration?: PostMatchCalibration;
  scoreEnhancement?: WorldCupScoreEnhancement;
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

export type OfficialMatchSource = "fifa" | "uefa" | "kaggle";

export interface OfficialMatchRecord {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  score90Min: string;
  stage: string;
  matchDate: string;
  isExtraTime: boolean;
  isPenalty: boolean;
  source: OfficialMatchSource;
}

export interface OfficialMatchRecordWire {
  match_id: string;
  home_team: string;
  away_team: string;
  score_90min: string;
  stage: string;
  match_date: string;
  is_extra_time: boolean;
  is_penalty: boolean;
  source: OfficialMatchSource;
}

export interface OfficialMatchResponse {
  officialMatchRecord: OfficialMatchRecord;
  official_match_record: OfficialMatchRecordWire;
  sourceUsed: OfficialMatchSource;
  source_used: OfficialMatchSource;
  confidence: number;
  truthLayer: "Official Football Truth Layer";
  truth_layer: "Official Football Truth Layer";
}

export interface OfficialTruthStatus {
  available: boolean;
  recordCount: number;
  sourceCounts: Record<OfficialMatchSource, number>;
  filePath: string | null;
  truthLayer: "Official Football Truth Layer";
}

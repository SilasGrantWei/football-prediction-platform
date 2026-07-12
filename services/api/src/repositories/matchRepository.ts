import { query } from "../db.js";
import { config } from "../config.js";
import { demoStore } from "../demoStore.js";
import type {
  EventType,
  Match,
  MatchDecision,
  MatchEvent,
  MatchStatus,
  Prediction,
  ScorePrediction,
  TrendPoint,
  UpsetRisk
} from "../models.js";
import { staleScheduledDisplayCutoffMs } from "../services/matchDisplayPolicy.js";
import { matchDisplayTimeZone } from "../services/matchPeriodPolicy.js";

interface MatchRow {
  id: string;
  competition: string;
  home_score: number;
  away_score: number;
  full_match_home_score: number | null;
  full_match_away_score: number | null;
  penalty_shootout_home_score: number | null;
  penalty_shootout_away_score: number | null;
  result_decision: MatchDecision | null;
  status: MatchStatus;
  start_time: string | Date;
  minute: number;
  winner_team_id: string | null;
  home_team_id: string;
  home_team_name: string;
  home_fifa_rating: string;
  home_recent_form: string;
  home_attack_avg: string;
  home_defense_avg: string;
  home_xga: string;
  away_team_id: string;
  away_team_name: string;
  away_fifa_rating: string;
  away_recent_form: string;
  away_attack_avg: string;
  away_defense_avg: string;
  away_xga: string;
  home_win_prob: string | null;
  draw_prob: string | null;
  away_win_prob: string | null;
  top_scores: unknown | null;
  game_style: Prediction["gameStyle"] | null;
  upset_risk: UpsetRisk | null;
  expected_home_goals: string | null;
  expected_away_goals: string | null;
  generated_at: string | Date | null;
  model_version: string | null;
}

interface EventRow {
  id: number;
  match_id: string;
  minute: number;
  type: EventType;
  team: string;
  player: string;
  created_at: string | Date;
}

export interface MatchFilters {
  status?: MatchStatus | MatchStatus[];
  competition?: string;
  period?: "today" | "tomorrow";
  displayable?: boolean;
}

export interface MatchStateUpdate {
  minute: number;
  homeScore: number;
  awayScore: number;
  fullMatchHomeScore?: number;
  fullMatchAwayScore?: number;
  penaltyShootoutHomeScore?: number;
  penaltyShootoutAwayScore?: number;
  resultDecision?: MatchDecision;
  status: MatchStatus;
  homeTeamId?: string;
  awayTeamId?: string;
  startTime?: string;
  winnerTeamId?: string;
}

const MATCH_SELECT = `
  SELECT
    m.id,
    m.competition,
    m.home_score,
    m.away_score,
    m.full_match_home_score,
    m.full_match_away_score,
    m.penalty_shootout_home_score,
    m.penalty_shootout_away_score,
    m.result_decision,
    m.status,
    COALESCE(m.kickoff_time, m.start_time) AS start_time,
    m.minute,
    m.winner_team_id,
    ht.id AS home_team_id,
    ht.name AS home_team_name,
    ht.fifa_rating AS home_fifa_rating,
    ht.recent_form AS home_recent_form,
    ht.attack_avg AS home_attack_avg,
    ht.defense_avg AS home_defense_avg,
    ht.xga AS home_xga,
    at.id AS away_team_id,
    at.name AS away_team_name,
    at.fifa_rating AS away_fifa_rating,
    at.recent_form AS away_recent_form,
    at.attack_avg AS away_attack_avg,
    at.defense_avg AS away_defense_avg,
    at.xga AS away_xga,
    p.home_win_prob,
    p.draw_prob,
    p.away_win_prob,
    p.top_scores,
    p.game_style,
    p.upset_risk,
    p.expected_home_goals,
    p.expected_away_goals,
    p.generated_at,
    p.model_version
  FROM matches m
  JOIN teams ht ON ht.id = m.home_team_id
  JOIN teams at ON at.id = m.away_team_id
  LEFT JOIN predictions p ON p.match_id = m.id
`;

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  return Number(value);
}

function parseTopScores(value: unknown): ScorePrediction[] {
  const rawScores = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(rawScores)) return [];

  return rawScores.map((item) => {
    if (typeof item === "string") return { score: item, probability: 0 };
    const candidate = item as Partial<ScorePrediction>;
    return {
      score: String(candidate.score ?? ""),
      probability: Number(candidate.probability ?? 0)
    };
  });
}

function rowToPrediction(row: MatchRow): Prediction | undefined {
  if (row.home_win_prob === null || row.draw_prob === null || row.away_win_prob === null) {
    return undefined;
  }

  return {
    matchId: row.id,
    homeWinProb: toNumber(row.home_win_prob),
    drawProb: toNumber(row.draw_prob),
    awayWinProb: toNumber(row.away_win_prob),
    topScores: parseTopScores(row.top_scores),
    gameStyle: row.game_style ?? "balanced",
    upsetRisk: row.upset_risk ?? "low",
    expectedHomeGoals: toNumber(row.expected_home_goals),
    expectedAwayGoals: toNumber(row.expected_away_goals),
    generatedAt: row.generated_at ? toIso(row.generated_at) : new Date().toISOString(),
    modelVersion: row.model_version ?? undefined
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    competition: row.competition,
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      fifaRating: toNumber(row.home_fifa_rating),
      recentForm: toNumber(row.home_recent_form),
      attackAvg: toNumber(row.home_attack_avg),
      defenseAvg: toNumber(row.home_defense_avg),
      xga: toNumber(row.home_xga)
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      fifaRating: toNumber(row.away_fifa_rating),
      recentForm: toNumber(row.away_recent_form),
      attackAvg: toNumber(row.away_attack_avg),
      defenseAvg: toNumber(row.away_defense_avg),
      xga: toNumber(row.away_xga)
    },
    homeScore: row.home_score,
    awayScore: row.away_score,
    ...(row.full_match_home_score !== null && row.full_match_away_score !== null
      ? {
          fullMatchHomeScore: row.full_match_home_score,
          fullMatchAwayScore: row.full_match_away_score
        }
      : {}),
    ...(row.penalty_shootout_home_score !== null && row.penalty_shootout_away_score !== null
      ? {
          penaltyShootoutHomeScore: row.penalty_shootout_home_score,
          penaltyShootoutAwayScore: row.penalty_shootout_away_score
        }
      : {}),
    ...(row.result_decision ? { resultDecision: row.result_decision } : {}),
    status: row.status,
    startTime: toIso(row.start_time),
    minute: row.minute,
    winnerTeamId: row.winner_team_id ?? undefined,
    prediction: rowToPrediction(row)
  };
}

function rowToEvent(row: EventRow): MatchEvent {
  return {
    id: row.id,
    matchId: row.match_id,
    minute: row.minute,
    type: row.type,
    team: row.team,
    player: row.player,
    createdAt: toIso(row.created_at)
  };
}

function buildWhere(filters: MatchFilters, values: unknown[]): string {
  const clauses: string[] = [];

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    values.push(statuses);
    clauses.push(`m.status = ANY($${values.length})`);
  }

  if (filters.competition) {
    values.push(filters.competition);
    clauses.push(`m.competition = $${values.length}`);
  }

  const kickoffExpression = "COALESCE(m.kickoff_time, m.start_time)";
  const todayStartExpression = `(date_trunc('day', NOW() AT TIME ZONE '${matchDisplayTimeZone}') AT TIME ZONE '${matchDisplayTimeZone}')`;

  if (filters.period === "today") {
    clauses.push(`${kickoffExpression} >= ${todayStartExpression}`);
    clauses.push(`${kickoffExpression} < ${todayStartExpression} + INTERVAL '1 day'`);
  }

  if (filters.period === "tomorrow") {
    clauses.push(`${kickoffExpression} >= ${todayStartExpression} + INTERVAL '1 day'`);
    clauses.push(`${kickoffExpression} < ${todayStartExpression} + INTERVAL '2 days'`);
  }

  if (filters.displayable) {
    values.push(`${staleScheduledDisplayCutoffMs} milliseconds`);
    clauses.push(`NOT (m.status = 'scheduled' AND ${kickoffExpression} < NOW() - $${values.length}::interval)`);
  }

  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

export class MatchRepository {
  async findMatches(filters: MatchFilters = {}): Promise<Match[]> {
    if (config.demoMode) return demoStore.findMatches(filters);

    const values: unknown[] = [];
    const where = buildWhere(filters, values);
    const result = await query<MatchRow>(
      `${MATCH_SELECT}
       ${where}
       ORDER BY
         CASE m.status WHEN 'live' THEN 1 WHEN 'halftime' THEN 2 WHEN 'scheduled' THEN 3 ELSE 4 END,
         CASE WHEN m.status = 'finished' THEN COALESCE(m.kickoff_time, m.start_time) END DESC,
         CASE WHEN m.status <> 'finished' THEN COALESCE(m.kickoff_time, m.start_time) END ASC,
         ht.name ASC,
         at.name ASC`,
      values
    );

    return result.rows.map(rowToMatch);
  }

  async findById(id: string): Promise<Match | null> {
    if (config.demoMode) return demoStore.findById(id);

    const result = await query<MatchRow>(`${MATCH_SELECT} WHERE m.id = $1`, [id]);
    return result.rows[0] ? rowToMatch(result.rows[0]) : null;
  }

  async findEvents(matchId: string): Promise<MatchEvent[]> {
    if (config.demoMode) return demoStore.findEvents(matchId);

    const result = await query<EventRow>(
      `SELECT e.id, e.match_id, e.minute, e.type, t.name AS team, e.player, e.created_at
       FROM events e
       JOIN teams t ON t.id = e.team_id
       WHERE e.match_id = $1
       ORDER BY e.minute ASC, e.id ASC`,
      [matchId]
    );

    return result.rows.map(rowToEvent);
  }

  async eventExists(matchId: string, minute: number, type: EventType): Promise<boolean> {
    if (config.demoMode) return demoStore.eventExists(matchId, minute, type);

    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM events WHERE match_id = $1 AND minute = $2 AND type = $3
       )`,
      [matchId, minute, type]
    );

    return Boolean(result.rows[0]?.exists);
  }

  async createEvent(matchId: string, minute: number, type: EventType, teamId: string, player: string): Promise<void> {
    if (config.demoMode) {
      demoStore.createEvent(matchId, minute, type, teamId, player);
      return;
    }

    await query(
      `INSERT INTO events (match_id, minute, type, team_id, player)
       VALUES ($1, $2, $3, $4, $5)`,
      [matchId, minute, type, teamId, player]
    );
  }

  async updateMatchState(matchId: string, state: MatchStateUpdate): Promise<void> {
    if (config.demoMode) {
      demoStore.updateMatchState(matchId, state);
      return;
    }

    await query(
      `UPDATE matches
       SET minute = $2,
           home_score = $3,
           away_score = $4,
           status = $5,
           home_team_id = COALESCE($6, home_team_id),
            away_team_id = COALESCE($7, away_team_id),
            kickoff_time = COALESCE($8::timestamptz, kickoff_time),
            winner_team_id = COALESCE($9, winner_team_id),
            full_match_home_score = COALESCE($10, full_match_home_score),
            full_match_away_score = COALESCE($11, full_match_away_score),
            penalty_shootout_home_score = CASE
              WHEN $14::text IS NULL THEN penalty_shootout_home_score
              WHEN $14::text = 'penalties' THEN COALESCE($12, penalty_shootout_home_score)
              ELSE NULL
            END,
            penalty_shootout_away_score = CASE
              WHEN $14::text IS NULL THEN penalty_shootout_away_score
              WHEN $14::text = 'penalties' THEN COALESCE($13, penalty_shootout_away_score)
              ELSE NULL
            END,
            result_decision = COALESCE($14, result_decision),
            updated_at = NOW()
       WHERE id = $1`,
      [
        matchId,
        state.minute,
        state.homeScore,
        state.awayScore,
        state.status,
        state.homeTeamId ?? null,
        state.awayTeamId ?? null,
        state.startTime ?? null,
        state.winnerTeamId ?? null,
        state.fullMatchHomeScore ?? null,
        state.fullMatchAwayScore ?? null,
        state.penaltyShootoutHomeScore ?? null,
        state.penaltyShootoutAwayScore ?? null,
        state.resultDecision ?? null
      ]
    );
  }

  async upsertPrediction(prediction: Prediction): Promise<void> {
    if (config.demoMode) {
      demoStore.upsertPrediction(prediction);
      return;
    }

    await query(
      `INSERT INTO predictions (
         match_id,
         home_win_prob,
         draw_prob,
         away_win_prob,
         top_scores,
         game_style,
         upset_risk,
         expected_home_goals,
         expected_away_goals,
         generated_at,
         model_version
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (match_id) DO UPDATE SET
         home_win_prob = EXCLUDED.home_win_prob,
         draw_prob = EXCLUDED.draw_prob,
         away_win_prob = EXCLUDED.away_win_prob,
         top_scores = EXCLUDED.top_scores,
         game_style = EXCLUDED.game_style,
         upset_risk = EXCLUDED.upset_risk,
         expected_home_goals = EXCLUDED.expected_home_goals,
         expected_away_goals = EXCLUDED.expected_away_goals,
         generated_at = EXCLUDED.generated_at,
         model_version = EXCLUDED.model_version`,
      [
        prediction.matchId,
        prediction.homeWinProb,
        prediction.drawProb,
        prediction.awayWinProb,
        JSON.stringify(prediction.topScores),
        prediction.gameStyle,
        prediction.upsetRisk,
        prediction.expectedHomeGoals,
        prediction.expectedAwayGoals,
        prediction.generatedAt,
        prediction.modelVersion ?? "poisson-multifactor-v2"
      ]
    );
  }

  async buildTrend(matchId: string): Promise<TrendPoint[]> {
    if (config.demoMode) return demoStore.buildTrend(matchId);

    const match = await this.findById(matchId);
    if (!match) return [];

    const events = await this.findEvents(matchId);
    const maxMinute = match.status === "scheduled" ? 90 : Math.max(15, match.minute);
    const homeBase = match.prediction ? 50 + (match.prediction.homeWinProb - match.prediction.awayWinProb) * 32 : 50;
    const points: TrendPoint[] = [];

    for (let minute = 0; minute <= maxMinute; minute += 15) {
      const eventImpact = events
        .filter((event) => event.minute <= minute)
        .reduce(
          (impact, event) => {
            const isHome = event.team === match.homeTeam.name;
            const direction = isHome ? 1 : -1;
            if (event.type === "goal" || event.type === "penalty") return impact + direction * 12;
            if (event.type === "red_card") return impact - direction * 10;
            return impact - direction * 4;
          },
          0
        );

      const wave = Math.sin(minute / 14) * 6;
      const homeMomentum = clamp(homeBase + eventImpact + wave, 5, 95);
      points.push({
        minute,
        homeMomentum: Math.round(homeMomentum),
        awayMomentum: Math.round(100 - homeMomentum)
      });
    }

    if (!points.some((point) => point.minute === maxMinute)) {
      const last = points[points.length - 1];
      points.push({ ...last, minute: maxMinute });
    }

    return points;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const matchRepository = new MatchRepository();

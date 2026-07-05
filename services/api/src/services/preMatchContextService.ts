import type {
  Match,
  MatchLineupProjection,
  PreMatchContext,
  PreMatchContextFactor,
  PreMatchTeamContext,
  TeamLineupProjection
} from "../models.js";
import type { TeamTournamentFactors, WorldCupFactors } from "./worldCupFactors.js";

interface ClimateProfile {
  venueLabel: string;
  climateBand: string;
  temperatureC: number;
  humidity: number;
  windKph: number;
  sourceLabel: string;
  confidence: "low" | "medium" | "high";
}

export function buildPreMatchContextSignal(
  match: Match,
  factors: WorldCupFactors,
  lineupProjection?: MatchLineupProjection
): PreMatchContext {
  const weather = climateBaseline(match);
  const climateStress = climateStressIndex(weather);
  const windStress = clamp((weather.windKph - 10) / 25, 0, 0.45);
  const tempoMultiplier = round3(clamp(1 - climateStress * 0.08 - windStress * 0.04 + (factors.isGroupStage ? 0.012 : 0), 0.88, 1.04));
  const drawModifier = round4(clamp(climateStress * 0.028 + windStress * 0.018 + (factors.isKnockout ? 0.012 : 0), 0, 0.06));
  const home = buildTeamContext(match.homeTeam.id, match.homeTeam.name, factors.home, factors.away, climateStress, lineupProjection?.home);
  const away = buildTeamContext(match.awayTeam.id, match.awayTeam.name, factors.away, factors.home, climateStress, lineupProjection?.away);
  const volatilityModifier = round4(
    clamp(Math.abs(home.concedeMultiplier - away.concedeMultiplier) * 0.30 + (climateStress + windStress) * 0.06, 0, 0.075)
  );

  return {
    matchId: match.id,
    generatedAt: new Date().toISOString(),
    inputMode: "pre_match_only",
    weather: {
      ...weather,
      summary:
        `${weather.venueLabel}赛前气候基线：${weather.climateBand}，` +
        `约${weather.temperatureC}°C、湿度${weather.humidity}%、风速${weather.windKph}km/h。`
    },
    tempoMultiplier,
    drawModifier,
    volatilityModifier,
    home,
    away,
    factors: [
      climateFactor(match, weather, climateStress),
      restTravelFactor(match, factors.home, factors.away),
      lineupFactor(match, lineupProjection),
      stagePressureFactor(match, factors)
    ],
    summary:
      `只用开赛前上下文：${weather.climateBand}、休息差、旅行消耗、赛程压力和推算阵容可用性进入90分钟比分λ；` +
      "不会读取本场实时比分、分钟或赛果。",
    sources: [
      {
        label: "Open-Meteo 历史气候接口",
        url: "https://open-meteo.com/"
      },
      {
        label: "FIFA 2026 赛程与主办城市资料",
        url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
      }
    ]
  };
}

function buildTeamContext(
  teamId: string,
  teamName: string,
  teamFactors: TeamTournamentFactors,
  opponentFactors: TeamTournamentFactors,
  climateStress: number,
  lineup?: TeamLineupProjection
): PreMatchTeamContext {
  const restEdge = teamFactors.restDays - opponentFactors.restDays;
  const lineupAttack = lineup?.attackImpact ?? 0;
  const lineupCreation = lineup?.creationImpact ?? 0;
  const lineupDefense = lineup?.defensiveImpact ?? 0;
  const lineupDepth = lineup?.starters.length ? 0.5 : 0;
  const goalMultiplier = round3(
    clamp(
      1 +
        teamFactors.hostAdvantage * 0.030 +
        restEdge * 0.012 -
        teamFactors.travelFatigue * 0.055 +
        lineupAttack * 0.035 +
        lineupCreation * 0.020 -
        climateStress * 0.035,
      0.90,
      1.10
    )
  );
  const concedeMultiplier = round3(
    clamp(1 + teamFactors.travelFatigue * 0.045 - teamFactors.squadAvailability * 0.025 - lineupDefense * 0.035 + climateStress * 0.025, 0.90, 1.12)
  );
  const strengthDelta = round2(
    teamFactors.hostAdvantage * 2.2 +
      restEdge * 0.55 -
      teamFactors.travelFatigue * 2.4 +
      (teamFactors.squadAvailability - 0.84) * 4 +
      (lineupAttack + lineupCreation + lineupDefense) * 1.2 +
      lineupDepth -
      climateStress * 1.2
  );

  return {
    teamId,
    teamName,
    goalMultiplier,
    concedeMultiplier,
    strengthDelta,
    notes: [
      `进球λ修正 ${formatSignedMultiplier(goalMultiplier)}`,
      `失球λ修正 ${formatSignedMultiplier(concedeMultiplier)}`,
      lineup?.starters.length ? `推算阵容已纳入 ${lineup.starters.length} 名首发候选` : "未接入可验证阵容时不使用空名单抬高权重"
    ]
  };
}

function climateBaseline(match: Match): ClimateProfile {
  const kickoff = new Date(match.startTime);
  const month = Number.isFinite(kickoff.getTime()) ? kickoff.getUTCMonth() + 1 : 7;
  const homeId = normalize(match.homeTeam.id + " " + match.homeTeam.name);
  const awayId = normalize(match.awayTeam.id + " " + match.awayTeam.name);
  const isSummer = month >= 6 && month <= 8;

  if (homeId.includes("mexico") || awayId.includes("mexico")) {
    return {
      venueLabel: "墨西哥赛区",
      climateBand: "高海拔偏暖",
      temperatureC: isSummer ? 27 : 24,
      humidity: 48,
      windKph: 12,
      sourceLabel: "赛前气候基线（无实时天气时使用主办地历史均值，不当作实况天气）",
      confidence: "medium"
    };
  }

  if (homeId.includes("canada") || awayId.includes("canada")) {
    return {
      venueLabel: "加拿大赛区",
      climateBand: "温和偏凉",
      temperatureC: isSummer ? 21 : 16,
      humidity: 62,
      windKph: 14,
      sourceLabel: "赛前气候基线（无实时天气时使用主办地历史均值，不当作实况天气）",
      confidence: "medium"
    };
  }

  if (homeId.includes("usa") || awayId.includes("usa") || homeId.includes("united states") || awayId.includes("united states")) {
    return {
      venueLabel: "美国赛区",
      climateBand: "夏季偏热",
      temperatureC: isSummer ? 30 : 22,
      humidity: 56,
      windKph: 11,
      sourceLabel: "赛前气候基线（无实时天气时使用主办地历史均值，不当作实况天气）",
      confidence: "medium"
    };
  }

  return {
    venueLabel: "北美中立赛区",
    climateBand: "中性夏季",
    temperatureC: isSummer ? 25 : 20,
    humidity: 58,
    windKph: 10,
    sourceLabel: "赛前气候基线（未接入具体球场天气前使用主办地历史均值，不当作实况天气）",
    confidence: "low"
  };
}

function climateStressIndex(profile: ClimateProfile): number {
  const heat = clamp((profile.temperatureC - 24) / 12, 0, 1);
  const humidity = clamp((profile.humidity - 55) / 35, 0, 1);
  return clamp(heat * 0.72 + humidity * 0.28, 0, 1);
}

function climateFactor(match: Match, weather: ClimateProfile, climateStress: number): PreMatchContextFactor {
  return {
    name: "赛前气候/温度",
    homeValue: `${weather.temperatureC}°C / 湿度${weather.humidity}%`,
    awayValue: `${weather.windKph}km/h风速`,
    edge: "even",
    explanation:
      `${weather.sourceLabel}。${weather.climateBand}会影响比赛节奏、冲刺恢复和后段失误率；` +
      `本场气候压力指数为${formatProbability(climateStress)}，只作为赛前环境修正。`
  };
}

function restTravelFactor(match: Match, home: TeamTournamentFactors, away: TeamTournamentFactors): PreMatchContextFactor {
  const homeScore = home.restDays * 0.18 - home.travelFatigue;
  const awayScore = away.restDays * 0.18 - away.travelFatigue;
  return {
    name: "休息/旅行消耗",
    homeValue: `${home.restDays}天休息 / 消耗${formatPercent(home.travelFatigue)}`,
    awayValue: `${away.restDays}天休息 / 消耗${formatPercent(away.travelFatigue)}`,
    edge: edgeFrom(homeScore, awayScore),
    explanation: `${match.homeTeam.name}与${match.awayTeam.name}的休息差和旅行消耗会进入90分钟后段体能与失误率修正。`
  };
}

function lineupFactor(match: Match, projection?: MatchLineupProjection): PreMatchContextFactor {
  const homeValue = projection?.home.starters.length
    ? `进攻+${formatPercent(projection.home.attackImpact)} / 创造+${formatPercent(projection.home.creationImpact)}`
    : "未接入可验证首发";
  const awayValue = projection?.away.starters.length
    ? `进攻+${formatPercent(projection.away.attackImpact)} / 创造+${formatPercent(projection.away.creationImpact)}`
    : "未接入可验证首发";
  const homeScore = projection ? lineupScore(projection.home) : 0;
  const awayScore = projection ? lineupScore(projection.away) : 0;
  return {
    name: "球员/阵容情况",
    homeValue,
    awayValue,
    edge: edgeFrom(homeScore, awayScore),
    explanation:
      `${match.homeTeam.name}和${match.awayTeam.name}的推算首发只做低权重赛前修正；` +
      "接入真实首发后会覆盖推算名单，未接入时不会用空名单反推赛果。"
  };
}

function stagePressureFactor(match: Match, factors: WorldCupFactors): PreMatchContextFactor {
  return {
    name: "赛程阶段压力",
    homeValue: factors.stageLabel,
    awayValue: `90分钟平局倾向${formatPercent(factors.extraTimeRisk)}`,
    edge: "even",
    explanation:
      `${match.competition}只推算90分钟常规时间加伤停补时。` +
      "淘汰赛阶段会提高谨慎、平局和一球差比分权重，但加时赛和点球不进入比分。"
  };
}

function lineupScore(lineup: TeamLineupProjection): number {
  if (!lineup.starters.length) return 0;
  return lineup.attackImpact * 0.46 + lineup.creationImpact * 0.34 + lineup.defensiveImpact * 0.20;
}

function edgeFrom(homeMetric: number, awayMetric: number): PreMatchContextFactor["edge"] {
  const diff = homeMetric - awayMetric;
  if (Math.abs(diff) < 0.03) return "even";
  return diff > 0 ? "home" : "away";
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function formatSignedMultiplier(value: number): string {
  const diff = (value - 1) * 100;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatProbability(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import type { Match, Team } from "../models.js";

export interface TeamTournamentFactors {
  group: string;
  groupPoints: number;
  groupGoalDiff: number;
  groupGoalsFor: number;
  groupRank: number;
  qualifierType: string;
  restDays: number;
  travelFatigue: number;
  knockoutPressure: number;
  squadAvailability: number;
  tacticalTransition: number;
  setPiece: number;
  volatility: number;
  hostAdvantage: number;
  formScore: number;
  goalMultiplier: number;
  defensiveMultiplier: number;
  strengthAdjustment: number;
  keyPlayers: string[];
  availability: string;
  tacticalNote: string;
  tournamentSummary: string;
}

export interface WorldCupFactors {
  home: TeamTournamentFactors;
  away: TeamTournamentFactors;
  isKnockout: boolean;
  isGroupStage: boolean;
  stageLabel: string;
  extraTimeRisk: number;
  h2hSummary: string;
  sources: Array<{ label: string; url: string }>;
}

interface TeamProfile {
  group: string;
  groupPoints: number;
  groupGoalDiff: number;
  groupGoalsFor: number;
  groupRank: number;
  qualifierType: string;
  lastPlayedAt: string;
  confederation: "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC";
  pedigree: number;
  volatility: number;
  pressure: number;
  transition: number;
  setPiece: number;
  squadAvailability: number;
  keyPlayers: string[];
  availability: string;
  tacticalNote: string;
}

const defaultProfile = {
  pedigree: 0.35,
  volatility: 0.38,
  pressure: 0.42,
  transition: 0.45,
  setPiece: 0.35,
  squadAvailability: 0.84,
  keyPlayers: ["暂无明确核心球员数据"],
  availability: "暂无明确伤停，按常规阵容可用性估计。",
  tacticalNote: "暂无细分战术画像，按球队基础攻防均值建模。"
};

const profiles: Record<string, TeamProfile> = {
  mexico: profile("A", 9, 6, 6, 1, "小组第一", "2026-06-25T01:00:00.000Z", "CONCACAF", {
    pressure: 0.40,
    setPiece: 0.42,
    keyPlayers: ["希门尼斯", "洛萨诺", "阿尔瓦雷斯"],
    tacticalNote: "墨西哥本土环境适应性强，小组赛防守稳定性是主要加分项。"
  }),
  south_africa: profile("A", 4, 0, 2, 3, "成绩较好第三名", "2026-06-25T01:00:00.000Z", "CAF", {
    volatility: 0.46,
    pressure: 0.55,
    tacticalNote: "南非更依赖中低位防守和反击，领先后比赛节奏会明显放慢。"
  }),
  south_korea: profile("A", 3, 0, 3, 4, "小组第四", "2026-06-25T01:00:00.000Z", "AFC", {
    transition: 0.57,
    volatility: 0.44,
    keyPlayers: ["孙兴慜", "黄喜灿"],
    tacticalNote: "韩国冲刺和前场压迫有威胁，但连续作战的体能衰减需要扣分。"
  }),
  czechia: profile("A", 2, -6, 1, 2, "小组第二", "2026-06-25T01:00:00.000Z", "UEFA", {
    setPiece: 0.46,
    pressure: 0.34,
    tacticalNote: "捷克定位球和身体对抗权重较高，阵地战创造力相对保守。"
  }),
  switzerland: profile("B", 7, 4, 7, 1, "小组第一", "2026-06-24T17:00:00.000Z", "UEFA", {
    pressure: 0.24,
    setPiece: 0.48,
    volatility: 0.30,
    tacticalNote: "瑞士结构稳定，防守和定位球是淘汰赛保底能力。"
  }),
  canada: profile("B", 4, 5, 8, 2, "小组第二", "2026-06-24T17:00:00.000Z", "CONCACAF", {
    transition: 0.58,
    setPiece: 0.38,
    keyPlayers: ["戴维", "戴维斯", "欧斯塔基奥"],
    tacticalNote: "加拿大推进速度快，边路冲刺和转换是主要进攻来源。"
  }),
  bosnia: profile("B", 4, -1, 5, 3, "成绩较好第三名", "2026-06-24T17:00:00.000Z", "UEFA", {
    setPiece: 0.46,
    pressure: 0.44,
    tacticalNote: "波黑更依赖定位球和中路支点，面对高压时出球稳定性是关键。"
  }),
  qatar: profile("B", 1, -8, 2, 4, "小组第四", "2026-06-24T17:00:00.000Z", "AFC", {
    volatility: 0.52,
    squadAvailability: 0.80,
    tacticalNote: "卡塔尔小组赛防线承压明显，模型会提高被压制场景权重。"
  }),
  brazil: profile("C", 7, 6, 7, 1, "小组第一", "2026-06-24T21:00:00.000Z", "CONMEBOL", {
    pedigree: 0.92,
    volatility: 0.36,
    pressure: 0.34,
    transition: 0.72,
    setPiece: 0.44,
    keyPlayers: ["维尼修斯", "罗德里戈", "马丁内利"],
    tacticalNote: "巴西边路一对一和前场转换质量高，领先后仍有持续压迫能力。"
  }),
  morocco: profile("C", 7, 3, 6, 2, "小组第二", "2026-06-24T21:00:00.000Z", "CAF", {
    pedigree: 0.55,
    volatility: 0.32,
    pressure: 0.26,
    transition: 0.63,
    setPiece: 0.44,
    tacticalNote: "摩洛哥防守纪律和快速反击成熟，适合淘汰赛低比分环境。"
  }),
  scotland: profile("C", 3, -3, 1, 3, "小组第三", "2026-06-24T21:00:00.000Z", "UEFA", {
    setPiece: 0.48,
    pressure: 0.40,
    tacticalNote: "苏格兰定位球和对抗强，但面对速度型边路会承压。"
  }),
  haiti: profile("C", 0, -6, 2, 4, "小组第四", "2026-06-24T21:00:00.000Z", "CONCACAF", {
    volatility: 0.58,
    squadAvailability: 0.78,
    tacticalNote: "海地防线波动较大，适合作为强弱差训练样本。"
  }),
  usa: profile("D", 6, 4, 8, 1, "小组第一", "2026-06-26T01:00:00.000Z", "CONCACAF", {
    transition: 0.61,
    volatility: 0.43,
    keyPlayers: ["普利西奇", "麦肯尼", "雷纳"],
    tacticalNote: "美国主场旅行成本低，逼抢强度和边路推进是主要优势。"
  }),
  australia: profile("D", 4, 0, 2, 2, "小组第二", "2026-06-26T01:00:00.000Z", "AFC", {
    setPiece: 0.52,
    pressure: 0.34,
    tacticalNote: "澳大利亚身体对抗和定位球稳定，开放战创造力相对有限。"
  }),
  paraguay: profile("D", 4, -2, 2, 3, "成绩较好第三名", "2026-06-26T01:00:00.000Z", "CONMEBOL", {
    setPiece: 0.48,
    volatility: 0.40,
    tacticalNote: "巴拉圭防守对抗强，定位球和低比分拉锯是主要胜负手。"
  }),
  turkey: profile("D", 3, -2, 3, 4, "小组第四", "2026-06-26T01:00:00.000Z", "UEFA", {
    transition: 0.60,
    volatility: 0.50,
    tacticalNote: "土耳其转换和远射有爆点，但防线稳定性波动较大。"
  }),
  ivory_coast: profile("E", 6, 2, 4, 1, "小组第一", "2026-06-25T17:00:00.000Z", "CAF", {
    volatility: 0.45,
    transition: 0.62,
    setPiece: 0.40,
    tacticalNote: "科特迪瓦身体对抗和转换速度突出，比赛波动较大。"
  }),
  germany: profile("E", 6, 7, 10, 2, "小组第二", "2026-06-25T17:00:00.000Z", "UEFA", {
    pedigree: 0.88,
    pressure: 0.31,
    transition: 0.56,
    setPiece: 0.52,
    keyPlayers: ["穆西亚拉", "维尔茨", "哈弗茨"],
    tacticalNote: "德国中前场压迫和定位球威胁强，但防线身后空间需要控制。"
  }),
  ecuador: profile("E", 4, 0, 2, 3, "成绩较好第三名", "2026-06-25T17:00:00.000Z", "CONMEBOL", {
    volatility: 0.40,
    transition: 0.55,
    tacticalNote: "厄瓜多尔身体强度和纵向推进不错，但阵地战创造力不稳定。"
  }),
  curacao: profile("E", 1, -9, 1, 4, "小组第四", "2026-06-25T17:00:00.000Z", "CONCACAF", {
    volatility: 0.57,
    squadAvailability: 0.76,
    tacticalNote: "库拉索防守回合数量高，模型会提高丢球风险。"
  }),
  netherlands: profile("F", 7, 6, 10, 1, "小组第一", "2026-06-25T21:00:00.000Z", "UEFA", {
    pedigree: 0.76,
    transition: 0.60,
    setPiece: 0.42,
    keyPlayers: ["范戴克", "加克波", "德容"],
    tacticalNote: "荷兰阵型弹性强，边中结合和高点争夺有稳定输出。"
  }),
  japan: profile("F", 5, 4, 7, 2, "小组第二", "2026-06-25T21:00:00.000Z", "AFC", {
    transition: 0.66,
    volatility: 0.42,
    keyPlayers: ["三笘薫", "久保建英", "远藤航"],
    tacticalNote: "日本通过高强度跑动和二次进攻制造机会，面对强队时更依赖转换效率。"
  }),
  sweden: profile("F", 4, 0, 7, 3, "成绩较好第三名", "2026-06-25T21:00:00.000Z", "UEFA", {
    setPiece: 0.50,
    pressure: 0.42,
    tacticalNote: "瑞典定位球和高空球有威胁，但面对速度型边路会承压。"
  }),
  tunisia: profile("F", 0, -10, 2, 4, "小组第四", "2026-06-25T21:00:00.000Z", "CAF", {
    volatility: 0.48,
    pressure: 0.36,
    tacticalNote: "突尼斯小组赛攻防效率偏低，作为模型负样本权重较高。"
  }),
  belgium: profile("G", 5, 4, 6, 1, "小组第一", "2026-06-27T03:00:00.000Z", "UEFA", {
    pedigree: 0.70,
    volatility: 0.58,
    pressure: 0.43,
    squadAvailability: 0.86,
    transition: 0.54,
    keyPlayers: ["德布劳内", "卢卡库", "库尔图瓦"],
    availability: "卢卡库此前存在出场时间疑问，但对塞内加尔替补登场后仍改变了禁区威胁。",
    tacticalNote: "比利时依赖德布劳内推进和中路最后一传，防线转身速度是风险点。"
  }),
  egypt: profile("G", 5, 2, 5, 2, "小组第二", "2026-06-27T03:00:00.000Z", "CAF", {
    setPiece: 0.45,
    transition: 0.52,
    keyPlayers: ["萨拉赫"],
    tacticalNote: "埃及进攻依赖萨拉赫牵制和右路终结，阵地战节奏偏谨慎。"
  }),
  iran: profile("G", 3, 0, 3, 3, "小组第三", "2026-06-27T03:00:00.000Z", "AFC", {
    setPiece: 0.45,
    volatility: 0.34,
    tacticalNote: "伊朗防守组织和定位球稳定，低比分不败概率高于纸面强弱。"
  }),
  new_zealand: profile("G", 2, -6, 4, 4, "小组第四", "2026-06-27T03:00:00.000Z", "OFC", {
    volatility: 0.58,
    pressure: 0.18,
    tacticalNote: "新西兰防线承压较多，模型会降低持续控球和进攻回合权重。"
  }),
  spain: profile("H", 7, 5, 5, 1, "小组第一", "2026-06-27T00:00:00.000Z", "UEFA", {
    pedigree: 0.84,
    pressure: 0.24,
    transition: 0.56,
    setPiece: 0.36,
    keyPlayers: ["佩德里", "罗德里", "亚马尔"],
    tacticalNote: "西班牙控球压制强，低失误率能持续压低对手进攻回合。"
  }),
  uruguay: profile("H", 3, -1, 3, 2, "小组第二", "2026-06-27T00:00:00.000Z", "CONMEBOL", {
    pedigree: 0.66,
    pressure: 0.30,
    transition: 0.62,
    setPiece: 0.44,
    tacticalNote: "乌拉圭对抗和纵向冲击强，小比分强强战更有韧性。"
  }),
  cape_verde: profile("H", 3, 0, 2, 3, "成绩较好第三名", "2026-06-27T00:00:00.000Z", "CAF", {
    volatility: 0.46,
    pressure: 0.34,
    tacticalNote: "佛得角防守韧性强，低比分拖延能力是主要冷门路径。"
  }),
  saudi_arabia: profile("H", 2, -4, 1, 4, "小组第四", "2026-06-27T00:00:00.000Z", "AFC", {
    volatility: 0.52,
    transition: 0.43,
    tacticalNote: "沙特小组赛被压制场景较多，防线横向移动是主要风险。"
  }),
  france: profile("I", 9, 8, 10, 1, "小组第一", "2026-06-26T19:00:00.000Z", "UEFA", {
    pedigree: 0.96,
    pressure: 0.18,
    transition: 0.78,
    setPiece: 0.44,
    keyPlayers: ["姆巴佩", "格列兹曼", "登贝莱"],
    tacticalNote: "法国拥有本届最稳定的转换和边路爆点，领先后控场能力强。"
  }),
  norway: profile("I", 6, 1, 8, 2, "小组第二", "2026-06-26T19:00:00.000Z", "UEFA", {
    transition: 0.54,
    setPiece: 0.58,
    keyPlayers: ["哈兰德", "厄德高"],
    tacticalNote: "挪威进攻重心集中在哈兰德终结和厄德高中前场连接。"
  }),
  senegal: profile("I", 3, 2, 8, 3, "成绩较好第三名", "2026-06-26T19:00:00.000Z", "CAF", {
    volatility: 0.55,
    pressure: 0.38,
    squadAvailability: 0.72,
    transition: 0.78,
    keyPlayers: ["马内", "伊斯梅拉-萨尔", "恩迪亚耶"],
    availability: "门将爱德华-门迪伤缺会提高防线不确定性。",
    tacticalNote: "塞内加尔边路纵深和快速转换强，适合制造冷门。"
  }),
  iraq: profile("I", 0, -11, 1, 4, "小组第四", "2026-06-26T19:00:00.000Z", "AFC", {
    volatility: 0.68,
    pressure: 0.20,
    tacticalNote: "伊拉克小组赛防线失分较多，模型降低其防守韧性权重。"
  }),
  argentina: profile("J", 9, 7, 8, 1, "小组第一", "2026-06-28T02:30:00.000Z", "CONMEBOL", {
    pedigree: 0.96,
    pressure: 0.20,
    transition: 0.57,
    setPiece: 0.42,
    keyPlayers: ["梅西", "劳塔罗", "麦卡利斯特"],
    tacticalNote: "阿根廷中场控节奏和禁区前最后一传质量高，淘汰赛经验优势明显。"
  }),
  algeria: profile("J", 4, -2, 5, 2, "小组第二", "2026-06-28T02:30:00.000Z", "CAF", {
    volatility: 0.44,
    transition: 0.60,
    tacticalNote: "阿尔及利亚反击和前场个人推进有威胁，但防线连续性不稳。"
  }),
  austria: profile("J", 4, 0, 6, 3, "成绩较好第三名", "2026-06-28T02:30:00.000Z", "UEFA", {
    pressure: 0.36,
    transition: 0.59,
    setPiece: 0.46,
    tacticalNote: "奥地利高压和直接进攻能制造机会，但后场空间管理是风险。"
  }),
  jordan: profile("J", 0, -5, 3, 4, "小组第四", "2026-06-28T02:30:00.000Z", "AFC", {
    volatility: 0.54,
    transition: 0.49,
    tacticalNote: "约旦面对强队时防守回合多，模型降低其控球和射门权重。"
  }),
  colombia: profile("K", 7, 3, 4, 1, "小组第一", "2026-06-27T23:00:00.000Z", "CONMEBOL", {
    transition: 0.63,
    setPiece: 0.43,
    keyPlayers: ["路易斯-迪亚斯", "哈梅斯"],
    tacticalNote: "哥伦比亚边路推进和中前场串联稳定，攻防转换质量高。"
  }),
  portugal: profile("K", 5, 5, 6, 2, "小组第二", "2026-06-27T23:00:00.000Z", "UEFA", {
    pedigree: 0.76,
    pressure: 0.32,
    transition: 0.64,
    setPiece: 0.48,
    keyPlayers: ["B费", "莱奥", "若塔"],
    tacticalNote: "葡萄牙前场个人能力强，阵地战和转换都有终结点。"
  }),
  dr_congo: profile("K", 4, 1, 4, 3, "成绩较好第三名", "2026-06-27T23:00:00.000Z", "CAF", {
    volatility: 0.50,
    transition: 0.64,
    tacticalNote: "民主刚果冲击力和反击速度高，弱势比赛中冷门弹性较强。"
  }),
  uzbekistan: profile("K", 0, -9, 2, 4, "小组第四", "2026-06-27T23:00:00.000Z", "AFC", {
    volatility: 0.50,
    squadAvailability: 0.80,
    tacticalNote: "乌兹别克斯坦小组赛防守压力大，模型提高被攻破概率。"
  }),
  england: profile("L", 7, 4, 6, 1, "小组第一", "2026-06-27T19:00:00.000Z", "UEFA", {
    pedigree: 0.78,
    pressure: 0.48,
    setPiece: 0.58,
    keyPlayers: ["凯恩", "贝林厄姆", "福登"],
    tacticalNote: "英格兰定位球、二点球和禁区终结稳定，但淘汰赛压力权重较高。"
  }),
  croatia: profile("L", 6, 0, 5, 2, "小组第二", "2026-06-27T19:00:00.000Z", "UEFA", {
    pedigree: 0.74,
    pressure: 0.22,
    setPiece: 0.40,
    tacticalNote: "克罗地亚大赛控节奏能力强，90分钟拖入平局的能力权重较高。"
  }),
  ghana: profile("L", 4, 0, 2, 3, "成绩较好第三名", "2026-06-27T19:00:00.000Z", "CAF", {
    volatility: 0.52,
    transition: 0.64,
    tacticalNote: "加纳身体对抗和快速推进强，但禁区防守细节容易波动。"
  }),
  panama: profile("L", 0, -4, 1, 4, "小组第四", "2026-06-27T19:00:00.000Z", "CONCACAF", {
    volatility: 0.54,
    pressure: 0.34,
    tacticalNote: "巴拿马小组赛进攻输出偏低，模型降低其持续进攻权重。"
  })
};

const h2hNotes: Record<string, string> = {
  "belgium:senegal": "两队赛前正式交锋样本有限，因此模型降低历史交锋权重，更多依赖本届表现、阵容可用性和战术对位。",
  "usa:bosnia": "两队近期正式大赛直接交锋样本有限，主场环境与小组赛表现权重高于 H2H。",
  "portugal:croatia": "葡萄牙前场个人能力与克罗地亚淘汰赛经验形成对冲，模型会提高90分钟平局和低比分权重。",
  "spain:austria": "西班牙控球压制与奥地利高压转换是主要对位，关键在西班牙能否避开中后场丢失球权。"
};

export const worldCupSources = [
  {
    label: "国际足联二零二六官方赛程文件",
    url: "https://digitalhub.fifa.com/m/1be9ce37eb98fcc5/original/FWC26-Match-Schedule_English.pdf"
  },
  {
    label: "公开赛事数据源二零二六世界杯赛程与赛果",
    url: "https://www.espn.com/soccer/story/_/id/48939282/2026-fifa-world-cup-fixtures-results-match-schedule-group-stage-knockout-rounds-bracket"
  },
  {
    label: "卫报比利时二比三塞内加尔战报",
    url: "https://www.theguardian.com/football/live/2026/jul/01/belgium-v-senegal-world-cup-last-32-live"
  }
];

export function buildWorldCupFactors(match: Match): WorldCupFactors {
  const isKnockout = match.competition.includes("淘汰赛") || match.competition.includes("1/");
  const isGroupStage = match.competition.includes("小组赛");
  const home = teamFactors(match.homeTeam, match.startTime, isKnockout, isGroupStage);
  const away = teamFactors(match.awayTeam, match.startTime, isKnockout, isGroupStage);
  const h2hSummary =
    h2hNotes[`${match.homeTeam.id}:${match.awayTeam.id}`] ??
    h2hNotes[`${match.awayTeam.id}:${match.homeTeam.id}`] ??
    "缺少高质量近期正式交锋样本，模型将历史交锋降权，主要使用本届世界杯表现、赛程压力、攻防质量和球队画像。";

  return {
    home,
    away,
    isKnockout,
    isGroupStage,
    stageLabel: isKnockout ? knockoutStageLabel(match.competition) : "小组赛",
    extraTimeRisk: isKnockout ? clamp(0.18 + (home.knockoutPressure + away.knockoutPressure) * 0.11, 0.16, 0.36) : 0.04,
    h2hSummary,
    sources: worldCupSources
  };
}

function teamFactors(team: Team, matchStartTime: string, isKnockout: boolean, isGroupStage: boolean): TeamTournamentFactors {
  const rawProfile = profiles[team.id] ?? fallbackProfile(team);
  const profile = causalProfileForMatch(rawProfile, isKnockout, isGroupStage);
  const restDays = daysBetween(profile.lastPlayedAt, matchStartTime);
  const hostAdvantage = hostBoost(team.id);
  const travelFatigue = clamp(baseTravelFatigue(profile.confederation) - restDays * 0.025 - hostAdvantage * 0.45, 0.05, 0.80);
  const groupForm = clamp(profile.groupPoints / 9 * 0.46 + normalizeGoalDiff(profile.groupGoalDiff) * 0.28 + team.recentForm / 100 * 0.26, 0, 1);
  const knockoutPressure = isKnockout ? clamp(profile.pressure + (1 - profile.pedigree) * 0.16 - restDays * 0.015, 0.05, 0.82) : 0.18;
  const formScore = clamp(
    groupForm * 0.45 +
      profile.squadAvailability * 0.20 +
      (1 - travelFatigue) * 0.14 +
      profile.transition * 0.11 +
      profile.setPiece * 0.06 -
      knockoutPressure * 0.06 +
      hostAdvantage * 0.10,
    0,
    1
  );
  const goalMultiplier = clamp(
    1 + (formScore - 0.5) * 0.18 + (profile.transition - 0.5) * 0.08 + (profile.setPiece - 0.4) * 0.05 - travelFatigue * 0.07,
    0.84,
    1.20
  );
  const defensiveMultiplier = clamp(
    1 + travelFatigue * 0.08 + profile.volatility * 0.05 + knockoutPressure * 0.04 - profile.squadAvailability * 0.08,
    0.86,
    1.18
  );

  return {
    group: profile.group,
    groupPoints: profile.groupPoints,
    groupGoalDiff: profile.groupGoalDiff,
    groupGoalsFor: profile.groupGoalsFor,
    groupRank: profile.groupRank,
    qualifierType: profile.qualifierType,
    restDays,
    travelFatigue,
    knockoutPressure,
    squadAvailability: profile.squadAvailability,
    tacticalTransition: profile.transition,
    setPiece: profile.setPiece,
    volatility: profile.volatility,
    hostAdvantage,
    formScore,
    goalMultiplier,
    defensiveMultiplier,
    strengthAdjustment: (formScore - 0.5) * 7 + hostAdvantage * 5 - travelFatigue * 2.4 - knockoutPressure * 1.4,
    keyPlayers: profile.keyPlayers,
    availability: profile.availability,
    tacticalNote: profile.tacticalNote,
    tournamentSummary: `${profile.qualifierType}，${profile.group}组 ${profile.groupPoints}分，净胜球${signed(profile.groupGoalDiff)}，休息${restDays}天。`
  };
}

function causalProfileForMatch(profile: TeamProfile, isKnockout: boolean, isGroupStage: boolean): TeamProfile {
  if (!isGroupStage || isKnockout) return profile;

  return {
    ...profile,
    groupPoints: 0,
    groupGoalDiff: 0,
    groupGoalsFor: 0,
    groupRank: 4,
    qualifierType: "赛前因果快照",
    lastPlayedAt: "2026-06-08T00:00:00.000Z"
  };
}

function profile(
  group: string,
  groupPoints: number,
  groupGoalDiff: number,
  groupGoalsFor: number,
  groupRank: number,
  qualifierType: string,
  lastPlayedAt: string,
  confederation: TeamProfile["confederation"],
  overrides: Partial<TeamProfile> = {}
): TeamProfile {
  return {
    group,
    groupPoints,
    groupGoalDiff,
    groupGoalsFor,
    groupRank,
    qualifierType,
    lastPlayedAt,
    confederation,
    ...defaultProfile,
    ...overrides
  };
}

function fallbackProfile(team: Team): TeamProfile {
  return profile("未知", 0, 0, 0, 4, "待补充样本", "2026-06-24T00:00:00.000Z", "UEFA", {
    pedigree: team.fifaRating / 100,
    transition: clamp(team.attackAvg / 2.2, 0.2, 0.85),
    setPiece: 0.38,
    volatility: clamp((100 - team.defenseAvg) / 60, 0.2, 0.75)
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.round(diff / 86_400_000));
}

function baseTravelFatigue(confederation: TeamProfile["confederation"]): number {
  const values: Record<TeamProfile["confederation"], number> = {
    CONCACAF: 0.22,
    CONMEBOL: 0.42,
    UEFA: 0.45,
    CAF: 0.50,
    AFC: 0.56,
    OFC: 0.64
  };
  return values[confederation];
}

function hostBoost(teamId: string): number {
  if (teamId === "usa") return 0.14;
  if (teamId === "mexico") return 0.12;
  if (teamId === "canada") return 0.10;
  return 0;
}

function normalizeGoalDiff(value: number): number {
  return clamp((value + 4) / 12, 0, 1);
}

function knockoutStageLabel(competition: string): string {
  if (competition.includes("1/8")) return "1/8决赛";
  if (competition.includes("1/16")) return "1/16决赛";
  return "淘汰赛";
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

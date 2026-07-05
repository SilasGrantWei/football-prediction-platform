import type {
  LineupActualStatus,
  LineupValidationProviderAttempt,
  Match,
  MatchLineupProjection,
  MatchLineupValidation,
  ProjectedPlayer,
  TeamLineupProjection,
  TeamLineupValidation,
  TeamRecordLineup
} from "../models.js";

interface ActualLineupBundle {
  home: TeamRecordLineup;
  away: TeamRecordLineup;
}

interface LineupValidationSource {
  label: string;
  url?: string;
  verifiedAt?: string;
  providerAttempts?: LineupValidationProviderAttempt[];
}

const pendingSourceLabel = "等待官方首发数据";
const minimumCredibleStarterCount = 11;

export function buildLineupValidation(
  match: Match,
  projection: MatchLineupProjection,
  actualLineups?: ActualLineupBundle | null,
  source: LineupValidationSource = { label: pendingSourceLabel }
): MatchLineupValidation {
  const home = validateTeamLineup(match, projection.home, actualLineups?.home ?? null, source);
  const away = validateTeamLineup(match, projection.away, actualLineups?.away ?? null, source);
  const verifiedTeams = [home, away].filter((team) => team.hitRate !== null);
  const overallHitRate = verifiedTeams.length
    ? round4(verifiedTeams.reduce((sum, team) => sum + (team.hitRate ?? 0), 0) / verifiedTeams.length)
    : null;
  const status = overallStatus(home.status, away.status);

  return {
    matchId: match.id,
    status,
    sourceLabel: source.label,
    sourceUrl: source.url,
    verifiedAt: source.verifiedAt,
    providerAttempts: source.providerAttempts,
    overallHitRate,
    home,
    away,
    summary: buildMatchSummary(match, status, overallHitRate),
    learningActions: buildLearningActions(home, away)
  };
}

function validateTeamLineup(
  match: Match,
  projection: TeamLineupProjection,
  actualLineup: TeamRecordLineup | null,
  source: LineupValidationSource
): TeamLineupValidation {
  const sanitizedActualLineup = sanitizeActualLineup(actualLineup);

  if (!projection.starters.length) {
    return {
      teamId: projection.teamId,
      teamName: projection.teamName,
      status: "unavailable",
      sourceLabel: source.label,
      sourceUrl: source.url,
      verifiedAt: source.verifiedAt,
      predictedStarterCount: 0,
      actualStarterCount: sanitizedActualLineup?.starters.length ?? 0,
      matchedStarterCount: 0,
      hitRate: null,
      matchedPlayers: [],
      missedPlayers: [],
      unexpectedStarters: sanitizedActualLineup?.starters.map((player) => player.name) ?? [],
      actualStarters: sanitizedActualLineup?.starters.map((player) => player.name) ?? [],
      actualSubstitutes: sanitizedActualLineup?.substitutes.map((player) => player.name) ?? [],
      playerResults: [],
      summary: `${projection.teamName} 没有可验证的推算首发，阵容因子不能参与验证。`,
      reasons: ["模型没有该队推算球员池，不能拿空名单计算命中率。"]
    };
  }

  if (!sanitizedActualLineup) {
    const matchFinished = match.status === "finished";
    const matchStarted = hasMatchStarted(match);
    const cannotKeepWaiting = matchFinished || matchStarted;
    const playerResults = projection.starters.map((player) => toUnknownPlayerResult(player, cannotKeepWaiting));
    const missingSourceLabel = cannotKeepWaiting && source.label === pendingSourceLabel ? "缺少真实首发数据" : source.label;
    const rejectedPlaceholderLineup = Boolean(actualLineup);
    return {
      teamId: projection.teamId,
      teamName: projection.teamName,
      status: cannotKeepWaiting ? "unavailable" : "pending",
      sourceLabel: missingSourceLabel,
      sourceUrl: source.url,
      verifiedAt: cannotKeepWaiting ? source.verifiedAt : undefined,
      predictedStarterCount: projection.starters.length,
      actualStarterCount: 0,
      matchedStarterCount: 0,
      hitRate: null,
      matchedPlayers: [],
      missedPlayers: [],
      unexpectedStarters: [],
      actualStarters: [],
      actualSubstitutes: [],
      playerResults,
      summary: cannotKeepWaiting
        ? `${projection.teamName} 比赛${matchFinished ? "已结束" : "已经开始"}，但当前数据源没有返回可用的真实首发姓名，因此不能计算首发命中率。`
        : `${projection.teamName} 推算首发待验证：当前没有拿到可用的官方/真实首发姓名。`,
      reasons: cannotKeepWaiting
        ? [
            matchFinished
              ? "比赛已经结束，当前结论是缺少真实首发数据，而不是继续等待。"
              : "比赛已经开始，真实首发按业务上应已公布；当前结论是缺少真实首发数据，而不是继续显示待验证。",
            rejectedPlaceholderLineup
              ? `当前数据源状态：${missingSourceLabel}。数据源返回了阵容结构，但球员姓名为空或是占位符，已按缺少真实首发处理。`
              : `当前数据源状态：${missingSourceLabel}。没有拿到真实首发名单，所以不能把推算名单自己当真值验证。`,
            "接入专业赛事数据源、体育数据源、接口足球数据源或公开赛事数据源返回的真实首发阵容后，会自动逐人比对并更新命中率。"
          ]
        : [
            rejectedPlaceholderLineup
              ? "当前数据源返回的是未知球员或未接入中文名等占位数据，不能用占位名单验证推算。"
              : "没有官方首发或比赛报告阵容数据，不能用推算名单自己验证自己。",
            "接入专业赛事数据源、体育数据源、接口足球数据源或公开赛事数据源返回的真实名单后，会自动逐人比对。"
          ]
    };
  }

  const actualStarters = new Map(sanitizedActualLineup.starters.map((player) => [normalizePlayerName(player.name), player.name]));
  const actualSubstitutes = new Map(sanitizedActualLineup.substitutes.map((player) => [normalizePlayerName(player.name), player.name]));
  const actualStarterNames = sanitizedActualLineup.starters.map((player) => player.name);
  const actualSubstituteNames = sanitizedActualLineup.substitutes.map((player) => player.name);
  const playerResults = projection.starters.map((player) => validatePlayer(player, actualStarters, actualSubstitutes));
  const matchedPlayers = playerResults.filter((player) => player.matched).map((player) => player.name);
  const missedPlayers = playerResults.filter((player) => !player.matched).map((player) => player.name);
  const predictedNames = new Set(projection.starters.map((player) => normalizePlayerName(player.name)));
  const unexpectedStarters = sanitizedActualLineup.starters
    .filter((player) => !predictedNames.has(normalizePlayerName(player.name)))
    .map((player) => player.name);
  const hitRate = projection.starters.length ? round4(matchedPlayers.length / projection.starters.length) : null;

  return {
    teamId: projection.teamId,
    teamName: projection.teamName,
    status: "verified",
    sourceLabel: source.label,
    sourceUrl: source.url,
    verifiedAt: source.verifiedAt,
    predictedStarterCount: projection.starters.length,
    actualStarterCount: sanitizedActualLineup.starters.length,
    matchedStarterCount: matchedPlayers.length,
    hitRate,
    matchedPlayers,
    missedPlayers,
    unexpectedStarters,
    actualStarters: actualStarterNames,
    actualSubstitutes: actualSubstituteNames,
    playerResults,
    summary:
      hitRate === null
        ? `${projection.teamName} 阵容验证样本不足。`
        : `${projection.teamName} 推算首发命中 ${matchedPlayers.length}/${projection.starters.length}，命中率 ${Math.round(hitRate * 100)}%。`,
    reasons: buildTeamReasons(hitRate, missedPlayers, unexpectedStarters)
  };
}

function sanitizeActualLineup(lineup: TeamRecordLineup | null): TeamRecordLineup | null {
  if (!lineup) return null;

  const starters = sanitizePlayers(lineup.starters);
  const substitutes = sanitizePlayers(lineup.substitutes);
  if (starters.length < minimumCredibleStarterCount) return null;

  return {
    ...lineup,
    starters,
    substitutes
  };
}

function sanitizePlayers(players: TeamRecordLineup["starters"]): TeamRecordLineup["starters"] {
  const seen = new Set<string>();
  return players.filter((player) => {
    if (!hasUsablePlayerName(player.name)) return false;
    const key = basicNormalizeName(player.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasUsablePlayerName(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "-" || normalized === "n/a") return false;
  return ![
    "未知球员",
    "待补中文球员",
    "未接入中文名",
    "unknown",
    "unknown player",
    "tbd",
    "待定球员"
  ].some((placeholder) => normalized.includes(placeholder));
}

function validatePlayer(
  player: ProjectedPlayer,
  actualStarters: Map<string, string>,
  actualSubstitutes: Map<string, string>
) {
  const key = normalizePlayerName(player.name);
  const actualStatus: LineupActualStatus = actualStarters.has(key) ? "starter" : actualSubstitutes.has(key) ? "substitute" : "absent";
  const matched = actualStatus === "starter";
  return {
    name: player.name,
    predictedPosition: player.position,
    startProbability: player.startProbability,
    actualStatus,
    matched,
    note: playerNote(actualStatus)
  };
}

function toUnknownPlayerResult(player: ProjectedPlayer, cannotVerify: boolean) {
  return {
    name: player.name,
    predictedPosition: player.position,
    startProbability: player.startProbability,
    actualStatus: "unknown" as const,
    matched: false,
    note: cannotVerify ? "缺少真实首发数据，无法验证" : "待官方首发验证"
  };
}

function playerNote(status: LineupActualStatus): string {
  if (status === "starter") return "命中真实首发";
  if (status === "substitute") return "进入替补/登场名单，但不是首发";
  if (status === "absent") return "未出现在真实首发或登场名单";
  return "待官方首发验证";
}

function overallStatus(home: TeamLineupValidation["status"], away: TeamLineupValidation["status"]): MatchLineupValidation["status"] {
  if (home === "verified" && away === "verified") return "verified";
  if (home === "verified" || away === "verified") return "partial";
  if (home === "unavailable" && away === "unavailable") return "unavailable";
  return "pending";
}

function buildMatchSummary(match: Match, status: MatchLineupValidation["status"], overallHitRate: number | null): string {
  if (status === "verified" || status === "partial") {
    return overallHitRate === null
      ? "已接入真实阵容，但可计算样本不足。"
      : `已用真实首发验证推算名单，整体命中率 ${Math.round(overallHitRate * 100)}%。`;
  }

  if (status === "unavailable") {
    if (match.status === "finished") return "比赛已结束，但没有真实首发名单，阵容推算不能评分；不会用推算名单反证自己。";
    if (hasMatchStarted(match)) return "比赛已经开始，但没有真实首发名单，阵容推算不能评分；不会继续显示待验证。";
    return "缺少真实首发名单或可验证球员池，阵容推算不能评分；不会用推算名单反证自己。";
  }
  return "推算首发等待真实首发验证；未接入真实阵容前不会计算命中率。";
}

function hasMatchStarted(match: Match): boolean {
  return match.status === "live" || match.status === "halftime" || match.minute > 0;
}

function buildTeamReasons(hitRate: number | null, missedPlayers: string[], unexpectedStarters: string[]): string[] {
  const reasons: string[] = [];
  if (hitRate !== null) reasons.push(`推算首发命中率为 ${Math.round(hitRate * 100)}%，只按真实首发计算，不把替补算作命中。`);
  if (missedPlayers.length) reasons.push(`未命中推算球员：${missedPlayers.slice(0, 6).join("、")}。`);
  if (unexpectedStarters.length) reasons.push(`真实首发但模型未推算：${unexpectedStarters.slice(0, 6).join("、")}。`);
  if (!reasons.length) reasons.push("推算首发与真实首发高度一致，可作为正样本保留。");
  return reasons;
}

function buildLearningActions(home: TeamLineupValidation, away: TeamLineupValidation): string[] {
  const verifiedTeams = [home, away].filter((team) => team.hitRate !== null);
  if (!verifiedTeams.length) {
    return [
      "等待官方首发接入后再验证推算名单，不用模型推算名单反证模型自己。",
      "真实首发接入后，按命中/替补/缺席三类记录每名球员，赛后再调整阵容权重。"
    ];
  }

  const actions = verifiedTeams.map((team) =>
    (team.hitRate ?? 0) >= 0.72
      ? `${team.teamName} 首发推算命中率较高，保留核心球员首发概率。`
      : `${team.teamName} 首发推算命中率偏低：命中 ${team.matchedStarterCount}/${team.predictedStarterCount}。后续只对未来未开赛比赛降低该队推算首发对进球期望的权重，并提高真实首发覆盖优先级。`
  );

  actions.push("真实首发只用于验证和后续校准，不回填修改开赛前已经冻结的推算结果。");
  return actions;
}

const playerAliasGroups = [
  ["克里斯蒂亚诺·罗纳尔多", "C罗", "Cristiano Ronaldo", "Cristiano Ronaldo dos Santos Aveiro"],
  ["迪奥戈-科斯塔", "Diogo Costa"],
  ["若昂-坎塞洛", "Joao Cancelo", "João Cancelo"],
  ["鲁本-迪亚斯", "Ruben Dias", "Rúben Dias"],
  ["安东尼奥-席尔瓦", "Antonio Silva", "António Silva"],
  ["努诺-门德斯", "Nuno Mendes"],
  ["若昂-帕利尼亚", "Joao Palhinha", "João Palhinha"],
  ["维蒂尼亚", "Vitinha"],
  ["布鲁诺-费尔南德斯", "Bruno Fernandes"],
  ["贝尔纳多-席尔瓦", "Bernardo Silva"],
  ["拉斐尔-莱奥", "Rafael Leao", "Rafael Leão"],
  ["迪奥戈-若塔", "Diogo Jota"],
  ["贡萨洛-拉莫斯", "Goncalo Ramos", "Gonçalo Ramos"],
  ["若昂-菲利克斯", "Joao Felix", "João Félix"],
  ["雷纳托-韦加", "Renato Veiga"],
  ["若昂-内维斯", "Joao Neves", "João Neves"],
  ["佩德罗-内托", "Pedro Neto"],

  ["多米尼克-利瓦科维奇", "Dominik Livakovic", "Dominik Livaković"],
  ["约瑟普-斯塔尼希奇", "Josip Stanisic", "Josip Stanišić"],
  ["马林-庞格拉契奇", "Marin Pongracic", "Marin Pongračić"],
  ["约什科-格瓦迪奥尔", "Josko Gvardiol", "Joško Gvardiol"],
  ["博尔纳-索萨", "Borna Sosa"],
  ["马塞洛-布罗佐维奇", "Marcelo Brozovic", "Marcelo Brozović"],
  ["马特奥-科瓦契奇", "Mateo Kovacic", "Mateo Kovačić"],
  ["卢卡-莫德里奇", "Luka Modric", "Luka Modrić"],
  ["伊万-佩里西奇", "Ivan Perisic", "Ivan Perišić"],
  ["安德雷-克拉马里奇", "Andrej Kramaric", "Andrej Kramarić"],
  ["布鲁诺-佩特科维奇", "Bruno Petkovic", "Bruno Petković"],
  ["布季米尔", "Ante Budimir"],
  ["马耶尔", "Lovro Majer"],
  ["帕沙利奇", "Mario Pasalic", "Mario Pašalić"],
  ["佩塔尔-苏契奇", "Petar Sucic", "Petar Sučić"],
  ["约瑟普-舒塔洛", "Josip Sutalo", "Josip Šutalo"],
  ["马丁-巴图里纳", "Martin Baturina"],
  ["尼古拉-弗拉西奇", "Nikola Vlasic", "Nikola Vlašić"],

  ["格雷戈尔-科贝尔", "Gregor Kobel"],
  ["曼努埃尔-阿坎吉", "Manuel Akanji"],
  ["尼科-埃尔维迪", "Nico Elvedi"],
  ["里卡多-罗德里格斯", "Ricardo Rodriguez", "Ricardo Rodríguez"],
  ["西尔万-威德默", "Silvan Widmer"],
  ["卢卡-雅凯兹", "Luca Jaquez"],
  ["格拉尼特-扎卡", "Granit Xhaka"],
  ["雷莫-弗罗伊勒", "Remo Freuler"],
  ["鲁本-巴尔加斯", "Ruben Vargas", "Rubén Vargas"],
  ["丹-恩多耶", "Dan Ndoye"],
  ["布雷尔-恩博洛", "Breel Embolo"],
  ["泽基-阿姆杜尼", "Zeki Amdouni"],
  ["诺阿-奥卡福", "Noah Okafor"],
  ["法比安-里德尔", "Fabian Rieder"],
  ["约翰-曼赞比", "Johan Manzambi"],

  ["克雷波", "Maxime Crepeau", "Maxime Crépeau"],
  ["阿利斯泰尔-约翰斯顿", "Alistair Johnston"],
  ["科内利厄斯", "Derek Cornelius"],
  ["卢克-德富热罗勒", "Luc de Fougerolles"],
  ["里奇-拉里亚", "Richie Laryea"],
  ["阿方索-戴维斯", "Alphonso Davies"],
  ["埃斯塔基奥", "Stephen Eustaquio"],
  ["伊斯梅尔-科内", "Ismael Kone", "Ismaël Koné"],
  ["泰琼-布坎南", "Tajon Buchanan"],
  ["乔纳森-戴维", "Jonathan David"],
  ["塞勒-拉林", "Cyle Larin"],
  ["沙费尔伯格", "Jacob Shaffelburg"],
  ["阿里-艾哈迈德", "Ali Ahmed"],
  ["马蒂厄-舒瓦尼埃", "Mathieu Choiniere", "Mathieu Choinière"],
  ["内森-萨利巴", "Nathan Saliba"],
  ["普罗米斯-戴维", "Promise David"],
  ["利亚姆-米勒", "Liam Millar"],
  ["塔尼-奥卢瓦塞伊", "Tani Oluwaseyi"],

  ["乌奈-西蒙", "Unai Simon", "Unai Simón"],
  ["卡瓦哈尔", "Dani Carvajal", "Daniel Carvajal"],
  ["勒诺尔芒", "Robin Le Normand"],
  ["拉波尔特", "Aymeric Laporte"],
  ["库库雷利亚", "Marc Cucurella"],
  ["罗德里", "Rodri"],
  ["佩德里", "Pedri"],
  ["法比安-鲁伊斯", "Fabian Ruiz", "Fabián Ruiz"],
  ["亚马尔", "Lamine Yamal"],
  ["莫拉塔", "Alvaro Morata", "Álvaro Morata"],
  ["尼科-威廉姆斯", "Nico Williams"],
  ["奥尔莫", "Dani Olmo"],
  ["奥亚萨瓦尔", "Mikel Oyarzabal"],
  ["梅里诺", "Mikel Merino"],
  ["亚历克斯-巴埃纳", "Alex Baena", "Álex Baena"],
  ["马科斯-略伦特", "Marcos Llorente"],

  ["迈克-迈尼昂", "Mike Maignan"],
  ["儒勒-孔德", "Jules Kounde", "Jules Koundé"],
  ["威廉-萨利巴", "William Saliba"],
  ["达约-于帕梅卡诺", "Dayot Upamecano"],
  ["特奥-埃尔南德斯", "Theo Hernandez", "Theo Hernández", "Théo Hernández"],
  ["奥雷利安-楚阿梅尼", "Aurelien Tchouameni", "Aurélien Tchouaméni"],
  ["爱德华多-卡马文加", "Eduardo Camavinga"],
  ["阿德里安-拉比奥", "Adrien Rabiot"],
  ["恩戈洛-坎特", "N'Golo Kante", "N'Golo Kanté", "N’Golo Kante"],
  ["安托万-格列兹曼", "Antoine Griezmann"],
  ["奥斯曼-登贝莱", "Ousmane Dembele", "Ousmane Dembélé"],
  ["基利安-姆巴佩", "Kylian Mbappe", "Kylian Mbappé"],
  ["马库斯-图拉姆", "Marcus Thuram"],
  ["布拉德利-巴尔科拉", "Bradley Barcola"],
  ["兰达尔-科洛穆阿尼", "Randal Kolo Muani"],
  ["金斯利-科曼", "Kingsley Coman"],
  ["易卜拉希马-科纳特", "Ibrahima Konate", "Ibrahima Konaté"],
  ["本杰明-帕瓦尔", "Benjamin Pavard"],
  ["费兰-门迪", "Ferland Mendy"],
  ["克里斯托弗-恩昆库", "Christopher Nkunku"],
  ["沃伦-扎伊尔-埃梅里", "Warren Zaire-Emery", "Warren Zaïre-Emery"],

  ["加蒂托-费尔南德斯", "Gatito Fernandez", "Gatito Fernández"],
  ["罗伯托-费尔南德斯", "Roberto Fernandez", "Roberto Fernández"],
  ["古斯塔沃-戈麦斯", "Gustavo Gomez", "Gustavo Gómez"],
  ["法比安-巴尔武埃纳", "Fabian Balbuena", "Fabián Balbuena"],
  ["朱尼奥尔-阿隆索", "Junior Alonso"],
  ["奥马尔-阿尔德雷特", "Omar Alderete"],
  ["罗伯特-罗哈斯", "Robert Rojas"],
  ["阿尔贝托-埃斯皮诺拉", "Alberto Espinola", "Alberto Espínola"],
  ["马蒂亚斯-维拉桑蒂", "Matias Villasanti", "Matías Villasanti", "Mathias Villasanti"],
  ["安德烈斯-库巴斯", "Andres Cubas", "Andrés Cubas"],
  ["迭戈-戈麦斯", "Diego Gomez", "Diego Gómez"],
  ["达米安-博瓦迪利亚", "Damian Bobadilla", "Damián Bobadilla"],
  ["米格尔-阿尔米隆", "Miguel Almiron", "Miguel Almirón"],
  ["胡利奥-恩西索", "Julio Enciso"],
  ["拉蒙-索萨", "Ramon Sosa", "Ramón Sosa"],
  ["安东尼奥-萨纳布里亚", "Antonio Sanabria"],
  ["亚当-巴雷罗", "Adam Bareiro"],
  ["安赫尔-罗梅罗", "Angel Romero", "Ángel Romero"],
  ["亚历杭德罗-罗梅罗-加马拉", "Alejandro Romero Gamarra", "Kaku"]
];

const playerAliasIndex = buildPlayerAliasIndex(playerAliasGroups);

function normalizePlayerName(value: string): string {
  const key = basicNormalizeName(value);
  return playerAliasIndex.get(key) ?? key;
}

function buildPlayerAliasIndex(groups: string[][]): Map<string, string> {
  const index = new Map<string, string>();
  for (const group of groups) {
    const canonical = basicNormalizeName(group[0]);
    for (const alias of group) {
      index.set(basicNormalizeName(alias), canonical);
    }
  }
  return index;
}

function basicNormalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

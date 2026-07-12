const termMap: Record<string, string> = {
  "API-Football": "接口足球数据源",
  SportMonks: "体育数据源",
  StatsPerform: "专业赛事数据源",
  LiveScore: "实时比分数据源",
  ESPN: "公开赛事数据源",
  Guardian: "卫报",
  Opta: "专业赛事数据源",
  FIFA: "国际足联",
  VAR: "视频助理裁判",
  xG: "预期进球",
  XG: "预期进球",
  AI: "智能",
  API: "接口",
  WebSocket: "实时连接",
  REST: "轮询接口",
  Poisson: "泊松模型",
  Elo: "等级分模型",
  LightGBM: "梯度提升模型",
  CatBoost: "类别提升模型",
  "Dixon-Coles": "泊松修正模型",
  open: "开放型",
  balanced: "平衡型",
  defensive: "防守型",
  vs: "对"
};

const teamNameMap: Record<string, string> = {
  Spain: "西班牙",
  Uruguay: "乌拉圭",
  Portugal: "葡萄牙",
  Croatia: "克罗地亚",
  Chile: "智利",
  Slovenia: "斯洛文尼亚",
  "Congo DR": "民主刚果",
  "DR Congo": "民主刚果",
  Denmark: "丹麦",
  Bermuda: "百慕大",
  Honduras: "洪都拉斯",
  Finland: "芬兰",
  Austria: "奥地利",
  England: "英格兰",
  Ghana: "加纳",
  Colombia: "哥伦比亚",
  Panama: "巴拿马",
  Algeria: "阿尔及利亚",
  Argentina: "阿根廷",
  Jordan: "约旦",
  Switzerland: "瑞士",
  Canada: "加拿大",
  Ireland: "爱尔兰",
  Jamaica: "牙买加",
  Serbia: "塞尔维亚",
  Mexico: "墨西哥",
  Paraguay: "巴拉圭",
  Qatar: "卡塔尔",
  Brazil: "巴西",
  Morocco: "摩洛哥",
  Scotland: "苏格兰",
  Australia: "澳大利亚",
  Turkey: "土耳其",
  Germany: "德国",
  Curacao: "库拉索",
  Netherlands: "荷兰",
  Japan: "日本",
  Ecuador: "厄瓜多尔",
  Sweden: "瑞典",
  Belgium: "比利时",
  Egypt: "埃及",
  Iran: "伊朗",
  France: "法国",
  Senegal: "塞内加尔",
  Iraq: "伊拉克",
  Norway: "挪威",
  Bolivia: "玻利维亚",
  "Costa Rica": "哥斯达黎加",
  "Saudi Arabia": "沙特阿拉伯",
  "Cape Verde": "佛得角",
  "United States": "美国",
  USA: "美国",
  "Republic of Ireland": "爱尔兰",
  "South Africa": "南非",
  "South Korea": "韩国",
  "Ivory Coast": "科特迪瓦",
  "New Zealand": "新西兰",
  "North Macedonia": "北马其顿"
};

const playerNameMap: Record<string, string> = {
  "Cristiano Ronaldo": "C罗",
  "Diogo Costa": "迪奥戈-科斯塔",
  "Renato Veiga": "雷纳托-韦加",
  "Tomas Araujo": "托马斯-阿劳若",
  "Tomás Araújo": "托马斯-阿劳若",
  "Nuno Mendes": "努诺-门德斯",
  "Joao Cancelo": "若昂-坎塞洛",
  "João Cancelo": "若昂-坎塞洛",
  "Bruno Fernandes": "布鲁诺-费尔南德斯",
  Vitinha: "维蒂尼亚",
  "Joao Neves": "若昂-内维斯",
  "João Neves": "若昂-内维斯",
  "Pedro Neto": "佩德罗-内托",
  "Bernardo Silva": "贝尔纳多-席尔瓦",
  "Joao Felix": "若昂-菲利克斯",
  "João Félix": "若昂-菲利克斯",
  "Diogo Jota": "迪奥戈-若塔",
  "Rafael Leao": "拉斐尔-莱奥",
  "Rafael Leão": "拉斐尔-莱奥",
  "Francisco Conceicao": "弗朗西斯科-孔塞桑",
  "Francisco Conceição": "弗朗西斯科-孔塞桑",
  "Camilo Vargas": "卡米洛-巴尔加斯",
  "Jhon Lucumi": "约翰-卢库米",
  "Jhon Lucumí": "约翰-卢库米",
  "Davinson Sanchez": "达文森-桑切斯",
  "Davinson Sánchez": "达文森-桑切斯",
  "Deiver Machado": "德伊韦尔-马查多",
  "Santiago Arias": "圣地亚哥-阿里亚斯",
  "Jefferson Lerma": "杰斐逊-莱尔马",
  "Gustavo Puerta": "古斯塔沃-普埃尔塔",
  "Jhon Arias": "约翰-阿里亚斯",
  "Jhon Cordoba": "约翰-科尔多瓦",
  "Jhon Córdoba": "约翰-科尔多瓦",
  "Luis Diaz": "路易斯-迪亚斯",
  "Luis Díaz": "路易斯-迪亚斯",
  "James Rodriguez": "哈梅斯-罗德里格斯",
  "James Rodríguez": "哈梅斯-罗德里格斯",
  "Maxime Crepeau": "马克西姆-克雷波",
  "Maxime Crépeau": "马克西姆-克雷波",
  "Cyle Larin": "赛尔-拉林",
  "Jonathan David": "乔纳森-戴维",
  "Tajon Buchanan": "塔琼-布坎南",
  "Gregor Kobel": "格雷戈尔-科贝尔",
  "Manuel Akanji": "曼努埃尔-阿坎吉",
  "Granit Xhaka": "格拉尼特-扎卡",
  "Kylian Mbappe": "姆巴佩",
  "Kylian Mbappé": "姆巴佩",
  "Mike Maignan": "迈克-迈尼昂",
  "William Saliba": "威廉-萨利巴",
  "Theo Hernandez": "特奥-埃尔南德斯",
  "Theo Hernández": "特奥-埃尔南德斯",
  "Aurelien Tchouameni": "奥雷利安-楚阿梅尼",
  "Aurélien Tchouaméni": "奥雷利安-楚阿梅尼",
  "Alisson Becker": "阿利松-贝克尔",
  Alisson: "阿利松",
  Ederson: "埃德森",
  "Éderson": "埃德森",
  "Gabriel Magalhaes": "加布里埃尔-马加良斯",
  "Gabriel Magalhães": "加布里埃尔-马加良斯",
  Marquinhos: "马尔基尼奥斯",
  "Douglas Santos": "道格拉斯-桑托斯",
  Danilo: "达尼洛",
  Casemiro: "卡塞米罗",
  "Bruno Guimaraes": "布鲁诺-吉马良斯",
  "Bruno Guimarães": "布鲁诺-吉马良斯",
  "Gabriel Martinelli": "加布里埃尔-马丁内利",
  Rayan: "拉扬",
  "Vinicius Junior": "维尼修斯-儒尼奥尔",
  "Vinícius Júnior": "维尼修斯-儒尼奥尔",
  "Matheus Cunha": "马特乌斯-库尼亚",
  Neymar: "内马尔",
  Endrick: "恩德里克",
  "Orjan Nyland": "奥尔扬-尼兰",
  "Ørjan Nyland": "奥尔扬-尼兰",
  "Torbjorn Heggem": "托比约恩-赫格姆",
  "Torbjørn Heggem": "托比约恩-赫格姆",
  "Kristoffer Ajer": "克里斯托弗-阿耶尔",
  "David Moller Wolfe": "大卫-穆勒-沃尔夫",
  "David Møller Wolfe": "大卫-穆勒-沃尔夫",
  "Julian Ryerson": "朱利安-雷尔森",
  "Sander Berge": "桑德尔-贝格",
  "Patrick Berg": "帕特里克-贝格",
  "Martin Odegaard": "马丁-厄德高",
  "Martin Ødegaard": "马丁-厄德高",
  "Erling Haaland": "埃尔林-哈兰德",
  "Antonio Nusa": "安东尼奥-努萨",
  "Alexander Sorloth": "亚历山大-索尔洛特",
  "Alexander Sørloth": "亚历山大-索尔洛特",
  "Oscar Bobb": "奥斯卡-鲍勃",
  "Andreas Schjelderup": "安德烈亚斯-舍尔德鲁普",
  "Fredrik Aursnes": "弗雷德里克-奥斯内斯",
  "Leo Ostigard": "莱奥-厄斯蒂高",
  "Leo Østigard": "莱奥-厄斯蒂高",
  "Raul Rangel": "劳尔-兰赫尔",
  "Raúl Rangel": "劳尔-兰赫尔",
  "Johan Vasquez": "约翰-巴斯克斯",
  "Johan Vásquez": "约翰-巴斯克斯",
  "Cesar Montes": "塞萨尔-蒙特斯",
  "César Montes": "塞萨尔-蒙特斯",
  "Jesus Gallardo": "赫苏斯-加利亚多",
  "Jesús Gallardo": "赫苏斯-加利亚多",
  "Jorge Sanchez": "豪尔赫-桑切斯",
  "Jorge Sánchez": "豪尔赫-桑切斯",
  "Erik Lira": "埃里克-利拉",
  "Érik Lira": "埃里克-利拉",
  "Luis Romo": "路易斯-罗莫",
  "Gilberto Mora": "吉尔伯托-莫拉",
  "Raul Jimenez": "劳尔-希门尼斯",
  "Raúl Jiménez": "劳尔-希门尼斯",
  "Julian Quinones": "胡利安-基尼奥内斯",
  "Julián Quiñones": "胡利安-基尼奥内斯",
  "Roberto Alvarado": "罗伯托-阿尔瓦拉多",
  "Alvaro Fidalgo": "阿尔瓦罗-菲达尔戈",
  "Álvaro Fidalgo": "阿尔瓦罗-菲达尔戈",
  "Santiago Gimenez": "圣地亚哥-希门尼斯",
  "Santiago Giménez": "圣地亚哥-希门尼斯",
  "Brian Gutierrez": "布赖恩-古铁雷斯",
  "Brian Gutiérrez": "布赖恩-古铁雷斯",
  "Edson Alvarez": "埃德森-阿尔瓦雷斯",
  "Edson Álvarez": "埃德森-阿尔瓦雷斯",
  "Guillermo Martinez": "吉列尔莫-马丁内斯",
  "Guillermo Martínez": "吉列尔莫-马丁内斯",
  "Jordan Pickford": "乔丹-皮克福德",
  "Marc Guehi": "马克-格伊",
  "Marc Guéhi": "马克-格伊",
  "Ezri Konsa": "埃兹里-孔萨",
  "Nico O'Reilly": "尼科-奥赖利",
  "Nico O’Reilly": "尼科-奥赖利",
  "Jarell Quansah": "贾雷尔-昆萨",
  "Jude Bellingham": "裘德-贝林厄姆",
  "Elliot Anderson": "埃利奥特-安德森",
  "Declan Rice": "德克兰-赖斯",
  "Harry Kane": "哈里-凯恩",
  "Anthony Gordon": "安东尼-戈登",
  "Bukayo Saka": "布卡约-萨卡",
  "John Stones": "约翰-斯通斯",
  "Dan Burn": "丹-伯恩",
  "Djed Spence": "杰德-斯彭斯",
  "Morgan Rogers": "摩根-罗杰斯"
};

const positionMap: Record<string, string> = {
  Goalkeeper: "门将",
  "Center Defender": "中后卫",
  "Center Left Defender": "左中卫",
  "Center Right Defender": "右中卫",
  "Left Back": "左后卫",
  "Right Back": "右后卫",
  "Defensive Midfielder": "后腰",
  Midfielder: "中场",
  Forward: "前锋",
  Substitute: "替补",
  "Center Left Forward": "左中锋",
  "Center Right Forward": "右中锋",
  "Attacking Midfielder": "前腰",
  "Left Midfielder": "左中场",
  "Right Midfielder": "右中场",
  "Left Forward": "左前锋",
  "Right Forward": "右前锋",
  "Left Winger": "左边锋",
  "Right Winger": "右边锋"
};

const orderedEntries = Object.entries({
  ...teamNameMap,
  ...playerNameMap,
  ...positionMap,
  ...termMap
}).sort((a, b) => b[0].length - a[0].length);

const latinRegex = /[A-Za-zÀ-ÖØ-öø-ÿ]/u;
const latinTokenRegex = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'.-]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'.-]*)*/gu;
const unmappedLatinMarker = "__UNMAPPED_LATIN_TOKEN__";

export function hasLatinText(value: unknown): boolean {
  return latinRegex.test(String(value ?? ""));
}

export function toChineseDisplay(value: unknown, fallback = "待接入中文名"): string {
  let text = String(value ?? "").trim();
  if (!text) return "";

  for (const [source, target] of orderedEntries) {
    text = text.replace(sourceRegex(source), target);
  }

  return text.replace(latinTokenRegex, (token) => {
    const trimmed = token.trim();
    if (!trimmed || !latinRegex.test(trimmed)) return token;
    return fallback;
  });
}

export function toChineseDisplayOrOriginal(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const translated = toChineseDisplay(raw, unmappedLatinMarker);
  return translated.includes(unmappedLatinMarker) ? raw : translated;
}

const playerNamePlaceholders = [
  "未知球员",
  "待补中文球员",
  "待补中文名",
  "待接入中文名",
  "待接入中文球员",
  "未接入中文名",
  "数据源未返回姓名",
  "数据源重复姓名",
  "占位",
  "placeholder",
  "unknown",
  "unknown player",
  "tbd",
  "待定球员",
  "sub player"
];

export function isPlaceholderPlayerName(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "-" || normalized === "n/a") return true;
  return playerNamePlaceholders.some((placeholder) => normalized.includes(placeholder));
}

export function toPlayerDisplayName(value: unknown, fallback = "数据源未返回姓名"): string {
  const raw = String(value ?? "").trim();
  if (isPlaceholderPlayerName(raw)) return fallback;

  const translated = toChineseDisplayOrOriginal(raw).trim();
  if (!translated || isPlaceholderPlayerName(translated)) return raw;
  return translated;
}

export function translateTeamName(value: unknown): string {
  return toChineseDisplay(value, "待接入中文队名");
}

export function translatePlayerName(value: unknown): string {
  return toChineseDisplay(value, "待接入中文名");
}

export function translatePosition(value: unknown): string {
  return toChineseDisplay(value, "待接入中文位置");
}

export function translateFreeText(value: unknown): string {
  return toChineseDisplay(value, "待接入中文字段");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceRegex(source: string): RegExp {
  const escaped = escapeRegExp(source);
  if (!latinRegex.test(source)) return new RegExp(escaped, "giu");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

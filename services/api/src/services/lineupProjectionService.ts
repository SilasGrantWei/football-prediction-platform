import type {
  Match,
  MatchLineupProjection,
  ProjectedPlayer,
  Team,
  TeamLineupProjection
} from "../models.js";

type PlayerSeed = Omit<ProjectedPlayer, "role" | "source">;

interface TeamLineupProfile {
  formation: string;
  confidence: "low" | "medium" | "high";
  starters: PlayerSeed[];
  keySubstitutes?: PlayerSeed[];
}

interface TeamLineupProfileOverride {
  learningMatchId: string;
  effectiveFrom: string;
  reason: string;
  profile: TeamLineupProfile;
}

export interface LineupImpactSignal {
  homeStrengthDelta: number;
  awayStrengthDelta: number;
  homeGoalFactor: number;
  awayGoalFactor: number;
}

const projectionNote =
  "推算首发不是官方实时阵容；官方首发、换人、伤停或比赛报告接入后会覆盖该特征。当前只作为赛前可用的阵容概率特征，不会冒充真实数据。";

const teamLineupProfiles: Record<string, TeamLineupProfile> = {
  portugal: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("迪奥戈-科斯塔", "门将", 0.9, 85, 0, 0),
      player("若昂-坎塞洛", "右后卫", 0.82, 86, 0.01, 0.04),
      player("鲁本-迪亚斯", "中后卫", 0.92, 89, 0.01, 0.01),
      player("安东尼奥-席尔瓦", "中后卫", 0.7, 81, 0.01, 0),
      player("努诺-门德斯", "左后卫", 0.82, 85, 0.01, 0.03),
      player("若昂-帕利尼亚", "后腰", 0.72, 84, 0, 0.01),
      player("维蒂尼亚", "中场", 0.84, 87, 0.02, 0.05),
      player("布鲁诺-费尔南德斯", "前腰", 0.9, 88, 0.05, 0.08),
      player("贝尔纳多-席尔瓦", "右边锋", 0.88, 88, 0.04, 0.07),
      player("拉斐尔-莱奥", "左边锋", 0.76, 86, 0.06, 0.04),
      player("克里斯蒂亚诺·罗纳尔多", "中锋", 0.68, 89, 0.1, 0.02)
    ],
    keySubstitutes: [
      player("迪奥戈-若塔", "前锋", 0.54, 85, 0.07, 0.03),
      player("贡萨洛-拉莫斯", "中锋", 0.48, 83, 0.06, 0.02),
      player("若昂-菲利克斯", "前锋", 0.45, 84, 0.04, 0.05)
    ]
  },
  croatia: {
    formation: "4-3-3",
    confidence: "medium",
    starters: [
      player("多米尼克-利瓦科维奇", "门将", 0.88, 83, 0, 0),
      player("约瑟普-斯塔尼希奇", "右后卫", 0.78, 81, 0.01, 0.02),
      player("马林-庞格拉契奇", "中后卫", 0.68, 79, 0.01, 0),
      player("约什科-格瓦迪奥尔", "中后卫", 0.9, 86, 0.02, 0.02),
      player("博尔纳-索萨", "左后卫", 0.72, 80, 0.01, 0.03),
      player("马塞洛-布罗佐维奇", "后腰", 0.74, 84, 0.01, 0.03),
      player("马特奥-科瓦契奇", "中场", 0.88, 85, 0.01, 0.04),
      player("卢卡-莫德里奇", "中场", 0.82, 88, 0.03, 0.07),
      player("伊万-佩里西奇", "左边锋", 0.58, 83, 0.04, 0.04),
      player("安德雷-克拉马里奇", "前锋", 0.78, 84, 0.07, 0.03),
      player("布鲁诺-佩特科维奇", "中锋", 0.54, 81, 0.05, 0.02)
    ],
    keySubstitutes: [
      player("布季米尔", "中锋", 0.44, 82, 0.06, 0.01),
      player("马耶尔", "前腰", 0.48, 82, 0.03, 0.05),
      player("帕沙利奇", "中场", 0.42, 81, 0.03, 0.02)
    ]
  },
  spain: {
    formation: "4-3-3",
    confidence: "medium",
    starters: [
      player("乌奈-西蒙", "门将", 0.86, 84, 0, 0),
      player("卡瓦哈尔", "右后卫", 0.84, 86, 0.01, 0.03),
      player("勒诺尔芒", "中后卫", 0.78, 83, 0.01, 0),
      player("拉波尔特", "中后卫", 0.82, 85, 0.01, 0.01),
      player("库库雷利亚", "左后卫", 0.72, 82, 0.01, 0.03),
      player("罗德里", "后腰", 0.92, 91, 0.03, 0.05),
      player("佩德里", "中场", 0.78, 87, 0.03, 0.06),
      player("法比安-鲁伊斯", "中场", 0.8, 85, 0.03, 0.04),
      player("亚马尔", "右边锋", 0.82, 87, 0.06, 0.07),
      player("莫拉塔", "中锋", 0.76, 84, 0.07, 0.02),
      player("尼科-威廉姆斯", "左边锋", 0.82, 86, 0.06, 0.05)
    ],
    keySubstitutes: [
      player("奥尔莫", "前腰", 0.56, 86, 0.05, 0.06),
      player("奥亚萨瓦尔", "前锋", 0.44, 83, 0.04, 0.03),
      player("梅里诺", "中场", 0.46, 83, 0.02, 0.03)
    ]
  },
  austria: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("帕特里克-彭茨", "门将", 0.78, 78, 0, 0),
      player("斯特凡-波施", "右后卫", 0.8, 80, 0.01, 0.02),
      player("凯文-丹索", "中后卫", 0.84, 82, 0.01, 0),
      player("菲利普-林哈特", "中后卫", 0.78, 81, 0.01, 0),
      player("菲利普-姆韦内", "左后卫", 0.76, 79, 0.01, 0.02),
      player("康拉德-莱默尔", "后腰", 0.86, 83, 0.02, 0.03),
      player("尼古拉斯-塞瓦尔德", "后腰", 0.82, 81, 0.01, 0.03),
      player("马塞尔-萨比策", "前腰", 0.88, 85, 0.05, 0.06),
      player("克里斯托夫-鲍姆加特纳", "前腰", 0.82, 82, 0.05, 0.04),
      player("米夏埃尔-格雷戈里奇", "中锋", 0.64, 80, 0.06, 0.02),
      player("马尔科-阿瑙托维奇", "前锋", 0.58, 82, 0.06, 0.02)
    ],
    keySubstitutes: [
      player("帕特里克-维默尔", "边锋", 0.42, 80, 0.03, 0.03),
      player("格里利奇", "中场", 0.46, 80, 0.01, 0.03)
    ]
  },
  switzerland: {
    formation: "3-4-2-1",
    confidence: "medium",
    starters: [
      player("格雷戈尔-科贝尔", "门将", 0.78, 86, 0, 0),
      player("曼努埃尔-阿坎吉", "中后卫", 0.9, 86, 0.01, 0.01),
      player("尼科-埃尔维迪", "中后卫", 0.78, 81, 0.01, 0),
      player("里卡多-罗德里格斯", "中后卫", 0.76, 80, 0.01, 0.02),
      player("西尔万-威德默", "右翼卫", 0.64, 78, 0.01, 0.02),
      player("格拉尼特-扎卡", "中场", 0.92, 86, 0.03, 0.06),
      player("雷莫-弗罗伊勒", "中场", 0.84, 82, 0.02, 0.03),
      player("鲁本-巴尔加斯", "左前腰", 0.78, 82, 0.05, 0.04),
      player("丹-恩多耶", "右前腰", 0.72, 80, 0.04, 0.04),
      player("布雷尔-恩博洛", "中锋", 0.7, 83, 0.07, 0.02),
      player("泽基-阿姆杜尼", "前锋", 0.58, 81, 0.05, 0.03)
    ],
    keySubstitutes: [
      player("诺阿-奥卡福", "前锋", 0.44, 82, 0.05, 0.03),
      player("法比安-里德尔", "中场", 0.4, 80, 0.02, 0.03)
    ]
  },
  algeria: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("安东尼-曼德雷亚", "门将", 0.76, 77, 0, 0),
      player("尤塞夫-阿塔尔", "右后卫", 0.7, 78, 0.01, 0.03),
      player("艾萨-曼迪", "中后卫", 0.82, 79, 0.01, 0),
      player("拉米-本塞拜尼", "中后卫", 0.82, 82, 0.02, 0.01),
      player("拉扬-艾特-努里", "左后卫", 0.84, 82, 0.01, 0.04),
      player("伊斯梅尔-本纳赛尔", "中场", 0.78, 84, 0.02, 0.05),
      player("拉米兹-泽鲁基", "后腰", 0.68, 78, 0.01, 0.02),
      player("里亚德-马赫雷斯", "右边锋", 0.8, 86, 0.07, 0.08),
      player("赛义德-本拉赫马", "左边锋", 0.68, 82, 0.05, 0.05),
      player("阿明-古伊里", "前锋", 0.72, 83, 0.06, 0.04),
      player("巴格达-博内贾", "中锋", 0.58, 80, 0.06, 0.01)
    ],
    keySubstitutes: [
      player("费古利", "中场", 0.38, 80, 0.02, 0.04),
      player("斯利马尼", "中锋", 0.32, 79, 0.05, 0.01)
    ]
  },
  argentina: {
    formation: "4-3-3",
    confidence: "medium",
    starters: [
      player("埃米利亚诺-马丁内斯", "门将", 0.9, 88, 0, 0),
      player("莫利纳", "右后卫", 0.82, 84, 0.01, 0.03),
      player("克里斯蒂安-罗梅罗", "中后卫", 0.9, 87, 0.01, 0),
      player("奥塔门迪", "中后卫", 0.72, 83, 0.01, 0),
      player("塔利亚菲科", "左后卫", 0.68, 80, 0.01, 0.02),
      player("德保罗", "中场", 0.86, 84, 0.02, 0.05),
      player("恩佐-费尔南德斯", "中场", 0.78, 85, 0.02, 0.05),
      player("麦卡利斯特", "中场", 0.88, 86, 0.03, 0.05),
      player("梅西", "右前锋", 0.78, 93, 0.09, 0.1),
      player("劳塔罗-马丁内斯", "中锋", 0.78, 88, 0.09, 0.02),
      player("朱利安-阿尔瓦雷斯", "前锋", 0.76, 87, 0.08, 0.04)
    ],
    keySubstitutes: [
      player("迪马利亚", "边锋", 0.34, 84, 0.04, 0.06),
      player("尼古拉斯-冈萨雷斯", "边锋", 0.4, 82, 0.04, 0.03)
    ]
  },
  canada: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("克雷波", "门将", 0.78, 78, 0, 0),
      player("阿利斯泰尔-约翰斯顿", "右后卫", 0.84, 80, 0.01, 0.03),
      player("科内利厄斯", "中后卫", 0.78, 78, 0.01, 0),
      player("卢克-德富热罗勒", "中后卫", 0.62, 76, 0, 0),
      player("阿方索-戴维斯", "左后卫", 0.86, 86, 0.04, 0.07),
      player("埃斯塔基奥", "中场", 0.82, 81, 0.02, 0.05),
      player("伊斯梅尔-科内", "中场", 0.72, 79, 0.02, 0.03),
      player("泰琼-布坎南", "右边锋", 0.76, 81, 0.04, 0.04),
      player("乔纳森-戴维", "中锋", 0.88, 86, 0.08, 0.03),
      player("塞勒-拉林", "前锋", 0.72, 81, 0.06, 0.02),
      player("沙费尔伯格", "左边锋", 0.58, 78, 0.03, 0.03)
    ],
    keySubstitutes: [
      player("奥索里奥", "中场", 0.4, 78, 0.02, 0.03),
      player("利亚姆-米勒", "边锋", 0.36, 78, 0.03, 0.03)
    ]
  },
  egypt: {
    formation: "4-3-3",
    confidence: "medium",
    starters: [
      player("穆罕默德-谢纳维", "门将", 0.82, 80, 0, 0),
      player("穆罕默德-哈尼", "右后卫", 0.72, 77, 0.01, 0.02),
      player("艾哈迈德-希加齐", "中后卫", 0.78, 80, 0.01, 0),
      player("穆罕默德-阿卜杜勒莫内姆", "中后卫", 0.78, 79, 0.01, 0),
      player("艾哈迈德-法图赫", "左后卫", 0.68, 77, 0.01, 0.02),
      player("埃尔内尼", "中场", 0.7, 79, 0.01, 0.03),
      player("哈姆迪-法蒂", "中场", 0.68, 78, 0.02, 0.02),
      player("特雷泽盖", "左边锋", 0.76, 81, 0.05, 0.04),
      player("萨拉赫", "右边锋", 0.9, 91, 0.1, 0.08),
      player("马尔穆什", "前锋", 0.84, 86, 0.08, 0.05),
      player("穆斯塔法-穆罕默德", "中锋", 0.72, 81, 0.06, 0.01)
    ],
    keySubstitutes: [
      player("齐佐", "边锋", 0.42, 79, 0.03, 0.04),
      player("艾哈迈德-赛义德", "前锋", 0.36, 78, 0.03, 0.02)
    ]
  },
  france: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("迈克-迈尼昂", "门将", 0.86, 86, 0, 0),
      player("儒勒-孔德", "右后卫", 0.82, 85, 0.01, 0.02),
      player("威廉-萨利巴", "中后卫", 0.88, 87, 0.01, 0),
      player("达约-于帕梅卡诺", "中后卫", 0.78, 85, 0.01, 0),
      player("特奥-埃尔南德斯", "左后卫", 0.82, 86, 0.02, 0.04),
      player("奥雷利安-楚阿梅尼", "后腰", 0.84, 86, 0.02, 0.03),
      player("爱德华多-卡马文加", "中场", 0.7, 84, 0.02, 0.04),
      player("安托万-格列兹曼", "前腰", 0.82, 88, 0.05, 0.08),
      player("奥斯曼-登贝莱", "右边锋", 0.72, 86, 0.05, 0.07),
      player("基利安-姆巴佩", "左边锋", 0.92, 93, 0.12, 0.06),
      player("兰达尔-科洛穆阿尼", "中锋", 0.56, 83, 0.06, 0.03)
    ],
    keySubstitutes: [
      player("马库斯-图拉姆", "中锋", 0.48, 84, 0.07, 0.02),
      player("布拉德利-巴尔科拉", "边锋", 0.42, 82, 0.04, 0.04),
      player("金斯利-科曼", "边锋", 0.34, 84, 0.04, 0.05),
      player("阿德里安-拉比奥", "中场", 0.46, 84, 0.02, 0.04),
      player("易卜拉希马-科纳特", "中后卫", 0.4, 84, 0.01, 0)
    ]
  },
  paraguay: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("加蒂托-费尔南德斯", "门将", 0.66, 77, 0, 0),
      player("阿尔贝托-埃斯皮诺拉", "右后卫", 0.62, 76, 0.01, 0.02),
      player("古斯塔沃-戈麦斯", "中后卫", 0.88, 82, 0.02, 0),
      player("法比安-巴尔武埃纳", "中后卫", 0.76, 79, 0.01, 0),
      player("朱尼奥尔-阿隆索", "左后卫", 0.72, 78, 0.01, 0.02),
      player("安德烈斯-库巴斯", "后腰", 0.76, 78, 0.01, 0.02),
      player("马蒂亚斯-维拉桑蒂", "中场", 0.8, 80, 0.02, 0.03),
      player("迭戈-戈麦斯", "前腰", 0.68, 80, 0.04, 0.05),
      player("米格尔-阿尔米隆", "右边锋", 0.86, 83, 0.06, 0.05),
      player("胡利奥-恩西索", "左边锋", 0.74, 82, 0.06, 0.04),
      player("安东尼奥-萨纳布里亚", "中锋", 0.7, 81, 0.07, 0.01)
    ],
    keySubstitutes: [
      player("拉蒙-索萨", "边锋", 0.44, 80, 0.04, 0.04),
      player("亚当-巴雷罗", "中锋", 0.38, 79, 0.05, 0.01),
      player("安赫尔-罗梅罗", "前锋", 0.36, 80, 0.04, 0.03),
      player("奥马尔-阿尔德雷特", "后卫", 0.34, 78, 0.01, 0),
      player("达米安-博瓦迪利亚", "中场", 0.32, 78, 0.02, 0.02)
    ]
  },
  colombia: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("卡米洛-巴尔加斯", "门将", 0.82, 81, 0, 0),
      player("丹尼尔-穆尼奥斯", "右后卫", 0.84, 82, 0.02, 0.03),
      player("达文森-桑切斯", "中后卫", 0.86, 83, 0.01, 0),
      player("卢库米", "中后卫", 0.78, 81, 0.01, 0),
      player("莫希卡", "左后卫", 0.76, 79, 0.01, 0.03),
      player("莱尔马", "后腰", 0.82, 82, 0.02, 0.02),
      player("马特乌斯-乌里韦", "中场", 0.7, 80, 0.02, 0.03),
      player("哈梅斯-罗德里格斯", "前腰", 0.78, 86, 0.04, 0.08),
      player("约翰-阿里亚斯", "右边锋", 0.82, 83, 0.05, 0.05),
      player("路易斯-迪亚斯", "左边锋", 0.9, 88, 0.08, 0.06),
      player("约翰-杜兰", "中锋", 0.64, 83, 0.07, 0.02)
    ],
    keySubstitutes: [
      player("博雷", "前锋", 0.42, 81, 0.05, 0.02),
      player("金特罗", "前腰", 0.34, 80, 0.02, 0.05)
    ]
  },
  ghana: {
    formation: "4-2-3-1",
    confidence: "medium",
    starters: [
      player("阿蒂-齐吉", "门将", 0.72, 77, 0, 0),
      player("兰普泰", "右后卫", 0.68, 78, 0.01, 0.03),
      player("亚历山大-吉库", "中后卫", 0.78, 80, 0.01, 0),
      player("穆罕默德-萨利苏", "中后卫", 0.82, 81, 0.01, 0),
      player("吉迪恩-门萨", "左后卫", 0.68, 77, 0.01, 0.02),
      player("托马斯-帕尔特伊", "后腰", 0.76, 84, 0.03, 0.04),
      player("埃德蒙德-阿多", "中场", 0.58, 76, 0.01, 0.02),
      player("穆罕默德-库杜斯", "前腰", 0.88, 86, 0.08, 0.06),
      player("安德烈-阿尤", "边锋", 0.5, 80, 0.04, 0.03),
      player("伊纳基-威廉姆斯", "前锋", 0.82, 84, 0.07, 0.03),
      player("安托万-塞梅尼奥", "边锋", 0.72, 82, 0.06, 0.03)
    ],
    keySubstitutes: [
      player("卡马尔丁-苏莱马纳", "边锋", 0.44, 80, 0.04, 0.04),
      player("乔丹-阿尤", "前锋", 0.42, 80, 0.04, 0.03)
    ]
  }
};

const teamLineupProfileOverrides: Record<string, TeamLineupProfileOverride[]> = {
  croatia: [
    {
      learningMatchId: "match-003",
      effectiveFrom: "2026-07-03T01:30:00.000Z",
      reason:
        "葡萄牙 vs 克罗地亚赛后验证显示克罗地亚推算首发只命中6/11；后续比赛提高真实首发覆盖权重，降低旧固定主力池权重。",
      profile: {
        formation: "4-3-3",
        confidence: "medium",
        starters: [
          player("多米尼克-利瓦科维奇", "门将", 0.9, 83, 0, 0),
          player("约瑟普-斯塔尼希奇", "右后卫", 0.82, 81, 0.01, 0.02),
          player("马林-庞格拉契奇", "中后卫", 0.75, 79, 0.01, 0),
          player("约瑟普-舒塔洛", "中后卫", 0.72, 81, 0.01, 0),
          player("伊万-佩里西奇", "左后卫", 0.7, 83, 0.03, 0.04),
          player("佩塔尔-苏契奇", "中场", 0.68, 80, 0.02, 0.03),
          player("马特奥-科瓦契奇", "中场", 0.88, 85, 0.01, 0.04),
          player("卢卡-莫德里奇", "中场", 0.82, 88, 0.03, 0.07),
          player("马丁-巴图里纳", "前腰", 0.6, 80, 0.03, 0.05),
          player("安特-布迪米尔", "中锋", 0.62, 82, 0.06, 0.01),
          player("尼古拉-弗拉希奇", "前锋", 0.58, 81, 0.04, 0.04)
        ],
        keySubstitutes: [
          player("约什科-格瓦迪奥尔", "中后卫", 0.56, 86, 0.02, 0.02),
          player("安德雷-克拉马里奇", "前锋", 0.52, 84, 0.06, 0.03),
          player("布鲁诺-佩特科维奇", "中锋", 0.38, 81, 0.04, 0.02),
          player("马里奥-帕萨利奇", "中场", 0.42, 81, 0.03, 0.02),
          player("博尔纳-索萨", "左后卫", 0.34, 80, 0.01, 0.03)
        ]
      }
    }
  ]
};

export function buildMatchLineupProjection(match: Match): MatchLineupProjection {
  return {
    matchId: match.id,
    generatedAt: new Date().toISOString(),
    note: projectionNote,
    home: buildTeamLineupProjection(match.homeTeam, match.startTime),
    away: buildTeamLineupProjection(match.awayTeam, match.startTime)
  };
}

export function buildLineupImpactSignal(projection: MatchLineupProjection): LineupImpactSignal {
  const homeReliability = lineupReliability(projection.home);
  const awayReliability = lineupReliability(projection.away);
  const homeImpact = teamImpactScore(projection.home) * homeReliability;
  const awayImpact = teamImpactScore(projection.away) * awayReliability;
  if (homeImpact === 0 && awayImpact === 0) {
    return {
      homeStrengthDelta: 0,
      awayStrengthDelta: 0,
      homeGoalFactor: 1,
      awayGoalFactor: 1
    };
  }

  const homeAttackEdge =
    (projection.home.attackImpact + projection.home.creationImpact) * homeReliability -
    projection.away.defensiveImpact * awayReliability * 0.55;
  const awayAttackEdge =
    (projection.away.attackImpact + projection.away.creationImpact) * awayReliability -
    projection.home.defensiveImpact * homeReliability * 0.55;
  const strengthDelta = clamp((homeImpact - awayImpact) * 8, -2.4, 2.4);

  return {
    homeStrengthDelta: strengthDelta,
    awayStrengthDelta: -strengthDelta,
    homeGoalFactor: clamp(1 + homeAttackEdge * 0.18, 0.94, 1.10),
    awayGoalFactor: clamp(1 + awayAttackEdge * 0.18, 0.94, 1.10)
  };
}

function buildTeamLineupProjection(team: Team, matchStartTime: string): TeamLineupProjection {
  const selectedProfile = selectTeamLineupProfile(team.id, matchStartTime);
  const profile = selectedProfile?.profile;
  const calibration = selectedProfile?.calibration;
  if (!profile) {
    return {
      teamId: team.id,
      teamName: team.name,
      formation: "待定",
      sourceType: "projected",
      sourceLabel: "未接入可验证球员池",
      confidence: "low",
      starters: [],
      keySubstitutes: [],
      attackImpact: 0,
      creationImpact: 0,
      defensiveImpact: 0,
      summary: `${team.name} 暂无可验证球员池，推算首发不参与模型校准。`
    };
  }

  const starters = profile.starters.slice(0, 11).map((seed) => withRole(seed, "starter"));
  const keySubstitutes = (profile.keySubstitutes ?? []).slice(0, 5).map((seed) => withRole(seed, "key_substitute"));
  const attackImpact = round4(
    clamp(
      starters.reduce((sum, item) => sum + item.goalImpact * item.startProbability, 0) +
        keySubstitutes.reduce((sum, item) => sum + item.goalImpact * item.startProbability * 0.28, 0),
      0,
      0.42
    )
  );
  const creationImpact = round4(
    clamp(
      starters.reduce((sum, item) => sum + item.assistImpact * item.startProbability, 0) +
        keySubstitutes.reduce((sum, item) => sum + item.assistImpact * item.startProbability * 0.24, 0),
      0,
      0.36
    )
  );
  const defensiveImpact = round4(clamp(defensiveRatingImpact(starters), 0, 0.2));
  const starNames = starters
    .filter((item) => item.starRating >= 86 || item.goalImpact >= 0.07 || item.assistImpact >= 0.07)
    .slice(0, 4)
    .map((item) => item.name);

  return {
    teamId: team.id,
    teamName: team.name,
    formation: profile.formation,
    sourceType: "projected",
    sourceLabel: calibration ? "模型推算首发，已应用赛后校准" : "模型推算首发，非官方实时阵容",
    confidence: profile.confidence,
    calibration,
    starters,
    keySubstitutes,
    attackImpact,
    creationImpact,
    defensiveImpact,
    summary: starNames.length
      ? `${team.name} 预计核心为 ${starNames.join("、")}；该信号会小幅修正进球期望。${calibration ? ` 已应用赛后校准：${calibration.reason}` : ""}`
      : `${team.name} 推算首发影响较分散，阵容信号保持中性。${calibration ? ` 已应用赛后校准：${calibration.reason}` : ""}`
  };
}

function selectTeamLineupProfile(
  teamId: string,
  matchStartTime: string
): { profile: TeamLineupProfile; calibration?: TeamLineupProjection["calibration"] } | null {
  const baseProfile = teamLineupProfiles[teamId];
  const matchTime = Date.parse(matchStartTime);
  const overrides = teamLineupProfileOverrides[teamId] ?? [];
  const activeOverride = overrides
    .filter((item) => Number.isFinite(matchTime) && matchTime >= Date.parse(item.effectiveFrom))
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];

  if (!activeOverride) return baseProfile ? { profile: baseProfile } : null;

  return {
    profile: activeOverride.profile,
    calibration: {
      status: "post_match_adjusted",
      learningMatchId: activeOverride.learningMatchId,
      effectiveFrom: activeOverride.effectiveFrom,
      reason: activeOverride.reason
    }
  };
}

function player(
  name: string,
  position: string,
  startProbability: number,
  starRating: number,
  goalImpact: number,
  assistImpact: number
): PlayerSeed {
  return {
    name,
    position,
    startProbability,
    starRating,
    goalImpact,
    assistImpact
  };
}

function withRole(seed: PlayerSeed, role: ProjectedPlayer["role"]): ProjectedPlayer {
  return {
    ...seed,
    role,
    source: "player_pool"
  };
}

function defensiveRatingImpact(starters: ProjectedPlayer[]): number {
  const defensivePlayers = starters.filter(
    (item) => item.position.includes("门将") || item.position.includes("后卫") || item.position.includes("后腰")
  );
  if (!defensivePlayers.length) return 0;
  const weightedRating =
    defensivePlayers.reduce((sum, item) => sum + item.starRating * item.startProbability, 0) /
    defensivePlayers.reduce((sum, item) => sum + item.startProbability, 0);
  return (weightedRating - 76) / 80;
}

function teamImpactScore(team: TeamLineupProjection): number {
  return team.starters.length
    ? team.attackImpact * 0.46 + team.creationImpact * 0.34 + team.defensiveImpact * 0.2
    : 0;
}

function lineupReliability(team: TeamLineupProjection): number {
  if (!team.starters.length) return 0;
  if (team.sourceType === "official") return 1;
  if (team.calibration?.status === "post_match_adjusted") return 0.34;
  if (team.confidence === "high") return 0.36;
  if (team.confidence === "medium") return 0.28;
  return 0.12;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

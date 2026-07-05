import { describe, expect, it } from "vitest";

import {
  localizeFootballText,
  localizePlayerName,
  localizePositionName,
  localizeTeamName
} from "../src/services/footballLocalization.js";

describe("footballLocalization", () => {
  it("localizes ESPN team, player and position names for match detail display", () => {
    expect(localizeTeamName("Uruguay")).toBe("乌拉圭");
    expect(localizeTeamName("Spain")).toBe("西班牙");
    expect(localizePlayerName("Fernando Muslera")).toBe("费尔南多·穆斯莱拉");
    expect(localizePlayerName("Lamine Yamal")).toBe("拉明·亚马尔");
    expect(localizePositionName("Center Left Defender")).toBe("左中卫");
    expect(localizePositionName("Attacking Midfielder Right")).toBe("右前腰");
  });

  it("localizes Switzerland and Canada match detail names", () => {
    expect(localizeTeamName("Switzerland")).toBe("瑞士");
    expect(localizeTeamName("Canada")).toBe("加拿大");
    expect(localizePlayerName("Gregor Kobel")).toBe("格雷戈尔·科贝尔");
    expect(localizePlayerName("Granit Xhaka")).toBe("格拉尼特·扎卡");
    expect(localizePlayerName("Maxime Crépeau")).toBe("马克西姆·克雷波");
    expect(localizePlayerName("Jonathan David")).toBe("乔纳森·戴维");
    expect(localizePositionName("Center Left Forward")).toBe("左中锋");
    expect(localizePositionName("Center Right Forward")).toBe("右中锋");
  });

  it("localizes friendly opponent country names used in team record panels", () => {
    expect(localizeTeamName("Chile")).toBe("智利");
    expect(localizeTeamName("Slovenia")).toBe("斯洛文尼亚");
    expect(localizeTeamName("Congo DR")).toBe("民主刚果");
    expect(localizeTeamName("Denmark")).toBe("丹麦");
    expect(localizeTeamName("Bermuda")).toBe("百慕大");
    expect(localizeTeamName("Costa Rica")).toBe("哥斯达黎加");
    expect(localizeTeamName("Honduras")).toBe("洪都拉斯");
    expect(localizeTeamName("Finland")).toBe("芬兰");
  });

  it("localizes Portugal, Congo DR and Denmark player names from ESPN match details", () => {
    expect(localizePlayerName("Diogo Costa")).toBe("迪奥戈·科斯塔");
    expect(localizePlayerName("Tomás Araújo")).toBe("托马斯·阿劳若");
    expect(localizePlayerName("João Cancelo")).toBe("若昂·坎塞洛");
    expect(localizePlayerName("Bernardo Silva")).toBe("贝尔纳多·席尔瓦");
    expect(localizePlayerName("Cristiano Ronaldo")).toBe("克里斯蒂亚诺·罗纳尔多");
    expect(localizePlayerName("Lionel Mpasi")).toBe("莱昂内尔·姆帕西");
    expect(localizePlayerName("Chancel Mbemba")).toBe("尚塞尔·姆本巴");
    expect(localizePlayerName("Cédric Bakambu")).toBe("塞德里克·巴坎布");
    expect(localizePlayerName("Filip Jørgensen")).toBe("菲利普·约根森");
    expect(localizePlayerName("Pierre-Emile Højbjerg")).toBe("皮埃尔-埃米尔·霍伊别尔");
    expect(localizePositionName("Center Defender")).toBe("中后卫");
    expect(localizePositionName("Left Forward")).toBe("左前锋");
    expect(localizePositionName("Right Forward")).toBe("右前锋");
  });

  it("localizes Argentina and Algeria player names from ESPN World Cup details", () => {
    expect(localizeTeamName("Argentina")).toBe("阿根廷");
    expect(localizeTeamName("Algeria")).toBe("阿尔及利亚");
    expect(localizePlayerName("Emiliano Martínez")).toBe("埃米利亚诺·马丁内斯");
    expect(localizePlayerName("Lionel Messi")).toBe("梅西");
    expect(localizePlayerName("Lautaro Martinez")).toBe("劳塔罗·马丁内斯");
    expect(localizePlayerName("Luca Zidane")).toBe("卢卡·齐达内");
    expect(localizePlayerName("Aïssa Mandi")).toBe("艾萨·曼迪");
    expect(localizePlayerName("Anis Hadj Moussa")).toBe("阿尼斯·哈吉·穆萨");
  });

  it("localizes Australia and Egypt player names and detailed event text from ESPN World Cup details", () => {
    expect(localizePlayerName("Patrick Beach")).toBe("帕特里克·比奇");
    expect(localizePlayerName("Jackson Irvine")).toBe("杰克逊·欧文");
    expect(localizePlayerName("Aiden O'Neill")).toBe("艾登·奥尼尔");
    expect(localizePlayerName("Mohamed Hany")).toBe("穆罕默德·哈尼");
    expect(localizePlayerName("Mostafa Shoubir")).toBe("穆斯塔法·舒贝尔");
    expect(localizePlayerName("Emam Ashour")).toBe("伊玛姆·阿舒尔");
    expect(localizePlayerName("Mostafa Zico")).toBe("穆斯塔法·齐佐");
    expect(localizeFootballText("Corner, Australia. Conceded by Mohamed Hany.")).toContain(
      "角球, 澳大利亚. 造成者： 穆罕默德·哈尼"
    );
    expect(localizeFootballText("Jackson Irvine (Australia) wins a free kick in the defensive half.")).toContain(
      "杰克逊·欧文 (澳大利亚) 在防守半场赢得任意球"
    );
    expect(localizeFootballText("Foul by Yasser Ibrahim (Egypt).")).toContain("犯规， 亚西尔·易卜拉欣 (埃及)");
    expect(localizeFootballText("Own Goal by Mohamed Hany, Egypt. Australia 1, Egypt 1.")).toContain(
      "乌龙球， 穆罕默德·哈尼, 埃及"
    );
  });

  it("keeps ESPN event descriptions fully Chinese for accented names and card details", () => {
    const tourEvent = localizeFootballText(
      "Attempt missed. Mohamed Touré (Australia) header from the centre of the box misses to the right."
    );
    expect(tourEvent).toContain(localizePlayerName("Mohamed Touré"));
    expect(tourEvent).not.toMatch(/未接入中文名|待补中文球员|Unknown|Mohamed|Tour/);

    const cardEvent = localizeFootballText("Haissem Hassan (Egypt) is shown the yellow card for a bad foul.");
    expect(cardEvent).toContain(localizePlayerName("Haissem Hassan"));
    expect(cardEvent).toContain("黄牌");
    expect(cardEvent).not.toMatch(/未接入中文名|shown|yellow|foul/);
  });

  it("keeps unmapped real names unchanged instead of inventing translations", () => {
    expect(localizePlayerName("Unmapped Player")).toBe("未知球员");
    expect(localizePositionName("Wing Wizard")).toBe("位置未返回");
  });

  it("localizes Colombia and Portugal lineup names returned with or without accents", () => {
    const names = [
      ["Camilo Vargas", "卡米洛·巴尔加斯"],
      ["Jhon Lucumí", "约翰·卢库米"],
      ["Jhon Lucumi", "约翰·卢库米"],
      ["Davinson Sánchez", "达文森·桑切斯"],
      ["Davinson Sanchez", "达文森·桑切斯"],
      ["Deiver Machado", "戴维尔·马查多"],
      ["Santiago Arias", "圣地亚哥·阿里亚斯"],
      ["Jefferson Lerma", "杰弗森·莱尔马"],
      ["Gustavo Puerta", "古斯塔沃·普埃尔塔"],
      ["Jhon Arias", "约翰·阿里亚斯"],
      ["Jhon Córdoba", "约翰·科尔多瓦"],
      ["Jhon Cordoba", "约翰·科尔多瓦"],
      ["Luis Díaz", "路易斯·迪亚斯"],
      ["Luis Diaz", "路易斯·迪亚斯"],
      ["James Rodríguez", "哈梅斯·罗德里格斯"],
      ["James Rodriguez", "哈梅斯·罗德里格斯"],
      ["João Félix", "若昂·菲利克斯"],
      ["Joao Felix", "若昂·菲利克斯"]
    ];

    for (const [source, localized] of names) {
      expect(localizePlayerName(source)).toBe(localized);
    }
  });

  it("localizes player names inside event text with accent-insensitive aliases", () => {
    expect(localizeFootballText("Goal by Joao Felix, assist James Rodriguez")).toBe(
      "进球： 若昂·菲利克斯, 助攻 哈梅斯·罗德里格斯"
    );
  });

  it("localizes common ESPN event descriptions without hiding the real event source", () => {
    expect(localizeFootballText("First Half begins.")).toBe("上半场开始");
    expect(
      localizeFootballText("Anis Hadj Moussa (Algeria) wins a free kick in the defensive half.")
    ).toContain("阿尼斯·哈吉·穆萨 (阿尔及利亚) 在防守半场赢得任意球");
    expect(localizeFootballText("Offside, Argentina. Lionel Messi is caught offside.")).toContain(
      "越位, 阿根廷. 梅西 越位"
    );
    expect(localizeFootballText("Corner, Portugal. Conceded by Dominik Livakovic.")).toContain(
      "角球, 葡萄牙. 造成者： 多米尼克·利瓦科维奇"
    );
    expect(
      localizeFootballText(
        "Attempt blocked. Bruno Fernandes (Portugal) right footed shot from the left side of the six yard box is blocked."
      )
    ).toContain("布鲁诺·费尔南德斯 (葡萄牙) 右脚射门 小禁区左侧 被封堵");
    expect(localizeFootballText("VAR Decision: No Goal Portugal 2-1 Croatia.")).toContain("视频助理裁判判定：进球无效");
  });
});

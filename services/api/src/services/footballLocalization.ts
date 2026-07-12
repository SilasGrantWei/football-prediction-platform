const teamNameMap: Record<string, string> = {
  spain: "西班牙",
  uruguay: "乌拉圭",
  portugal: "葡萄牙",
  croatia: "克罗地亚",
  chile: "智利",
  slovenia: "斯洛文尼亚",
  "congo dr": "民主刚果",
  denmark: "丹麦",
  bermuda: "百慕大",
  "costa rica": "哥斯达黎加",
  honduras: "洪都拉斯",
  finland: "芬兰",
  austria: "奥地利",
  england: "英格兰",
  ghana: "加纳",
  colombia: "哥伦比亚",
  panama: "巴拿马",
  algeria: "阿尔及利亚",
  argentina: "阿根廷",
  jordan: "约旦",
  "saudi arabia": "沙特阿拉伯",
  "cape verde": "佛得角",
  uzbekistan: "乌兹别克斯坦",
  "dr congo": "民主刚果",
  switzerland: "瑞士",
  canada: "加拿大",
  "united states": "美国",
  guatemala: "危地马拉",
  "republic of ireland": "爱尔兰",
  ireland: "爱尔兰",
  grenada: "格林纳达",
  sudan: "苏丹",
  burundi: "布隆迪",
  nigeria: "尼日利亚",
  zimbabwe: "津巴布韦",
  india: "印度",
  jamaica: "牙买加",
  russia: "俄罗斯",
  gambia: "冈比亚",
  andorra: "安道尔",
  serbia: "塞尔维亚",
  iceland: "冰岛",
  tunisia: "突尼斯",
  mexico: "墨西哥",
  "south africa": "南非",
  "south korea": "韩国",
  czechia: "捷克",
  bosnia: "波黑",
  paraguay: "巴拉圭",
  qatar: "卡塔尔",
  brazil: "巴西",
  morocco: "摩洛哥",
  haiti: "海地",
  scotland: "苏格兰",
  australia: "澳大利亚",
  turkey: "土耳其",
  germany: "德国",
  curacao: "库拉索",
  netherlands: "荷兰",
  japan: "日本",
  "ivory coast": "科特迪瓦",
  ecuador: "厄瓜多尔",
  sweden: "瑞典",
  belgium: "比利时",
  egypt: "埃及",
  iran: "伊朗",
  "new zealand": "新西兰",
  france: "法国",
  senegal: "塞内加尔",
  iraq: "伊拉克",
  norway: "挪威",
  bolivia: "玻利维亚",
  "north macedonia": "北马其顿"
};

const playerNameMap: Record<string, string> = {
  "Diogo Costa": "迪奥戈·科斯塔",
  "Renato Veiga": "雷纳托·韦加",
  "Tomás Araújo": "托马斯·阿劳若",
  "Tomas Araujo": "托马斯·阿劳若",
  "Nuno Mendes": "努诺·门德斯",
  "João Cancelo": "若昂·坎塞洛",
  "Joao Cancelo": "若昂·坎塞洛",
  "Bruno Fernandes": "布鲁诺·费尔南德斯",
  Vitinha: "维蒂尼亚",
  "João Neves": "若昂·内维斯",
  "Joao Neves": "若昂·内维斯",
  "Cristiano Ronaldo": "克里斯蒂亚诺·罗纳尔多",
  "Rúben Dias": "鲁本·迪亚斯",
  "Ruben Dias": "鲁本·迪亚斯",
  "Rúben Neves": "鲁本·内维斯",
  "Ruben Neves": "鲁本·内维斯",
  "Pedro Neto": "佩德罗·内托",
  "Bernardo Silva": "贝尔纳多·席尔瓦",
  "Francisco Conceição": "弗朗西斯科·孔塞桑",
  "Francisco Conceicao": "弗朗西斯科·孔塞桑",
  "Nélson Semedo": "内尔松·塞梅多",
  "Nelson Semedo": "内尔松·塞梅多",
  "Gonçalo Ramos": "贡萨洛·拉莫斯",
  "Goncalo Ramos": "贡萨洛·拉莫斯",
  "Rafael Leão": "拉斐尔·莱奥",
  "Rafael Leao": "拉斐尔·莱奥",
  "Mike Maignan": "迈克·迈尼昂",
  "Jules Koundé": "儒勒·孔德",
  "Jules Kounde": "儒勒·孔德",
  "William Saliba": "威廉·萨利巴",
  "Dayot Upamecano": "达约·于帕梅卡诺",
  "Theo Hernández": "特奥·埃尔南德斯",
  "Theo Hernandez": "特奥·埃尔南德斯",
  "Théo Hernández": "特奥·埃尔南德斯",
  "Théo Hernandez": "特奥·埃尔南德斯",
  "Eduardo Camavinga": "爱德华多·卡马文加",
  "Aurélien Tchouaméni": "奥雷利安·楚阿梅尼",
  "Aurelien Tchouameni": "奥雷利安·楚阿梅尼",
  "Adrien Rabiot": "阿德里安·拉比奥",
  "N'Golo Kanté": "恩戈洛·坎特",
  "N'Golo Kante": "恩戈洛·坎特",
  "N’Golo Kante": "恩戈洛·坎特",
  "Antoine Griezmann": "安托万·格列兹曼",
  "Ousmane Dembélé": "奥斯曼·登贝莱",
  "Ousmane Dembele": "奥斯曼·登贝莱",
  "Kylian Mbappé": "基利安·姆巴佩",
  "Kylian Mbappe": "基利安·姆巴佩",
  "Marcus Thuram": "马库斯·图拉姆",
  "Bradley Barcola": "布拉德利·巴尔科拉",
  "Randal Kolo Muani": "兰达尔·科洛·穆阿尼",
  "Kingsley Coman": "金斯利·科曼",
  "Ibrahima Konaté": "易卜拉希马·科纳特",
  "Ibrahima Konate": "易卜拉希马·科纳特",
  "Benjamin Pavard": "邦雅曼·帕瓦尔",
  "Ferland Mendy": "费兰·门迪",
  "Christopher Nkunku": "克里斯托弗·恩昆库",
  "Warren Zaïre-Emery": "沃伦·扎伊尔-埃梅里",
  "Warren Zaire-Emery": "沃伦·扎伊尔-埃梅里",
  "Gatito Fernández": "加蒂托·费尔南德斯",
  "Gatito Fernandez": "加蒂托·费尔南德斯",
  "Roberto Fernández": "罗伯托·费尔南德斯",
  "Roberto Fernandez": "罗伯托·费尔南德斯",
  "Gustavo Gómez": "古斯塔沃·戈麦斯",
  "Gustavo Gomez": "古斯塔沃·戈麦斯",
  "Fabián Balbuena": "法比安·巴尔武埃纳",
  "Fabian Balbuena": "法比安·巴尔武埃纳",
  "Junior Alonso": "朱尼奥尔·阿隆索",
  "Omar Alderete": "奥马尔·阿尔德雷特",
  "Robert Rojas": "罗伯特·罗哈斯",
  "Alberto Espínola": "阿尔贝托·埃斯皮诺拉",
  "Alberto Espinola": "阿尔贝托·埃斯皮诺拉",
  "Mathias Villasanti": "马蒂亚斯·维拉桑蒂",
  "Matias Villasanti": "马蒂亚斯·维拉桑蒂",
  "Matías Villasanti": "马蒂亚斯·维拉桑蒂",
  "Andrés Cubas": "安德烈斯·库巴斯",
  "Andres Cubas": "安德烈斯·库巴斯",
  "Diego Gómez": "迭戈·戈麦斯",
  "Diego Gomez": "迭戈·戈麦斯",
  "Damián Bobadilla": "达米安·博瓦迪利亚",
  "Damian Bobadilla": "达米安·博瓦迪利亚",
  "Miguel Almirón": "米格尔·阿尔米隆",
  "Miguel Almiron": "米格尔·阿尔米隆",
  "Julio Enciso": "胡利奥·恩西索",
  "Ramón Sosa": "拉蒙·索萨",
  "Ramon Sosa": "拉蒙·索萨",
  "Antonio Sanabria": "安东尼奥·萨纳布里亚",
  "Adam Bareiro": "亚当·巴雷罗",
  "Ángel Romero": "安赫尔·罗梅罗",
  "Angel Romero": "安赫尔·罗梅罗",
  "Alejandro Romero Gamarra": "亚历杭德罗·罗梅罗·加马拉",
  Kaku: "卡库",
  "Lionel Mpasi": "莱昂内尔·姆帕西",
  "Axel Tuanzebe": "阿克塞尔·图安泽贝",
  "Steve Kapuadi": "史蒂夫·卡普阿迪",
  "Chancel Mbemba": "尚塞尔·姆本巴",
  "Arthur Masuaku": "阿图尔·马苏亚库",
  "Aaron Wan-Bissaka": "阿隆·万-比萨卡",
  "Samuel Moutoussamy": "萨穆埃尔·穆图萨米",
  "Edo Kayembe": "埃多·卡延贝",
  "Ngal'ayel Mukau": "恩加拉耶尔·穆考",
  "Cédric Bakambu": "塞德里克·巴坎布",
  "Cedric Bakambu": "塞德里克·巴坎布",
  "Yoane Wissa": "约安·维萨",
  "Joris Kayembe": "约里斯·卡延贝",
  "Gédéon Kalulu": "热代翁·卡卢卢",
  "Gedeon Kalulu": "热代翁·卡卢卢",
  "Simon Banza": "西蒙·班扎",
  "Noah Sadiki": "诺亚·萨迪基",
  "Charles Pickel": "查尔斯·皮克尔",
  "Nathanaël Mbuku": "纳塔纳埃尔·姆布库",
  "Nathanael Mbuku": "纳塔纳埃尔·姆布库",
  "Filip Jørgensen": "菲利普·约根森",
  "Filip Jörgensen": "菲利普·约根森",
  "Filip Jorgensen": "菲利普·约根森",
  "Oliver Provstgaard": "奥利弗·普罗夫斯高",
  "Andreas Christensen": "安德烈亚斯·克里斯滕森",
  "Joakim Maehle": "约阿基姆·梅勒",
  "Rasmus Kristensen": "拉斯穆斯·克里斯滕森",
  "Pierre-Emile Højbjerg": "皮埃尔-埃米尔·霍伊别尔",
  "Pierre-Emile Hojbjerg": "皮埃尔-埃米尔·霍伊别尔",
  "Christian Eriksen": "克里斯蒂安·埃里克森",
  "Mathias Jensen": "马蒂亚斯·延森",
  "Rasmus Højlund": "拉斯穆斯·霍伊伦",
  "Rasmus Hojlund": "拉斯穆斯·霍伊伦",
  "Patrick Dorgu": "帕特里克·多古",
  "Adam Daghim": "亚当·达吉姆",
  "William Osula": "威廉·奥苏拉",
  "Kasper Høgh": "卡斯珀·霍伊",
  "Kasper Hogh": "卡斯珀·霍伊",
  "Lucas Høgsberg": "卢卡斯·霍格斯贝格",
  "Lucas Hogsberg": "卢卡斯·霍格斯贝格",
  "Albert Grønbaek": "阿尔伯特·格伦拜克",
  "Albert Gronbaek": "阿尔伯特·格伦拜克",
  "Joachim Andersen": "约阿希姆·安德森",
  "Victor Froholdt": "维克托·弗罗霍尔特",
  "Dominik Livakovic": "多米尼克·利瓦科维奇",
  "Dominik Livaković": "多米尼克·利瓦科维奇",
  "Marin Pongracic": "马林·庞格拉契奇",
  "Marin Pongračić": "马林·庞格拉契奇",
  "Josip Sutalo": "约瑟普·舒塔洛",
  "Josip Šutalo": "约瑟普·舒塔洛",
  "Josko Gvardiol": "约什科·格瓦迪奥尔",
  "Joško Gvardiol": "约什科·格瓦迪奥尔",
  "Ivan Perisic": "伊万·佩里西奇",
  "Ivan Perišić": "伊万·佩里西奇",
  "Josip Stanisic": "约瑟普·斯塔尼希奇",
  "Josip Stanišić": "约瑟普·斯塔尼希奇",
  "Petar Sucic": "佩塔尔·苏契奇",
  "Petar Sučić": "佩塔尔·苏契奇",
  "Mateo Kovacic": "马特奥·科瓦契奇",
  "Mateo Kovačić": "马特奥·科瓦契奇",
  "Luka Modric": "卢卡·莫德里奇",
  "Luka Modrić": "卢卡·莫德里奇",
  "Ante Budimir": "安特·布迪米尔",
  "Martin Baturina": "马丁·巴图里纳",
  "Nikola Vlasic": "尼古拉·弗拉希奇",
  "Nikola Vlašić": "尼古拉·弗拉希奇",
  "Igor Matanovic": "伊戈尔·马塔诺维奇",
  "Igor Matanović": "伊戈尔·马塔诺维奇",
  "Mario Pasalic": "马里奥·帕沙利奇",
  "Mario Pašalić": "马里奥·帕沙利奇",
  "Andrej Kramaric": "安德雷·克拉马里奇",
  "Andrej Kramarić": "安德雷·克拉马里奇",
  "Fernando Muslera": "费尔南多·穆斯莱拉",
  "Mathías Olivera": "马蒂亚斯·奥利韦拉",
  "Sebastián Cáceres": "塞巴斯蒂安·卡塞雷斯",
  "Manuel Ugarte": "曼努埃尔·乌加特",
  "Juan Manuel Sanabria": "胡安·曼努埃尔·萨纳布里亚",
  "Guillermo Varela": "吉列尔莫·巴雷拉",
  "Federico Valverde": "费德里科·巴尔韦德",
  "Rodrigo Bentancur": "罗德里戈·本坦库尔",
  "Maxi Araújo": "马克西·阿劳霍",
  "Agustín Canobbio": "阿古斯丁·卡诺比奥",
  "Darwin Núñez": "达尔文·努涅斯",
  "Federico Viñas": "费德里科·维尼亚斯",
  "Brian Rodríguez": "布赖恩·罗德里格斯",
  "Nicolás de la Cruz": "尼古拉斯·德拉克鲁斯",
  "Sergio Rochet": "塞尔吉奥·罗切特",
  "Unai Simón": "乌奈·西蒙",
  "Aymeric Laporte": "艾梅里克·拉波尔特",
  "Pau Cubarsí": "保·库巴西",
  "Marc Cucurella": "马克·库库雷利亚",
  "Marcos Llorente": "马科斯·略伦特",
  "Mikel Merino": "米克尔·梅里诺",
  Rodri: "罗德里",
  Pedri: "佩德里",
  "Mikel Oyarzabal": "米克尔·奥亚萨瓦尔",
  "Álex Baena": "亚历克斯·巴埃纳",
  "Lamine Yamal": "拉明·亚马尔",
  "Yéremy Pino": "耶雷米·皮诺",
  "Nico Williams": "尼科·威廉姆斯",
  "Dani Olmo": "达尼·奥尔莫",
  "Ferran Torres": "费兰·托雷斯",
  "Fabián Ruiz": "法比安·鲁伊斯",
  "Gregor Kobel": "格雷戈尔·科贝尔",
  "Manuel Akanji": "曼努埃尔·阿坎吉",
  "Nico Elvedi": "尼科·埃尔维迪",
  "Ricardo Rodríguez": "里卡多·罗德里格斯",
  "Luca Jaquez": "卢卡·雅克斯",
  "Johan Manzambi": "约翰·曼赞比",
  "Granit Xhaka": "格拉尼特·扎卡",
  "Remo Freuler": "雷莫·弗罗伊勒",
  "Breel Embolo": "布雷尔·恩博洛",
  "Rubén Vargas": "鲁本·巴尔加斯",
  "Djibril Sow": "吉布里尔·索乌",
  "Silvan Widmer": "西尔万·威德默",
  "Dan Ndoye": "丹·恩多耶",
  "Zeki Amdouni": "泽基·阿姆杜尼",
  "Cedric Itten": "塞德里克·伊滕",
  "Michel Aebischer": "米歇尔·阿比舍尔",
  "Christian Fassnacht": "克里斯蒂安·法斯纳赫特",
  "Maxime Crépeau": "马克西姆·克雷波",
  "Derek Cornelius": "德里克·科尼利厄斯",
  "Luc de Fougerolles": "卢克·德富热罗勒斯",
  "Richie Laryea": "里奇·拉里亚",
  "Alistair Johnston": "阿利斯泰尔·约翰斯顿",
  "Mathieu Choinière": "马蒂厄·舒瓦尼埃",
  "Nathan Saliba": "内森·萨利巴",
  "Ali Ahmed": "阿里·艾哈迈德",
  "Tajon Buchanan": "塔琼·布坎南",
  "Cyle Larin": "赛尔·拉林",
  "Jonathan David": "乔纳森·戴维",
  "Tani Oluwaseyi": "塔尼·奥卢瓦塞伊",
  "Jacob Shaffelburg": "雅各布·沙费尔伯格",
  "Stephen Eustáquio": "斯蒂芬·欧斯塔基奥",
  "Liam Millar": "利亚姆·米勒",
  "Promise David": "普罗米斯·戴维",
  "Camilo Vargas": "卡米洛·巴尔加斯",
  "Jhon Lucumí": "约翰·卢库米",
  "Davinson Sánchez": "达文森·桑切斯",
  "Deiver Machado": "戴维尔·马查多",
  "Santiago Arias": "圣地亚哥·阿里亚斯",
  "Jefferson Lerma": "杰弗森·莱尔马",
  "Gustavo Puerta": "古斯塔沃·普埃尔塔",
  "Jhon Arias": "约翰·阿里亚斯",
  "Jhon Córdoba": "约翰·科尔多瓦",
  "Luis Díaz": "路易斯·迪亚斯",
  "James Rodríguez": "哈梅斯·罗德里格斯",
  "Daniel Muñoz": "丹尼尔·穆尼奥斯",
  "Luis Suárez": "路易斯·苏亚雷斯",
  "Kevin Castaño": "凯文·卡斯塔尼奥",
  "Juan Fernando Quintero": "胡安·费尔南多·金特罗",
  "Juan Quintero": "胡安·金特罗",
  "Juanfer Quintero": "胡安费尔·金特罗",
  "Yerry Mina": "耶里·米纳",
  "Mateus Uribe": "马特乌斯·乌里韦",
  "Rafael Santos Borré": "拉斐尔·桑托斯·博雷",
  "Jorge Carrascal": "豪尔赫·卡拉斯卡尔",
  "João Félix": "若昂·菲利克斯",
  "João Palhinha": "若昂·帕利尼亚",
  "Diogo Dalot": "迪奥戈·达洛特",
  "Francisco Trincão": "弗朗西斯科·特林康",
  "Rui Patrício": "鲁伊·帕特里西奥",
  "Emiliano Martínez": "埃米利亚诺·马丁内斯",
  "Emiliano Martinez": "埃米利亚诺·马丁内斯",
  "Lisandro Martínez": "利桑德罗·马丁内斯",
  "Lisandro Martinez": "利桑德罗·马丁内斯",
  "Cristian Romero": "克里斯蒂安·罗梅罗",
  "Nicolás Otamendi": "尼古拉斯·奥塔门迪",
  "Nicolas Otamendi": "尼古拉斯·奥塔门迪",
  "Enzo Fernández": "恩佐·费尔南德斯",
  "Enzo Fernandez": "恩佐·费尔南德斯",
  "Rodrigo De Paul": "罗德里戈·德保罗",
  "Alexis Mac Allister": "亚历克西斯·麦卡利斯特",
  "Lionel Messi": "梅西",
  "Lautaro Martínez": "劳塔罗·马丁内斯",
  "Lautaro Martinez": "劳塔罗·马丁内斯",
  "Julián Álvarez": "胡利安·阿尔瓦雷斯",
  "Julián Alvarez": "胡利安·阿尔瓦雷斯",
  "Julian Alvarez": "胡利安·阿尔瓦雷斯",
  "Gonzalo Montiel": "贡萨洛·蒙铁尔",
  "Facundo Medina": "法昆多·梅迪纳",
  "Nahuel Molina": "纳韦尔·莫利纳",
  "Thiago Almada": "蒂亚戈·阿尔马达",
  "Nico González": "尼科·冈萨雷斯",
  "Nico Gonzalez": "尼科·冈萨雷斯",
  "Nico Paz": "尼科·帕斯",
  "Luca Zidane": "卢卡·齐达内",
  "Ramy Bensebaini": "拉米·本塞拜尼",
  "Aïssa Mandi": "艾萨·曼迪",
  "Aissa Mandi": "艾萨·曼迪",
  "Rayan Aït-Nouri": "拉扬·艾特-努里",
  "Rayan Ait-Nouri": "拉扬·艾特-努里",
  "Nabil Bentaleb": "纳比勒·本塔莱布",
  "Riyad Mahrez": "里亚德·马赫雷斯",
  "Anis Hadj Moussa": "阿尼斯·哈吉·穆萨",
  "Farès Chaïbi": "法雷斯·沙伊比",
  "Fares Chaibi": "法雷斯·沙伊比",
  "Houssem Aouar": "侯赛姆·奥亚尔",
  "Amine Gouiri": "阿明·古伊里",
  "Ibrahim Maza": "易卜拉欣·马扎",
  "Mohamed Amoura": "穆罕默德·阿穆拉",
  "Mohammed Amoura": "穆罕默德·阿穆拉",
  "Ramiz Zerrouki": "拉米兹·泽鲁基",
  "Hicham Boudaoui": "希沙姆·布达维",
  "Rafik Belghali": "拉菲克·贝尔加利",
  "Adil Boulbina": "阿迪尔·布尔比纳",
  "Anthony Mandrea": "安东尼·曼德雷亚",
  "Youcef Atal": "尤塞夫·阿塔尔",
  "Ismael Bennacer": "伊斯梅尔·本纳赛尔",
  "Said Benrahma": "赛义德·本拉赫马",
  "Baghdad Bounedjah": "巴格达·布内贾",
  "Sub Player": "替补球员",
  "Patrick Beach": "帕特里克·比奇",
  "Harry Souttar": "哈里·苏塔",
  "Lucas Herrington": "卢卡斯·赫林顿",
  "Alessandro Circati": "亚历山德罗·奇尔卡蒂",
  "Aiden O'Neill": "艾登·奥尼尔",
  "Aiden O’Neill": "艾登·奥尼尔",
  "Jackson Irvine": "杰克逊·欧文",
  "Aziz Behich": "阿齐兹·贝希奇",
  "Jordan Bos": "乔丹·博斯",
  "Nestory Irankunda": "内斯托里·伊兰昆达",
  "Connor Metcalfe": "康纳·梅特卡夫",
  "Cristian Volpato": "克里斯蒂安·沃尔帕托",
  "Cameron Devlin": "卡梅伦·德夫林",
  "Ajdin Hrustic": "阿伊丁·赫鲁斯蒂奇",
  "Ajdin Hrustić": "阿伊丁·赫鲁斯蒂奇",
  "Cameron Burgess": "卡梅伦·伯吉斯",
  "Nishan Velupillay": "尼尚·韦卢皮莱",
  "Kai Trewin": "凯·特鲁温",
  "Milos Degenek": "米洛斯·德格内克",
  "Awer Mabil": "阿韦尔·马比尔",
  "Mohamed Toure": "穆罕默德·图雷",
  "Mohamed Touré": "穆罕默德·图雷",
  "Tete Yengi": "特特·延吉",
  "Jason Geria": "杰森·格里亚",
  "Mathew Ryan": "马修·瑞安",
  "Paul Okon-Engstler": "保罗·奥康-恩斯特勒",
  "Paul Izzo": "保罗·伊佐",
  "Mostafa Shoubir": "穆斯塔法·舒贝尔",
  "Mostafa Shobeir": "穆斯塔法·舒贝尔",
  "Ramy Rabia": "拉米·拉比亚",
  "Yasser Ibrahim": "亚西尔·易卜拉欣",
  "Karim Hafez": "卡里姆·哈菲兹",
  "Mohamed Hany": "穆罕默德·哈尼",
  "Marawan Attia": "马尔万·阿提亚",
  "Marwan Attia": "马尔万·阿提亚",
  "Hamdy Fathy": "哈姆迪·法蒂",
  "Hamdi Fathy": "哈姆迪·法蒂",
  "Omar Marmoush": "奥马尔·马尔穆什",
  "Emam Ashour": "伊玛姆·阿舒尔",
  "Mostafa Zico": "穆斯塔法·齐佐",
  "Mohamed Salah": "穆罕默德·萨拉赫",
  "Mahdy Soliman": "马赫迪·索利曼",
  Zizo: "齐佐",
  "Ibrahim Adel": "易卜拉欣·阿德尔",
  "Mohamed Alaa": "穆罕默德·阿拉",
  "Tarek Alaa": "塔雷克·阿拉",
  "Hossam Abdelmaguid": "胡萨姆·阿卜杜勒马吉德",
  "Haissem Hassan": "海赛姆·哈桑",
  "Mohamed El Shenawy": "穆罕默德·埃尔谢纳维",
  "Hamza Abdelkarim": "哈姆扎·阿卜杜勒卡里姆",
  "Mahmoud Saber": "马哈茂德·萨贝尔",
  "Nabil Donga": "纳比勒·东加",
  "Trézéguet": "特雷泽盖",
  Trezeguet: "特雷泽盖",
  "Raul Rangel": "劳尔·兰赫尔",
  "Raúl Rangel": "劳尔·兰赫尔",
  "Johan Vasquez": "约翰·巴斯克斯",
  "Johan Vásquez": "约翰·巴斯克斯",
  "Cesar Montes": "塞萨尔·蒙特斯",
  "César Montes": "塞萨尔·蒙特斯",
  "Jesus Gallardo": "赫苏斯·加利亚多",
  "Jesús Gallardo": "赫苏斯·加利亚多",
  "Jorge Sanchez": "豪尔赫·桑切斯",
  "Jorge Sánchez": "豪尔赫·桑切斯",
  "Erik Lira": "埃里克·利拉",
  "Érik Lira": "埃里克·利拉",
  "Luis Romo": "路易斯·罗莫",
  "Gilberto Mora": "吉尔伯托·莫拉",
  "Raul Jimenez": "劳尔·希门尼斯",
  "Raúl Jiménez": "劳尔·希门尼斯",
  "Julian Quinones": "胡利安·基尼奥内斯",
  "Julián Quiñones": "胡利安·基尼奥内斯",
  "Roberto Alvarado": "罗伯托·阿尔瓦拉多",
  "Alvaro Fidalgo": "阿尔瓦罗·菲达尔戈",
  "Álvaro Fidalgo": "阿尔瓦罗·菲达尔戈",
  "Santiago Gimenez": "圣地亚哥·希门尼斯",
  "Santiago Giménez": "圣地亚哥·希门尼斯",
  "Brian Gutierrez": "布赖恩·古铁雷斯",
  "Brian Gutiérrez": "布赖恩·古铁雷斯",
  "Edson Alvarez": "埃德森·阿尔瓦雷斯",
  "Edson Álvarez": "埃德森·阿尔瓦雷斯",
  "Guillermo Martinez": "吉列尔莫·马丁内斯",
  "Guillermo Martínez": "吉列尔莫·马丁内斯",
  "Jordan Pickford": "乔丹·皮克福德",
  "Marc Guehi": "马克·格伊",
  "Marc Guéhi": "马克·格伊",
  "Ezri Konsa": "埃兹里·孔萨",
  "Nico O'Reilly": "尼科·奥赖利",
  "Nico O’Reilly": "尼科·奥赖利",
  "Jarell Quansah": "贾雷尔·昆萨",
  "Jude Bellingham": "裘德·贝林厄姆",
  "Elliot Anderson": "埃利奥特·安德森",
  "Declan Rice": "德克兰·赖斯",
  "Harry Kane": "哈里·凯恩",
  "Anthony Gordon": "安东尼·戈登",
  "Bukayo Saka": "布卡约·萨卡",
  "John Stones": "约翰·斯通斯",
  "Dan Burn": "丹·伯恩",
  "Djed Spence": "杰德·斯彭斯",
  "Morgan Rogers": "摩根·罗杰斯"
};

const positionNameMap: Record<string, string> = {
  Goalkeeper: "门将",
  Defender: "后卫",
  "Left Back": "左后卫",
  "Right Back": "右后卫",
  "Center Back": "中后卫",
  "Centre Back": "中后卫",
  "Center Defender": "中后卫",
  "Centre Defender": "中后卫",
  "Center Left Defender": "左中卫",
  "Center Right Defender": "右中卫",
  "Defensive Midfielder": "防守型中场",
  Midfielder: "中场",
  "Left Midfielder": "左中场",
  "Right Midfielder": "右中场",
  "Center Midfielder": "中场",
  "Center Left Midfielder": "左中场",
  "Center Right Midfielder": "右中场",
  "Attacking Midfielder": "前腰",
  "Attacking Midfielder Left": "左前腰",
  "Attacking Midfielder Right": "右前腰",
  "Center Left Forward": "左中锋",
  "Center Right Forward": "右中锋",
  "Left Forward": "左前锋",
  "Right Forward": "右前锋",
  Forward: "前锋",
  Striker: "中锋",
  Substitute: "替补",
  GK: "门将",
  D: "后卫",
  M: "中场",
  F: "前锋"
};

const normalizedPlayerNameMap = createNormalizedNameMap(playerNameMap);
const normalizedPositionNameMap = createNormalizedNameMap(positionNameMap);

export function localizeTeamName(value: string | undefined, fallback = "-"): string {
  if (!value) return safeFallback(fallback, "-");
  const localized = teamNameMap[normalizeKey(value)];
  if (localized) return localized;
  return hasLatin(value) ? safeFallback(fallback, "待补中文队名") : value;
}

export function localizePlayerName(value: string | undefined, fallback = "未知球员"): string {
  if (!value) return safeFallback(fallback, "未知球员");
  const localized = playerNameMap[value] ?? playerNameMap[stripDiacritics(value)] ?? normalizedPlayerNameMap[normalizeKey(value)];
  if (localized) return localized === "C罗" ? "克里斯蒂亚诺·罗纳尔多" : localized;
  if (fallback === "") return "";
  if (hasLatin(value)) {
    const sourceName = value.trim();
    const fallbackName = fallback.trim();
    if (fallbackName && stripDiacritics(fallbackName) === stripDiacritics(sourceName)) return fallbackName;
    return safeFallback(fallback, "待补中文球员");
  }
  return value;
}

export function localizePositionName(value: string | undefined, fallback = "位置未返回"): string {
  if (!value) return safeFallback(fallback, "-");
  const localized = positionNameMap[value] ?? positionNameMap[stripDiacritics(value)] ?? normalizedPositionNameMap[normalizeKey(value)];
  if (localized) return localized;
  return hasLatin(value) ? safeFallback(fallback, "位置未返回") : value;
}

export function localizeFootballText(value: string | undefined, fallback = ""): string {
  if (!value) return fallback;

  let result = value;
  for (const [source, localized] of replacementPairs(playerNameMap)) {
    result = replaceAllNames(result, source, localized);
  }
  for (const [source, localized] of replacementPairs(teamNameMap)) {
    result = replaceAllNames(result, source, localized);
  }

  const translated = result
    .replace(/\bLineups are announced and players are warming up\.?/gi, "首发名单已公布，球员正在热身")
    .replace(/\bKickoff\.?/gi, "比赛开始")
    .replace(/\bHalftime\.?/gi, "半场结束")
    .replace(/\bFirst Half begins\.?/gi, "上半场开始")
    .replace(/\bSecond Half begins\.?/gi, "下半场开始")
    .replace(/\bFirst Half ends\.?/gi, "上半场结束")
    .replace(/\bSecond Half ends\.?/gi, "下半场结束")
    .replace(/\bFirst Half Extra Time begins\b/gi, "加时赛上半场开始")
    .replace(/\bSecond Half Extra Time begins\b/gi, "加时赛下半场开始")
    .replace(/\bFirst Half Extra Time ends\.?/gi, "加时赛上半场结束")
    .replace(/\bSecond Half Extra Time ends\.?/gi, "加时赛下半场结束")
    .replace(/\bMatch ends\.?/gi, "比赛结束")
    .replace(/\bFourth official has announced (\d+) minutes? of added time\.?/gi, "第四官员宣布补时$1分钟")
    .replace(/\bOwn Goal by\b/gi, "乌龙球，")
    .replace(/\bOwn Goal\b/gi, "乌龙球")
    .replace(/\bVAR Decision:?\s*/gi, "视频助理裁判判定：")
    .replace(/\bNo Goal\b/gi, "进球无效")
    .replace(/\bGoal awarded\b/gi, "进球有效")
    .replace(/\bDelay in match for a drinks break\.?/gi, "比赛暂停，补水时间")
    .replace(/\bDelay in match because of an injury\b/gi, "比赛因伤暂停")
    .replace(/\bDelay over\. They are ready to continue\.?/gi, "暂停结束，双方准备继续比赛")
    .replace(/\bbecause of an injury\b/gi, "因伤")
    .replace(/\bis caught offside\.?/gi, "越位")
    .replace(/\bis caught 越位\.?/gi, "越位")
    .replace(/\bwins a free kick in the defensive half\.?/gi, "在防守半场赢得任意球")
    .replace(/\bwins a free kick in the attacking half\.?/gi, "在进攻半场赢得任意球")
    .replace(/\bwins a free kick on the left wing\.?/gi, "在左路赢得任意球")
    .replace(/\bwins a free kick on the right wing\.?/gi, "在右路赢得任意球")
    .replace(/\bAttempt saved\.?/gi, "射门被扑出")
    .replace(/\bAttempt blocked\.?/gi, "射门被封堵")
    .replace(/\bAttempt missed\.?/gi, "射门偏出")
    .replace(/\bis shown the yellow card for a bad foul\.?/gi, "因严重犯规被出示黄牌")
    .replace(/\bis shown the yellow card\.?/gi, "被出示黄牌")
    .replace(/\bis shown the red card\.?/gi, "被出示红牌")
    .replace(/\bfor a bad foul\.?/gi, "因严重犯规")
    .replace(/\bwith an?\s+/gi, "")
    .replace(/\bleft footed shot\b/gi, "左脚射门")
    .replace(/\bright footed shot\b/gi, "右脚射门")
    .replace(/\bheader\b/gi, "头球")
    .replace(/\bfrom outside the box\b/gi, "禁区外")
    .replace(/\bfrom more than 35 yards\b/gi, "35码外")
    .replace(/\bfrom a direct free kick\b/gi, "直接任意球")
    .replace(/\bfrom the centre of the box\b/gi, "禁区中央")
    .replace(/\bfrom the center of the box\b/gi, "禁区中央")
    .replace(/\bfrom the left side of the six yard box\b/gi, "小禁区左侧")
    .replace(/\bfrom the right side of the six yard box\b/gi, "小禁区右侧")
    .replace(/\bfrom very close range\b/gi, "近距离")
    .replace(/\bfrom the right side of the box\b/gi, "禁区右侧")
    .replace(/\bfrom the left side of the box\b/gi, "禁区左侧")
    .replace(/\bfrom a difficult angle on the right\b/gi, "右侧小角度")
    .replace(/\bfrom a difficult angle on the left\b/gi, "左侧小角度")
    .replace(/\bto the top right corner\b/gi, "打入右上角")
    .replace(/\bto the top left corner\b/gi, "打入左上角")
    .replace(/\bto the bottom right corner\b/gi, "打入右下角")
    .replace(/\bto the bottom left corner\b/gi, "打入左下角")
    .replace(/\bto the left side of the goal\b/gi, "打向球门左侧")
    .replace(/\bto the right side of the goal\b/gi, "打向球门右侧")
    .replace(/\bto the centre of the goal\b/gi, "打向球门中路")
    .replace(/\bto the center of the goal\b/gi, "打向球门中路")
    .replace(/\bis saved in the bottom left corner by\b/gi, "被扑向左下角，扑救者：")
    .replace(/\bis saved in the bottom right corner by\b/gi, "被扑向右下角，扑救者：")
    .replace(/\bis saved in the centre of the goal by\b/gi, "被扑到球门中路，扑救者：")
    .replace(/\bis saved in the center of the goal by\b/gi, "被扑到球门中路，扑救者：")
    .replace(/\bis saved in the top centre of the goal by\b/gi, "被扑到球门上方中路，扑救者：")
    .replace(/\bis saved in the top center of the goal by\b/gi, "被扑到球门上方中路，扑救者：")
    .replace(/\bmisses to the left\b/gi, "偏出左侧")
    .replace(/\bmisses to the right\b/gi, "偏出右侧")
    .replace(/\bis close, but 偏出右侧/gi, "接近命中但偏右")
    .replace(/\bis close, but 偏出左侧/gi, "接近命中但偏左")
    .replace(/\bis high and wide to the right\b/gi, "高出并偏右")
    .replace(/\bis high and wide to the left\b/gi, "高出并偏左")
    .replace(/\bis too high\b/gi, "打高")
    .replace(/\bis close, but misses to the right\b/gi, "接近命中但偏右")
    .replace(/\bis close, but misses to the left\b/gi, "接近命中但偏左")
    .replace(/\bhits the bar\b/gi, "击中横梁")
    .replace(/\bhits the left post\b/gi, "击中左门柱")
    .replace(/\bhits the right post\b/gi, "击中右门柱")
    .replace(/\bis blocked\b/gi, "被封堵")
    .replace(/\bAssisted by\b/gi, "助攻：")
    .replace(/\bassist\b/gi, "助攻")
    .replace(/\breplaces\b/gi, "换下")
    .replace(/\bConceded by\b/gi, "造成者：")
    .replace(/\bwith a cross following a set piece situation\b/gi, "通过定位球后的传中")
    .replace(/\bwith a cross following a corner\b/gi, "通过角球后的传中")
    .replace(/\bwith a cross\b/gi, "通过传中")
    .replace(/\bwith a through ball\b/gi, "通过直塞")
    .replace(/\bfollowing a set piece situation\b/gi, "来自定位球进攻")
    .replace(/\bfollowing a corner\b/gi, "来自角球进攻")
    .replace(/\bFoul by\b/gi, "犯规，")
    .replace(/\bOffside\b/gi, "越位")
    .replace(/\bCorner,/gi, "角球,")
    .replace(/\bcorner\b/gi, "角球")
    .replace(/\bfree kick\b/gi, "任意球")
    .replace(/\bSubstitution\b/gi, "换人")
    .replace(/\bGoal by\b/gi, "进球：")
    .replace(/\bGoal!/gi, "进球！")
    .replace(/\bgoal\b/gi, "球门")
    .replace(/\bYellow Card\b/gi, "黄牌")
    .replace(/\bRed Card\b/gi, "红牌")
    .replace(/\bPenalty\b/gi, "点球");

  return removeRemainingLatin(translated);
}

function normalizeKey(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function hasLatin(value: string): boolean {
  return /[A-Za-zÀ-ž]/u.test(value);
}

function safeFallback(value: string, fallback: string): string {
  return value && !hasLatin(value) ? value : fallback;
}

function removeRemainingLatin(value: string): string {
  return value
    .replace(/\bAPI-Football\b/gi, "接口足球数据源")
    .replace(/\bSportMonks\b/gi, "体育数据源")
    .replace(/\bStatsPerform\b/gi, "专业赛事数据源")
    .replace(/\bLiveScore\b/gi, "实时比分数据源")
    .replace(/\bESPN\b/gi, "公开赛事数据源")
    .replace(/\bGuardian\b/gi, "卫报")
    .replace(/\bOpta\b/gi, "专业赛事数据源")
    .replace(/\bFIFA\b/gi, "国际足联")
    .replace(/\bVAR\b/gi, "视频助理裁判")
    .replace(/\bxG\b/gi, "预期进球")
    .replace(/\bAI\b/gi, "智能")
    .replace(/\bAPI\b/gi, "接口")
    .replace(/\bWebSocket\b/gi, "实时连接")
    .replace(/\bREST\b/gi, "轮询接口")
    .replace(/[A-Za-zÀ-ž][A-Za-zÀ-ž0-9'’._/-]*/gu, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,，。.!?])/g, "$1")
    .replace(/([,，、:：/\\-]\s*){2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function createNormalizedNameMap(values: Record<string, string>): Record<string, string> {
  return Object.entries(values).reduce<Record<string, string>>((acc, [source, localized]) => {
    acc[normalizeKey(source)] = localized;
    return acc;
  }, {});
}

function replacementPairs(values: Record<string, string>): Array<[string, string]> {
  const pairs = new Map<string, string>();
  for (const [source, localized] of Object.entries(values)) {
    pairs.set(source, localized);
    const stripped = stripDiacritics(source);
    if (stripped !== source) {
      pairs.set(stripped, localized);
    }
  }

  return Array.from(pairs.entries()).sort(([left], [right]) => right.length - left.length);
}

function replaceAllNames(value: string, source: string, localized: string): string {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), localized);
}

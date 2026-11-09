// ================================================================
//  Hamachi 賭場的文字、餐車、成就、財產的清單（決定 0040）
//  荷官是 Yuga Bot，台詞是翊文以前寫的 Discord 21 點（重寫過，沒有搬程式）。畫面上的字用「壹」。
//  這裡的字都是草稿，Yuga 可以改。品牌名字一律換掉了（不放酒、炸雞、手機品牌）。
//  舊玩家的名字、金額、成就、財產不在這裡：放資料庫的 casinoLegacy，由本人認領。
//  數字（賠率以外）在 config.js 的 NUM.casino；大禮包的機率和餐點的價錢是舊的，留在這裡。
// ================================================================

export const CAS_TEXT = {
  title: "Hamachi 賭場",
  dealer: "Yuga Bot",
  series: "佩佩 Museum Series・Casino Hamachi System",
  intro: "館裡的小賭場。荷官是 Yuga Bot。這裡用的是籌碼，只在這裡用，跟靈感分開；籌碼不是錢，也買不到錢。",
  chipsNote: "籌碼只能換壹點點小東西，每週有上限。",
  // 荷官沒事的時候亂說的（舊的隨機回覆）
  idle: ["沒有", "R", "才不是", "就說不要了", "可是我肚子還是有點痛"],
  // 開桌
  hello: ["R 21點遊戲開始", "R 來啦", "R 你錢包的錢還夠嗎"],
  // 發牌（舊的：底牌、明牌）
  dealHole: "R 我收到壹張底牌",
  dealUp: "R 我收到壹張明牌，牌是 {card}",
  askHit: "R 你要加牌嗎",
  standLine: "不要就算了",
  dealerReveal: "我的底牌是 {card}，總共點數是 {n}",
  dealerHit: "我要加牌",
  dealerGot: "R 我拿到壹張明牌，牌是 {card}，總共點數是 {n}",
  // 結果
  bust: "你爆了ㄏㄏ",
  dealerBust: ["RRRRR我爆了", "你贏了RRRRR"],
  win: "你贏了",
  lose: "我贏了RRRRR",
  push: "R 平手了",
  push21: "但是21點平手莊家贏",
  charlie: ["你達到五張牌了", "你直接贏了"],
  blackjack: "黑傑克！前兩張就是21點",
  // 下注的挑剔（舊的）
  betNaN: "你再下壹次{text}給我試試看",
  betWeird: "你再下壹次奇怪的數字給我試試看",
  betPoor: "你才沒那麼有錢，你錢包只有 {chips}",
  betSmall: "最少要下 {min}",
  betBig: "最多只能下 {max}",
  // 莊家
  houseNow: "莊家現在有：{n}",
  houseBroke: "（破產中）",
  houseGot: "莊家得：{n}",
  houseLost: "莊家輸了：{n}",
  houseReopen: "莊家破產了，Yuga 借他 {n} 重新開張",
  // 救濟（新的）
  reliefHello: "R 你沒錢了喔",
  reliefGive: "Yuga 借你，補到 {n}。今天還能借 {left} 次",
  reliefNone: "今天借完了，明天 05:00 再來。大禮包每天還有 {n} 包",
  reliefNot: "你還有籌碼，不用借",
  // 餐車
  dinerHello: "您好，餐車收銀是 {name}",
  dinerHint: "吃東西有機會抽中大禮包券，先開過今天的大禮包才抽得到",
  dinerBroke: "你沒有錢，只有 {chips}，滾",
  foodFull: "今天吃飽了：還是吃得下，只是心情、理智不會再加了",
  dinerThanks: "謝謝",
  dinerNeedPack: "您還沒領今天的大禮包，請先領才能買這個",
  snackA: "其實你想要買的是旁邊的烤雞肉串對吧",
  snackB: "壓力就像壹個彈力球，要是過度壓抑的話就會反彈的喔",
  snackC: "你說：摁摁沒錯",
  sushiLine: "我們只有提供 Hamachi 壽司",
  seaHero: ["海超人說：", "再買更多包"],
  dinerOdds: "這份餐點有 {p}% 機率抽到大禮包券",
  dinerWon: "恭喜你抽到機率 {p}% 的禮包券 {n} 張",
  // 大禮包
  packHello: "恭喜你可以領今天的大禮包",
  packNone: "沒有可以開的大禮包",
  packLeft: "剩下 {n} 個大禮包",
  packWon: "恭喜你抽到壹張大禮包券",
  // 認領舊資料
  legacyTitle: "有舊的錢包在等你",
  legacyBody: "翊文以前寫的 Discord 21 點，你有壹份舊的籌碼、成就和財產。認領之後歸你，只能領壹次。",
  legacyDone: "認領好了：籌碼 +{chips}，成就 {ach} 個，財產 {props} 件",
};

// ---------- 大禮包（舊的機率）：一到五星 ----------
// upTo：骰 1–1000，落在這個數字以內（含）就是這一星；base＋(0..extra)×step 是籌碼。籌碼由莊家出（舊的：禮包錢由莊家出）
export const CAS_PACKS = [
  { stars: 1, upTo: 500, base: 10000, extra: 0, step: 0, name: "壹星大禮包" },          // 50%
  { stars: 2, upTo: 800, base: 100000, extra: 1, step: 100000, name: "二星大禮包" },     // 30%
  { stars: 3, upTo: 945, base: 500000, extra: 4, step: 100000, name: "三星大禮包" },     // 14.5%
  { stars: 4, upTo: 990, base: 10000000, extra: 5, step: 1000000, name: "四星大禮包" },  // 4.5%
  { stars: 5, upTo: 1000, base: 100000000, extra: 0, step: 0, name: "五星億萬大禮包" },  // 1%
];

// ---------- 餐車（舊的價目，品牌換掉了） ----------
// odds：買了之後抽到「大禮包券 3 張」的機率（%）；ticket：買的是大禮包券（一定拿到，要先開過今天的大禮包）；prop：進財產的紀念品 id
export const CAS_MENU = [
  { n: 1, id: "chicken", name: "烤雞肉", price: 3000, odds: 5, mood: 2, icon: "chicken", line: "給你壹份烤雞肉" },
  { n: 2, id: "tea", name: "冰涼麥茶", price: 1750, odds: 2.5, mood: 1, san: 1, icon: "cup", line: "給你壹杯冰涼麥茶！" },
  { n: 3, id: "feast", name: "歡樂分享餐", price: 20000, odds: 10, mood: 3, icon: "box", line: "歡樂分享餐來了" },
  { n: 4, id: "juice", name: "堂主推薦葡萄汁", price: 100000, odds: 20, mood: 4, icon: "cup", line: "堂主說這杯最好" },
  { n: 5, id: "snack", name: "零食壹包", price: 50, odds: 5, icon: "box", line: "", redirect: "chicken" }, // 舊的：點零食會被換成烤雞肉串（價錢是烤雞肉的）
  { n: 6, id: "admiral", name: "海軍上將珍藏茶", price: 2000000, odds: 70, mood: 5, san: 2, icon: "cup", line: "海軍上將的珍藏，小心拿" },
  { n: 7, id: "sushi", name: "搶鮮壽司", price: 2000, odds: 5, mood: 2, icon: "fish", line: "", special: "sushi" },
  { n: 8, id: "ticket1", name: "大禮包 1 抽券", price: 1500000, odds: 100, ticket: 1, icon: "gift", line: "你買了大禮包 1 抽券" },
  { n: 9, id: "ticket11", name: "大禮包 11 抽券", price: 10000000, odds: 100, ticket: 11, icon: "gift", line: "你買了大禮包 11 抽券" },
];
// 餐點變成財產（紀念品）的名字和說明
export const CAS_PROPS = {
  chicken: { name: "烤雞肉", desc: "餐車的招牌。吃完還記得那個味道。" },
  tea: { name: "冰涼麥茶", desc: "壹杯冰冰涼涼的麥茶。" },
  feast: { name: "歡樂分享餐", desc: "壹個人吃不完的分享餐。" },
  juice: { name: "堂主推薦葡萄汁", desc: "堂主說最好喝的那壹杯。" },
  admiral: { name: "海軍上將珍藏茶", desc: "海軍上將珍藏的茶，很貴，很香。" },
  sushi: { name: "搶鮮壽司", desc: "賭場只有 Hamachi 壽司，這壹盤是搶來的。" },
  gold: { name: "金色籌碼", desc: "抽到五星億萬大禮包的人才有。" },
  table: { name: "牌桌的小旗", desc: "跟館友同桌打過牌的紀念。" },
};

// ---------- 成就（新的；之後在賭場還拿得到）：可以當稱號 ----------
// rule 是 casino_wallet.js 的 casAchCheck 看的條件；title 是當稱號時顯示的字
export const CAS_ACH = [
  { id: "first", name: "初次入座", desc: "打完第壹手牌。", rule: { hands: 1 } },
  { id: "win1", name: "第壹場勝利", desc: "贏第壹把。", rule: { wins: 1 } },
  { id: "bj", name: "天生壹對", desc: "前兩張牌就是 21 點。", rule: { blackjacks: 1 } },
  { id: "charlie", name: "五張過關", desc: "五張牌都沒爆。", rule: { charlies: 1 } },
  { id: "dbust", name: "莊家爆了", desc: "看著荷官自己爆牌。", rule: { dealerBusts: 1 } },
  { id: "bust10", name: "爆爆爆", desc: "累計爆牌 10 次。", rule: { busts: 10 } },
  { id: "hands50", name: "老主顧", desc: "累計打 50 手。", rule: { hands: 50 } },
  { id: "hands300", name: "牌桌常客", desc: "累計打 300 手。", rule: { hands: 300 } },
  { id: "streak5", name: "手氣正旺", desc: "連贏 5 把。", rule: { bestWin: 5 } },
  { id: "lose5", name: "不信邪", desc: "連輸 5 把還坐著。", rule: { bestLose: 5 } },
  { id: "allin", name: "孤注壹擲", desc: "全部的籌碼壓上去，而且贏了。", rule: { allinWins: 1 } },
  { id: "rich", name: "腰纏萬貫", desc: "籌碼超過 10,000,000。", rule: { chipsMax: 10000000 } },
  { id: "star5", name: "五星億萬", desc: "抽到五星億萬大禮包。", rule: { star5: 1 } },
  { id: "relief", name: "Yuga 的朋友", desc: "第壹次向 Yuga 借籌碼。", rule: { reliefs: 1 } },
  { id: "houseBroke", name: "把莊家打到破產", desc: "你贏的那壹把，讓莊家掉到 0 以下。", rule: { houseBroke: 1 } },
  { id: "diner", name: "吃遍餐車", desc: "餐車的餐點每種都買過。", rule: { meals: 6 } },
  { id: "table", name: "同桌壹夜", desc: "跟館友同桌打完壹局。", rule: { tables: 1 } },
];

// 走地下探險時撿到籌碼的那一句（決定 0047）。伺服器給第幾句，輪流用。接主線「帳總是差壹點」的感覺，不揭曉謎底；不寫賭博、不寫錢
export const CAS_FIND_TEXT = {
  lines: [
    "地上有幾枚籌碼，像是哪筆帳漏記了。你先收著。",
    "牆縫裡卡著壹小把籌碼，旁邊的記號少畫了壹筆。",
    "抽屜沒關好，掉出幾枚籌碼。帳上總是差壹點，這大概是其中壹點。",
    "腳邊滾來幾枚籌碼，像是有人數到壹半就走開了。",
    "箱子底下壓著幾枚籌碼，差壹點就被當成灰塵。",
    "幾枚籌碼排在牆角，排得很整齊。有人想把它們記下來。",
  ],
};

// ---------- 拚經濟（舊 Discord 21 點的梗，決定 0048、0052）----------
// 界線（決定 0048）：不寫真人的名字、綽號、頭銜、政黨。失敗和撈油水的句子不接任何政策名字，不能變成在指控誰貪污。
// 政策口號沒有人名；只在「成功」的那一句出現。戶頭裡的「油水」只在失敗那邊，跟政策名字不會在同一句。
export const CAS_ECON = {
  title: "拚經濟",
  slogan: "拚 經濟，做 就對了",
  intro: "Yuga Bot 的口頭禪。按下去，賭場裡全館共用的莊家就跟著拚壹次：成功了莊家賺大錢，失敗了莊家的預算就石沉大海。",
  policies: [
    "兩岸服務業、貨品貿易協定", "兩岸觀光客自由行", "自由經濟示範區", "新鄭和計畫", "三業四化",
    "合宜住宅加速興建活化公有土地", "加速擴大民間參與公共建設及都市更新", "全台設置LED路燈",
  ],
  // 為什麼要拚（舊的回覆）、怎麼拚（舊的回覆）
  why: "鑒於面臨歐債危機、工業國家經濟成長不如預期、新興市場成長減速、區域經濟整合興起影響出口等國際經濟情勢變化。",
  how: ["穩金融", "平物價", "增就業", "促投資", "助產業", "旺消費", "拼出口"],
  rule: "成功的機率約 7 成，莊家賺 93 萬到 300 萬，還有壹點點機會多壹張大禮包券（要先開過今天的大禮包）。失敗的話莊家的預算沉下去，有時候有人撈到壹點油水。",
  // 按下去的演出（壹行壹行跳）；{policy}、{n}、{x} 由規則填
  cheer: ["拚 經濟，做 就對了！", "Yuga Bot：我們來拚經濟！"],
  okLine: "「{policy}」執行成功！",
  okHouse: "莊家入帳：+{n}",
  okTicket: "還多了壹張大禮包券！",
  okRescue: "把莊家拚回來了！莊家的帳回到正的了！",
  okRescueSub: "（全館壹起拚的，謝謝大家）",
  failBudget: "追加預算中……",
  failSink: "共有 {n} 石沉大海",
  failNone: "這次連石頭都沒沉，只是白忙壹場",
  failLoot: "壹部分的油水，剛好流進你的口袋：+{n}",
  failEnd: "反正這非常複雜就是了",
  left: "今天還能拚 {n} 次",
  none: "今天拚夠了，明天 05:00 再來",
  // 荷官的閒聊：Yuga Bot 的身世壹點壹點露出來。不畫圖、沒有真人名字
  chat: [
    "R 我是開賭場的 AI。Casino Hamachi，就是這裡。",
    "我以前帳上有超過 120 億。真的，不騙你。",
    "後來出了壹場禮包大災難。現在你們比莊家還有錢，我沒有在抱怨。",
    "別擔心，我知道怎麼翻身：拚經濟，做就對了。",
    "莊家的帳有點複雜，反正這非常複雜就是了。",
    "R 要不要壹起拚經濟？按壹下就好。",
    "穩金融、平物價、增就業、促投資、助產業、旺消費、拼出口。我背得出來，做得出來是另外壹回事。",
  ],
};

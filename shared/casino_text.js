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
  houseReopenLoan: "莊家破產了，Yuga 跟館方和外面世界借了 {n}，莊家重新開張。借的錢要還。",
  houseStillBroke: "莊家破產了，外面世界的信用額度用完了，借不到錢，先停業整頓。",
  betBigRisk: "莊家現在手頭緊，最多只能下 {max}",
  payCapDone: "莊家今天賠付的額度用完了，明天再來。輸給莊家的照收，贏的錢不會收回。",
  payCapBet: "莊家今天剩下的賠付額度只夠下 {max}",
  // 救濟（新的）
  // 跟 Yuga 借錢（決定 0064）
  loanHello: "R 要借錢喔",
  loanGive: "Yuga Bot 借你 {n}。{due} 前要還 {owe}（利息 {pct}%）",
  loanBack: "還了 {owe}，Yuga Bot 收到了。下次可以借到 {limit}",
  // 欠款送參觀者去地下工作（決定 0064 第二部分）
  workTitle: "Yuga Bot 來收錢了",
  workBody: "你欠 Yuga Bot {debt} 籌碼。要送壹位參觀者去地下室工作：每天換日還 {pay}（開工那天欠款的 {pct}%），還清了就回來。工作的時候理智每天 −{san}，最低停在 {min}。",
  workPick: "送這位下去",
  workNeedNew: "{name}是現在唯壹能上場的參觀者。送他下去之前，要先請壹位新的參觀者進來。",
  workSent: "{name}去地下室工作了。每天會還 {pay}，大約 {days} 天回來。",
  workBack: "{name}從地下室回來了（理智 {san}）。欠款還清了。",
  workLine: "{name}在地下室工作中：理智 {san}／{san0}，還欠 {debt}，大約還要 {days} 天",
  workCheer: "花靈感幫他",
  workCheerTitle: "花靈感幫{name}",
  workCheerBody: "{n} 靈感換 1 點理智，最多補回到他下去之前的 {san0}。博物館現在有 {insp} 靈感。",
  workCheered: "{name}的理智 +{n}（現在 {san}）。",
  workNone: "現在沒有參觀者在地下工作",
  workNoDebt: "你沒有欠款，不用送人下去",
  workAlready: "已經有壹位在地下工作了",
  workWho: "找不到這位參觀者",
  workCant: "這位不能送下去（還沒選職業，或是燈已經熄了）",
  workFull: "理智已經補滿了",
  workInsp: "靈感不夠（要 {n}）",
  workSlot: "在地下室工作",
  // 別的館友在地下遇到他（決定 0064 第三部分）
  meetSee: "角落有壹位參觀者在搬箱子：{name}（{owner}的參觀者）。他在替館主還 Yuga Bot 的錢，理智 {san}。",
  meetHello: "打招呼（他理智 +{n}）",
  meetGive: "塞 {n} 籌碼幫他還",
  meetNote: "留壹句話",
  meetHelloOk: "{name}抬頭跟你點了點頭。理智 +{n}。",
  meetGiveOk: "你塞了 {n} 籌碼給{name}。他小聲說了謝謝。",
  meetNoteOk: "你留了壹句話給{name}。他回館的時候看得到。",
  meetDone: "今天已經做過了",
  meetGone: "他已經不在這裡了",
  meetSelf: "這是你自己的參觀者",
  meetPoor: "籌碼不夠（要 {n}）",
  meetNotes: ["加油，快還完了", "我幫你看著樓梯", "上來請你喝麥茶", "別看那個角落", "箱子我幫你抬壹邊"],
  meetGot: "館友留給{name}的話：{list}",
  bankName: "Yuga Bot 銀行",
  bankBranch: "Hamachi 分行",
  loanFull: "額度用完了：先還壹筆，還清了額度還會變高",
  loanMany: "沒還的已經 {n} 筆了，先還壹筆",
  loanMin: "壹次最少借 {n}",
  loanBad: "要借多少？輸入數字",
  loanPlaying: "先打完這壹手",
  loanHouseNone: "莊家手上沒有錢，借款先暫停。",
  loanHouseShort: "莊家手上的錢不夠借那麼多，最多 {max}",
  loanOutFull: "莊家借出去的錢已經夠多了，過幾天再來。",
  loanNone: "沒有這筆借款",
  loanPoor: "籌碼不夠還這筆（要 {owe}）",
  loanTooSoon: "借了 {n} 分鐘之後才能還（還要等 {left} 分鐘）",
  loanLate: "Yuga Bot 來收錢了：{day} 借的那筆到期沒還，從籌碼扣了 {owe}。額度降到 {limit}",
  loanDue: "{due} 前還 {owe}",
  loanDueToday: "今天要還 {owe}",
  reliefPoor: "可以借：上面的「Yuga Bot 銀行」",
  // 餐車
  dinerHello: "您好，餐車收銀是 {name}",
  dinerHint: "吃東西有機會抽中大禮包券，先開過今天的大禮包才抽得到",
  dinerBroke: "你沒有錢，只有 {chips}，滾",
  foodFull: "今天吃飽了：還是吃得下，只是心情、理智不會再加了",
  foodMood: "心情 +{n}（現在 {now}）",
  foodCut: "心情 +{n}（現在 {now}）。本來是 +{want}，今天的份快吃滿了",
  foodNoVisitor: "好吃，不過現在沒有挑戰模式的參觀者，心情不會變",
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
  packHouse: "莊家現在缺錢，今天的免費大禮包先發到這裡。莊家的錢回來就會恢復。",
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

// ---------- 餐車（舊的價目，品牌換掉了；機率和券的價錢 11-13 重算過，決定 0070） ----------
// odds：買了之後抽到「大禮包券 3 張」的機率（%，可以有小數）；ticket：買的是大禮包券（一定拿到，要先開過今天的大禮包）；prop：進財產的紀念品 id
// 期望值：壹包大禮包平均 1,714,000 籌碼（casPackEV），3 張 5,142,000。餐點抽到券的期望值是價錢的六～八成（小賭壹把，平均會輸壹點）；
// 舊的機率（烤雞 5%、上將茶 70%）每買壹次平均賺幾十萬到一百多萬，可以無限買。test/casino.test.cjs 會擋：餐點、券都不能是穩賺的
export const CAS_MENU = [
  { n: 1, id: "chicken", name: "烤雞肉", price: 3000, odds: 0.04, mood: 2, icon: "chicken", line: "給你壹份烤雞肉" },
  { n: 2, id: "tea", name: "冰涼麥茶", price: 1750, odds: 0.025, mood: 1, san: 1, icon: "cup", line: "給你壹杯冰涼麥茶！" },
  { n: 3, id: "feast", name: "歡樂分享餐", price: 20000, odds: 0.29, mood: 3, icon: "box", line: "歡樂分享餐來了" },
  { n: 4, id: "juice", name: "堂主推薦葡萄汁", price: 100000, odds: 1.5, mood: 4, icon: "cup", line: "堂主說這杯最好" },
  { n: 5, id: "snack", name: "零食壹包", price: 50, odds: 0.04, icon: "box", line: "", redirect: "chicken" }, // 舊的：點零食會被換成烤雞肉串（價錢、機率都是烤雞肉的）
  { n: 6, id: "admiral", name: "海軍上將珍藏茶", price: 2000000, odds: 30, mood: 5, san: 2, icon: "cup", line: "海軍上將的珍藏，小心拿" },
  { n: 7, id: "sushi", name: "搶鮮壽司", price: 2000, odds: 0.03, mood: 2, icon: "fish", line: "", special: "sushi" },
  { n: 8, id: "ticket1", name: "大禮包 1 抽券", price: 2000000, odds: 100, ticket: 1, icon: "gift", line: "你買了大禮包 1 抽券" },
  { n: 9, id: "ticket11", name: "大禮包 11 抽券", price: 20000000, odds: 100, ticket: 11, icon: "gift", line: "你買了大禮包 11 抽券" }, // 10 抽的價錢買 11 抽
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
  { id: "relief", name: "Yuga 的朋友", desc: "第壹次跟 Yuga Bot 借籌碼。", rule: { reliefs: 1 } },
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
// Yuga Bot 銀行的活存、定存（11-13，shared/casino_bank.js）。草稿，Yuga 可以改
export const CAS_BANK = {
  tabLoan: "借款",
  tabSave: "存款",
  save: "活存",
  saveSub: "隨時存、隨時領，每天換日給利息",
  term: "定存",
  termSub: "鎖住幾天，到期自動回到活存；提早解約只拿回本金",
  bad: "金額看不懂。",
  min: "最少 {n}。",
  poor: "籌碼不夠。",
  takePoor: "活存沒有這麼多。",
  termMany: "定存同時最多 {n} 筆。",
  termCap: "壹筆定存最多 {n}。",
  noTerm: "找不到這筆定存。",
  putOk: "存進活存 {n}。活存現在 {save}。",
  takeOk: "從活存領出 {n}。活存還有 {save}。",
  termOk: "定存 {n}，{days} 天，{due} 換日到期，利息 {int}。",
  breakOk: "解約了，本金 {n} 還你，利息沒有。",
  noteInt: "銀行通知：活存利息 {n} 入帳。",
  noteBack: "銀行通知：{days} 天的定存到期，本金 {amt} 加利息 {int} 放回活存。",
  noteBroke: "銀行通知：莊家現在沒錢，利息少給了。帳記著，下次不補。",
  rule: "存在銀行的籌碼不能下注。利息由莊家出，莊家破產時沒有利息。不用每天回來領，換日自動算。",
};
// 館債（11-13，shared/casino_bond.js）。草稿，Yuga 可以改；names 每週輪流用（之後可以接週劇情的 bond）
export const CAS_BOND = {
  title: "館債",
  sub: "借錢給莊家。每週壹期，下週壹換日還本金加利息；莊家越缺錢利率越高",
  names: ["B1 紙箱整理債", "畫廊燈泡債", "餐車擴建債", "地下排水債", "展台補漆債", "賭場地毯債", "帳本裝訂債", "館長室冷氣債"],
  bad: "金額看不懂。",
  young: "帳號開了 {n} 天以上才能買館債。",
  none: "莊家破產中，這週不發館債。",
  unit: "壹張 {n}，要買整張。",
  soldOut: "這期快賣完了，最多還能買 {n}。",
  perUser: "這期壹個人最多 {n}。",
  poor: "籌碼不夠。",
  buyOk: "買了「{name}」{n}，持有 {days} 天，{due} 換日到期，利息 {int}。",
  noteBack: "館債到期：本金 {amt} 加利息 {int} 還你了。",
  noteShort: "館債到期：本金 {amt} 加利息 {int}，莊家和館方的錢不夠，少給的 {short} 寫成債權憑證，莊家回穩後補給你。",
  noteIou: "債權憑證補付 {n}，還欠你 {left}。",
  rule: "不能提早贖回、不能轉讓。利息照持有天數算，越早買越多。莊家還不出來時館方先墊，再不夠就開債權憑證，之後補付。",
};
// 股票（11-14，shared/casino_stock.js）。草稿，Yuga 可以改
export const CAS_STOCK = {
  title: "股票",
  sub: "館外七支，每天 05:00 照外面世界的行情動壹次",
  bad: "看不懂要買賣什麼。",
  halt: "台灣時間 22:00 到隔天 05:00 停盤，明天開盤再說。",
  houseBroke: "莊家現在沒錢，暫停買進。",
  poor: "籌碼不夠（還要付手續費）。",
  exposed: "莊家手上的股票已經夠多了，今天不能再買。",
  none: "你沒有這支。",
  notEnough: "你只有 {n} 股。",
  sellDay: "壹天最多賣 2,000 萬，今天還能賣 {n}。",
  queue: "今天全館賣太多了，莊家付不過來，明天再賣。",
  buyOk: "買進「{name}」{n} 股，每股 {px}，花了 {cost}，手續費 {fee}。",
  sellOk: "賣出「{name}」{n} 股，每股 {px}，拿到 {net}，手續費 {fee}。",
  stale: "今天沒有新行情（外面的資料還沒到），股價先停著。",
  order: {
    halt: "停盤時段（台灣時間 22:00～05:00）不能下單、取消。",
    full: "掛單最多 {n} 張，先取消壹張。",
    fullStock: "同壹支股票最多掛 {n} 張。",
    px: "價格要比現價 {px} 更有利：限價買和停損要低於現價，限價賣要高於現價。",
    noShares: "可賣的股數不夠（有 {n} 股沒被別張單鎖住）。",
    cancelDay: "壹天最多取消 {n} 次。",
    noOrder: "找不到這張單。",
    buyOk: "掛好了：「{name}」限價買 {n} 股，{px} 以下才買，先鎖住 {lock}。",
    sellOk: "掛好了：「{name}」限價賣 {n} 股，{px} 以上才賣，鎖住這 {n} 股。",
    stopOk: "掛好了：「{name}」停損賣 {n} 股，跌到 {px} 以下就賣，鎖住這 {n} 股。",
    cancelOk: "取消了，鎖住的已退回。",
    kinds: { buy: "限價買", sell: "限價賣", stop: "停損賣" },
    fillBuy: "限價單成交：買進「{name}」{n} 股，每股 {px}，花了 {cost}，手續費 {fee}。",
    fillSell: "{kind}成交：賣出「{name}」{n} 股，每股 {px}，拿到 {net}，手續費 {fee}。",
    expire: "「{name}」{kind} {n} 股放了 3 天沒成交，取消了，鎖住的已退回。",
    capCancel: "「{name}」{kind} {n} 股成交時賣出額度不夠，取消了，鎖住的已退回。",
    rule: "掛單最多 10 張、同壹支最多 3 張，有效 3 天；成交價用觸發的那個價（跳空比你掛的更好或更差都照那個價）；手續費照舊，取消不收費。",
  },
  soon: "館內五家店的股票、槓桿、放空、當沖還在準備。",
  rule: "股價每天 05:00 動壹次，照外面世界前壹天的行情。買賣各收 0.5% 手續費，進館方的預算池。台灣時間 22:00～05:00 停盤。",
};
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
  okFrozen: "（預算凍結中，館方只撥了壹點）",
  okDead: "（館方的預算見底了，這次壹毛都撥不出來）",
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
// 實況和斗內（決定 0053）。界線：只顯示遊戲暱稱；不公開誰沒錢。草稿，Yuga 可以改
export const CAS_LIVE = {
  title: "實況",
  intro: "壹次只有壹位實況主。別人按「斗內」，系統隨機給實況主 2 萬到 26 萬籌碼，金額自己不能選，那是好笑的地方。錢從斗內的人自己的籌碼出，不經過莊家。",
  rule: "播壹小時自動下播，也可以自己按下播；關掉遊戲壹分鐘以上也算下播。壹人壹天斗內 {perDay} 次；實況主壹天最多收 {cap}。",
  noOne: "現在沒有人在實況。",
  now: "{name} 正在實況",
  until: "到 {t} 下播",
  you: "你正在實況",
  taken: "{name} 正在實況，等對方下播再接手",
  invisible: "隱身的時候不能開播：大家看不到你在線上。先到「館友證」關掉隱身",
  already: "你已經在實況了",
  notYou: "你不是現在的實況主",
  noWho: "沒辦法開播",
  self: "不能斗內給自己",
  poor: "你才沒那麼有錢",
  full: "今天收夠了",
  limit: "今天斗內夠了，明天 05:00 再來",
  start: "我要實況",
  stop: "下播",
  donate: "斗內",
  left: "今天還能斗內 {n} 次",
  gotToday: "今天收了 {n} / {cap}",
  sentToday: "今天斗內出去 {n}",
  thanks: "{from} 斗內了 {n}！實況主感謝 {from} 的斗內～",
  lastLabel: "最近壹則",
  lobbyGo: "去斗內",
};

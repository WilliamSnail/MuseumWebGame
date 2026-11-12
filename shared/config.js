// ================================================================
//  佩佩博物館 4（第 4 版，多人版）—— 設定清單（Yuga 可以直接改這一段）
//  ・選項可以增減，組合數、圖鑑格數會自動重算。
//  ・start: true ＝一開始就打開；req ＝解鎖前要先做到的事；
//    forbidden ＝禁忌選項（不算在基本組合裡，佩佩神話夠了才會自己打開）；
//    mutant ＝突變選項（只能靠融合室配種突變出來）；gift ＝委託人送的選項；
//    key ＝要在地下收藏庫拿到鑰匙才會打開（deco ＝裝飾類別，拿到鑰匙組合才會變多）；
//    limited ＝限定（"signin"：只有每週全簽到拿得到，決定 0030；"shop"：只有兌換所賣，決定 0032；"show"：主題展辦到金、"week"：每週特展到金，決定 0035）。限定的不算進基本組合、圖鑑、「全部解鎖」，另外算。
//  ・新加的選項如果畫法裡沒有對應，圖上會用預設的樣子，文字照樣出現。
//  ・下面的文字是 Claude 的草稿；標「第 1 代」的文字不要改。
// ================================================================

// ---------- 佩佩的選項（第 1 代：稀有度、心情、顏色；第 2 代：帽子、姿勢） ----------
// req 可以寫：{ seen: "展品 id" }、{ badge: "徽章 id" }、{ commissions: 張數 }、{ unlocked: "選項名" }
// 第 3 版新增的選項放在每一類最後面。
export const PEPE_PARTS = [
  { name: "稀有度", inName: true, rolled: true, options: [
    { name: "普通", start: true },
    { name: "稀有", start: true },
    { name: "超稀有" },
    { name: "傳說級稀有", req: { unlocked: "超稀有" } },
    { name: "不可名狀", forbidden: true, myth: 10 },
  ] },
  { name: "心情", inName: true, options: [
    { name: "開心", start: true },
    { name: "傷心", start: true },
    { name: "生氣" },
    { name: "俄國8+9", req: { seen: "strange" } }, // 第 1 代叫「俄國8」；翊文 2026-11-08 改名：俄國的 8+9（gopnik）
    { name: "微醺", mutant: true },
    { name: "虔誠", gift: "priest" },
  ] },
  { name: "顏色", inName: true, options: [
    { name: "紅", start: true },
    { name: "綠", start: true },
    { name: "黃" },
    { name: "黑", req: { badge: "fourMoods" } },
    { name: "虹彩", mutant: true },
    { name: "夜市金", gift: "youth" },
    // 調色盤的顏色（mix）：只能在融合室用兩種顏色調出來，調出來以後手作坊也能用（配方在 RECIPES，翊文 11-10）
    { name: "橘", mix: true },
    { name: "藍", mix: true },
    { name: "紫", mix: true },
    { name: "白", mix: true },
    { name: "粉", mix: true },
  ] },
  { name: "帽子", options: [
    { name: "沒有", start: true },
    { name: "棒球帽", start: true },
    { name: "巫師帽" },
    { name: "皇冠", req: { badge: "fourColors" } },
    { name: "觸手帽", forbidden: true, myth: 5 },
    { name: "毛帽", mutant: true },
    { name: "紳士帽", gift: "collector" },
    // 第 4 版（11-09，決定 0030）：只有每週全簽到拿得到的帽子（名字、樣子都是草稿，Yuga 可以改；畫法在 web/src/art.js 的 HATS）
    { name: "館員帽", limited: "signin" },
    { name: "燈籠帽", limited: "signin" },
    // 第 4 版（11-09，決定 0032）：兌換所賣的限定頭飾（名字、樣子都是草稿，Yuga 可以改；畫法在 web/src/art.js 的 HATS；哪一週賣哪幾件見 LIMITED_ITEMS 下面的說明）
    { name: "黃雨帽", limited: "shop" },
    { name: "廚師帽", limited: "shop" },
    { name: "毛耳罩", limited: "shop" },
    { name: "礦工帽", limited: "shop" },
    { name: "花環", limited: "shop" },
    { name: "蝴蝶結", limited: "shop" },
    { name: "鐵鍋帽", limited: "shop" },
    { name: "摺紙帽", limited: "shop" },
    // 主題展辦到金才拿得到（決定 0035，名字、樣子都是草稿）。首飾也放在「帽子」這一類：不多開一類，舊存檔的 key 才不用改；一次戴一樣
    { name: "傳說的金冠", limited: "show" },
    { name: "火氣頭帶", limited: "show" },
    { name: "淚滴耳環", limited: "show" },
    { name: "瓜子項鍊", limited: "show" },
    { name: "彩虹圍巾", limited: "show" },
    { name: "三層帽", limited: "show" },
    { name: "枕頭睡帽", limited: "show" },
    { name: "歡笑花環", limited: "show" },
    { name: "躺平眼罩", limited: "show" },
    { name: "縫過的領結", limited: "show" },
    // 每週特展到金才拿得到（決定 0035）：先做 3 件，其他 5 週的還沒做
    { name: "黑絨領結", limited: "week" },
    { name: "小枕頭髮夾", limited: "week" },
    { name: "金瓜子項鍊", limited: "week" },
  ] },
  { name: "姿勢", options: [
    { name: "站著", start: true },
    { name: "坐著", start: true },
    { name: "躺平" },
    { name: "比讚", req: { commissions: 2 } },
    { name: "斯拉夫蹲", req: { unlocked: "俄國8+9" } }, // 俄國8+9 的招牌姿勢：腳跟貼地、膝蓋打開
    { name: "倒立", mutant: true },
  ] },
  // 第 3 版：裝飾類別。一開始只有「沒有」，在地下收藏庫拿到鑰匙才全部打開（組合 ×4）
  { name: "背景", deco: true, options: [{ name: "沒有", start: true }, { name: "花紋壁紙", key: "bg" }, { name: "星空", key: "bg" }, { name: "雪夜", key: "bg" }] },
  { name: "手上拿的東西", deco: true, options: [{ name: "沒有", start: true }, { name: "瓜子", key: "hold" }, { name: "小抱枕", key: "hold" }, { name: "放大鏡", key: "hold" }] },
];

// 改過名字的選項：舊存檔（含第 2 代）裡的舊名字會自動換成新名字
export const RENAMED = { "俄國8": "俄國8+9" };

// ---------- 抱枕（第 1 代選單的「枕」）：另外多一類「印哪一隻」，從收藏裡挑 ----------
export const PILLOW_PARTS = [
  { name: "尺寸", inName: true, options: [{ name: "小抱枕" }, { name: "標準" }, { name: "等身大" }] },
  { name: "材質", inName: true, options: [{ name: "棉布" }, { name: "絨毛" }, { name: "桃皮絨" }, { name: "星光絨", limited: "signin" }] }, // 星光絨：簽到限定的材料，做一個用掉一份（決定 0030）
  { name: "填充", options: [{ name: "軟綿綿" }, { name: "剛剛好" }, { name: "硬梆梆" }] },
];

// ---------- 擲 d100 決定稀有度（系統 B） ----------
// 擲出的數字 ≤ max 就是那一級；01 是完美作品，NUM.fumbleFrom（98）到 100 是失敗作。
export const RARITY_TABLE = [
  { max: 2, name: "傳說級稀有" },
  { max: 12, name: "超稀有" },
  { max: 40, name: "稀有" },
  { max: 100, name: "普通" },
];

// ---------- 數值（之後跑模擬再調） ----------
export const NUM = {
  // 介面的版本（決定 0066，翊文 11-11：「把這個當大版本更新，之後有問題可以回滾」）。
  // newLobby：新的大廳（導覽圖底圖、右欄、圓形圖示）。有問題改成 false 就回到舊的大廳，舊的程式都還在
  // newCellar：地下室改版（決定 0067、0068）。true ＝合作地下每一層的房間探索完之後要打守門，打贏才算走完。
  //   11-12 翊文說直接打開，不用先自己測（決定 0069）。有問題改回 false 就回到舊的（房間走完直接算這一層走完），舊的程式都還在
  ui: { newLobby: true, newCellar: true },
  // 地下室改版（決定 0067，規劃 docs/地下室改版規劃.md）：打怪物的規則 shared/cellar_fight.js。數字都是草稿，模擬 node test/sim_fight.cjs
  //   baseTeam、perPlayer、pressureHp：怪物的壓力照隊伍放大＝基本 × 隻數 ÷ baseTeam ×（1 ＋ perPlayer ×（人數 − 1））＋ pressureHp × 全隊理智壓力的級數
  //   die：每個人「推」擲的骰子；weakMult：看穿之後「推」乘多少（館方助手不算）
  //   seeMod、calmMod：看穿（偵查、神秘學取高的）、安撫（說服）的技能加多少；calmHp：安撫成功順便減多少壓力
  //   guardDodge、softDodge：擋住、被安撫過的「撲」沒中的機率；理智類的招是減半（無條件進位）
  //   wizard、cheer：巫師帽這回合、比讚下壹回合，每個人的「推」加多少；tentacleMult、tentacleSan：觸手帽強度乘多少、帶牠的人扣多少理智
  //   rest：躺平、毛帽回多少理智（這壹層第壹次走才能用，界線「不要改回去」）；maxRounds：打到第幾回合怪物自己走掉
  //   pressureSan：全隊理智壓力到第幾級，理智類的招多扣 1；injure：打完之後，倒下的佩佩真的受傷的機率（翊文 11-12：「倒下的是真的受傷」，所以是 1）
  //   決定 0068（翊文 11-12 回答的）：
  //   rankHp、rankSan：怪物的等級 1～3（地圖上看得到大概多強），壓力乘多少、理智類的招多扣多少；rankInsp：打贏比較強的多給多少靈感
  //   flee、fleeBoss：逃跑成功的機率（百分比）；要有壹半以上的人選逃跑才會擲
  //   courage：壯膽，每多壹個真人隊友，每個人多這麼多「膽量」，先替理智擋（這壹趟用完就沒了，不會留在存檔）；coopInsp：每多壹個真人隊友，打贏多給多少靈感
  //   tap：有些回合可以按時機（「有時候 B」）：chance ＝下壹回合可以按的機率，找到弱點的下壹回合壹定可以；good、great ＝按得好、按得很準，「推」多加多少。只加不扣，不按也沒事
  fight: { baseTeam: 3, perPlayer: 0.35, pressureHp: 3, die: "1D6", weakMult: 1.5, seeMod: 20, calmMod: 25, calmHp: 2, guardDodge: 0.5, softDodge: 0.5, wizard: 2, cheer: 2, tentacleMult: 2, tentacleSan: "1D3", rest: "1D3", maxRounds: 12, pressureSan: 2, injure: 1, rankHp: [1, 1.35, 1.7], rankSan: [0, 0, 1], rankInsp: [0, 1, 2], flee: 60, fleeBoss: 40, courage: 5, coopInsp: 1, tap: { chance: 0.25, good: 1, great: 2 } },
  // 地下室的小地圖（shared/cellar_map.js）：rows 排；每排壹定有壹間探索房（翊文 11-12：「房間探索還是要保留喔，是個重點」），壹趟可以把這層的房間全部走完
  //   wide：某壹排有 3 個點的機率（不然 2 個）；最後壹排是休息＋別的；最底是守門
  //   rank2、rank3：遭遇的怪物是 2 級、3 級的機率 ＝ [第壹排的機率, 每往下壹排多多少]
  // restSan：休息回幾點理智（今天還有獎勵的趟才有）；chestInsp：寶箱開到好的，靈感幾點；chestSan：開到壞的扣多少理智；
  // chestOdds：[好的, 怪的] 的機率，剩下是壞的。數字是草稿（11-12）
  cellarMap: { rows: 5, wide: 0.5, rank2: [0.2, 0.12], rank3: [0, 0.06], restSan: 6, chestInsp: 2, chestSan: "1D3", chestOdds: [0.45, 0.3] },
  sanDayBack: { n: 5, cap: 75 }, // 每天（05:00 換日）第一次進館，理智自己恢復 n 點，最多恢復到 cap；原本就比 cap 高的不扣、理智 0（熄燈）的不恢復（翊文 11-11：「每天自己會恢復 San 值 5 點，恢復最高加到 75」）
  startSanity: 50,          // 理智從 50 開始，CoC 的平均值（翊文 11-08：理智要更容易歸零；原本 70）
  startInsp: 12,            // 一開始的靈感（夠做一隻；11-10 做一隻 2 → 3 → 6 → 12，跟著改）
  // 畫廊的靈感：越危險的畫越多、越簡單的畫越少（翊文 11-08）。原本是第壹次 +3、之後 +1（要理智檢定的 +2）、壹天 5 次。
  // 危險度看理智檢定「失敗最多扣幾點」：沒有檢定是 0、8 點以內是 1、12 點以內是 2、更多是 3。
  // first ＝第壹次看；review ＝之後再看；perDay ＝同壹件展品壹天最多再拿幾次
  galleryInsp: [
    { first: 2, review: 1, perDay: 3 },   // 0：不用理智檢定（普通的佩佩肖像、稀有佩佩圖畫）
    { first: 4, review: 2, perDay: 5 },   // 1：例如奇怪的繪畫（1/1D8）
    { first: 5, review: 3, perDay: 5 },   // 2：例如雕像（1/10）、蓋著白布的神像（1D3/1D10）
    { first: 7, review: 4, perDay: 5 },   // 3：例如俄國8+9 的房間（1D4/1D20）
  ],
  chapterInsp: 3,           // 第一次讀完一章 +3 靈感
  costPepe: 12,             // 做一隻佩佩（翊文 11-10：「上升一點點」2 → 3，「調高兩倍」3 → 6，「再 x 2」6 → 12）
  costPillow: 8,            // 做一個抱枕（翊文 11-10：1 → 2 → 4，「再 x 2」4 → 8）
  unlockCosts: [8, 10, 12, 14, 16, 18, 20, 20, 20, 20, 20], // 第幾個解鎖要多少靈感（越後面越貴）
  reward: { precise: 12, vague: 5, riddle: 10, pillow: 10 }, // 委託沒寫 reward 時用這個
  rewardPct: 75,            // 委託的靈感打幾折（翊文 11-10：「委託給的靈感再少一點，可以改給一些籌碼」，決定 0062）。每張都照這個算（四捨五入、最少 1）；籌碼那一半在 casino.job。先照這樣，等翊文
  fumbleFrom: 98,           // 擲出 98–100 是失敗作（翊文 11-08：原本只有 100，機會太小）；這次不能花心情救
  moodFloor: 2,             // 花心情最多把骰子壓到 02（01 要原本就擲出）
  habituate: 8,             // 同一件展品「同一天」看過 8 次以上變成 0/1（隔天又會怕；原本 5）
  hug: "1D2", hugHappy: "1D3", commissionSan: "1D3", fullRowSan: "1D6", // 回理智都變少（原本 1D3、1D4、1D6、2D6）
  pushSan: "1/1D6",         // 孤注一擲結果更差時的理智檢定
  understandBase: 50,       // 看懂檢定＝50＋佩佩神話
  visitorEvery: 150,        // 展廳：每玩 150 秒來一位參觀者
  visitorStep: 50,          // 參觀者給的靈感＝1＋展廳評分÷50（無條件捨去）
  miniPerDay: 5,            // 每個小遊戲一天最多拿幾次靈感
  ch2: 4, ch3: 8,           // 解鎖幾個選項後開第 2、3 章
  quirkManiaDays: 3,        // 狂熱幾天後自己消失（翊文 11-09：「狂熱縮成三天」。做別的多花靈感，留壹週太痛）
  quirkDays: 7,             // 怪癖沒治好的話，幾天後自己消失（真的時鐘，關掉遊戲、換成別的參觀者也在走；決定 0046，先照這樣。原本是 20 分鐘 quirkMinutes，決定 0027）
  quirkTaskDays: 2,         // 做事情治好：要在幾個不同的遊戲日做到治法那件事（不用連續，同一天做幾次都只算一天；決定 0046，先照這樣）
  quirkMax: 3,              // 同一位參觀者同時最多幾個怪癖：滿了就不再給新的（怪癖留一週，不擋的話會越疊越多；決定 0046，先照這樣）
  // 第 3 版
  fusionCost: 3,            // 融合一次要多少靈感
  fusionPerDay: 3,          // 一天可以融合幾次（升級「第二座融合爐」再 +3）
  fusionSan: "1/1D4",       // 融合要做的理智檢定（原本 0/1D4）
  inherit: 45,              // 每一類從爸爸、媽媽各遺傳的機率（%），剩下的是突變
  blood: 5,                 // 血統：爸媽每一隻照稀有度給（稀有 5、超稀有 10、傳說 15、不可名狀 20），可以像心情一樣壓低骰子
  fusionRarityCost: [0, 1, 2, 3, 4], // 融合加價：爸媽每一隻照稀有度多收幾靈感（普通、稀有、超稀有、傳說、不可名狀；失敗作不加）
  mixBlood: 5,              // 調色盤：這一對調得出新顏色時，多給幾點血統
  diceRerolls: 3,           // 升級「骰子打磨」後，一天可以重擲十位骰幾次
  visitorFame: 120,         // 升級「名聲」後，參觀者幾秒來一位
  skillMain: "1D10", skillMainBase: 55, skillBase: "1D10", skillOtherBase: 15, // 職業技能 56–65；其他技能 16–25
  persuadeBonus: 30,        // 說服成功：委託賞金多 30%
  injureDays: 2,            // 在地下收藏庫受傷的佩佩，幾天後自己好
  repairCost: 3, healCost: 2, // 修復台：修失敗作、治受傷的佩佩
  cellarRepeatInsp: 1,      // 已經過關的房間再過一次只給 1 靈感
  idleBook: 15,             // 讀過《佩佩起源考》後，在圖書館什麼都不做幾秒，續集會出現（11-08 翊文說等了沒反應：20 → 15，並且等的時候書會越來越亮）
  cellarRest: "1D3",        // 隊伍裡有躺平、毛帽：每一層第一次走時各回這麼多理智
  linesFrom: 4,             // 解鎖幾個選項之後，老主顧（委託人關係線）才開始出現
  lineReward: 8,            // 老主顧的委託給多少靈感
  // 第 4 版（11-09，決定 0030）：每日簽到、每週全簽到、節日。數字是草稿，跑 test/sim.cjs 看過（維護日誌 11-09_翊文_每日簽到.md）
  signin: {
    // 照「累計第幾次」七天一輪（斷掉不歸零）：第 1～7 次各給什麼。第 7 次多一點。一輪加起來靈感 17、心情 13（每天平均靈感 2 點多）
    // 第 1 次只給心情：第一天剛開館就多 3 靈感，模擬裡「玩 10 分鐘解鎖幾個」從 4 變 5（11-09 跑過），所以靈感從第 2 次才給
    cycle: [{ mood: 3 }, { insp: 2 }, { insp: 2, mood: 2 }, { insp: 3 }, { insp: 2, mood: 3 }, { insp: 3 }, { insp: 5, mood: 5 }],
    holiday: { insp: 5, mood: 3, mat: 1 }, // 節日那天簽到多一份（mat ＝星光絨幾份）；紀念日沒有
    weekKinds: ["part", "deco", "mat"],    // 每週全簽到的特別項目，照週的號碼輪流（大家同一週同一種）
    dupInsp: 10,                           // 這週的特別項目已經有了（帽子、裝飾）：換成靈感
    weekChips: 15000000,                   // 這週七天都簽到（含補簽），另外送賭場籌碼（翊文 11-11：「簽到一週加送1500萬」）。伺服器發，要登入
    makeupCost: 1,                         // 補簽：這週已經過去、沒簽到的壹天，花幾枚週章補（翊文 11-11：「可以補這週沒有簽到的，花一個週章」）
    noticeBefore: 2,                       // 節日公告在節日前幾天貼出來
  },
  // 第 4 版（11-09）：參觀館友的展廳、伺服器的信（規則 shared/visit.js；來訪的靈感、留言字數這些在 gifts.js 的 SOCIAL）
  guest: {
    postersMax: 13,         // 參觀時最多看幾張展覽海報（主題展 10 個、每週特展 3 個）
    logMax: 60,             // 訪客簿留幾筆（一天一位館友一筆；今天的不會被擠掉）
    shown: 12,              // 自己的展廳上列幾筆「館友來過」（新的一定都列）
    slotsMax: 12,           // 給別人看的展台最多幾座（別人的存檔不能相信）
    claimMax: 30,           // 一次最多領幾封伺服器的信
    mailListMax: 60,        // 信箱一次列幾封伺服器的信
    giftListMax: 60,        // 送佩佩的框一次列幾隻（按「再多列」看更多）
    callListMax: 10,        // 「請你去看展廳」的通知一次列幾則（今天、昨天沒看的）
  },
  // 第 4 版（11-09）：每週劇情（規則 shared/story.js，規劃 docs/每週劇情.md）。週包的獎勵加起來不能超過下面的預算（tools/week_check.cjs 檢查）
  story: {
    bookInsp: 2,            // 第一次讀完一本這週的書給幾靈感（只有那一週給；補讀以前的不給）
    understandInsp: 3,      // 線索集齊、「你看懂了」壹件給幾靈感（壹件只給壹次；不扣理智、不發作，shared/clues.js）
    showInsp: [1, 2],       // 今日特展第一次看一幅：不用理智檢定的／要理智檢定的
    showInspDay: 5,         // 今日特展一天最多拿幾靈感
    showSvgKB: 12,          // 今日特展自己畫的向量圖（works[].svg）一幅最多幾 KB
    showSanMax: 6,          // 今日特展的畫，理智檢定失敗最多扣幾點（成功一定不扣，所以「看完今日特展」不會一定掉理智）
    lateBonus: false,       // 補做的每日任務算不算進「3 個都做完多一份」和每週任務「每日任務全部做完 N 天」（決定 0060：不算，只給當天做完的人）
    stampPerTask: 1,        // 每週任務做完一個、領的時候拿幾枚週章
    stampAllBonus: 2,       // 5 個每週任務全做完，再多拿幾枚（週章不會過期，之後兌換所用）
    skillBook: "1D3",       // 技能書：用了技能加幾點
    skillCap: 80,           // 技能書最多加到幾
    dailyMinutes: 12,       // 3 個每日任務加起來最多幾分鐘（照 STORY_TASKS 每種的估計時間算）
    dayBudget: { insp: 22, mood: 10, items: 1, skills: 1 },      // 一天全部拿到的上限：3 個每日任務＋全做完的那份＋那天的書＋那天加的房間＋今日特展（skills：幾間房間給技能成長，決定 0032）
    weekTaskBudget: { insp: 60, mood: 20, items: 3, skills: 1 }, // 5 個每週任務＋全做完的那份＋本週異狀的房間
    startWeek: "2026-W46",  // 每週劇情從這一週開始有（更早的週沒有劇情，也不用備用週）
    seasonStart: "2026-11-16", // 第一季從這一週開始（2026-W47）；之前的算「序章」
    seasonWeeks: 4,         // 一季幾週（書架上一季收成一本合訂本）
    shelfRow: 8,            // 書架一排最多放幾本，超過就分頁
  },
  // 第 4 版（11-09，決定 0032）：兌換所、技能成長（規則 shared/shop.js）。數字是草稿，跑 test/sim.cjs、sim_san.cjs、sim_cellar.cjs 看過（維護日誌 11-09_翊文_兌換所和技能.md）
  // 技能的上限：技能書、提升技能、試煉房間、跟館友學都到 NUM.story.skillCap（80）；上課只到 lessonCap（60）；換日的經驗檢定照舊到 99
  shop: {
    gearWorn: 2,            // 現在這位參觀者最多穿幾件裝備
    gearPrice: { common: 4, fine: 8, rare: 14 }, // 裝備幾枚週章：普通、精良、稀有（每週全做完最多拿 7 枚）
    skillUp: "1D5",         // 提升技能：花週章，指定一個技能加這麼多
    skillUpPrice: [{ below: 40, stamps: 2 }, { below: 60, stamps: 3 }, { below: 81, stamps: 5 }], // 技能現在低於 below 時要幾枚：越高越貴
    lessonPerDay: 1,        // 委託櫃台上課：一天幾堂（P.day 的，換人不會多一堂）
    lessonSkill: "1D3",     // 上一堂課技能加這麼多
    lessonCap: 60,          // 上課最多上到幾
    lessonPrice: [{ below: 30, insp: 6 }, { below: 45, insp: 10 }, { below: 61, insp: 15 }], // 技能現在低於 below 時要幾靈感
    trialSkill: "1D5",      // 地下的試煉房間、週包房間獎勵的技能成長
    trialPerWeek: 1,        // 一間試煉房間一週可以拿幾次成長（週一 05:00 換週）
    weekSkillRooms: 2,      // 週包一週最多幾間房間的獎勵可以寫技能成長（tools/week_check.cjs 檢查）
    learnChance: 50,        // 一起融合：對方拿手的技能比你高，你那個技能 +1 的機率（%）
    learnPerDay: 2,         // 一天最多這樣學會幾次（P.day 的）
    learnGain: 1,           // 學會了加幾點
    limitedRotate: 3,       // 週包沒指定 shop 的週，限定頭飾照週號輪流上架幾件
    limitedMax: 4,          // 週包的 shop 最多指定幾件
    matToStamp: 3,          // 幾份材料（背包裡的舊畫布、金箔、金線，哪一種都算）換一枚週章
  },
  // 第 4 版（11-09，決定 0041）：限時活動（規則 shared/events.js，內容寫在 content/weeks/<週>/week.json 的 events）。數字都等翊文看
  events: {
    coopBoost: { mult: 1.5, extraTurns: 1 }, // 合作地下收藏庫：記號對上、猜對、搬回來的靈感 ×1.5；活動中那天多 1 趟有獎勵（P.coopDay 上限 +1，不疊加）
    casinoBoost: { extraPacks: 1 },          // 賭場：活動時間內，第一次進賭場多 1 包免費大禮包（每場活動每人一次；等翊文）
    trialBoost: { mult: 1.5 },               // 試煉房間：過關的技能成長 ×1.5（一間一週還是只拿一次）
    cellarChips: { min: 800000, max: 1200000, step: 10000, chance: 0.7 }, // 地下撿籌碼（翊文 11-12：「地下室拿到的籌碼多100萬左右」）：活動時間內撿到的那次，另外多 min～max（伺服器擲）。單人、多人走完房間都算；活動中撿到的機率改成 chance（翊文 11-12：「今天機率升高到70%」），壹天幾次照舊（NUM.casino.cellarFind）
    perWeek: 3,             // 一週最多排幾場（週一排程挑 1～2 場，其他給臨時加的）
    earliest: "05:00",      // 活動最早幾點開始（05:00 換日，不跨日）
    minMin: 30, maxMin: 360, // 一場最短、最長幾分鐘
    titleMax: 16, wordsMax: 60, // 名字、一段話的字數上限（tools/week_check.cjs 檢查）
    noticeMinLeft: 5,       // 開跑的通知：活動剩不到這麼多分鐘就不跳了（快結束才打開遊戲，大廳那條看得到就好；決定 0045）
  },
  // 第 4 版（11-09，決定 0035）：主題展辦完（規則 shared/themeshow.js）。分數實際到得了多少，寫在維護日誌 11-09_翊文_主題展.md
  show: {
    days: 3,                // 同一個主題連續掛幾天才算辦完（真的天，05:00 換日；掛上那天算第 1 天）
    tiers: [60, 80, 95],    // 銅、銀、金要幾分
    tiersBy: { failed: [40, 55, 75] }, // 失敗作一件只有 3 分，照 60／80／95 辦不到金：另外算
    bronzeMood: 10,         // 第一次到銅：心情 +幾（給現在這位）
    silverInsp: 15,         // 第一次到銀：靈感 +幾（給博物館）
    // 每週特展到金要幾分（只有這一級；同樣照「這週最高分」）。failedOnly、start32、noLegend 的分數本來就到不了 90
    weekGold: { start32: 45, allBlack: 90, allFlat: 90, failedOnly: 30, noHat: 90, noLegend: 70, pillowWeek: 90, gopnikWeek: 90 },
  },
  // 第 4 版（11-09，決定 0040）：Hamachi 賭場（規則 shared/casino*.js，伺服器 functions/casino*.js）。籌碼跟靈感分開，沒有真錢。
  // 標「等翊文」的是我先定的數字，翊文看過再改。賠率、禮包機率、餐點價錢是舊 Discord bot 的（packs、MENU 在 shared/casino_text.js）
  casino: {
    startChips: 1000000,    // 新玩家的籌碼。舊程式裡沒有預設（錢包檔是手動建的）；20 個舊錢包裡有 3 個剛好是 1,000,000（沒動過的起始值），所以沿用
    minBet: 100,            // 等翊文：最小的注
    maxBet: 10000000,       // 等翊文：最大的注（舊的沒有上限，只看錢包）
    houseStart: 100000000,  // 莊家一開始有多少（舊的錢包檔是手動建的，數字不抄；這個是新定的）
    houseReset: 10000000,   // 莊家破產中（小於 0）過了換日，Yuga 借他這麼多重新開張
    // 跟 Yuga 借錢（決定 0064，取代原本的免費救濟）：每筆固定利息、幾天內要還、額度準時還清就提高。規則在 shared/casino_wallet.js 的 casBorrow、casRepay、casLoanRoll
    loan: {
      limit: 1000000,       // 壹開始的額度（沒還的本金加起來不能超過）。翊文 11-10：「借款最高可以100萬」，問答選「壹開始就能借 100 萬」
      limitPct: 50,         // 準時還清壹筆，額度多 50%（翊文 11-10：「改成多20%」→「50% 好了」；以前是固定 +20 萬）。沒有上限，無條件進位到整數
      latePct: 10,          // 到期沒還被扣壹次，額度降這麼多 %（翊文 11-10：「額度退回 100 萬……這個不要，只要降10%就好」）。無條件捨去，可以降到 100 萬以下
      repayAfterMin: 15,    // 借了幾分鐘之後才能還（翊文 11-10：「每筆要一天之後才能還」→「改成至少 15分鐘後才能還」）。時間照伺服器的
      interestPct: 10,      // 利息：每筆固定 10%（借 10 萬還 11 萬，提早還也是）
      days: 3,              // 第 D 天借的，第 D+3 天結束前要還；第 D+4 天還沒還就從籌碼直接扣，扣到負的也扣
      min: 10000,           // 壹次最少借多少
      quick: [100000, 300000, 500000], // 畫面上的快速按鈕（另外有「借滿」）
      discord: 100000,      // Discord 的 /pepe-借錢 沒有參數，壹次借這麼多（額度不夠就借剩下的）
      maxOpen: 10,          // 同時最多幾筆沒還
    },
    // 欠款送參觀者去地下工作（決定 0064 第二部分）。規則在 shared/casino_wallet.js 的 casWork*，參觀者那邊在 shared/visitors.js
    work: {
      payPct: 34,           // 每天換日還「開工那天的欠款」的 34%（三天還完；翊文 11-10：「地下室工作每天可以欠下錢的34%」）
      sanDay: 5,            // 工作的參觀者每天理智 −5
      sanMin: 1,            // 工作中理智最低停在這裡，不會在地下發瘋
      inspPerSan: 1,        // 花幾靈感補 1 點理智（靈感是博物館的，三位共用）
      meetPct: 80,          // 別的館友走地下時，每壹層有這麼多機會遇到壹位在工作的參觀者（翊文 11-10：「有80%遇到他的機會」）
      helloSan: 2,          // 打招呼：他理智 +2（壹位館友對同壹位壹天壹次）
      giveChips: 10000,     // 塞籌碼幫他還：從自己的籌碼出這麼多（壹天壹次；等翊文）
    },
    dailyPacks: 2,          // 每天免費的大禮包幾包（舊的：每人 2 包；不累積，換日重算）
    maxPacksAtOnce: 11,     // 一次最多連開幾包（11 抽券）
    packWinOdds: 20,        // 贏一把有 20% 機率多一張大禮包券（舊的 rottery(20)；要先開過今天的大禮包）
    bonus: { gamblerPct: 0.2, luckPct: 0.2 }, // 賭徒、幸運技能的小加成：贏的那一把，賺的錢多 %（賭徒 +gamblerPct；幸運每 100 點 +luckPct）。小到莊家還是贏，模擬見日誌（等翊文）
    warp: [{ below: 12, p: 0.6 }, { below: 25, p: 0.4 }, { below: 40, p: 0.2 }], // 理智低於 below，每張牌有 p 的機率顯示成別張（只是看起來，結算用真的）
    // 籌碼換小獎：每週有上限（週一 05:00 換週）。reward：insp 靈感、bag 背包的材料（story.js 的 STORY_ITEMS）。數字全部等翊文
    exchange: [
      { id: "insp", chips: 200000, perWeek: 5, reward: { insp: 1 } },
      { id: "canvas", chips: 600000, perWeek: 2, reward: { bag: "mat:畫布" } },
      { id: "foil", chips: 1500000, perWeek: 1, reward: { bag: "mat:金箔" } },
    ],
    // 單人 21 點的連勝、連敗（翊文 11-09：「21點連續贏會恢復一點心情，連續輸會降一點san值」，決定 0049）。數字全部先照這樣，等翊文
    streak: { winN: 3, mood: 10, loseN: 3, san: 10, moodDay: 30, sanDay: 30 }, // 翊文 11-10：「連贏 3 把心情會好10點，連輸 3 把理智會掉10點」（原本 +2、−1，每天上限 6、3）。上限先放三次的份，等翊文 // 連贏 winN 把心情 +mood、連輸 loseN 把理智 -san；每天（05:00 換日）心情最多加 moodDay、理智最多扣 sanDay；平手不算；理智最低留到 1
    // 地下探險撿籌碼（決定 0047，翊文 11-09：「讓地下探險劇情也有機會可以拿到一點點籌碼」）。先照這樣，等翊文：
    // 走完壹個房間擲壹次，chance 的機率撿到 min～max（每 step 壹級）；壹天最多撿 perDay 次。對照：最小的注 100、壹杯麥茶 1,750、免費大禮包最小 10,000、換壹點靈感 200,000，壹天最多也只有 6,000
    cellarFind: { chance: 0.25, min: 500, max: 2000, step: 100, perDay: 3 },
    // 交委託拿籌碼（決定 0062，翊文 11-10：「委託給的靈感再少一點，可以改給一些籌碼」）。先照這樣，等翊文：
    // 交壹張給 min～max（每 step 壹級），壹定有；壹天最多 perDay 張。壹天最多 10,000，跟最小的免費大禮包壹樣多
    job: { min: 1000, max: 2000, step: 100, perDay: 5 },
    // 拚經濟（舊 Discord 21 點的玩法，決定 0052）：亂數 r 是 0～rMax 的整數，r > winAbove 成功，莊家 +r×winPer；否則失敗，莊家 -r×losePer，按的人有 lootPct% 撈到同額的油水。數字照舊；每人每天幾次是新的（等翊文）
    // budgetStart：拚經濟的錢從「預算池」進出（翊文 11-10：「先設定一個地方，讓它其實從那邊扣錢，這個之後怎麼接上其他的，我們再討論」）。存在莊家同壹份（casinoHouse/main 的 budget）；先給這麼多，不夠可以是負的，只記帳不擋
    econ: { perDay: 3, rMax: 100, winAbove: 30, winPer: 30000, losePer: 10000, ticketPct: 8, lootPct: 55, budgetStart: 1000000000 },
    // 實況和斗內（舊 Discord 21 點的玩法，決定 0053）：金額是 base + step×k，k 是 1～kMax 的整數（舊的：10000 + 10000×1～25，也就是 2 萬～26 萬），自己不能選。durationMs 開播多久自動下播；graceMs 實況主離線超過這麼久算下播（關掉遊戲）。perDay、receiveCap 是新的（等翊文）
    live: { base: 10000, step: 10000, kMax: 25, durationMs: 3600000, graceMs: 60000, perDay: 3, receiveCap: 1000000 },
    foodCap: { mood: 10, san: 3 }, // 餐車的吃的（翊文 11-09）：一天最多加這麼多，不然籌碼會變成買不完的心情（等翊文）。每樣加多少在 casino_text.js 的 CAS_MENU
    hangMax: 3,             // 展廳最多掛幾件紀念品
    titleMax: 12,           // 舊資料裡的紀念品、成就名字最多幾個字
    // 同桌（第二階段）
    seats: 4,               // 一桌最多幾人（跟 PARTY.maxMembers.table 一樣）
    betMs: 30000,           // 下注的時間
    turnMs: 25000,          // 輪到你，要或不要的時間；超過、斷線都當停牌
    resultMs: 10000,        // 看結果的時間，之後自動下一局
    sayGapMs: 1500,         // 說話至少隔多久
    chatKeep: 30,           // 聊天留最近幾句
    // 每週收藏（決定 0042，shared/casino_week.js）。數字全部等翊文
    week: {
      stamp: 1,             // 一週集滿，領 1 枚週章（每週任務一個 1 枚、全做完再多 2 枚，所以這個很少）。靈感一點都不給
      itemsMin: 3,          // 一週的收藏品 3～5 件（week.json 的 casino.items）
      itemsMax: 5,
      extraMax: 1,          // 每天的 dN.json 可以再加 1 件（加碼件不算集滿的條件）
      titleMax: 14,         // 這週收藏的標題
      introMax: 60,         // 前言
      descMax: 50,          // 一件收藏品的說明
      noteMax: 50,          // 每天多的一段話
      souvenirDescMax: 40,  // 集滿的紀念品說明
      storyPagesMax: 3,     // 集滿後的小故事 1～3 頁
      pageMax: 120,         // 每頁字數（跟書一樣）
      keepWeeks: 8,         // 錢包裡留幾週的紀錄（過期的週：拿到的財產留著，沒領的週章還能補領）
    },
  },
  // 第 4 版（11-09，決定 0039）：每週排行榜（規則 shared/board.js）
  board: {
    top: 3,                 // 每個榜列到第幾名（同分同名次；全勤例外，簽滿的都列）
    fullDays: 7,            // 全勤：這週簽滿幾天
    tipsMax: 3,             // 全館的建議最多幾條（最少 2 條，不夠的用平常的建議補）
    nudgesMax: 3,           // 給個人的小提醒最多幾條，一個人最多一條
    signNear: 5,            // 這週簽了幾天以上，才提醒「只差幾天就全勤」
    lowShare: 0.5,          // 有做的人不到這個比例，才算「大家做得不多」
    chipCap: 1e12,          // 賭場榜（斗內王、賭神）的籌碼上限：錢包是不可信的資料，拿數字要有上限（決定 0054）
    countCap: 999999,       // 賭場榜（牌桌王、爆牌王、拚經濟王）的次數上限
    achCap: 999,            // 成就王的成就數上限
    discordMax: 2000,       // Discord 一則最多幾個字（公告、/pepe-排行榜 都不能超過）
  },
  // Discord 聯動第一步（決定 0051，規則 shared/discord.js）
  discord: {
    linkBonus: 1000000,     // 綁定獎勵（籌碼）：每個遊戲帳號只送一次，解除再綁、換 Discord 都不再送（翊文 11-09：「送100萬」）
    linkCodeMin: 10,        // 綁定碼（6 位數）幾分鐘內有效、只能用一次
    triesMax: 5,            // 同一個 Discord 帳號在視窗內最多打錯幾次
    triesWindowMin: 10,     // 打錯太多次的暫時擋：打錯的次數算多久（也是擋多久）
    joinCodeMin: 30,        // 自己加入的連結幾分鐘內有效、只能用一次
    joinPerDay: 5,          // 壹天（05:00 換日）最多幾人靠 Discord 自己加入
    skewSec: 300,           // 簽名的時間戳跟伺服器差超過幾秒就拒絕
    newsDefault: 5,         // /pepe-更新 預設列幾則
    newsMax: 10,            // /pepe-更新 最多列幾則
    realMax: 3,             // /pepe-今日活動 的「今天的現實世界」最多列幾則
    realChars: 60,          // 每則最多幾個字（檢查程式限 50，這裡是 Functions 這邊的保險）
    // 第二步：遊戲大事發到頻道（規則 shared/discord_out.js）
    outCooldownMin: 10,     // 同壹種事件（破產、救回來、加入、開播…）最多每幾分鐘壹則
    outDonateMin: 1,        // 斗內感謝的冷卻（斗內本來就是要馬上說謝謝）
    outMaxAgeMin: 30,       // 事件寫進去超過幾分鐘還沒發，就不發了（過時的事不要突然跳出來）
    outBjMin: 5,            // 在 Discord 打完的 21 點：同壹個人這麼多分鐘內連打，併成壹則（編輯第壹則）
  },
};
// ---------- 第 4 版（11-09，決定 0030）：只有簽到拿得到的東西 ----------
// kind：part（佩佩部件，cat、opt 是 PEPE_PARTS 裡 limited 的選項）、deco（slot：stand 展台裝飾、frame 名牌框；只好看、不影響數值）、mat（材料，n 是一次給幾份）
// 名字、說明在 content3.js 的 LIMITED_TEXT；樣子在 web/src/art.js。每週全簽到照 NUM.signin.weekKinds 輪到哪一種，那一種裡再照週輪流
export const LIMITED_ITEMS = [
  { id: "hat-curator", kind: "part", cat: "帽子", opt: "館員帽" },
  { id: "hat-lantern", kind: "part", cat: "帽子", opt: "燈籠帽" },
  { id: "stand-velvet", kind: "deco", slot: "stand" },
  { id: "frame-vine", kind: "deco", slot: "frame" },
  { id: "mat-star", kind: "mat", cat: "材質", opt: "星光絨", n: 3 },
  // 第 4 版（11-09，決定 0032）：兌換所賣的限定頭飾。shop: true ＝只有兌換所賣（每週全簽到不會輪到）；price ＝幾枚週章。
  // 週包 week.json 可以寫 shop: ["hat-rain", …] 指定這週賣哪幾件（排程照這週的主題挑）；沒指定的週照週號輪流（shared/shop.js 的 shopOnSale）
  { id: "hat-rain", kind: "part", cat: "帽子", opt: "黃雨帽", shop: true, price: 5 },
  { id: "hat-chef", kind: "part", cat: "帽子", opt: "廚師帽", shop: true, price: 5 },
  { id: "hat-muff", kind: "part", cat: "帽子", opt: "毛耳罩", shop: true, price: 5 },
  { id: "hat-miner", kind: "part", cat: "帽子", opt: "礦工帽", shop: true, price: 5 },
  { id: "hat-wreath", kind: "part", cat: "帽子", opt: "花環", shop: true, price: 5 },
  { id: "hat-bow", kind: "part", cat: "帽子", opt: "蝴蝶結", shop: true, price: 5 },
  { id: "hat-pot", kind: "part", cat: "帽子", opt: "鐵鍋帽", shop: true, price: 5 },
  { id: "hat-paper", kind: "part", cat: "帽子", opt: "摺紙帽", shop: true, price: 5 },
  // 主題展辦到金（決定 0035）：theme 是 HALL_THEME_BONUS 的主題。from 有寫的不會被每週全簽到抽到（signin.js 的 weeklyItem）
  { id: "show-legend", kind: "part", cat: "帽子", opt: "傳說的金冠", from: "show", theme: "legend" },
  { id: "show-angry", kind: "part", cat: "帽子", opt: "火氣頭帶", from: "show", theme: "angry" },
  { id: "show-tears", kind: "part", cat: "帽子", opt: "淚滴耳環", from: "show", theme: "tears" },
  { id: "show-russia8", kind: "part", cat: "帽子", opt: "瓜子項鍊", from: "show", theme: "russia8" },
  { id: "show-rainbow", kind: "part", cat: "帽子", opt: "彩虹圍巾", from: "show", theme: "rainbow" },
  { id: "show-hats", kind: "part", cat: "帽子", opt: "三層帽", from: "show", theme: "hats" },
  { id: "show-pillows", kind: "part", cat: "帽子", opt: "枕頭睡帽", from: "show", theme: "pillows" },
  { id: "show-joy", kind: "part", cat: "帽子", opt: "歡笑花環", from: "show", theme: "joy" },
  { id: "show-flat", kind: "part", cat: "帽子", opt: "躺平眼罩", from: "show", theme: "flat" },
  { id: "show-failed", kind: "part", cat: "帽子", opt: "縫過的領結", from: "show", theme: "failed" },
  // 每週特展到金（決定 0035）：theme 是 WEEKLY_IDS 的主題。先做 3 件
  { id: "week-allBlack", kind: "part", cat: "帽子", opt: "黑絨領結", from: "week", theme: "allBlack" },
  { id: "week-pillowWeek", kind: "part", cat: "帽子", opt: "小枕頭髮夾", from: "week", theme: "pillowWeek" },
  { id: "week-gopnikWeek", kind: "part", cat: "帽子", opt: "金瓜子項鍊", from: "week", theme: "gopnikWeek" },
];
// ---------- 第 4 版（11-09，決定 0032）：兌換所的裝備 ----------
// 名字、說明在 content3.js 的 GEAR_TEXT。放在博物館（P.shop.gear），現在這位參觀者最多穿 NUM.shop.gearWorn 件（P.gear，換人時各穿各的）。
// 效果的欄位跟小優點、小缺點一樣（下面 PERKS 的說明），legacy.js 的 traitSum 會一起算，所以不用在規則裡另外加判斷；
// 多一種 "skill:技能名"：那個技能檢定時多幾點（不改技能本身，也不影響成長）。tier：common 普通、fine 精良、rare 稀有（價錢在 NUM.shop.gearPrice）。
// 會讓理智好過的（探險燈）放在最貴的一級；理智要「算容易歸零」（docs/界線.md）。
export const GEAR_ITEMS = [
  { id: "magnifier", tier: "common", "skill:偵查": 5 },
  { id: "coin", tier: "common", "skill:幸運": 5 },
  { id: "apron", tier: "common", pillowFree: 30 },
  { id: "abacus", tier: "fine", deal: 1 },
  { id: "amulet", tier: "fine", understand: -10 },
  { id: "gloves", tier: "fine", power: 1 },
  { id: "lamp", tier: "rare", cellarSan: -1 },
  { id: "notebook", tier: "rare", growth: 1 },
];

// ---------- 第 3 版：工坊升級（系統 K，在館長室買） ----------
export const UPGRADES = [
  { id: "ped7", cost: 30 },
  { id: "ped8", cost: 60, req: "ped7" },
  { id: "dice", cost: 40 },
  { id: "board", cost: 50 },
  { id: "fame", cost: 40 },
  { id: "forge2", cost: 50 },
  { id: "repair", cost: 30 },
];

// ---------- 第 3 版：融合室的隱藏配方（系統 J；文字在 content3.js 的 RECIPE_TEXT） ----------
// a、b ＝兩隻爸媽要符合的條件（順序不拘）；child ＝小孩一定會有的選項；minRarity ＝至少幾級；fixed ＝直接決定稀有度、不擲骰
export const RECIPES = [
  { id: "forbidden", a: { 帽子: "觸手帽" }, b: { 稀有度: "不可名狀" }, child: { 帽子: "觸手帽" }, fixed: "不可名狀", san: "1D6/1D20" },
  { id: "twins", same: true, upTier: true },
  { id: "yiqi", a: { 心情: "俄國8+9", 姿勢: "斯拉夫蹲" }, b: { 心情: "俄國8+9", 姿勢: "斯拉夫蹲" }, child: { 心情: "俄國8+9", 姿勢: "斯拉夫蹲", 帽子: "毛帽" }, minRarity: "超稀有" },
  { id: "tipsy", a: { 心情: "開心", 姿勢: "躺平" }, b: { 心情: "傷心", 姿勢: "躺平" }, child: { 心情: "微醺", 姿勢: "躺平" } },
  { id: "rainbow", a: { 心情: "開心", 顏色: "紅" }, b: { 心情: "開心", 顏色: "綠" }, child: { 心情: "開心", 顏色: "虹彩" } },
  { id: "handstand", a: { 姿勢: "比讚" }, b: { 姿勢: "比讚" }, child: { 姿勢: "倒立" } },
  // 調色盤（mix）：只看兩隻的顏色，可以跟上面的配方同時發生（上面的配方已經決定顏色時，照上面的）
  { id: "mixOrange", mix: true, a: { 顏色: "紅" }, b: { 顏色: "黃" }, child: { 顏色: "橘" } },
  { id: "mixBlue", mix: true, a: { 顏色: "綠" }, b: { 顏色: "黑" }, child: { 顏色: "藍" } },
  { id: "mixPurple", mix: true, a: { 顏色: "紅" }, b: { 顏色: "藍" }, child: { 顏色: "紫" } },
  { id: "mixWhite", mix: true, a: { 顏色: "橘" }, b: { 顏色: "藍" }, child: { 顏色: "白" } },
  { id: "mixPink", mix: true, a: { 顏色: "紅" }, b: { 顏色: "白" }, child: { 顏色: "粉" } },
];
// 調出來的顏色在地下收藏庫多幾點強度
export const COLOR_POWER = { 橘: 1, 藍: 1, 紫: 1, 白: 1, 粉: 1 };

// ---------- 第 3 版：參觀者的職業與技能（系統 L；名字、說明在 content3.js 的 JOBS） ----------
export const SKILLS = ["偵查", "鑑賞", "神秘學", "幸運", "手工藝", "說服"];

// ---------- 第 3 版：地下收藏庫每一層第一次過關的獎勵（系統 M；房間文字在 content3.js 的 CELLAR） ----------
export const CELLAR_REWARDS = {
  1: { insp: 10, unlock: ["帽子", "毛帽"] },
  2: { insp: 12, book: "book4" },
  3: { insp: 15, key: "bg" },
  4: { insp: 18, unlock: ["姿勢", "倒立"] },
  5: { insp: 25, key: "hold", ending: "cellar" },
};
// 隊伍：每隻佩佩的強度
export const CELLAR_POWER = { 普通: 1, 稀有: 2, 超稀有: 3, 傳說級稀有: 5, 不可名狀: 6, 失敗作: 0, perfect: 1 };
// 心情相剋：前面的剋後面的（俄國8+9 不被剋）
export const MOOD_BEATS = { 開心: "傷心", 傷心: "生氣", 生氣: "開心" };
// ---------- 地下室改版（決定 0067）：怪物（名字、台詞在 content3.js 的 FOE_TEXT；規則 shared/cellar_fight.js） ----------
// hp ＝壓力（3 隻、1 個人的時候）；boss ＝守門，壓到零進第二階段（hp2、moves2）；mood、color ＝相剋照房間的算法（memberPower）
// 招：kind "hit" 撲向壹個人的佩佩（倒下壹隻）、"scare" 壹個人扣理智 san、"all" 每個人扣理智 san、"grow" 壓力回 n；w ＝抽到的比重
// 數字是草稿：node test/sim_fight.cjs 看 1～4 人的勝率和回合數
export const CELLAR_FOES = [
  { id: "f1a", floor: 1, hp: 38, mood: "傷心", color: "黃", moves: [{ id: "topple", kind: "hit", w: 2 }, { id: "dust", kind: "scare", san: "1D2", w: 2 }] },
  { id: "f1b", floor: 1, hp: 36, mood: null, color: "紅", moves: [{ id: "cling", kind: "scare", san: "1D3", w: 2 }, { id: "pile", kind: "grow", n: 4, w: 1 }] },
  { id: "f1g", floor: 1, boss: true, hp: 32, hp2: 22, mood: "生氣", color: "綠", moves: [{ id: "topple", kind: "hit", w: 1 }, { id: "count", kind: "grow", n: 5, w: 1 }, { id: "dust", kind: "scare", san: "1D3", w: 2 }], moves2: [{ id: "slide", kind: "all", san: "1D2", w: 2 }, { id: "topple", kind: "hit", w: 1 }] },
  { id: "f2a", floor: 2, hp: 50, mood: "生氣", color: "黑", moves: [{ id: "shift", kind: "hit", w: 2 }, { id: "stare", kind: "scare", san: "1D3", w: 2 }] },
  { id: "f2b", floor: 2, hp: 48, mood: "開心", color: null, moves: [{ id: "blank", kind: "scare", san: "1D4", w: 2 }, { id: "rename", kind: "grow", n: 5, w: 1 }] },
  { id: "f2g", floor: 2, boss: true, hp: 36, hp2: 24, mood: null, color: "綠", moves: [{ id: "shift", kind: "hit", w: 1 }, { id: "stare", kind: "scare", san: "1D4", w: 2 }, { id: "rename", kind: "grow", n: 6, w: 1 }], moves2: [{ id: "unveil", kind: "all", san: "1D3", w: 2 }, { id: "shift", kind: "hit", w: 1 }] },
  { id: "f3a", floor: 3, hp: 60, mood: "傷心", color: "黑", moves: [{ id: "step", kind: "hit", w: 2 }, { id: "follow", kind: "scare", san: "1D4", w: 2 }] },
  { id: "f3b", floor: 3, hp: 56, mood: "開心", color: "紅", moves: [{ id: "smear", kind: "scare", san: "1D4", w: 2 }, { id: "repaint", kind: "grow", n: 6, w: 1 }] },
  { id: "f3g", floor: 3, boss: true, hp: 50, hp2: 34, mood: "生氣", color: "黑", moves: [{ id: "step", kind: "hit", w: 1 }, { id: "follow", kind: "scare", san: "1D4", w: 2 }, { id: "repaint", kind: "grow", n: 7, w: 1 }], moves2: [{ id: "frame", kind: "all", san: "1D4", w: 2 }, { id: "step", kind: "hit", w: 1 }] },
  { id: "f4a", floor: 4, hp: 68, mood: "傷心", color: "黃", moves: [{ id: "soak", kind: "hit", w: 2 }, { id: "blur", kind: "scare", san: "1D5", w: 2 }] },
  { id: "f4b", floor: 4, hp: 66, mood: "生氣", color: "黑", moves: [{ id: "click", kind: "scare", san: "1D5", w: 2 }, { id: "carry", kind: "grow", n: 7, w: 1 }] },
  { id: "f4g", floor: 4, boss: true, hp: 58, hp2: 38, mood: "開心", color: "黃", moves: [{ id: "soak", kind: "hit", w: 1 }, { id: "blur", kind: "scare", san: "1D5", w: 2 }, { id: "carry", kind: "grow", n: 8, w: 1 }], moves2: [{ id: "tally", kind: "all", san: "1D4", w: 2 }, { id: "soak", kind: "hit", w: 1 }] },
  { id: "f5a", floor: 5, hp: 74, mood: "傷心", color: null, moves: [{ id: "queue", kind: "hit", w: 2 }, { id: "almost", kind: "scare", san: "1D6", w: 2 }] },
  { id: "f5b", floor: 5, hp: 72, mood: "生氣", color: "黃", moves: [{ id: "almost", kind: "scare", san: "1D6", w: 2 }, { id: "another", kind: "grow", n: 8, w: 1 }] },
  { id: "f5g", floor: 5, boss: true, hp: 64, hp2: 42, mood: null, color: null, moves: [{ id: "queue", kind: "hit", w: 1 }, { id: "almost", kind: "scare", san: "1D6", w: 2 }, { id: "another", kind: "grow", n: 9, w: 1 }], moves2: [{ id: "nameless", kind: "all", san: "1D5", w: 2 }, { id: "queue", kind: "hit", w: 1 }] },
];

// ---------- 第 3 版：每週特展的主題（文字在 content3.js 的 WEEKLY_TEXT） ----------
export const WEEKLY_IDS = ["start32", "allBlack", "allFlat", "failedOnly", "noHat", "noLegend", "pillowWeek", "gopnikWeek"];

// ---------- 畫廊（第 1 代的文字原樣保留，不要改） ----------
// san ＝理智檢定「成功掉多少／失敗掉多少」，跟 CoC 一樣寫法。
export const GALLERY_INTRO = "三幅畫和一尊雕像映入眼簾...";
export const EXHIBITS = [
  { id: "portrait", art: "portrait", title: "普通的佩佩肖像", label: "觀看普通的佩佩肖像",
    lines: ["這是最普通也最常見的佩佩肖像。", "有人說這是神賜予凡人的禮物。"] },
  { id: "strange", art: "strange", title: "壹幅奇怪的繪畫", label: "觀看壹幅奇怪的繪畫",
    lines: ["你看到壹群祭司圍繞著乙輛賓士轎車。", "車中的那名祭司看起來莫名的眼熟。", "這才不是佩佩!"],
    aside: "(你感到怒火中燒)", mood: -10, san: "1/1D8" }, // 原本 1/1D6
  { id: "rare", art: "rare", title: "稀有佩佩圖畫", label: "觀看稀有佩佩圖畫",
    lines: ["你看到壹幅帥佩佩圖。", "這幅畫用色大膽，風格更是前所未有。", "看得出來這是非常稀有的佩佩。"],
    aside: "(你的心情變好了些)", mood: 10 },
  { id: "statue", art: "statue", title: "雕像", label: "觀看雕像",
    lines: ["你看到壹尊描繪佩佩正在嘔吐的雕像。"], failAside: "(理智值扣拾)", san: "1/10" },
  // 新的展品：文字在下面的 NEW_EXHIBITS
  { id: "hidden", art: "hidden", san: "1D3/1D10", myth: 2, unlock: "hidden" },
  { id: "russia8", art: "russia8", san: "1D4/1D20", myth: 3, unlock: "russia8" },
];
// 起源（第 1 代）
export const ORIGIN = { lines: ["佩佩並沒有所謂的起源。", "祂並不受到時間與空間的限制。"], aside: "(得知此項事實，你感到和諧與平靜)", mood: 10 };
// 第 1 代、第 2 代的其他句子
export const GEN_TEXT = {
  museum: "佩佩博物館2", // 開場的大標題（翊文 11-08：「我決定這麼多版還是叫做 佩佩博物館2 好了」，決定 0022）
  workshop: "歡迎來到客製佩佩手作坊",
  pillow: "歡迎來到抱枕部",
  done: "久等了，這是你的{x}。",
  gift: "可以免費帶回家喔!",
  bye: "歡迎再次參訪本館",
};

// ---------- 徽章（系統 D：成套目標） ----------
export const BADGES = [
  { id: "first", name: "第一隻", desc: "做出第一隻佩佩", insp: 3 },
  { id: "fourMoods", name: "四種心情", desc: "同一種顏色把 4 種心情都做出來（解鎖「黑」）", insp: 10 },
  { id: "fourColors", name: "四色同心情", desc: "同一種心情把 4 種顏色都做出來（解鎖「皇冠」）", insp: 10 },
  { id: "hats", name: "帽子收藏家", desc: "4 種帽子都做過", insp: 12 },
  { id: "poses", name: "姿勢大全", desc: "4 種姿勢都做過", insp: 10 },
  { id: "allFlat", name: "全部躺平", desc: "4 種心情都做過躺平的", insp: 10 },
  { id: "fourLegends", name: "四種傳說級", desc: "收藏 4 隻傳說級", insp: 20 },
  { id: "perfect", name: "完美主義", desc: "擲出 01，做出完美作品", insp: 5 },
  { id: "failed", name: "失敗也是作品", desc: "擲出 98–100，做出第一個失敗作", insp: 3 },
  { id: "pillows10", name: "抱枕控", desc: "做出 10 種抱枕", insp: 8 },
  { id: "commissions10", name: "委託達人", desc: "完成 10 張委託", insp: 15 },
  { id: "curator", name: "策展人", desc: "展廳第一次成立主題", insp: 8 },
  { id: "mythos", name: "禁忌知識", desc: "佩佩神話達到 10", insp: 0 },
  { id: "hundred", name: "百隻", desc: "收藏 100 隻佩佩", insp: 20 },
  // 第 3 版
  { id: "firstFusion", name: "第一次融合", desc: "在融合室做出第一隻佩佩", insp: 5 },
  { id: "mutant", name: "突變", desc: "融合出第一個突變選項", insp: 8 },
  { id: "recipes3", name: "配方師", desc: "發現 3 個隱藏配方", insp: 15 },
  { id: "cellar5", name: "地下館長", desc: "走到地下收藏庫最底層", insp: 20 },
  { id: "clientLine", name: "老主顧", desc: "跟一位委託人走完整段故事", insp: 15 },
];

// ---------- 展廳（系統 E） ----------
// 每件作品的分數；主題成立時再加分。滿分 100。
export const HALL_POINTS = { 普通: 4, 稀有: 7, 超稀有: 10, 傳說級稀有: 14, 不可名狀: 15, perfect: 3, failed: 3, pillow: 2, repaired: 5 };
export const HALL_THEME_BONUS = { legend: 20, angry: 15, tears: 15, russia8: 15, rainbow: 15, hats: 12, pillows: 12, joy: 12, flat: 10, failed: 10 };

// ---------- 第 4 版：參觀者一位接一位（翊文 11-08，roguelike 的繼承） ----------
// 規則在 shared/legacy.js；文字在 content3.js 的 TRAIT_TEXT、LEGACY_TEXT。
// 換人時：前一位留一樣東西給下一位（A）。
// 每一位參觀者（第一位也是）都從 6 個職業自己選，選好再抽一個小優點、一個小缺點（決定 0028；以前換人時是從 3 位候選人挑）。
export const LEGACY = {
  skillPlus: 10,  // 「把最拿手的技能傳下去」：下一位這個技能的起點 +10
  relicMood: 10,  // 「留下一件收藏當遺物」：下一位開場心情 +10（0 ＝遺物只是紀念）
  relicsMax: 50,  // 遺物櫃最多放幾件（跟歷任參觀者的紀錄一樣 50 位）
  slots: 3,       // 一個帳號最多幾位參觀者同時在館裡、共用博物館（決定 0018，翊文 11-08 選「3 位」）
  nameMax: 12,    // 參觀者的名字最多幾個字（跟暱稱一樣，server/store.js 的 NICK_MAX）
  retireDays: 1,  // 在館長室自己退休：這一位要來了幾天以上（遊戲裡的天）才可以（決定 0025；不然可以一直退休重抽優缺點）
};
// 小優點、小缺點：效果都要小。改數字，說明文字會跟著變（TRAIT_TEXT 裡的 {欄位名}）。
//   tag 有一樣的，不會配在同一位身上（例如「精打細算」不會配「坐不住」）；notJob ＝這個職業抽不到（跟職業的能力重複）。
// 欄位：
//   pillowFree 做抱枕不花靈感的機率（%）    deal 交委託多拿幾靈感         fusion 融合多花幾靈感
//   power 地下收藏庫的隊伍強度              growth 技能成長多長幾點（最少還是 +1）
//   mood 開場心情    sanity 開場理智        others 拿手以外的技能起點     skillName／skillAdj 某一個技能的起點
//   injure 在地下收藏庫受傷幾天會好（最少 1 天）   cellarSan 在地下收藏庫扣理智時多扣幾點   understand 看懂檢定（＋＝比較容易看懂）
export const PERKS = [
  { id: "deft", tag: ["craft"], pillowFree: 20, notJob: ["artisan"] }, // 抱枕職人本來就有機會不花靈感
  { id: "sweet", tag: ["deal"], deal: 1 },
  { id: "thrifty", tag: ["fusion"], fusion: -1 },
  { id: "strong", tag: ["power"], power: 1 },
  { id: "quick", tag: ["growth"], growth: 1 },
  { id: "lucky", tag: ["mood"], mood: 10 },
  { id: "allround", tag: ["skill"], others: 5 },
  { id: "nimble", tag: ["injury"], injure: -1 },
];
export const FLAWS = [
  { id: "darkfear", tag: ["dark"], cellarSan: 1, understand: 10 },
  { id: "haggler", tag: ["deal"], deal: -1 },
  { id: "restless", tag: ["fusion"], fusion: 1 },
  { id: "weak", tag: ["power"], power: -1 },
  { id: "slow", tag: ["growth"], growth: -1 },
  { id: "gloomy", tag: ["mood"], mood: -10 },
  { id: "clumsy", tag: ["craft", "skill"], skillName: "手工藝", skillAdj: -10 },
  { id: "butter", tag: ["injury"], injure: 1 },
  { id: "insomnia", tag: ["sanity"], sanity: -5 },
];

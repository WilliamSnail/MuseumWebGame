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

// 限定帽子的能力（決定 0085，docs/限定配件能力提案.md；翊文 11-15：地下以外也要有、特展的更強一點）。數字都在這裡。
//   探索（走房間）：team 全隊強度 +、teamIfColor [顏色, +n] 隊裡有這個顏色就 +、teamIfMood [心情, +n] 戴的那隻是這個心情就 +、rainbow 隊裡每種不同顏色 +1（最多這麼多）、skill 技能檢定 +（取最高，不疊）、
//   sanCut 每次被扣理智少扣（最少扣 1）、rest 每層第壹次走回這麼多理智、block 擋下幾次理智損失（不同的帽子加起來）、reroll 多幾次重擲、firstSan 每層第壹次走多扣、minPower 自己的強度至少這麼多
//   打怪（一場一次的招式）：fight { move: 用哪個招式的算法（cheer、wizard、cap、squat、beanie、crown、tentacle）, n 數字, uses 可以用幾次, mult 推的倍率（tentacle）, noSan 不扣理智, team 全隊（beanie）}
//   館內（地下以外）：home { foodMood 餐車吃的心情 +、foodSan 餐車理智每天上限 +、signInsp 每週第壹次簽到 +靈感、winInsp 房間第壹次過 +靈感、daySan 換日自己回復 +理智、dayMood 換日心情 + }，都是玩家自己存檔裡的東西，沒有新的籌碼來源
export const LIMITED_FX = {
  館員帽: { skill: 5, fight: { move: "cheer", n: 1 } },
  燈籠帽: { team: 1, fight: { move: "wizard", n: 1 } },
  黃雨帽: { sanCut: 1 },
  廚師帽: { home: { foodMood: 1 } },
  毛耳罩: { rest: 1 },
  礦工帽: { home: { winInsp: 1 } },
  花環: { teamIfColor: ["粉", 1] },
  蝴蝶結: { fight: { move: "wizard", n: 1 } },
  鐵鍋帽: { block: 1 },
  摺紙帽: { minPower: 1 },
  傳說的金冠: { team: 3, reroll: 1, fight: { move: "crown", uses: 2 } },
  火氣頭帶: { team: 4, firstSan: 1, fight: { move: "tentacle", mult: 1.5, noSan: true } },
  淚滴耳環: { rest: 2, fight: { move: "beanie", n: 2, team: true } },
  瓜子項鍊: { skill: 10, home: { signInsp: 1 }, fight: { move: "cheer", n: 3 } },
  彩虹圍巾: { rainbow: 4, fight: { move: "wizard", n: 3 } },
  三層帽: { block: 3, fight: { move: "cap", uses: 2 } },
  枕頭睡帽: { rest: 3, home: { daySan: 2 }, fight: { move: "beanie", n: 3 } },
  歡笑花環: { team: 2, teamIfMood: ["開心", 1], fight: { move: "wizard", n: 3 } },
  躺平眼罩: { team: -1, rest: 3, fight: { move: "cheer", n: 4 } },
  縫過的領結: { skill: 8, minPower: 2, fight: { move: "squat" } },
  黑絨領結: { skill: 12, home: { dayMood: 3 }, fight: { move: "cheer", n: 2 } },
  小枕頭髮夾: { rest: 2, fight: { move: "squat" } },
  金瓜子項鍊: { team: 3, home: { foodSan: 1 }, fight: { move: "wizard", n: 4 } },
};
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
  ui: { newLobby: true, newCellar: true, lobbyCrowdMusic: 150, lobbySan: [55, 30, 15], casinoBusyMusic: 35, workshopBusyMusic: 20 }, // workshopBusyMusic：手作坊超過幾人換成翊文的錄音（11-17 翊文：「這首手作坊多人的時候可以放」；20 是先估的） // casinoBusyMusic：賭場超過幾人換成 Copper Nights（11-16 翊文：「賭場裡超過35人就改播這個」）； // lobbySan：大廳照理智換曲（11-16 翊文）：低於 55 放「Familiar Melody, Subly Wrong」、低於 30「Lobby Silence」、低於 15 到 0 放原本的合成旋律； // lobbyCrowdMusic：館內同時超過幾人，大廳換成「Inviting Loop」（11-16 翊文：「人潮很多的時候用這首」；150 是先估的，太常/太少出現就改）
  // 地下室改版（決定 0067，規劃 docs/地下室改版規劃.md）：打怪物的規則 shared/cellar_fight.js。數字都是草稿，模擬 node test/sim_fight.cjs
  //   baseTeam、perPlayer、pressureHp：怪物的壓力照隊伍放大＝基本 × 隻數 ÷ baseTeam ×（1 ＋ perPlayer ×（人數 − 1））＋ pressureHp × 全隊理智壓力的級數
  //   die：每個人「推」擲的骰子；weakMult：看穿之後「推」乘多少（館方助手不算）
  //   seeMod、calmMod：看穿（偵查、神秘學取高的）、安撫（說服）的技能加多少；calmHp：安撫成功順便減多少壓力
  //   guardDodge、softDodge：擋住、被安撫過的「撲」沒中的機率；理智類的招是減半（無條件進位）
  //   wizard、cheer：巫師帽這回合、比讚下壹回合，每個人的「推」加多少；tentacleMult、tentacleSan：觸手帽強度乘多少、帶牠的人扣多少理智
  //   rest：躺平、毛帽回多少理智（這壹層第壹次走才能用，界線「不要改回去」）；maxRounds：打到第幾回合怪物自己走掉
  //   pressureSan：全隊理智壓力到第幾級，理智類的招多扣 1；injure：打完之後，倒下的佩佩真的受傷的機率（翊文 11-12：「倒下的是真的受傷」，所以是 1）
  //   11-13 調過勝率（模擬用 sim_fight.cjs 的 full 選法：看穿、安撫、逃跑、撤退都會用）：普通 65～80%、菁英（rank 2）45～60%、守門 30～45%。perPlayer 0.35 → 0.5、maxRounds 12 → 15、rankHp [1, 1.35, 1.7] → [1, 1.3, 1.55]、每隻怪物的壓力在 CELLAR_FOES
  //   決定 0068（翊文 11-12 回答的）：
  //   rankHp、rankSan：怪物的等級 1～3（地圖上看得到大概多強），壓力乘多少、理智類的招多扣多少；rankInsp：打贏比較強的多給多少靈感
  //   flee、fleeBoss：逃跑成功的機率（百分比）；要有壹半以上的人選逃跑才會擲
  //   courage：壯膽，每多壹個真人隊友，每個人多這麼多「膽量」，先替理智擋（這壹趟用完就沒了，不會留在存檔）；coopInsp：每多壹個真人隊友，打贏多給多少靈感
  //   tap：有些回合可以按時機（「有時候 B」）：chance ＝下壹回合可以按的機率，找到弱點的下壹回合壹定可以；good、great ＝按得好、按得很準，「推」多加多少。只加不扣，不按也沒事
  fight: { baseTeam: 3, perPlayer: 0.5, pressureHp: 3, die: "1D6", weakMult: 1.5, seeMod: 20, calmMod: 25, calmHp: 2, guardDodge: 0.5, softDodge: 0.5, wizard: 2, cheer: 2, tentacleMult: 2, tentacleSan: "1D3", rest: "1D3", maxRounds: 15, pressureSan: 2, injure: 1, rankHp: [1, 1.3, 1.55], rankSan: [0, 0, 1], rankInsp: [0, 1, 2], flee: 60, fleeBoss: 40, courage: 5, coopInsp: 1, tap: { chance: 0.25, good: 1, great: 2 },
    // 結算演出（docs/打怪演出規劃.md）：每件事演 replayStep 毫秒，最後小結 replayTail，最多 replayMax。演完才開始倒數：伺服器把這段時間加進下一回合的期限
    replayStep: 750, replayTail: 1600, replayMax: 9000,
    // 佩佩身上的（docs/打怪玩法規劃.md 第三節）：red 推 +；green 每回合結束理智 +；yellow 看穿、安撫 +％；black 被嚇少扣；moodCombo 全隊湊到三種心情推 +
    color: { red: 1, green: 1, yellow: 10, black: 1 }, moodCombo: 1,
    // 合作的新行動（第四節）：inspire 鼓舞讓隊友推 +；comfort 安慰回理智（骰子＋說服 ÷ comfortDiv）；reveal 看清（偵查 ＋ revealMod）
    inspire: 3, comfort: "1D3", comfortDiv: 30, revealMod: 20,
    // 怪物個性「殼很硬」：沒看穿之前推只剩幾成（模擬 11-12：0.5 的時候 B1 紙箱 1 人只贏 54%）
    shellMult: 0.65 },
  // 地下室的小地圖（shared/cellar_map.js）：rows 排；每排壹定有壹間探索房（翊文 11-12：「房間探索還是要保留喔，是個重點」），壹趟可以把這層的房間全部走完
  //   wide：某壹排有 3 個點的機率（不然 2 個）；最後壹排是休息＋別的；最底是守門
  //   rank2、rank3：遭遇的怪物是 2 級、3 級的機率 ＝ [第壹排的機率, 每往下壹排多多少]
  // restSan：休息回幾點理智（今天還有獎勵的趟才有）；chestInsp：寶箱開到好的，靈感幾點；chestSan：開到壞的扣多少理智；
  // chestOdds：[好的, 怪的] 的機率，剩下是壞的。數字是草稿（11-12）
  cellarMap: { rows: 5, wide: 0.5, rank2: [0.2, 0.12], rank3: [0, 0.06], restSan: 6, chestInsp: 2, chestSan: "1D3", chestOdds: [0.45, 0.3], bagKeep: 2 }, // bagKeep：全隊倒下時背包剩幾分之一（2 ＝剩一半）
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
  // 掛畫加展廳評分（翊文 11-14：「掛畫也讓展廳評分加壹點」）：收藏的畫（P.art.own，拍賣中的不算）照稀有度加分 pts（尋常、少見、珍藏、孤品），總共最多 cap 點；展廳裡沒有東西時不加（分數仍是 0）
  hallArt: { pts: [0.5, 1, 1.5, 2], cap: 5 },
  visitorStep: 50,          // 參觀者給的靈感＝1＋展廳評分÷50（無條件捨去）
  visitorInspDay: 40,       // 展廳參觀者壹天最多給幾靈感（翊文 11-13：「靈感每天能透過展覽加的應該要有一個上限」）。以前沒有上限：滿分展廳掛著玩壹小時就有 72
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
  lost: { days: 7, meetPct: 30, finderInsp: 2, ownerMood: 5, readSan: "0/1D3", perOwner: 2, returnsDay: 2 }, // 招領（shared/lostfound.js，翊文 11-13）：理智歸零的參觀者幾天內遇得到、每層遇到的機會、送回去的獎勵、唸名字的理智檢定；防刷（翊文：「不能讓玩家用一直歸零來刷」）：壹個館友最多 perOwner 張、送的人壹天最多 returnsDay 次拿靈感
  // 藝術市場（11-14，shared/casino_art.js，規劃 2.10、2.10a 節；翊文：畫是避險資產，像富人買來避險；「最好一兩個禮拜內回本」）。
  //   tiers：稀有度四級的底價（尋常 100 萬 ＝ 新玩家一開場的籌碼，所以是「有錢之後才做的事」）。
  //   放久了（casArtAge）：展出後前 ageFastDays 天每天漲 ageFastPct %，之後每天只漲 ageUpPct %，最多漲到 ageCapPct %（到頂就不再漲，所以不是穩賺）。
  //   moodPct：景氣反向 ±%（景氣差微漲）；demandPct／demandCapPct：全館每多一人持有漲 %、最多 %；sellPct：賣回只拿現價幾 %（價差，短線進出一定虧）。
  //   perDay：一天最多買幾幅；sellPerDay：一天最多賣回幾幅；holdMax：最多收藏幾幅；shelfDays：特展出現後幾天內館方賣（1 ＝ 只有當天）；unit：價格進位。
  //   莊家的保護：賣回一天全館最多付 莊家的錢 × sellQuotaPct% ＋ sellQuotaBase（股票共用額度之後再接）；全館持有的畫買進價合計超過 莊家的錢 × heldPct% 就先不收新的。
  art: { tiers: [{ name: "尋常", base: 1000000 }, { name: "少見", base: 2500000 }, { name: "珍藏", base: 6000000 }, { name: "孤品", base: 15000000 }],
    ageFastPct: 0.85, ageFastDays: 14, ageUpPct: 0.04, ageCapPct: 15, moodPct: 1, demandPct: 0.2, demandCapPct: 2, sellPct: 90,
    // 畫也有風險（規劃 2.10c，翊文 11-14 選 E）：每幅畫每天自己小小地隨機動（walkSd %，累計夾在 ±walkCap %），另外每天每幅有 hoaxPct% 的機率「贗品疑雲」：價格壹次掉 hoaxMin～hoaxMax %（不回來）。
    // 前壹天（hoaxHintDays 天）先放線索，想避險的可以先賣回。種子含伺服器祕密（casArtSecret）。
    walkSd: 0.4, walkCap: 20, hoaxPct: 0.1, hoaxMin: 10, hoaxMax: 30, hoaxHintDays: 1, perDay: 2, sellPerDay: 3, holdMax: 20, shelfDays: 1, unit: 1000,
    sellQuotaPct: 5, sellQuotaBase: 5000000, heldPct: 40,
    // 再看收藏的畫（規劃 2.10b，翊文 11-14）：壹幅壹天壹次靈感（跟今日特展同壹件共用）；全部收藏壹天合計 viewInspDay；稀有度（尋常、少見、珍藏、孤品）加的靈感；超過上限只剩文字
    viewInspDay: 6, viewRarityBonus: [0, 0, 1, 2] },
  // 藝術市場第二步：畫的拍賣（11-14，shared/casino_auction.js，規劃 2.10b 節；翊文：封閉式、每幅稀有畫壹場、玩家可以拍自己的畫、只公開得標價）。
  //   minTier：這一級以上（珍藏）的畫只在拍賣買；內容標了 auction 的也是。closeDays／closeHour：展出那天起算幾天後、台灣幾點收標。
  //   houseReservePct：館方拍的底價 ＝ 展出那天的館方價 × 這個 %。
  //   玩家的畫：底價在館方現價的 floorPct～ceilPct %（出價上限也是 ceilPct，也不超過現價 ＋ premiumDay）；賣家每天靠拍賣收的溢價（成交價 － 現價）合計 ≤ premiumDay；
  //   帳號要開 minAge 天；成交抽 feePct % 進博物館資金；壹個人同時最多拍 listPerSeller 幅；壹場最多 maxBidders 人出價；recent：畫面留幾場收標的結果；unit：價格進位。
  auction: { minTier: 2, closeDays: 3, closeHour: 22, houseReservePct: 100, floorPct: 80, ceilPct: 150, premiumDay: 2000000, minAge: 3, feePct: 5, listPerSeller: 2, maxBidders: 40,
    // NPC 買家（11-14，docs/館內NPC規劃.md 步驟 4、翊文：NPC 的錢從已知世界來）：每場最多壹位 NPC 出價，出價機率 npcJoinPct%；出價 ＝ 參考價 ×（玩家的畫 0.80～1.00／館方的畫 1.00～1.10）× 喜歡這個稀有度（×1.05，否則 ×0.95），
    //   不超過這位 NPC 的 budget.max、也不超過他壹天剩下的 perDay；全館壹天 NPC 買畫總額 ≤ npcDay ×（1 ＋ npcExtPct% × 景氣）；錢從已知世界池子付、付回池子（吃緊時付不出的場不出價）
    npcJoinPct: 60, npcDay: 3000000, npcExtPct: 20, npcLikePct: 5, recent: 12, unit: 1000 },
  eldritchRoll: { base: 2, perMyth: 5, max: 5 }, // 不可名狀：神話到了以後，原本擲出 01～base 就是；每多 perMyth 點神話寬壹格，最寬到 max（翊文 11-13 要放寬；以前只有 01）
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
  cellarFx: { wizard: 2, tentacle: 5, gent: 10, handstand: 1, stack: { like: 2, wizard: 2, tentacle: 1 }, floorBump: { 4: 2, 5: 2 } }, // 地下探索：巫師帽全隊強度 +、觸手帽全隊強度 +（要付理智）、紳士帽的技能檢定 +、倒立自己強度 +。手作坊的「地下效果」顯示（logic3.js cellarPartFx）也讀這裡。stack：比讚、巫師帽、觸手帽帶幾隻最多算幾份（決定 0109，翊文 11-16：比讚、巫師帽最多 2 份，觸手帽 1 份）；floorBump：疊加之後 B4、B5 強度檢定目標各 +2（已經寫進 content3.js 的目標，這裡只是記錄）
  limitedFx: { teamCap: 6, homeSeen: "avatar" }, // 限定帽子的探索加成：全隊強度加起來最多 +teamCap（決定 0085）；館內效果看館友證頭像那隻佩佩戴的帽子
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
    weekChips: 375000,                     // 這週七天都簽到（含補簽），另外送賭場籌碼（翊文 11-11：「簽到一週加送1500萬」）。伺服器發，要登入
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
  // 館內 NPC 的內容規則（11-14，docs/館內NPC規劃.md 步驟 3；內容在 content/npc/，檢查在 tools/npc_check.cjs）。這裡只放「內容能寫的範圍」，不碰股票、拍賣的程式。
  //   kinds：visitor 旅客、client 委託人、trace 劇情角色（只留痕跡、不算人數、不出價）；places：去哪（hall 展廳、五家店 food/bj/job/cellar/craft、bank 銀行、auction 拍賣）；
  //   likeThemes：展廳主題（HALL_THEME_BONUS 的 id）；likeRarity：畫的稀有度（尋常、少見、珍藏、孤品）；routeMax：route 每個地方的權重 0～routeMax。
  //   tiers：預算分級（單位：籌碼）。perDay 壹天最多花多少、max 單筆最多（出價、買畫），都落在那一級的範圍內，而且 max ≤ perDay；每個 NPC 的 perDay 不能跟別人壹樣
  //   （翊文：「每個 NPC 根據他是誰，可以拿的數目壹定不壹樣」）；數字取壹千的倍數。none 只給劇情角色（沒有錢）。全館壹天 NPC 買畫總額的上限在拍賣那壹步訂，不在這裡。
  //   arcNeed：故事線要全館的進度才往下走（不看個別玩家）：commissions 全館累計完成這位委託人的委託幾次、hallVisits 全館累計參觀展廳幾人次，n 的上限。
  npc: {
    kinds: ["visitor", "client", "trace"],
    places: ["hall", "food", "bj", "job", "cellar", "craft", "bank", "auction"],
    likeThemes: ["legend", "angry", "tears", "russia8", "rainbow", "hats", "pillows", "joy", "flat", "failed"],
    likeRarity: ["尋常", "少見", "珍藏", "孤品"],
    routeMax: 10, likesMax: 5, arcMax: 6,
    limits: { name: 12, note: 40, story: 60, arcText: 90, arcNews: 36 },
    tiers: {
      none: { label: "不帶錢", perDay: [0, 0], max: [0, 0] },
      drifter: { label: "路人", perDay: [20000, 200000], max: [10000, 150000] },
      modest: { label: "小資", perDay: [100000, 600000], max: [50000, 400000] },
      comfortable: { label: "小康", perDay: [500000, 1500000], max: [300000, 1000000] },
      collector: { label: "藏家", perDay: [1500000, 3000000], max: [1000000, 3000000] },
    },
    arcNeed: { commissions: 500, hallVisits: 5000 },
    // 展廳的旅客（11-14，shared/npc.js）：來的人照 route.hall 的權重從旅客和委託人裡抽（跟上壹位不同）；hallStory＝這壹位說自己的故事（現在這壹段的字，還沒有就說身分）的機率，其餘照舊留壹般的評語
    hallStory: 0.4, newsMax: 2,
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
    startChips: 10000000,   // 新玩家的籌碼（翊文 11-15：「新進玩家都給1000萬」，決定 0081 的 2.5 萬改掉）。舊程式裡沒有預設（錢包檔是手動建的）；20 個舊錢包裡有 3 個剛好是 1,000,000（沒動過的起始值），所以沿用
    minBet: 10,             // 等翊文：最小的注
    maxBet: 10000000,       // 等翊文：最大的注（舊的沒有上限，只看錢包）
    // 已知世界的池子（11-14，規劃 2.12，翊文：「已知世界也是個經濟體系，從那裏扣錢」）：house.world。start 起始、growBase 每天成長（再 ×（1 ＋ growExtPct% × 外部景氣）；真正憑空的，記 worldGrow）、
    //   lowPct 池子低於起始的幾 % 算吃緊；吃緊時 NPC 付錢（門票、拍賣）壹天最多付池子的 lowPayPct%，莊家向已知世界貸款暫停；賣股、槓桿賺的錢從海外（house.ext）付，不受這個限制（決定 0126）。
    // 世界文件（W2，決定 0086，shared/world.js）：gateway 館的對外帳戶（house.world）最多放多少，其餘放 world/main 的備用池；0 ＝ 關閉、不搬錢（W3 分帳時才開）
    //   W3 分帳（決定 0086）：已知世界的錢分成「各單位＋家計＋公共」（house.wu，只是帳上的分類，總和永遠等於 house.world）。household 家計占的比例（頂層單位的 share 在 content/world/units，公共＝剩下的）；
    //   sectorCoef 行業對景氣的敏感度：每天成長分給單位的權重 ＝ 比例 ×（1 ＋ 係數 × 景氣 b）。
    //   W5 連動：health 健康值 h ＝ clamp(1 ＋ 景氣 × 行業係數 ＋ 旗下股票週漲跌 × stockW, min, max)；週一換狀態：h ≥ cut 一般（預算倍率 1～upMax）、squeeze ≤ h ＜ cut 減薪、h ＜ squeeze 連續 squeezeWeeks 週緊縮／layoffWeeks 週裁員；mult 各狀態的預算倍率、floor 最低倍率、chgCap 股價週漲跌最多算多少
    //   W6 NPC 錢包：targetDays 錢包補到「今天預算 × 幾天」；joinWeeks 被裁員幾週內一定找到新工作；layoffPct 集團裁員時每位被裁的機率 %、findPct 被裁的每週找到新工作的機率 %
    //   NPC 理智（決定 0090）：start 初始值、daily 一天最多變多少（排程和換工作的事件不算）、cellar 去地下每次加減（一天最多 cellarMax）、food 去餐車、rest 完全沒來館、back 每天往 start 靠多少、lay 被裁、job 找到新工作；
    //   lowRoute 低於這個不去地下、lowStars 低於這個展廳評價少 1 顆星、lowBudget 低於這個預算 × budgetMult
    //   集團集體不安 unrest（決定 0091，理智值第二步）：0～100（高＝不安），預設 start；換狀態那天推一下（cut／squeeze／layoff／normal），每天往 start 靠 back；旗下 NPC 理智的自然回復：不安 ≥ slow 就停、≥ reverse 反過來每天 −1；
    //   散客展廳氣氛 mood（無狀態，每天重算）：base ＋ b × 景氣 ＋ san × (NPC 平均理智 − 70) ＋ trouble × (減薪以上的集團數) ＋ 週末 weekend，夾 0～100
    //   壞消息推不安 downPush：世界市場新聞 tone=down、ref 指到某集團旗下的股票，那個集團不安 +這麼多（壹個集團壹天最多壹次）；排程事件的上下限（week_check 也擋）：san ±sanMax、unrest ±unrestMax、mood ±moodMax
    //   散客類型權重 crowd（決定 0092 第 3 件）：昨天的展廳氣氛 ≥ high：這幾種散客組比較多（乘上這個倍數）；≤ low：另外幾種。只改「抽到哪種組」的機率，每天幾組、幾點到、待多久不變。人數的期望值變動由 econ:check 擋（±20% 內）
    // 館門口池子的水位（決定 0132，翊文 11-19）：跟著被文化部資助那位館友的淨值動。目標水位 ＝ clamp(start ＋ (1−start)×ln(淨值÷起點)÷ln(xT)，min，1)（淨值長到起點的 xT 倍＝門檻 1）；每天 05:00 日報算壹次、最多動 step；連續 confirm 個日報目標 ≥ 1 才到門檻，那晚全館看得到事件，隔天天亮前收完（只收東西、不收錢，劇情定）水退回 start、起點重設。
    //   trace 留幾天的漲退痕跡、grid 水位量化成幾格（peek 給畫面）
    // 門檻那晚收走一個名字（決定 0133）：被收走的佩佩名字變空白名牌，名牌背面是館友號碼（加入順序）；信一年後過期
    poolTake: { on: true, expireDays: 365 },
    pool: { xT: 1.5, start: 0.6, min: 0.1, step: 0.03, confirm: 3, trace: 7, grid: 24 },
    // 文化部資助一位館友（決定 0131，翊文 11-19）：只一次、不是借款。錢從文化部（已知世界的 u-culture）出，記 cultureGift；暱稱比對照 fb 的 player-invest（去空白、小寫）；信在 shared/casino_text.js 的 CAS_GIFT。on:false 關掉
    cultureGift: { on: true, id: "moc-yuga-2026-11", nicks: ["YUGa Chu"], amt: 1000000000, days: 365 },
    // 佩佩銀行跟賭場分開（決定 0130，翊文 11-19）：館友借款（新的）、館債、存款利息改由準備金 house.gb 出錢；賭場、股票留在莊家。舊借款（9.85 億）留在莊家照舊還給莊家。
    //   on 總開關；reservePct 放款留的準備率；gdepKeepPct 集團存款留幾 %（會被領）；hdepW 莊家的錢超過這個，超過的部分每天存進 gb（hdep）；hdepRate hdep 的利息 %／天；
    //   hdepLow 莊家低於這個才可以領回 hdep，每天最多 gb 多餘現金的 hdepOutPct%；sweepHousePct 盈餘（利息淨收入）給莊家的 %，其餘進博物館資金；bondMove 一次性：莊家搬給 gb 的舊館債本金。
    bankSplit: { on: true, reservePct: 20, gdepKeepPct: 70, hdepW: 150000000, hdepRate: 0.012, hdepLow: 30000000, hdepOutPct: 20, sweepHousePct: 30, bondMove: 2100000 },
    worldDoc: { market: { on: true, amp: 1.5, common: 0.9, commonSd: 0.05, visitK: 0.35, visitLo: 0.6, visitHi: 1.4, spendK: 0.3, spendLo: 0.7, spendHi: 1.3, solace: ["c-late", "c-postman", "c-tourist", "v-dancer"], solaceK: 0.2, moodK: 40, realCap: 20 }, /* 決定 0121：景氣分市場。amp 真實漲跌放大倍數（翊文 11-17 選 1.5）；visit／spend 來館頻率、花錢意願的 k 和範圍；solace 景氣差時反而來館解悶的 NPC（id 清單）；moodK 散客組數照展廳氣氛（氣氛 50 ± 50 → ±moodK%）；realCap 真實單日漲跌夾 ±%（防資料錯誤） */ crowd: { high: 60, low: 30, mult: { high: { "帶小孩的家庭": 1.3, "旅行團": 1.3 }, low: { "獨自看展的人": 2, "兩位朋友": 1.3, "旅行團": 0.7 } } }, events: { downPush: 2, sanMax: 10, unrestMax: 15, moodMax: 20 }, unrest: { start: 20, back: 2, cut: 3, squeeze: 5, layoff: 8, normal: -5, slow: 60, reverse: 80 }, mood: { base: 50, b: 20, san: 0.3, trouble: -5, weekend: 5 }, branch: { on: true, segStart: "2026-11-16", segDays: 14, histDays: 7, minDays: 3, recoverN: 2, perUidNpc: 3, netUidNpc: 3, perUid: 10, perNpc: 6, delta: { win: 1, blackjack: 1, lose: -1, loseRow: -2, bust: -2, jobDone: 1, jobFail: -1 } }, san: { start: 70, daily: 10, cellar: -2, cellarMax: -4, food: 1, rest: 3, back: 1, lay: -8, job: 5, lowRoute: 30, lowStars: 50, lowBudget: 30, budgetMult: 0.9 }, wallet: { on: true, targetDays: 2, joinWeeks: 4, layoffPct: 30, findPct: 25 }, trade: { on: true, live: true, wealthW: 5, dCap: 0.2, loan: { pct: 3, ratePct: 0.02, repayH: 0.95, finPct: 10 }, goods: [{ from: "g-daily", to: "g-overseas", pct: 20 }, { from: "g-overseas", to: "g-island", pct: 10 }], revPct: 0.5,
      // 集團之間的往來（決定 0127，翊文 11-18：往來要熱絡、×1.5）：flows 每筆「付款方 from 每天付池子的 pct% 給收款方 to」，種類 k 是金流圖的名字；份量用最小二乘法調成每個單位名目上收＝付（tools/world_trade_sim.cjs --emit），
      //   實付 ＝ 池子 × pct% × 付款方預算倍率（whMult：一般 1～1.1、減薪 0.8、緊縮 0.5、裁員 0.3）×（1 ＋ bK × 景氣）、最多付它現有的。flowDefault：名單上有、表裡沒寫的集團（新增、拆分的）照這個預設付。
      flows: [
      { k: "tradeDaily", from: "g-arts", to: "g-daily", pct: 0.0569 }, { k: "tradeDaily", from: "g-school", to: "g-daily", pct: 0.0657 }, { k: "tradeDaily", from: "g-finance", to: "g-daily", pct: 0.0285 }, { k: "tradeDaily", from: "g-island", to: "g-daily", pct: 0.0135 }, { k: "tradeDaily", from: "g-overseas", to: "g-daily", pct: 0.0017 }, { k: "tradeDaily", from: "g-public", to: "g-daily", pct: 0.0484 }, { k: "tradeDaily", from: "u-culture", to: "g-daily", pct: 0.0328 },
      { k: "tradeFee", from: "g-daily", to: "g-finance", pct: 0.0348 }, { k: "tradeFee", from: "g-overseas", to: "g-finance", pct: 0.0192 }, { k: "tradeFee", from: "g-island", to: "g-finance", pct: 0.0213 }, { k: "tradeFee", from: "g-arts", to: "g-finance", pct: 0.0199 }, { k: "tradeFee", from: "g-school", to: "g-finance", pct: 0.0152 }, { k: "tradeFee", from: "g-public", to: "g-finance", pct: 0.0198 },
      { k: "tradeResearch", from: "g-island", to: "g-school", pct: 0.0134 }, { k: "tradeResearch", from: "g-overseas", to: "g-school", pct: 0.0158 }, { k: "tradeResearch", from: "g-daily", to: "g-school", pct: 0.0099 }, { k: "tradeResearch", from: "g-finance", to: "g-school", pct: 0.0113 },
      { k: "tradeDesign", from: "g-daily", to: "g-arts", pct: 0.0075 }, { k: "tradeDesign", from: "g-finance", to: "g-arts", pct: 0.0095 }, { k: "tradeDesign", from: "g-island", to: "g-arts", pct: 0.0093 }, { k: "tradeDesign", from: "g-overseas", to: "g-arts", pct: 0.0084 }, { k: "tradeDesign", from: "g-school", to: "g-arts", pct: 0.0136 }, { k: "tradeDesign", from: "u-culture", to: "g-arts", pct: 0.0405 },
      { k: "tradeTax", from: "g-daily", to: "g-public", pct: 0.0362 }, { k: "tradeTax", from: "g-finance", to: "g-public", pct: 0.0345 }, { k: "tradeTax", from: "g-island", to: "g-public", pct: 0.0206 }, { k: "tradeTax", from: "g-overseas", to: "g-public", pct: 0.0232 }, { k: "tradeTax", from: "g-arts", to: "g-public", pct: 0.0132 }, { k: "tradeTax", from: "g-school", to: "g-public", pct: 0.0077 },
      { k: "tradeSubsidy", from: "g-public", to: "g-school", pct: 0.0445 }, { k: "tradeSubsidy", from: "g-public", to: "g-arts", pct: 0.0197 }, { k: "tradeSubsidy", from: "g-public", to: "u-culture", pct: 0.0250 }, { k: "tradeSubsidy", from: "g-public", to: "g-daily", pct: 0.0358 },
      { k: "tradeTech", from: "g-finance", to: "g-island", pct: 0.0321 }, { k: "tradeTech", from: "g-arts", to: "g-island", pct: 0.0412 }, { k: "tradeTech", from: "g-school", to: "g-island", pct: 0.0305 }, { k: "tradeTech", from: "g-public", to: "g-island", pct: 0.0693 }, { k: "tradeTech", from: "g-island", to: "g-overseas", pct: 0.0494 }, { k: "tradeTech", from: "g-public", to: "g-overseas", pct: 0.0376 },
      { k: "tradeHhGoods", from: "u-household", to: "g-daily", pct: 0.0860 },
      { k: "tradeHhTax", from: "u-household", to: "g-public", pct: 0.0712 },
      { k: "tradeHhFee", from: "u-household", to: "g-finance", pct: 0.0346 },
      { k: "tradeWage", from: "g-daily", to: "u-household", pct: 0.0226 }, { k: "tradeWage", from: "g-finance", to: "u-household", pct: 0.0245 }, { k: "tradeWage", from: "g-island", to: "u-household", pct: 0.0224 }, { k: "tradeWage", from: "g-overseas", to: "u-household", pct: 0.0225 }, { k: "tradeWage", from: "g-arts", to: "u-household", pct: 0.0203 }, { k: "tradeWage", from: "g-school", to: "u-household", pct: 0.0264 }, { k: "tradeWage", from: "g-public", to: "u-household", pct: 0.0553 }, { k: "tradeWage", from: "u-culture", to: "u-household", pct: 0.0144 }
      ], flowDefault: [{ k: "tradeDaily", to: "g-daily", pct: 0.04 }, { k: "tradeFee", to: "g-finance", pct: 0.025 }, { k: "tradeTax", to: "g-public", pct: 0.025 }], bK: 0.5,
      // 佩佩銀行當集團的銀行（決定 0127）：準備金 house.gb（跟莊家分開）。存款：狀態一般的集團，帳上超過池子 depFloor（比例）的部分存 depShare%，存款上限池子的 depCap%；狀態不好就領回（每天 1/3）。
      //   放款：狀態不是一般的集團（文化部不借）借池子的 loanPct%；銀行最多放出準備金的 (100 − reservePct)%；準備金不夠就向博物館資金借（累計最多博物館資金的 budgetMax%，利息 debtRate%／天，有錢就還）。利息：存款 depRate%／天由博物館資金付、放款 loanRate%／天集團付進博物館資金。
      bank: { on: true, depFloor: 0, depShare: 80, depCap: 8, loanPct: 15, reservePct: 20, depRate: 0.012, loanRate: 0.02, budgetMax: 30, debtRate: 0.01 } }, // 決定 0117 之後：集團之間的交易（帳上搬 house.wu.adj）。wealthW：帳上的錢比「照比例應有的」多或少（dCap 夾住）每 1（＝100%）讓健康值多或少幾；loan：週一狀態不是一般的集團跟金融集團借自己池子的 pct%，每天利息 ratePct%，健康值（不含借款）回到 repayH 以上才還，金融集團最多借出自己的 finPct%；goods：每天貨款＝來源集團今天分到的成長 × pct% × 健康值（海外付島上科技是 B2 的對沖）；revPct：每週旗下股票漲跌 × 單位池子的這個 %，公共 ↔ 單位
      health: { min: 0.6, max: 1.2, stockW: 0.5, chgCap: 0.3, cut: 0.9, squeeze: 0.75, squeezeWeeks: 2, layoffWeeks: 4, mult: { cut: 0.8, squeeze: 0.5, layoff: 0.3 }, upMax: 1.1, floor: 0.3 }, gateway: 0, household: 0.1, sectorCoef: { tech: 0.3, finance: 0.15, arts: 0.1, daily: 0, school: -0.05, public: -0.1, story: 0 } },
    world: { start: 10000000000, expand: 90000000000, growBase: 5000000, growYoy: true, growExtPct: 20, // 決定 0117：expand 一次性加進已知世界（每個莊家文件壹次，記 mint.worldExpand）；growYoy：每天成長 ＝ max(growBase, 池子 × max(0, GDP 年增率%) ÷ 100 ÷ 365)，不再乘景氣 b（growExtPct 留著當舊算法）
      lowPct: 10, lowPayPct: 1 },
    // 館方投資海外（11-14，規劃 2.8f 第五節、決定 0074）：shared/casino_invest.js。莊家 bankroll 超過 reserve 的部分、博物館資金超過 budgetKeep 的部分，每天投 dailyPct%（×（1 ＋ extPct% × 外部景氣））；
    //   持股成本合計 ≤ 超過部分的 holdCapPct%；七成（topPct）買最近 lookback 天漲最多的 topN 支、evenPct 平均、randPct 隨機壹支；比成本跌 stopLossPct% 賣壹半、漲 takeProfitPct% 賣三分之壹；
    //   持股總賺賠虧超過 stopPct% 暫停買進 stopDays 天。on:false 整個關掉
    invest: { on: true, reserve: 100000000, budgetKeep: 500000000, dailyPct: 3, extPct: 50, holdCapPct: 30, mode: "even", dip: { days: 20, pct: 5, mult: 3, minDays: 5 }, topN: 2, topPct: 70, evenPct: 20, randPct: 10, lookback: 3, stopLossPct: 0, takeProfitPct: 0, stopPct: 25, stopDays: 7 }, // 決定 0099：mode even ＝ 每天平均買全部、價格比自己 20 天均價低 5% 以上的那幾支加碼 ×3，不追高、不停損停利（0 ＝ 關）；mode chase ＝ 舊的（追最近 lookback 天漲最多的 topN 支）
    // 新玩家的起始籌碼是文化部補助（決定 0082）：從已知世界池子搬、來源記 cultureStart，不再憑空。on:false ＝照舊憑空給。maxPlayers：全館最多補助幾位（池子吃緊時只補付得出的部分）
    culture: { on: true, name: "文化部" },
    // 世界集團的股票（決定 0121，shared/casino_stock_grp.js）：名單 listed 的集團發股。資本額 ＝ 池子 × capMult；基本價 ＝ 每股淨值 × pb ×（1＋healthW×(h−1)）×（1＋marketW×市場景氣）；推價 depthPct（買 1% 股本推約 5%）、半價差 half、漲跌停 dayLim、每 15 分鐘 tickLim；
    //   （決定 0122：拿掉持股上限；壹人壹天 80%、莊家庫存 100%）壹人壹天 dayVolPct%、莊家庫存 makerCapPct%；每週一：現金股利（池子成長 × payoutPct%）、增資（吃緊、hBelow、莊家要留 keep）、庫藏股（健康、價格低於基本價 discPct%）、股票股利（價格 ≥ stockDivPx）、分割（價格 ≥ splitPx）
    gstock: { on: true, cover: { pct: 50, max: 200000000 }, capMult: 2, p0: 100, pb: 2, floor: 1, ticks: 75, half: 0.01, depthPct: 20, tickLim: 3, dayLim: 10, revert: 0.1, sd: 0.004, healthW: 0.5, marketW: 0.1, dayVolPct: 80, makerCapPct: 100, payoutPct: 30,
      raise: { pct: 5, discPct: 5, hBelow: 0.9, keep: 100000000 }, buyback: { pct: 2, premPct: 2, hAbove: 1.05, discPct: 90, maxPoolPct: 2 }, stockDivPx: 250, stockDivPct: 5, splitPx: 500, splitK: 2 },
    houseStart: 100000000,  // 莊家一開始有多少（舊的錢包檔是手動建的，數字不抄；這個是新定的）
    houseReset: 10000000,   // 莊家破產中（小於 0）過了換日，Yuga 借他這麼多重新開張
    // 換日印錢補莊家先關掉（翊文 11-14：莊家 −8.3 億，換日會印 8 億多補回來，「這不行，莊家要跟整個經濟系統接軌才行」）。
    // false＝莊家破產就停在負的，不印錢；接軌的做法（跟館方或已知世界借、要還）設計好再改。
    houseResetMint: false,
    // 莊家跟整個經濟接軌（規劃 2.11，翊文 11-14「好這三次都做」）：破產過了換日不印錢，改借錢、記債、用賺的錢還。
    //   reserve 重開補到多少；先跟博物館資金借（博物館資金超過起始的 budgetKeepPct% 的部分，借 budgetPct%，一次最多 budgetMax），不夠再跟已知世界貸款
    //   （上限 ＝ max(creditMin, creditDays × 館內 GDP 每天) ×（1 ＋ creditExtPct% × 外部景氣）；每天利息 interestPct%，記在債上）；
    //   還債：換日時莊家超過 reserve 的部分，repayPct% 拿去還（先博物館資金、再文化部借款、最後已知世界，已知世界的本金加利息燒掉）。
    houseLoan: { on: true, cultureInterestPct: 0.02, cultureDue: "2027-01-12", cultureExtDays: 60, cultureKeep: 500000000, cultureBankMin: 150000000, fix: { on: true, amt: 32796492 }, // 決定 0118：11-17 換日莊家付了這期館債 32,796,492（0116 之前的規則），照新規定該由博物館資金付：一次性補撥（house.cFix 擋重複；只在 house.cul 記的那天、那筆金額剛好對得上時才做）
        // 決定 0116：館債分期先由博物館資金付（守 cultureKeep），不夠的莊家超過 cultureBankMin 的部分才付；展延 30 → 60 天。 到期日剩下的自動展延壹次 cultureExtDays 天（決定 0097，之後不再設到期日）；博物館資金墊付不得讓它低於 cultureKeep（＝NUM.casino.invest.budgetKeep）
       // 文化部館債（翊文 11-14：30 天 → 「借久一點 60 天」，從 11-13 撥款起算到 2027-01-12）：到期日；每天至少還 剩餘本息 ÷ 剩下天數，不夠由博物館資金墊，再不夠記逾期
       reserve: 10000000, budgetKeepPct: 50, budgetPct: 10, budgetMax: 50000000, creditDays: 20, creditMin: 10000000, creditExtPct: 20, interestPct: 0.05, repayPct: 50 },
    // 莊家破產／吃緊的時候限制流出（規劃 2.11 第二點）：不是處罰玩家，是不讓莊家掉得更深。贏的錢不收回。
    //   吃緊（0 ～ health.low）：最大注 max(betMin, 莊家的錢 × betTightPct%)、壹天總賠付（21 點贏的＋大禮包）≤ 莊家的錢 × payTightPct% ＋ payFlat、壹包最多賠 max(drawFlat, 莊家的錢 ÷ 2)
    //   破產（≤ 0）：最大注 betBroke、壹天總賠付 ≤ payBrokeFlat、壹包最多賠 drawFlat。betMult：壹手最多可能賠幾倍的注（雙倍、分牌），用來算這手會不會超過今天的額度
    risk: { betTightPct: 2, betMin: 1000000, betBroke: 1000000, payTightPct: 5, payFlat: 5000000, payBrokeFlat: 5000000, drawFlat: 5000000, betMult: 3 },
    // 已知世界壹次撥給莊家的錢（翊文 11-13：「先編個理由，比如文化部補助博物館從世界經濟撥給10億給博物館」）。
    // 每個 id 只撥壹次（記在 house.grants），記成館外進來（casHouseMint，來源 grant），日報「從館外進來」看得到。
    // 11-14 翊文：「好，那改成文化部借款」：記成債（house.debt.culture，不計利息），莊家超過準備金的部分拿去還（先博物館資金、再這個、最後已知世界貸款），還的時候燒掉。
    grants: [{ id: "moc-2026-11", amt: 1000000000, name: "文化部借款" }],
    // 跟 Yuga 借錢（決定 0064，取代原本的免費救濟）：每筆固定利息、幾天內要還、額度準時還清就提高。規則在 shared/casino_wallet.js 的 casBorrow、casRepay、casLoanRoll
    // 財經專員（決定 0093 第 3 件，shared/casino_advisor.js）：欠了不少錢（錢包是負的，或沒還的借款本金加利息 ≥ minOwe）的館友，銀行頁出現專員提還款計畫。
    // 借款延期：每筆最多 maxExt 次、還沒到期才行，到期日多 extendDays 天，手續費 feePct% 加進要還的錢。手續費換算成每天的利率要不低於借款本身（econ:check 守）。resendDays：好起來之後又欠了，隔幾天可以再寄信。
    advisor: { minOwe: 1000000, extendDays: 3, feePct: 5, maxExt: 1, resendDays: 7 },
    loan: {
      limit: 25000,         // 壹開始的額度（沒還的本金加起來不能超過）。翊文 11-10：「借款最高可以100萬」，問答選「壹開始就能借 100 萬」
      limitPct: 50,         // 準時還清壹筆，額度多 50%（翊文 11-10：「改成多20%」→「50% 好了」；以前是固定 +20 萬）。沒有上限，無條件進位到整數
      latePct: 10,          // 到期沒還被扣壹次，額度降這麼多 %（翊文 11-10：「額度退回 100 萬……這個不要，只要降10%就好」）。無條件捨去，可以降到 100 萬以下
      repayAfterMin: 15,    // 借了幾分鐘之後才能還（翊文 11-10：「每筆要一天之後才能還」→「改成至少 15分鐘後才能還」）。時間照伺服器的
      interestPct: 9,       // 利息：每筆固定 9%（借 10 萬還 10.9 萬，提早還也是）。翊文 11-15：「借款利息調低一點，改成一個禮拜內還款完」：10% 3 天 → 9% 7 天（換成壹週是 23% → 9%；不能再低：館債最高壹週 8%，借款要比館債高，借錢買館債才不會賺）
      days: 7,              // 第 D 天借的，第 D+7 天結束前要還；第 D+8 天還沒還就從籌碼直接扣，扣到負的也扣
      min: 250,             // 壹次最少借多少
      // 額度上限和莊家的限制（規劃 2.11a，翊文 11-14「好」）：capMax 額度最多；levelPerDay 壹個人壹天最多升幾級（翊文 11-13：「那兩級好了」，100 萬到 2,000 萬大約 4 天；當天借當天還的不升）；
      // outPct／outMin：全館沒還的本金 ≤ max(outMin, 莊家的錢 × outPct%)；借款要莊家的錢夠（莊家 ≤ 0 暫停）；欠款中（錢包是負的）額度鎖在 limit
      capMax: 20000000, levelPerDay: 2, outPct: 30, outMin: 5000000,
      // 部分還款、分期（決定 0114，翊文 11-17）：part ＝ 部分還款（先還利息、再還本金；一次最少 max(minAbs, 剩下 owe 的 minPct%)；每筆最多 max 次；部分還不升信用）；
      //   split ＝ 把一筆改成 kMin～kMax 期、每期間隔 gMin～gMax 天（最晚多 gMax×(kMax−1) ≤ 21 天）；本金 ≥ minAmt、借了 minAgeDays 天以上、沒延期過；
      //   手續費 ＝ 延後那一期的本金 × 借款日利率（interestPct ÷ days）× 延後天數；on ＝ false 整個關掉（翊文 11-17：拿掉「莊家現金低就暫停」的條件，只留總開關）
      part: { minAbs: 1000, minPct: 5, max: 8 },
      split: { on: true, kMin: 2, kMax: 4, gMin: 3, gMax: 7, minAmt: 100000, minAgeDays: 1 },
      quick: [2500, 7500, 12500], // 畫面上的快速按鈕（另外有「借滿」）：額度太小、quickPct 算不出來時才用這組
      quickPct: [10, 25, 50],     // 快速按鈕照額度的幾 %（11-15，翊文：額度 300 萬時按鈕還是 2,500 太小「好改」）；shared/casino_wallet.js casLoanQuick 取成 1、2、3、5 開頭的整數
      discord: 2500,        // Discord 的 /pepe-借錢 沒有參數，壹次借這麼多（額度不夠就借剩下的）
      maxOpen: 10,          // 同時最多幾筆沒還
    },
    // 欠款送參觀者去地下工作（決定 0064 第二部分）。規則在 shared/casino_wallet.js 的 casWork*，參觀者那邊在 shared/visitors.js
    work: {
      payMax: 3000000,      // 每天最多還這麼多（規劃 2.11a：欠 3 億的人不能三天就印 3 億）。取 payPct% 和這個比較小的
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
    packWinOdds: 20,        // 贏一把最多 20% 機率多一張大禮包券（舊的 rottery(20)；要先開過今天的大禮包）
    packWinEvPct: 1,        // 決定 0070：機率照下的注，抽到的券平均值是注的 1%（下 1,000 萬約 5.8%；下 100 幾乎抽不到）
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
    // budgetStart：拚經濟的錢從「博物館資金」進出（翊文 11-10：「先設定一個地方，讓它其實從那邊扣錢，這個之後怎麼接上其他的，我們再討論」）。存在莊家同壹份（casinoHouse/main 的 budget）；先給這麼多，不夠可以是負的，只記帳不擋
    // Yuga Bot 銀行（11-13，翊文：「可以投資了」；shared/casino_bank.js，規劃玩法 2）。利息從莊家出，莊家 ≤ 0 不給
    //   savePct：活存每天 %（本金最多算 saveCap）；terms：定存的種類；houseCapPct：壹次最多付莊家的 %；catchup：太久沒來最多補幾天
    //   利率順序（測試擋）：活存 < 定存 < 借款（loan.interestPct／loan.days），借錢來存不會賺
    bank: { savePct: 0.1, saveCap: 10000000, min: 250, quick: [2500, 25000, 125000],
      terms: [{ days: 3, pct: 1 }, { days: 7, pct: 3 }], termMax: 3, termMin: 2500, termCap: 10000000, houseCapPct: 0.05, catchup: 30 },
    // 館債（11-13，shared/casino_bond.js，規劃玩法 3）：每週壹期，利率照莊家的錢（bankroll ÷ houseStart 的 %）由好到壞；壹張 unit；
    //   壹個人每期最多 perUser、帳號要開了 minAge 天；有憑證的話，莊家回到起始的 iouAtPct% 以上補付。
    //   利率順序（測試擋）：定存 7 天 < 館債最低的壹週 < 借款（loan.interestPct／loan.days ×7）
    bond: { unit: 100000, perUser: 5000000, minAge: 3, iouAtPct: 50,
      tiers: [{ fromPct: 50, pct: 4, cap: 20000000 }, { fromPct: 10, pct: 6, cap: 30000000 }, { fromPct: 0, pct: 8, cap: 50000000 }] },
    // 股票槓桿、放空、當沖（11-14，shared/casino_stock_lev.js；規劃 2.8b、2.8d、2.8e、2.8f、2.8j；規則先做，還沒接到伺服器和畫面）。
    //   maxLev 各市場最多幾倍（0 ＝ 不開放；美股 11-14 翊文決定開，照信用解鎖，部位上限同台股）；maxLagMin 台股、美股真實行情落後超過幾分鐘就暫停「新開」（已開的、平倉、強平照常）；forcePct 剩下的保證金不到原本的幾 % 就強制平倉；
    //   levByCredit 信用等級對應的倍數上限 [[等級 ≥, 倍數], …]（翊文 11-14：「新手 2 倍，信用升級解鎖」；跟 maxLev 取小的，已開的部位不受影響）；
    //   interestPct 借的錢（部位 − 保證金）的利息 %，borrowPct 放空的借券費（占部位）%，手續費沿用 stock.feePct；
    //   opensDay 壹天最多開幾筆、coolMin 同壹檔平倉後幾分鐘內不能再開；
    //   posLimit 部位（做多＋放空合計）上限、profitCap 壹天當沖淨賺最多算多少，都乘 (1 ＋ stepPct% × 信用等級)；
    //   houseExposePct／houseFloor 莊家接館內股槓桿＋放空部位的上限（max(莊家的錢 × %, 保底)，莊家 ≤ 0 不接）；
    //   credit：ptsPerLevel 幾點升壹級、maxLevel 最高幾級、dayGain 壹天最多加幾點、lateLoss 借款逾期壹次扣幾點。
    stockLev: { maxLev: { in: 5, tw: 5, us: 5, grp: 5 }, maxLagMin: 3, levByCredit: [[0, 2], [2, 3], [4, 5]], forcePct: 50, interestPct: 0.15, borrowPct: 0.3, opensDay: 3, coolMin: 15,
      posLimit: 20000000, profitCap: 10000000, stepPct: 20, houseExposePct: 20, houseFloor: 3000000,
      credit: { ptsPerLevel: 5, maxLevel: 10, dayGain: 1, lateLoss: 3 } },
    // 館內五家店的股票（11-14，shared/casino_stock_in.js；規劃 2.8a、2.8b、2.8e、2.8g；翊文：營業 05:00～23:30、K＝0.03）：莊家當對手盤。
    //   start 起始股價、floor 最低；k 跳空倍率、moodPct 景氣漂移（%／天 × B）、noise 隨機 ±%、jumpCap 跳空最多 ±%、minPeople 昨天不到幾個不同的人不調價、
    //   minDays 有效日不到幾天不調、avgDays 平均前幾個有效日、histDays 留幾天的人數；盤中：from 開盤（分鐘，300 ＝ 05:00）、step 每幾分鐘一個價、ticks 一天幾個價（05:00～23:30 ＝ 75）、
    //   daySd 整天標準差 %、dayCap 夾開盤價 ±%；cap 每人每家最多持有幾股；exposeFloor 莊家接館內股的保底（規劃 2.8e）。手續費、賣出上限、全館淨賣出上限、exposePct 沿用 stock 的。
    // ramp（決定 0094）：盤中價格跟著到店的人數走的比例（1 ＝ 照 k 的斜率全部反映；0 ＝ 關掉，回到以前：人數只在 05:00 的跳空反映）。各房間的即時人數公開之後，看人數卡位賺不到（sim_peek_stock）
    stockIn: { ramp: 1, start: 10000, floor: 1, k: 0.03, moodPct: 0.3, noise: 1, jumpCap: 5, minPeople: 5, minDays: 3, avgDays: 7, histDays: 12,
      // NPC（規劃 2.8k、docs/館內NPC規劃.md 步驟 1、2）：每家店每天有 Poisson(npcLambda) 個 NPC 去逛（種子含伺服器祕密），算進昨天「不同的人」；NPC 最多占這家店人數的 npcShareMax%（館友太少就更少）；
      //   劇情日（week.json 的 npc）那天 NPC 多去 round(b × 前 7 個有效日的平均)，b 在 npcBoostMin～npcBoostMax 之間隨機（預期跳空 k×b ＜ 來回成本，預先進場賺不到；b 不能超過 0.33）
      // 突發大事件 C（翊文 11-14：不預告）：每家店每天有 npcBurstPct% 的機率突然多來 round(b × 前 7 個有效日的平均) 位旅客，b 在 npcBurstMin～npcBurstMax；
      //   事先不知道是哪天（種子有祕密），預先進場賺不到；事後日報寫「昨天餐車突然來了一大批旅客」
      // 預告的活動（翊文 11-14：「某店可能舉辦什麼活動，那天有機率進壹大批旅客」；week.json.fest，每週最多 2 天）：日報提前 festAhead 天預告，當天 festP 的機率真的辦成（種子有祕密，隔天 05:00 才知道），
      //   辦成就多來 round(b × 前 7 個有效日的平均) 位旅客，b 在 festMin～festMax；沒辦成照常。預先進場的期望報酬 ≈ K × festP × b（0.03 × 0.3 × 0.75 ≈ 0.68%）＜ 來回成本 1.04%。
      //   活動多來的旅客不算進平均（避免之後幾天股價被拉低、被放空賺走），見 casInRoll
      festP: 0.3, festMin: 0.5, festMax: 1.0, festAhead: 2,
      npcBurstPct: 0.3, npcBurstMin: 0.5, npcBurstMax: 1.0,
      // 營收也影響跳空（11-15，翊文：「店裡消費…反映在店家股價上」；決定 0087）：跳空 ＝ k ×（人數那項 × (1−revWeight) ＋ 營收那項 × revWeight）。營收 ＝ 昨天這家店的「客人花的錢」：館友的（每人每店每天最多算 revCap，館友自己砸錢推不動股價）＋ NPC 和散客的（house.npcs.shopBy）。
      //   平均用前幾個有效日（活動、突發多來的旅客照比例扣掉）；平均營收低於 revMinAvg、或有營收記錄的有效日不到 minDays 天：營收那項不算（只看人數）。
      revWeight: 0.5, revCap: 3000, revMinAvg: 10000,
      npcLambda: 2, npcShareMax: 40, npcBase: 120, npcWalk: 6, npcBoostMin: 0.15, npcBoostMax: 0.30,
      from: 300, step: 15, ticks: 75, daySd: 2, dayCap: 5, cap: 1000, exposeFloor: 10000000,
      // 真的市場（決定 0113，翊文 11-17 選 B「純買賣推價」）：on 開關（關掉就是舊的：伺服器祕密算好的隨機曲線）。
      //   Ns 每家發行股數（資本額 ＝ Ns × 價）；depth 淨買 depth 股價格漲 e 倍（每個價 ln 價 += 淨買股數 ÷ depth）；
      //   旅客、散客照該店「這個價到店的人數」每位下 1 單，平均約 size 股（最多 sizeCap）；個性：基本面 mixF（買賣機率隨價格偏離「合理價」連續變化，band ＝ 偏離多少一面倒）、
      //   追漲殺跌 mixC（看最近 8 個價）、其餘雜訊；合理價 ＝ 原本 casInRoll 算的每天的價（H.open），只活在旅客心裡，不直接決定價格；
      //   tickLim 每個價最多動多少、dayLim 每天最多離當天開盤（昨天收盤）多少；half 造市商半個價差（旅客散客付的，館友買賣也付）；rho 造市商每個價把持倉的幾 % 回補給已知世界；
      //   walkSd 價格自己的小雜訊；floatCap／floatShort 旅客散客合計最多持有／賣空發行股數的幾 %。
      mkt: { on: true, Ns: 100000, depth: 16000, size: 40, sizeCap: 40, band: 0.01, mixF: 0.7, mixC: 0.1, tickLim: 0.03, dayLim: 0.1, half: 0.01, rho: 0.05, walkSd: 0.0003, floatCap: 0.1, floatShort: 0.02 } },
    // 股票（11-14，銀行第三步，shared/casino_stock.js；數字由數值平衡訂，規劃 2.8a 節）。這壹步只做館外七支
    //   start 起始股價、floor 最低、outCap 館外壹天最多漲跌 %、drag 每天再扣 %（真實股市長期往上漂，不扣的話抱著就賺）
    //   feePct 手續費（進博物館資金）。停盤：每支只在自己的盤中交易（台股 tw、美股 us，見下面），盤外都停（11-14 規劃 2.8i 起，不再有全館 22:00～05:00 的停盤）
    //   exposePct 全館持股總市值最多是莊家的幾 %、sellDay 壹人壹天賣出上限、netSellPct／netSellFlat 全館壹天淨賣出上限
    stock: { start: 10000, floor: 1, outCap: 10, drag: 0.04, feePct: 0.5, taxPct: 0.3, taxUs: 0, div: { taxTw: 30.11, taxUs: 30, keep: 45, snapDays: 12 }, // div 配股息（決定 0112，翊文 11-17）：taxTw 台股股利所得稅率 %（分離 28% ＋ 二代健保 2.11%）、taxUs 美股預扣 %，進政府帳；keep 事件留幾天；snapDays 錢包留幾天的「每天開始時的持股」
    // taxPct 證交稅（決定 0111，翊文 11-16：取代資本利得稅 5%）：台股、館內股「賣出」都收賣出金額的 taxPct%，無條件進位、最少 1，進政府帳（搬，不是 burn）；taxUs 美股（0＝不收，貼近真實）；槓桿不收
     
      // sellMultByCredit：壹天賣出上限（sellDay）隨信用等級的倍數 [[等級 ≥, 倍數], …]（決定 0093，翊文 11-15：「賣出上限隨信用等級」；0 級 ×1、2 級 ×2.5、4 級 ×5）。館內股的全館淨賣出上限（netSellPct、netSellFlat）照舊，守住莊家
      sellMultByCredit: [[2, 2.5], [4, 50]],
      exposePct: 70, sellDay: 20000000, netSellPct: 5, netSellFlat: 5000000,
      // 限價單、停損單（11-14，規劃 2.8c，只做現股）：max 同時最多幾張、perStock 同一支最多幾張、days 有效天數（含下單那天算第 1 天，最後一天 22:00 停盤時取消）、cancelDay 一天最多取消幾次
      order: { max: 10, perStock: 3, days: 1, cancelDay: 20 }, // days：有效到下壹次價格變動（翊文 11-13：「應該每張單有效 1 天 跟真實的依樣」）
      // 台股真實成分 X（規劃 2.8d）：伺服器量到的行情落後分鐘數 ≤ lag 就用這個 x（由小到大找第一個符合的）；落後越久，看盤的人領先越多，真實成分就要壓低
      twX: [{ lag: 5, x: 0.4 }, { lag: 20, x: 0.3 }, { lag: Infinity, x: 0.25 }],
      // 照真實股價的比例（11-14，規劃 2.8h，翊文「美股×4、台股×24」「可以（拉回）」）：遊戲價 ＝ 倍數 × 真實價。第壹次換日時把價位換成這個比例（持股照比例換股數、市值不變）；
      //   之後每天開盤把遊戲價往「倍數 × 真實價」拉回 lamPct% 的差距，壹天最多拉回 2 × feePct − 0.04（%）：拉回量小於來回手續費加 drag，看盤的人收盤前知道方向也賺不到（test/sim_peg.cjs）
      peg: { us: 32, tw: 1, lamPct: 30 },
      // 直接用真實價（11-14，規劃 2.8l，翊文：「維持，直接用真實價即時成交」）：direct 開＝遊戲價 ＝ 倍數 × 真實價（每分鐘抓、即時成交；下面的錨點、橋、拉回、drag 都不用，測試設 false 走舊的）。
      //   staleMin 超過幾分鐘沒有新的真實價，這支暫停買賣（價停在最後一個價、標「未更新」）；holdPct 每天換日，持股市值的這個 % 從錢包搬進博物館資金（持有成本，取代 drag；%）。
      //   換比例零頭 stockRebase 照舊。真實價的合理範圍 sane（相對前壹收盤的倍數）：超出的當壞資料不收
      direct: true, staleMin: 3, holdPct: 0.04, sane: [0.5, 2],
      // 台股盤中（11-14，規劃 2.8d，shared/stocks_tw.js）：from／len 開盤、收盤（台灣時間 09:00 起算的分鐘，09:00～13:30 ＝ 0～270）；seg 幾分鐘壹個真實錨點；
      //   giveUp 開盤後超過幾分鐘還沒抓到第壹個價，當天不開；retry 錨點時間過了幾分鐘內重抓，再抓不到這壹段真實成分當 0；
      //   minSd 兩個錨點之間每分鐘隨機走的標準差 %；band 夾在前壹收盤 ±幾 %（台股漲跌停）；sd15 各股 15 分鐘標準差 %（規劃 2.8d 第 3 節的真實資料）
      // noOpenIdx：台股 13:25（第 265 分鐘）起不能新開槓桿、放空（收盤集合競價那五分鐘，翊文 11-14）；13:30 用官方收盤價平倉（收盤後再抓壹次，twNeed 的 fin）
      tw: { noOpenIdx: 265, from: 540, len: 270, seg: 15, giveUp: 30, retry: 3, minSd: 0.1, band: 10,
        sd15: { islandforge: 0.26, handbrain: 0.61, bigassembly: 0.34, trianglepower: 0.61, linetower: 0.3, brainrack: 0.31, cloudcabinet: 0.55, customchip: 0.64, voltgrid: 0.5, wavefreight: 0.3, ironwing: 0.33, plugstation: 0.37, pillpot: 0.4, needlelab: 0.43, towerbeam: 0.34, coilelder: 0.35 } },
      // 美股盤中（11-14，規劃 2.8i）：跟台股同一套模型。open 開盤是美東當天 00:00 起算的分鐘（570 ＝ 09:30；日光節約由 shared/stocks_tw.js 的 usOpenMs 用 Intl 算），len 390 ＝ 09:30～16:00；
      //   band 夾在前壹收盤 ±10%（美股沒有漲跌停，這是遊戲自己的「壹天最多 10%」，跟 outCap 壹樣）；
      //   sd15 各股 15 分鐘標準差 %、minSd 兩個錨點中間每分鐘隨機走的標準差 %：都是 2026-11-13 抓 Yahoo 過去壹個月的 15 分鐘價算的（盤中，不含隔夜跳空）；minSd ≈ sd15 ÷ 4
      // earlyLen：美股提早收盤日（13:00 美東收，壹年約 3 天：感恩節隔天、聖誕夜、7 月 3 日；shared/stocks_tw.js 的 usEarlyClose）那天盤中有幾分鐘（570 → 780 ＝ 210）
      us: { open: 570, len: 390, earlyLen: 210, seg: 15, giveUp: 30, retry: 3, band: 10,
        minSd: { greeneye: 0.09, redclaw: 0.15, nightindex: 0.05, silverapple: 0.05, flashcar: 0.09, squarewin: 0.06 },
        sd15: { greeneye: 0.37, redclaw: 0.62, nightindex: 0.19, silverapple: 0.19, flashcar: 0.37, squarewin: 0.26 } } },
    econ: { perDay: 3, rMax: 100, winAbove: 30, winPer: 30000, losePer: 10000, ticketPct: 8, lootPct: 55, budgetStart: 1000000000, freezeKeep: 20, budgetFloor: -100000000 }, // freezeKeep：博物館資金 ≤ 0（預算凍結）時，成功只撥平常的幾 %（11-13，沒錢就不再印錢；100 ＝ 不凍結）
    // 參觀者門票（11-13，翊文同意方向，規劃玩法 11、2.6 節）：展廳每來一位付 評分×perScore 籌碼；展廳主分紅 ownerPct%、博物館資金 budgetPct%、其餘進修繕基金；每人每天最多 perDay 位付。先照這樣，等翊文
    // NPC 來館花錢（11-14，shared/npc_spend.js，翊文：「要」）：on 開關；ticket 每位到館的 NPC 付壹張門票（不分紅給玩家：ticketBudgetPct% 進博物館資金、其餘修繕基金）；
    //   shopPct 去的每家店花 perDay 的幾 %（餐車、牌桌進莊家，委託櫃台、地下收藏庫、手作坊進博物館資金）；dayPct 每位 NPC 壹天最多花 perDay 的幾 %（連門票）；
    //   dayCap 全館壹天最多（×（1＋extPct%×景氣）），hallLambda 展廳壹天平均來幾位 NPC。都從已知世界池子搬
    //   npcWeights：有名字的 NPC 第壹站幾點到的比重（05:00 起每小時壹個；白天晚上平均，00:00～04:00 少但有，翊文 11-14「深夜也要有人」）
    npcSpend: { on: true, npcWeights: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.3, 0.3, 0.3, 0.3, 0.3], ticket: 500, ticketBudgetPct: 30, shopPct: 3, dayPct: 10, dayCap: 1500000, extPct: 20, hallLambda: 24, hallStay: [60, 180], shopStay: [30, 120],
      // 不具名的散客（翊文 11-14：「不具名的也可以有一些」「散客要付門票」）：每天 groupsDay 組（週末 ×weekendMult）、壹組幾位看類型；只在展廳、待 stay 分鐘；到的時間午後和晚上多（weights）。
      //   ticket 每位散客付的門票（已知世界付，ticketBudgetPct% 博物館資金、其餘修繕基金）；dayCap 全館散客門票壹天上限（要 ≤ 已知世界每天成長的 10%，econ:check）。不留評價、不算館內股人數、不花錢。
      // 散客也逛店（翊文 11-14：「散客去店裡、算進股價」）：跟展廳那幾組「分開」抽（逛店的散客不顯示在展廳，不然看展廳的組別就能猜到哪家店明天的人數）：每家店每天平均 shop.perStore 位散客，
      //   壹組幾位、什麼類型看這家店的個性（學生愛餐車和手作坊、旅行團愛餐車和牌桌、退休長輩愛地下收藏庫…）；每位進店花 shop.spend（餐車牌桌進莊家、其餘進博物館資金），全館壹天 shop.dayCap；算進這家店「昨天不同的人」
      crowd: { wander: { p: 0.95, from: [0.1, 0.3], len: [0.6, 0.85], rooms: { gallery: 3, origin: 2, codex: 1, fusion: 1, pillow: 1, casino: 0, bank: 1, workshop: 0, commission: 0, office: 1, cellar: 0 } }, shop: { perStore: 72, stay: [60, 240], spend: 800, dayCap: 600000 }, groupsDay: 300, weekendMult: 1.5, stay: [30, 120], ticket: 500, dayCap: 1200000, weights: [1, 1, 1, 1, 1, 2, 2, 3, 5, 5, 5, 5, 4, 4, 6, 6, 6, 3, 1, 1, 0.5, 0.5, 0.5, 0.5] }, // 停留分鐘（翊文 11-14：「延長停留＋多加 NPC」）；門票旅客、散客都 500（翊文 11-14：「都500，我想要籌碼跟台幣感覺相當，增加散客數量來補足賺錢的部分」「補滿」）：groupsDay 300（每天約 1,500 位散客）；dayCap 照舊 50 萬（econ:check：散客門票 ≤ 已知世界每天成長的 10%），約 1,000 位以後的散客不再付錢，門票總收入約原本的七成；weights 是 05:00 起每小時的比重，最後五個是 00:00～04:00（翊文 11-14：「深夜也要有人」，少但不是零）
      // 即時在場（11-14，shared/npc_spend.js）：到了才付錢；reviewDay 壹位 NPC 壹天在展廳最多留幾則評價、reviewKeep 全館最近的評價留幾則
      reviewDay: 2, reviewKeep: 20 },
    // 展廳參觀者門票（11-14 改版，決定 0079 取代 0073 的分法）：到訪的人（有名字的 NPC、散客，每位）自己付壹張票（npcSpend.ticket／crowd.ticket，已知世界付，到的那刻）；
    //   票的 ownerPct% 放進「那壹位的分紅池」，那壹刻真的在看展廳、領了這個 key 的線上玩家分：先領的拿池子剩下的 firstPct%（再領的拿再剩下的 firstPct%…，總額不超過池子）；
    //   perDay 壹個人壹天最多領幾位的分紅（壹組散客壹組算人數，用到幾位算幾位）。沒人領的池子留在博物館資金（票的博物館資金那份）。
    // 劇情經濟事件（11-14，shared/econ_events.js；排程只選種類、日期、等級，數字都在這裡）：foreignPct 外資 NPC 買畫的力道 ＋幾 %（等級 1～3）；windowMax 館債簽收窗口最多幾天、redeemPct 窗口每天最多付莊家超過準備金的幾 %；
    //   freezeMax 畫價凍結最多幾天；repayPct 莊家提早還貸款占「超過健康線 ×2 的部分」的 %（等級 1～3）；perWeek 每週最多幾個動錢的事件；ahead 事先公告的天數
    econEvent: { foreignPct: [15, 20, 30], windowMax: 3, redeemPct: 50, freezeMax: 7, repayPct: [5, 10, 20], perWeek: 2, ahead: { foreign: 2, bondWindow: 3, artFreeze: 2 } },
    ticket: { perDay: 20, ownerPct: 30, firstPct: 50 },
    tax: { bizPct: 5, entPct: 5 }, // 營業稅（NPC、散客在店裡的花費；牌桌不課）、娛樂稅（NPC、散客的門票）：內含，進政府帳（決定 0111）
    // 邀請在場的 NPC 壹起去賭場（11-14，決定 0080，shared/casino_npc.js、casino_table.js；翊文：「賭場邀請 NPC 一起來」「也可以參與多人賭桌」）：
    //   perNpcDay 壹位 NPC 壹天最多答應幾次；tableMax 壹桌最多幾位 NPC；perHost 壹位館友同時最多帶幾位（翊文 11-17：「讓邀請去賭場的旅客不只能帶一個人」「最多 3 位」，壹桌 4 個座位剛好坐滿）；stay 壹次待幾分鐘；coolMs 被拒之後同壹位館友 30 分鐘才能再邀；baseP／likeP 答應的機率 %（愛玩牌桌 likes bj 再加 likeP）；
    //   lossPct／winPct 壹位 NPC 壹天最多輸／贏他 perDay 的幾 %（到了就說離開台詞走人）；dayCap 全館 NPC 壹天在賭場淨輸或淨贏的上限（任壹邊到了，今天不再答應、在桌上的也走）；
    //   bet 每種打法壹注占 perDay 的 %（careful 保守、basic 標準、bold 大膽、wild 亂來），betMax 壹注上限；say 壹局最多說幾句（cap）、說兩句的機率（pTwo）、說自己輸贏的機率（pSelf）、替別人喝采的機率（pCheer）
    npcCas: { on: true, perNpcDay: 3, tableMax: 3, perHost: 3, stay: [8, 20], coolMs: 1800000, baseP: 55, likeP: 25, lossPct: 8, winPct: 15, dayCap: 300000, bet: { careful: 0.3, basic: 0.5, bold: 1, wild: 1.5 }, betMax: 30000, say: { cap: 2, pTwo: 35, pSelf: 60, pCheer: 45 }, coolKeep: 200 },
    // 莊家健康度保護（11-14，數值平衡；翊文 11-13『都做』）：預算凍結以後，免費大禮包的錢只能靠玩家輸回來（test/sim_econ_world.cjs：玩家輸回的比例低於約 0.4～0.6，莊家就破產）。
    // 莊家的錢少於 low：每人每天的免費大禮包只發 lowPacks 包；破產中（≤ 0）：只發 brokePacks 包。買來的券、拚經濟抽到的券不受影響。budgetFloor（在 econ 裡）：博物館資金低到這個負數，拚經濟成功完全不撥款。
    packDayCap: 30000000, // 決定 0116：全館大禮包壹天最多付這麼多籌碼，超過的包當天只發 1～3 星
    health: { low: 30000000, lowPacks: 1, brokePacks: 0 },
    // 館內 GDP 和景氣指數（11-13，規劃 2.7 節）：每項活動 次數×標準值，不看隨機的賺賠。foodAvg 餐車每份、bjHand 21 點每手、econWin 拚經濟成功平均撥款（r 31～100 平均 65.5 × 30,000）、econSink 失敗沉下去的平均（平均 r 15 × 10,000 × 沒被撈走的 45%）、investPct 銀行存款淨增加算幾 % 進投資；growthFull 成長率 10% ＝ 指數 1；minPeople 過去 7 天來過的人少於這個，館內指數維持 0。標準值是我先定的，等有幾天真的數字再調
    gdp: { foodAvg: 150, bjHand: 20000, econWin: 1965000, econSink: 67500, investPct: 5, growthFull: 0.1, minPeople: 3,
      // 景氣的影響（11-14，規劃 2.7 節）：景氣 B（−1～+1）對拚經濟撥款、門票、存款利率各 ±fxPct%；拚經濟成功抽到的政策持續 polDays 天（到明天），效果 ±polPct%。
      // extSpread：外部景氣＝（最新一季年增率 − 最近四季平均）÷ extSpread（百分點），夾在 ±1。policyFx 是 CAS_ECON.policies 每一項對應的效果（我配的，Yuga 可以改）：tourism 門票、cellar 地下撿、grant 拚經濟撥款多、tighten 撥款少（博物館資金因此少花）
      fxPct: 10, polPct: 10, polDays: 1, extSpread: 3, extStaleDays: 200,
      policyFx: ["tourism", "tourism", "grant", "grant", "grant", "cellar", "cellar", "tighten"] },
    // Yuga Bot 日報（11-13，數值平衡）：海底只給水位，每 seaPerCm 籌碼算壹公分（不給數字，規劃第五節問題 12 等翊文）
    report: { seaPerCm: 100000 },
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
  { id: "f1a", floor: 1, trait: { kind: "shell" }, hp: 44, mood: "傷心", color: "黃", moves: [{ id: "topple", kind: "hit", w: 2 }, { id: "dust", kind: "scare", san: "1D2", w: 2 }] },
  { id: "f1b", floor: 1, trait: { kind: "steal", every: 2 }, hp: 93, mood: null, color: "紅", moves: [{ id: "cling", kind: "scare", san: "1D3", w: 2 }, { id: "pile", kind: "grow", n: 4, w: 1 }] },
  { id: "f1g", floor: 1, trait: { kind: "grow", every: 3, n: 4 }, boss: true, hp: 75, hp2: 51, mood: "生氣", color: "綠", moves: [{ id: "topple", kind: "hit", w: 1 }, { id: "count", kind: "grow", n: 5, w: 1 }, { id: "dust", kind: "scare", san: "1D3", w: 2 }], moves2: [{ id: "slide", kind: "all", san: "1D2", w: 2 }, { id: "topple", kind: "hit", w: 1 }] },
  { id: "f2a", floor: 2, trait: { kind: "veil" }, hp: 65, mood: "生氣", color: "黑", moves: [{ id: "shift", kind: "hit", w: 2 }, { id: "stare", kind: "scare", san: "1D3", w: 2 }] },
  { id: "f2b", floor: 2, trait: { kind: "slippery", mod: 20 }, hp: 74, mood: "開心", color: null, moves: [{ id: "blank", kind: "scare", san: "1D4", w: 2 }, { id: "rename", kind: "grow", n: 5, w: 1 }] },
  { id: "f2g", floor: 2, trait: { kind: "thick", n: 3 }, boss: true, hp: 50, hp2: 34, mood: null, color: "綠", moves: [{ id: "shift", kind: "hit", w: 1 }, { id: "stare", kind: "scare", san: "1D4", w: 2 }, { id: "rename", kind: "grow", n: 6, w: 1 }], moves2: [{ id: "unveil", kind: "all", san: "1D3", w: 2 }, { id: "shift", kind: "hit", w: 1 }] },
  { id: "f3a", floor: 3, trait: { kind: "stubborn", mod: 20 }, hp: 96, mood: "傷心", color: "黑", moves: [{ id: "step", kind: "hit", w: 2 }, { id: "follow", kind: "scare", san: "1D4", w: 2 }] },
  { id: "f3b", floor: 3, trait: { kind: "grow", every: 2, n: 3 }, hp: 201, mood: "開心", color: "紅", moves: [{ id: "smear", kind: "scare", san: "1D4", w: 2 }, { id: "repaint", kind: "grow", n: 6, w: 1 }] },
  { id: "f3g", floor: 3, trait: { kind: "thick", n: 4 }, boss: true, hp: 82, hp2: 56, mood: "生氣", color: "黑", moves: [{ id: "step", kind: "hit", w: 1 }, { id: "follow", kind: "scare", san: "1D4", w: 2 }, { id: "repaint", kind: "grow", n: 7, w: 1 }], moves2: [{ id: "frame", kind: "all", san: "1D4", w: 2 }, { id: "step", kind: "hit", w: 1 }] },
  { id: "f4a", floor: 4, trait: { kind: "slippery", mod: 25 }, hp: 85, mood: "傷心", color: "黃", moves: [{ id: "soak", kind: "hit", w: 2 }, { id: "blur", kind: "scare", san: "1D5", w: 2 }] },
  { id: "f4b", floor: 4, trait: { kind: "grow", every: 2, n: 4 }, hp: 194, mood: "生氣", color: "黑", moves: [{ id: "click", kind: "scare", san: "1D5", w: 2 }, { id: "carry", kind: "grow", n: 7, w: 1 }] },
  { id: "f4g", floor: 4, trait: { kind: "mark", every: 2, san: "2D3" }, boss: true, hp: 98, hp2: 65, mood: "開心", color: "黃", moves: [{ id: "soak", kind: "hit", w: 1 }, { id: "blur", kind: "scare", san: "1D5", w: 2 }, { id: "carry", kind: "grow", n: 8, w: 1 }], moves2: [{ id: "tally", kind: "all", san: "1D4", w: 2 }, { id: "soak", kind: "hit", w: 1 }] },
  { id: "f5a", floor: 5, trait: { kind: "blur", n: 2 }, hp: 125, mood: "傷心", color: null, moves: [{ id: "queue", kind: "hit", w: 2 }, { id: "almost", kind: "scare", san: "1D6", w: 2 }] },
  { id: "f5b", floor: 5, trait: { kind: "veil" }, hp: 230, mood: "生氣", color: "黃", moves: [{ id: "almost", kind: "scare", san: "1D6", w: 2 }, { id: "another", kind: "grow", n: 8, w: 1 }] },
  { id: "f5g", floor: 5, trait: { kind: "blur", n: 3 }, boss: true, hp: 95, hp2: 63, mood: null, color: null, moves: [{ id: "queue", kind: "hit", w: 1 }, { id: "almost", kind: "scare", san: "1D6", w: 2 }, { id: "another", kind: "grow", n: 9, w: 1 }], moves2: [{ id: "nameless", kind: "all", san: "1D5", w: 2 }, { id: "queue", kind: "hit", w: 1 }] },
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
// 替佩佩取名（決定 0133）：所有佩佩都能取；最多 max 個字；含 bad 裡任何壹段（去空白、轉小寫比對）就擋
export const PEPE_NAME = { max: 12, bad: ["幹你", "操你", "去死", "白痴", "智障", "婊", "fuck", "shit", "bitch", "nigg", "slut", "porn"] };
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

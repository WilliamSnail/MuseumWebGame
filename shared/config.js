// ================================================================
//  佩佩博物館 4（第 4 版，多人版）—— 設定清單（Yuga 可以直接改這一段）
//  ・選項可以增減，組合數、圖鑑格數會自動重算。
//  ・start: true ＝一開始就打開；req ＝解鎖前要先做到的事；
//    forbidden ＝禁忌選項（不算在基本組合裡，佩佩神話夠了才會自己打開）；
//    mutant ＝突變選項（只能靠融合室配種突變出來）；gift ＝委託人送的選項；
//    key ＝要在地下收藏庫拿到鑰匙才會打開（deco ＝裝飾類別，拿到鑰匙組合才會變多）。
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
  ] },
  { name: "帽子", options: [
    { name: "沒有", start: true },
    { name: "棒球帽", start: true },
    { name: "巫師帽" },
    { name: "皇冠", req: { badge: "fourColors" } },
    { name: "觸手帽", forbidden: true, myth: 5 },
    { name: "毛帽", mutant: true },
    { name: "紳士帽", gift: "collector" },
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
  { name: "材質", inName: true, options: [{ name: "棉布" }, { name: "絨毛" }, { name: "桃皮絨" }] },
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
  startSanity: 50,          // 理智從 50 開始，CoC 的平均值（翊文 11-08：理智要更容易歸零；原本 70）
  startInsp: 2,             // 一開始的靈感（夠做一隻）
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
  costPepe: 2,              // 做一隻佩佩
  costPillow: 1,            // 做一個抱枕
  unlockCosts: [8, 10, 12, 14, 16, 18, 20, 20, 20, 20, 20], // 第幾個解鎖要多少靈感（越後面越貴）
  reward: { precise: 12, vague: 5, riddle: 10, pillow: 10 }, // 委託沒寫 reward 時用這個
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
  quirkCureDays: 3,         // 連續幾天抱抱枕治好怪癖
  // 第 3 版
  fusionCost: 3,            // 融合一次要多少靈感
  fusionPerDay: 3,          // 一天可以融合幾次（升級「第二座融合爐」再 +3）
  fusionSan: "1/1D4",       // 融合要做的理智檢定（原本 0/1D4）
  inherit: 45,              // 每一類從爸爸、媽媽各遺傳的機率（%），剩下的是突變
  blood: 5,                 // 爸媽每一隻是「稀有」以上，就多 5 點血統，可以像心情一樣壓低骰子
  diceRerolls: 3,           // 升級「骰子打磨」後，一天可以重擲十位骰幾次
  visitorFame: 120,         // 升級「名聲」後，參觀者幾秒來一位
  skillMain: "1D10", skillMainBase: 55, skillBase: "1D10", skillOtherBase: 15, // 職業技能 56–65；其他技能 16–25
  persuadeBonus: 30,        // 說服成功：委託賞金多 30%
  injureDays: 2,            // 在地下收藏庫受傷的佩佩，幾天後自己好
  repairCost: 3, healCost: 2, // 修復台：修失敗作、治受傷的佩佩
  cellarRepeatInsp: 1,      // 已經過關的房間再過一次只給 1 靈感
  idleBook: 15,             // 讀過《佩佩起源考》後，在起源室什麼都不做幾秒，續集會出現（11-08 翊文說等了沒反應：20 → 15，並且等的時候書會越來越亮）
  cellarRest: "1D3",        // 隊伍裡有躺平、毛帽：每一層第一次走時各回這麼多理智
  linesFrom: 4,             // 解鎖幾個選項之後，老主顧（委託人關係線）才開始出現
  lineReward: 8,            // 老主顧的委託給多少靈感
};

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
];

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

// ================================================================
//  館友證的「來源登記表」（翊文 11-22：「都要雙向用腳本或程式來追蹤，避免改了一部分另一邊沒有改」；規劃 docs/規劃/館友證裝備整合規劃.md 第七節）
//  一列壹類「玩家拿得到的東西」：它從哪個清單來、存在存檔哪個欄位、館友證哪一頁看得到、能不能用、別人看不看得到。只放字串，不 import 別的檔。
//  檢查：tools/check/pass_sources.cjs（npm test 會擋）。來源多了、存檔多了新欄位，要在這裡加壹列（或寫進 tools/check/pass_gaps.json 的 hide，寫原因）；
//  館友證還沒顯示的，在 pass_gaps.json 的 gaps 列壹條（補完就刪，檢查會擋「已經有了還留著」）。
//  欄位：
//   id    壹類東西的名字（英文，不重複）
//   name  中文名
//   from  { file, list }｜null：來源清單所在的檔和 export 的名字（沒有清單的寫 null）；ids 有寫的話，每個 id 都要還在那份清單裡
//   save  存檔欄位：P.<欄位>（參觀者存檔）、W.<欄位>（賭場錢包）、SAVE.<欄位>（帳號層）
//   pass  { src: "pass"（shared/social/pass.js 的 passView）｜"casino"（shared/casino/pass_view.js 的 casPassView）, key: "點分的欄位路徑" }｜null：館友證現在顯示的欄位
//   use   在館友證上能不能用：none（只看）／wear（穿脫）／hang（掛）／use（拿去用）／goto（只有「前往」）
//   pub   別人看得到：cleanHallView（shared/social/visit.js）輸出的欄位名（陣列），沒有就 []
// ================================================================
export const PASS_SOURCES = [
  // ---- 參觀者 ----
  { id: "visitor", name: "現在這位參觀者", from: null, save: ["P.mode", "P.visitor", "P.vname", "P.job", "P.perk", "P.flaw", "P.mood", "P.sanity", "P.myth", "P.insp", "P.stats", "P.quirks", "P.created", "P.activeSec", "P.done"], pass: { src: "pass", key: "visitor.stats" }, use: "goto", pub: [] },
  { id: "skills", name: "技能", from: { file: "shared/core/config.js", list: "SKILLS" }, save: ["P.skills", "P.skillTicks"], pass: { src: "pass", key: "visitor.skills" }, use: "none", pub: [] },
  { id: "gear", name: "兌換所裝備", from: { file: "shared/core/config.js", list: "GEAR_ITEMS" }, save: ["P.gear", "P.shop"], pass: { src: "pass", key: "gear" }, use: "wear", pub: [] }, // 11-22：封面隨身物＋參觀者頁三段（passGear），可以直接穿脫、買
  { id: "upgrades", name: "工坊升級", from: { file: "shared/core/config.js", list: "UPGRADES" }, save: ["P.upgrades"], pass: { src: "pass", key: "upgrades" }, use: "goto", pub: [] },
  { id: "relics", name: "遺物和歷任參觀者", from: null, save: ["P.legacy", "P.relics", "P.history"], pass: { src: "pass", key: "relics" }, use: "none", pub: [] },
  { id: "visitors", name: "三位參觀者的座位", from: null, save: ["P.visitors", "P.visitorCount", "P.slot", "P.vid", "P.oddSeen"], pass: null, use: "goto", pub: [] },
  // ---- 收藏（佩佩、書） ----
  { id: "pepes", name: "做過的佩佩", from: null, save: ["P.pepes", "P.unlocked", "P.unlockCount", "P.avatar"], pass: { src: "pass", key: "pepe.recent" }, use: "use", pub: [] },
  { id: "failed", name: "失敗作和修復品", from: null, save: ["P.failed", "P.repaired"], pass: { src: "pass", key: "pepe.failed" }, use: "none", pub: [] },
  { id: "pillows", name: "抱枕", from: null, save: ["P.pillows", "P.plPick", "P.plPrint"], pass: { src: "pass", key: "pepe.pillow" }, use: "none", pub: [] },
  { id: "recipes", name: "隱藏配方", from: { file: "shared/core/config.js", list: "RECIPES" }, save: ["P.recipes"], pass: { src: "pass", key: "pepe.recipes" }, use: "none", pub: [] },
  { id: "badges", name: "圖鑑徽章", from: { file: "shared/core/config.js", list: "BADGES" }, save: ["P.badges"], pass: { src: "pass", key: "ach.list" }, use: "none", pub: [] },
  { id: "books", name: "圖書館的書（章節）", from: null, save: ["P.chaptersRead", "P.seen"], pass: { src: "pass", key: "books.origin" }, use: "goto", pub: [] },
  { id: "understood", name: "看懂的事", from: { file: "shared/core/systems_text.js", list: "UNDERSTAND_TEXT" }, save: ["P.understood", "P.clues"], pass: { src: "pass", key: "books.understood" }, use: "none", pub: [] },
  // ---- 展廳 ----
  { id: "hall", name: "展廳（展台上的佩佩、評分、主題）", from: null, save: ["P.hall", "P.hallVisitors", "P.visitorLog", "P.themesSeen", "P.themeShow", "P.giftsIn", "P.visit", "P.fullRows"], pass: { src: "pass", key: "pepe.hall" }, use: "goto", pub: ["slots", "art", "score", "artBonus", "theme", "posters", "report"] },
  { id: "souvenirs", name: "掛在展廳的紀念品", from: null, save: ["W.hung", "W.props"], pass: { src: "pass", key: "souvenirs" }, use: "hang", pub: ["souvenirs"] },
  // ---- 簽到、限定品 ----
  { id: "limited", name: "限定品（簽到、兌換所、主題展）", from: { file: "shared/core/config.js", list: "LIMITED_ITEMS" }, save: ["P.limited", "SAVE.signin"], pass: { src: "pass", key: "deco.items" }, use: "use", pub: ["deco", "frame"] },
  // ---- 地下收藏庫 ----
  { id: "cellar", name: "地下收藏庫（最深樓層、通關、鑰匙、結局）", from: { file: "shared/core/config.js", list: "CELLAR_REWARDS" }, save: ["P.cellar", "P.keys", "P.endings", "P.injured"], pass: { src: "pass", key: "records" }, use: "none", pub: [] },
  { id: "foes", name: "怪物", from: { file: "shared/core/config.js", list: "CELLAR_FOES" }, save: [], pass: null, use: "none", pub: [] },
  { id: "trials", name: "試煉房間", from: { file: "shared/core/systems_text.js", list: "TRIAL_ROOMS" }, save: [], pass: null, use: "goto", pub: [] },
  // ---- 賭場（錢包在伺服器；pass.src = casino） ----
  { id: "chips", name: "籌碼和帳本", from: null, save: ["W.v", "W.chips", "W.led", "W.loan", "W.work", "W.rel"], pass: { src: "casino", key: "chips" }, use: "goto", pub: [] },
  { id: "packs", name: "大禮包和券", from: { file: "shared/casino/text.js", list: "CAS_PACKS" }, save: ["W.pk", "W.tix", "W.tickets", "W.seen"], pass: null, use: "goto", pub: [] },
  { id: "swap", name: "換小獎", from: null, save: ["W.ex", "W.exTot"], pass: { src: "casino", key: "swap" }, use: "goto", pub: [] },
  { id: "props", name: "紀念品（財產）", from: { file: "shared/casino/text.js", list: "CAS_PROPS" }, save: ["W.props"], pass: { src: "casino", key: "props" }, use: "hang", pub: ["souvenirs"] },
  { id: "achs", name: "賭場成就", from: { file: "shared/casino/text.js", list: "CAS_ACH" }, save: ["W.ach"], pass: { src: "casino", key: "ach" }, use: "use", pub: [] },
  { id: "title", name: "稱號", from: null, save: ["W.title", "P.casinoTitle"], pass: { src: "pass", key: "card" }, use: "goto", pub: ["title"] },
  { id: "meals", name: "餐車吃過的", from: { file: "shared/casino/text.js", list: "CAS_MENU" }, save: ["W.meals", "W.sk"], pass: null, use: "none", pub: [] },
  { id: "week", name: "每週收藏", from: null, save: ["W.wk", "W.wkLog"], pass: { src: "casino", key: "wk" }, use: "goto", pub: [] },
  { id: "stats", name: "賭場戰績", from: null, save: ["W.st", "W.legacy"], pass: null, use: "none", pub: [] },
  { id: "npcbond", name: "認得的旅客和交代人（好感度、熟識度）", from: null, save: ["W.npcRel", "W.npcDay"], pass: null, use: "none", pub: [] },
];

// 測試、模擬共用的載入器。
// shared/ 是 ES 模組（給瀏覽器和之後的伺服器用）。測試要「每一項都從頭載入一份全新的」，
// 所以這裡把 shared/ 的檔拿掉 import／export，照順序接成一段程式，放進 Node 的 vm 跑（跟第 3 版的測試一樣）。
// 模組之間的 import 對不對，另外由 test/esm_smoke.mjs 和 vite build 檢查。
const fs = require("fs"), path = require("path"), vm = require("vm");

// 照依賴順序排：被 import 的檔在前面（shared/ 的 import 不繞圈，tools/check/check_imports.cjs 擋）。新增檔案時排在用到它的檔前面。
const ORDER = ["config.js", "content.js", "systems_text.js", "holidays.js", "logic_base.js", "story_state.js", "legacy.js", "events.js", "signin.js", "shop.js", "themeshow.js", "systems.js", "npc_roster.js", "npc.js", "visitors.js", "logic.js", "coop/base.js", "world_base.js", "npc_trip.js", "casino/book.js", "casino/gdp.js", "casino/text.js", "stocks_text.js", "world_roster.js", "world_markets.js", "world_events.js", "stat_view.js", "world.js", "npc_spend.js", "map_data.js", "map.js", "casino/core.js", "econ_events.js", "fresh.js", "guide.js", "notices_data.js", "notices.js", "gifts.js", "mailbox.js", "coop/text.js", "party.js", "coop/fun.js", "cellar/fight.js", "coop/fight.js", "cellar/map.js", "coop/route.js", "coop/core.js", "coop/flow.js", "coop/trace.js", "casino/art.js", "story.js", "clues.js", "admin.js", "casino/streak.js", "casino/credit.js", "stocks_in_text.js", "casino/stock_in.js", "casino/week.js", "casino/wallet.js", "visit.js", "titles.js", "board.js", "casino/report.js", "casino/ticket.js", "casino/bond.js", "casino/auction.js", "casino/npc.js", "casino/table.js", "casino/find.js", "casino/job.js", "casino/econ.js", "casino/stock_grp.js", "stocks.js", "stocks_tw.js", "casino/stock.js", "casino/invest.js", "casino/debt.js", "casino/advisor.js", "casino/bank.js", "casino/live.js", "mates.js", "orient.js", "discord/core.js", "discord/out.js", "discord/play.js", "pass.js", "lostfound.js", "casino/stock_lev_text.js", "casino/stock_lev.js", "npc_card.js", "headlines.js", "room_mood.js"];
const DIR = path.join(__dirname, "..", "shared");

// notices_data.js 不進 git（公告壹則壹個檔，content/notices/*.json 組成）：沒有就先組出來。11-17：Discord 預約公告的排程沒先組，11-16 下午起每次都失敗
const read = f => { if (f === "notices_data.js" && !fs.existsSync(path.join(DIR, f))) require("../tools/content/notices_build.cjs").write(); return fs.readFileSync(path.join(DIR, f), "utf8"); };
// 拿掉 import 那一行、拿掉「export * from」「export { … } from」這種再匯出（名字本來就在同一段程式裡）、拿掉行首的 export
const strip = src => src.replace(/^import\s[^\n]*;[ \t]*$/gm, "").replace(/^export\s+(?:\*|\{[^}]*\})\s*from\s*"[^"]*";?[ \t]*$/gm, "").replace(/^export\s+/gm, "");
// 每個檔匯出的名字（一行一個宣告）
const exportsOf = src => [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);

function source() { require("../tools/content/notices_build.cjs").write(); /* shared/notices_data.js 不進 git，先產生 */ return ORDER.map(f => strip(read(f))).join("\n;\n"); }
function names() { return [...new Set(ORDER.flatMap(f => exportsOf(read(f))))]; }

// 回傳一個物件：G.名字 讀到的永遠是 vm 裡現在的值（例如 setRng 之後的 RNG）
function load(extra = {}) {
  const ctx = Object.assign({ console, Buffer, setTimeout, clearTimeout }, extra);
  vm.createContext(ctx);
  const getters = names().map(n => `get ${n}() { return ${n}; }`).join(",\n");
  vm.runInContext(source() + `\n;globalThis.__G = {\n${getters}\n};`, ctx, { filename: "shared（接起來）.js" });
  if (!extra.__realMoney) legacyMoney(ctx.__G.NUM);
  return ctx.__G;
}

// 決定 0081（價格照台幣感覺調、餘額不動）：舊的測試都用「新玩家有 100 萬、最大注 1,000 萬」的量級寫的，
// 測試的重點是規則、不是數字，所以預設把這幾個「起點、上限」換回舊的量級。要看真正的新數字，load({ __realMoney: true })。
function legacyMoney(NUM) {
  const C = NUM.casino;
  C.startChips = 1000000; C.minBet = 100; C.maxBet = 10000000;
  Object.assign(C.loan, { limit: 1000000, min: 10000, quick: [100000, 300000, 500000], discord: 100000 });
  Object.assign(C.bank, { min: 10000, termMin: 100000, quick: [100000, 1000000, 5000000] });
  NUM.signin.weekChips = 15000000;
  C.gdp.foodAvg = 100000;
  C.govSweep.on = false; // 決定 0140：政府帳搬進公共機構、撥款給文化部，舊的測試預設關掉；gov_sweep.test.cjs 用 __realMoney 自己測
  C.bankSplit.on = false; // 決定 0130：佩佩銀行跟賭場分開，舊的測試（借款、館債、利息都由莊家出）預設關掉；要測的用 load({ __realMoney: true }) 或自己打開
}

module.exports = { load, ORDER, DIR, strip, exportsOf };

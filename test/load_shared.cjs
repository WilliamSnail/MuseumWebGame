// 測試、模擬共用的載入器。
// shared/ 是 ES 模組（給瀏覽器和之後的伺服器用）。測試要「每一項都從頭載入一份全新的」，
// 所以這裡把 shared/ 的檔拿掉 import／export，照順序接成一段程式，放進 Node 的 vm 跑（跟第 3 版的測試一樣）。
// 模組之間的 import 對不對，另外由 test/esm_smoke.mjs 和 vite build 檢查。
const fs = require("fs"), path = require("path"), vm = require("vm");

const ORDER = ["config.js", "content.js", "content3.js", "logic.js", "logic3.js", "fresh.js", "guide.js", "notices.js", "mailbox.js", "legacy.js", "visitors.js", "gifts.js", "coop.js", "coop_text.js", "coop_fun.js", "coop_flow.js", "coop_trace.js", "party.js", "holidays.js", "signin.js", "story.js", "clues.js", "events.js", "admin.js", "shop.js", "visit.js", "themeshow.js", "board.js", "casino_text.js", "casino_week.js", "casino.js", "casino_streak.js", "casino_wallet.js", "casino_table.js", "titles.js", "casino_find.js", "casino_job.js", "casino_econ.js", "casino_live.js", "mates.js", "orient.js", "discord.js", "discord_out.js", "discord_play.js", "pass.js", "cellar_fight.js", "cellar_map.js"]; // fresh.js（11-08）用到 logic、logic3；guide.js（11-08，新玩家的下一步）用到 logic。都放最後；notices.js、mailbox.js（11-08，公佈欄、信箱）用到 logic、logic3、content3；legacy.js（11-08，參觀者一位接一位）用到 config、content3、logic、logic3（logic、logic3 也在函式裡叫它）；visitors.js（11-08，多位參觀者）用到 config、logic、legacy（logic 也在函式裡叫它）；gifts.js（11-08，送佩佩、參觀展廳）用到 logic，mailbox.js 在函式裡叫它；coop.js（11-08，合作地下收藏庫）用到 config、logic、logic3、legacy；holidays.js、signin.js（11-09，節日、每日簽到）用到 config、content3、logic、logic3（logic 也在函式裡叫它們），放最後；party.js（11-08，邀請、隊伍）不用別的檔，放最後；story.js（11-09，每週劇情）用到 config、logic、logic3，放最後；clues.js（11-09，線索和看懂）用到 config、logic、story，放在 story 後面；admin.js（決定 0033，管理員介面的摘要）用到前面全部，放最後；shop.js（11-09，兌換所和技能成長）用到 config、content3、logic、logic3、signin、story（legacy、logic、logic3、story 也在函式裡叫它），放最後
const DIR = path.join(__dirname, "..", "shared");

const read = f => fs.readFileSync(path.join(DIR, f), "utf8");
// 拿掉 import 那一行、拿掉行首的 export
const strip = src => src.replace(/^import\s[^\n]*;[ \t]*$/gm, "").replace(/^export\s+/gm, "");
// 每個檔匯出的名字（一行一個宣告）
const exportsOf = src => [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);

function source() { return ORDER.map(f => strip(read(f))).join("\n;\n"); }
function names() { return [...new Set(ORDER.flatMap(f => exportsOf(read(f))))]; }

// 回傳一個物件：G.名字 讀到的永遠是 vm 裡現在的值（例如 setRng 之後的 RNG）
function load(extra = {}) {
  const ctx = Object.assign({ console, Buffer, setTimeout, clearTimeout }, extra);
  vm.createContext(ctx);
  const getters = names().map(n => `get ${n}() { return ${n}; }`).join(",\n");
  vm.runInContext(source() + `\n;globalThis.__G = {\n${getters}\n};`, ctx, { filename: "shared（接起來）.js" });
  return ctx.__G;
}

module.exports = { load, ORDER, DIR, strip, exportsOf };

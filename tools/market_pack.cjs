// 把 content/world/markets/*.json 打包成 shared/world_markets.js（景氣分市場，決定 0121）。內容改了就跑 node tools/market_pack.cjs；npm test（test/world_market.test.cjs）會檢查有沒有跟上，copy_shared.cjs 也會順手跑。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const KEEP = ["cats", "id", "name", "kind", "anchor", "beta", "kappa", "sd", "rho"];
function markets(dir = path.join(ROOT, "content", "world", "markets")) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json")) continue;
    let o; try { o = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { console.error("市場：讀不出來", f, e.message); continue; }
    if (!o || typeof o.id !== "string") continue;
    const r = {}; KEEP.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); out.push(r);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
const HEAD = "// tools/market_pack.cjs 產生的，不要改（改 content/world/markets/*.json，再跑 node tools/market_pack.cjs）。\n// 景氣分市場的名單（決定 0121）：anchor 接哪個真實市場（tw／us／none）、beta 真實漲跌 1% 讓景氣動多少、kappa 每天回平均多少、sd 自己的雜訊、rho 跟共同因子的相關。\n";
const source = list => HEAD + "export const WORLD_MARKETS = " + JSON.stringify(list, null, 1).replace(/\n\s*/g, "") + ";\n";
function write() { const f = path.join(ROOT, "shared", "world_markets.js"), s = source(markets()); if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s) fs.writeFileSync(f, s); return f; }
module.exports = { markets, source, write };
if (require.main === module) console.log("寫好了", write());

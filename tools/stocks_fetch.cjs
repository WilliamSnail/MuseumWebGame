// 館外股票的每日資料（11-13）：抓真實的每日收盤，算成漲跌幅（%），合進 daily.json。
//   node tools/stocks_fetch.cjs [--out 檔案] [--dry]      預設寫 content/stocks/daily.json
//   node tools/stocks_fetch.cjs --check [檔案]            只檢查檔案格式
//   node tools/stocks_fetch.cjs --range 3mo               補抓更久（預設 1mo；每次本來就會重抓最近一個月）
//   node tools/stocks_fetch.cjs --fresh [檔案]            資料落後超過 3 天就失敗（排程用）
// 資料來源：Yahoo Finance 的公開圖表介面（query1.finance.yahoo.com/v8/finance/chart），不用金鑰。
//   不是官方保證的介面，可能被擋、改格式、限流；抓不到的那家這次就空著，不會寫壞舊資料。理由和限制見 PR 與日誌。
// 真實的代號只放在這支，不進 shared/（名字表不寫代號）。id 對應 shared/stocks_text.js。
// 格式見 shared/stocks.js 開頭。只寫「已經收盤」的日子：盤中的最新一根會丟掉。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SYMBOLS = { greeneye: "NVDA", redclaw: "AMD", nightindex: "^IXIC", islandforge: "2330.TW", silverapple: "AAPL", flashcar: "TSLA", squarewin: "MSFT" };
const KEEP = 40;
const FRESH_DAYS = 3; // 跟 shared/stocks.js 的 OUT_STOCK_NUM.staleDays 一樣

// 把一檔的圖表回應變成 { 市場日期: 漲跌幅% }（第一根沒有前一根可比，不算）
function parseChart(json, nowSec) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !Array.isArray(r.timestamp)) return null;
  const close = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
  if (!Array.isArray(close)) return null;
  const off = Number(r.meta && r.meta.gmtoffset) || 0;
  const reg = r.meta && r.meta.currentTradingPeriod && r.meta.currentTradingPeriod.regular;
  const bars = [];
  r.timestamp.forEach((t, i) => {
    const c = close[i];
    if (typeof c !== "number" || !isFinite(c) || c <= 0) return;
    if (reg && t >= reg.start && nowSec < reg.end) return; // 今天還在盤中，不算
    bars.push({ d: new Date((t + off) * 1000).toISOString().slice(0, 10), c });
  });
  const pct = {};
  for (let i = 1; i < bars.length; i++) pct[bars[i].d] = Math.round((bars[i].c / bars[i - 1].c - 1) * 10000) / 100;
  // last＝最後一根收盤的日期；today＝這個市場現在是哪一天。日期 d 這家算「定了」：d ≤ last，或 d < today（那天過完卻沒有 K 棒＝休市）
  return { pct, last: bars.length ? bars[bars.length - 1].d : "", today: new Date((nowSec + off) * 1000).toISOString().slice(0, 10) };
}

const addDay = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const isWeekend = d => { const [y, m, dd] = d.split("-").map(Number); const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return w === 0 || w === 6; };

// 資料斷了幾天（--fresh 用）：台灣現在的日期往前找最近一個平日的前一個市場日，跟 daily 最新一天差幾天。
// 美股隔天早上才收盤，所以「該有的最新一天」＝（台灣今天 05:00 換日後的日期）的前一天，遇到週末往前退到週五。
function ageDays(daily, nowMs) {
  const game = new Date(nowMs + (8 - 5) * 3600000).toISOString().slice(0, 10); // 遊戲日期（台灣 05:00 換日）
  let want = addDay(game, -1); while (isWeekend(want)) want = addDay(want, -1);
  const have = Object.keys((daily && daily.days) || {}).sort().pop();
  if (!have) return Infinity;
  return Math.max(0, Math.round((Date.parse(want) - Date.parse(have)) / 86400000));
}

// 合併：fetched = { id: {日期: pct} | null(這家抓失敗) }；old = 舊的 daily
function merge(old, fetched, nowIso) {
  const days = Object.assign({}, old && old.days);
  const dates = new Set();
  const final = (f, d) => d <= f.last || d < f.today;
  for (const id in fetched) if (fetched[id]) Object.keys(fetched[id].pct).forEach(d => dates.add(d));
  for (const d of dates) {
    if (!Object.values(fetched).every(f => !f || final(f, d))) continue; // 有一家這天還沒收盤：整天先不寫，下一次再來
    const row = Object.assign({}, days[d]);
    for (const id in fetched) {
      if (!fetched[id]) continue; // 抓失敗：不寫，留空（舊值也不動）
      row[id] = Object.prototype.hasOwnProperty.call(fetched[id].pct, d) ? fetched[id].pct[d] : null; // 那天這家沒開市＝null
    }
    days[d] = row;
  }
  // 平日整天沒有 K 棒＝全部休市（例如美股國定假日）：補一列全 null，伺服器才知道那天是休市，不是沒抓到。
  // 只補在「已有資料的範圍裡」、而且每家抓到的市場都已經過了那天的；抓失敗的家不寫（留空）。
  const live = Object.values(fetched).filter(Boolean);
  const have = Object.keys(days).sort();
  if (live.length && have.length) {
    for (let d = have[0]; d < have[have.length - 1]; d = addDay(d, 1)) {
      if (days[d] || isWeekend(d) || !live.every(f => d < f.today)) continue;
      const row = {}; for (const id in fetched) if (fetched[id]) row[id] = null;
      days[d] = row;
    }
  }
  const keys = Object.keys(days).sort().slice(-KEEP);
  const kept = {}; keys.forEach(k => { kept[k] = days[k]; });
  return { updated: nowIso, source: "Yahoo Finance chart API（免金鑰）", note: "pct＝真實漲跌幅（%）；null＝那天休市；key＝市場所在地的日期", days: kept };
}

function check(d) {
  const errs = [], ids = Object.keys(SYMBOLS);
  if (!d || typeof d !== "object" || !d.days || typeof d.days !== "object") return ["沒有 days"];
  for (const k of Object.keys(d.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) errs.push("日期壞了：" + k);
    const row = d.days[k];
    for (const id in row) {
      if (!ids.includes(id)) errs.push(k + " 不認得的 id：" + id);
      else if (row[id] !== null && !(typeof row[id] === "number" && isFinite(row[id]))) errs.push(k + " " + id + " 不是數字");
    }
  }
  return errs;
}

// range 預設 1mo＝每次都重抓最近一個月，漏跑幾天下一次會自己補回來；要補更久用 --range 3mo
async function fetchOne(sym, range) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?range=" + encodeURIComponent(range || "1mo") + "&interval=1d";
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (museum-stocks-fetch)" } });
      if (res.ok) return parseChart(await res.json(), Date.now() / 1000);
    } catch (e) { /* 再試 */ }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const outI = args.indexOf("--out");
  const file = outI >= 0 ? args[outI + 1] : path.join(ROOT, "content", "stocks", "daily.json");
  if (args[0] === "--check") {
    const f = args[1] || file, e = check(JSON.parse(fs.readFileSync(f, "utf8")));
    console.log(e.length ? "壞的：\n" + e.join("\n") : "格式沒問題"); process.exit(e.length ? 1 : 0);
  }
  if (args[0] === "--fresh") { // 檢查資料新不新：落後超過 FRESH_DAYS 天就失敗（排程那邊會寄信給 repo 擁有者）
    const f = args[1] || file, a = ageDays(JSON.parse(fs.readFileSync(f, "utf8")), Date.now());
    console.log("資料落後 " + a + " 天（最多容許 " + FRESH_DAYS + "）"); process.exit(a > FRESH_DAYS ? 1 : 0);
  }
  const rangeI = args.indexOf("--range"), range = rangeI >= 0 ? args[rangeI + 1] : "1mo";
  if (!/^[0-9]+(d|mo|y)$/.test(range)) { console.error("--range 要像 3mo、60d"); process.exit(1); }
  let old = null;
  try { old = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { /* 第一次 */ }
  const fetched = {};
  for (const id of Object.keys(SYMBOLS)) fetched[id] = await fetchOne(SYMBOLS[id], range);
  const failed = Object.keys(fetched).filter(id => !fetched[id]);
  console.log("抓到：" + Object.keys(fetched).filter(id => fetched[id]).join("、") + (failed.length ? "；沒抓到：" + failed.join("、") : ""));
  if (failed.length === Object.keys(fetched).length) { console.error("全部都失敗，不寫檔"); process.exit(1); }
  const next = merge(old, fetched, new Date().toISOString());
  const errs = check(next);
  if (errs.length) { console.error("產生的資料有問題：\n" + errs.join("\n")); process.exit(1); }
  if (args.includes("--dry")) { console.log(JSON.stringify(next, null, 1).slice(0, 1500)); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
  console.log("寫好：" + file + "（" + Object.keys(next.days).length + " 天，最新 " + Object.keys(next.days).sort().pop() + "）");
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { parseChart, merge, check, ageDays, SYMBOLS };

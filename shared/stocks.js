// 館外股票的每日漲跌（11-13）：把真實的漲跌幅換成遊戲裡的漲跌。只算數字，買賣規則不在這裡。
// 資料長這樣（content/stocks/daily.json 的 days，由 tools/stocks_fetch.cjs 每天產生）：
//   daily.days = { "2026-11-12": { greeneye: -1.23, redclaw: 0.8, squarewin: null, ... }, ... }
//   key＝真實市場的日期；值＝那天的漲跌幅（%，不是小數）；null＝那天這家休市；整天都沒有 key＝沒抓到（或週末）。
// 對應：市場日期 M 的漲跌，在遊戲日期 M 的隔天發生。美股台灣時間 M+1 早上才收盤，遊戲 05:00 換日，剛好接得上。
// 純函式：不碰時間、不碰亂數；「今天」由呼叫的人傳進來。
export const OUT_STOCK_NUM = {
  cap: 0.10, // 一天最多漲跌 10%（規劃第三節「一天一家最多漲跌 10%」）
  scale: 1, // 真實漲跌乘上這個再算上限；1＝照真的。想讓世界比較平靜就調小
  keep: 40, // daily.json 留幾個市場日期（舊的刪掉）
  floor: 1, // 股價最低 1，不會變 0
};

// 真實漲跌幅（%）→ 遊戲裡的漲跌（小數，+0.03＝漲 3%）。壞資料（null、字串、NaN）當作沒動
export function outStockMove(pct) {
  const x = typeof pct === "number" && isFinite(pct) ? pct : 0;
  const m = (x / 100) * OUT_STOCK_NUM.scale;
  return Math.max(-OUT_STOCK_NUM.cap, Math.min(OUT_STOCK_NUM.cap, m));
}

// 'YYYY-MM-DD' 往前或往後幾天（用 UTC 算，不受時區影響）
export function outStockAddDay(d, n) {
  const [y, m, dd] = String(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

// 週末（六、日）市場一定休市
export function outStockWeekend(d) {
  const [y, m, dd] = String(d).split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return w === 0 || w === 6;
}

// 遊戲日期 gameDate 這一天，每一家動多少：{ id: 小數 }。
//   用的是「前一天」的市場資料。
//   那天這家休市（null）→ 不動；週末沒有資料 → 不動；
//   平日卻整天沒資料（沒抓到）→ 用資料裡最近壹天有這家漲跌的那一筆（資料缺的時候用前一天的）；完全沒有就不動。
export function outStockMovesFor(daily, gameDate, ids) {
  const days = daily && daily.days && typeof daily.days === "object" ? daily.days : {};
  const out = {};
  const M = outStockAddDay(gameDate, -1);
  const row = days[M];
  const keys = Object.keys(days).filter(k => k < M).sort();
  for (const id of ids) {
    let pct = null;
    if (row && typeof row === "object") pct = Object.prototype.hasOwnProperty.call(row, id) ? row[id] : undefined;
    else if (outStockWeekend(M)) pct = null;
    else pct = undefined; // 平日整天沒資料＝缺
    if (pct === undefined) { // 缺：往前找最近壹筆有數字的
      pct = null;
      for (let i = keys.length - 1; i >= 0; i--) {
        const r = days[keys[i]], v = r && typeof r === "object" ? r[id] : undefined;
        if (typeof v === "number" && isFinite(v)) { pct = v; break; }
      }
    }
    out[id] = outStockMove(pct);
  }
  return out;
}

// 股價乘上漲跌，四捨五入成整數，最低 floor
export function outStockStep(price, move) {
  const p = typeof price === "number" && isFinite(price) ? price : OUT_STOCK_NUM.floor;
  return Math.max(OUT_STOCK_NUM.floor, Math.round(p * (1 + move)));
}

// 遊戲日期 gameDate 的資料到了沒：前一天的市場有資料，或前一天是週末（本來就沒有）。
// 沒到的時候（排程晚了）不要馬上用「缺資料」的做法把今天定下來，等一下再看；等太久再用 outStockMovesFor 的補法。
export function outStockReady(daily, gameDate) {
  const M = outStockAddDay(gameDate, -1);
  const days = daily && daily.days && typeof daily.days === "object" ? daily.days : {};
  return !!(days[M] && typeof days[M] === "object") || outStockWeekend(M);
}

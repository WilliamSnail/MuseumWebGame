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
  staleDays: 3, // 資料比「該有的最新一天」落後超過這麼多天，算斷了，伺服器要在記錄裡喊（outStockAgeDays）
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
//   平日卻整天沒資料（沒抓到）→ 不動（0），不拿別天的漲跌頂替：頂替等於編一個那天沒發生的漲跌。
//   哪幾家是「沒資料」才不動，用 outStockStale 問，畫面要標出來，不要讓人以為真的沒漲跌。
export function outStockMovesFor(daily, gameDate, ids) {
  const days = daily && daily.days && typeof daily.days === "object" ? daily.days : {};
  const out = {};
  const M = outStockAddDay(gameDate, -1);
  const row = days[M];
  for (const id of ids) {
    let pct = null;
    if (row && typeof row === "object") pct = Object.prototype.hasOwnProperty.call(row, id) ? row[id] : null;
    out[id] = outStockMove(pct);
  }
  return out;
}

// 遊戲日期 gameDate 這一天，哪幾家「沒有新資料」（不是休市）：平日整天沒資料，或那天的資料裡少了這家。
// 休市（null）、週末不算。回傳 id 陣列。畫面用它標「今天沒有新資料」。
export function outStockStale(daily, gameDate, ids) {
  const days = daily && daily.days && typeof daily.days === "object" ? daily.days : {};
  const M = outStockAddDay(gameDate, -1);
  const row = days[M];
  if (row && typeof row === "object") return ids.filter(id => !Object.prototype.hasOwnProperty.call(row, id));
  return outStockWeekend(M) ? [] : ids.slice();
}

// 資料斷了幾天：該有的最新市場日（gameDate 的前一天；它是週末就往前找到週五）減掉資料裡最新的一天。0＝沒斷。
// 超過 OUT_STOCK_NUM.staleDays 就該在伺服器記錄裡喊（console.error）。沒有任何資料回傳 Infinity。
export function outStockAgeDays(daily, gameDate) {
  const days = daily && daily.days && typeof daily.days === "object" ? daily.days : {};
  let want = outStockAddDay(gameDate, -1);
  while (outStockWeekend(want)) want = outStockAddDay(want, -1);
  const have = Object.keys(days).filter(k => days[k] && typeof days[k] === "object").sort().pop();
  if (!have) return Infinity;
  const ms = d => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
  return Math.max(0, Math.round((ms(want) - ms(have)) / 86400000));
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

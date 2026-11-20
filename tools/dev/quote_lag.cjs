// 真實報價源的落後量測（只讀，不碰遊戲、不寫任何東西）：node tools/dev/quote_lag.cjs [--mk us|tw] [--minutes 5] [--every 10] [--wait-until HH:MM（台灣時間）]
//   us：Yahoo chart（遊戲用的 1 分鐘 K 棒）：每 every 秒抓壹次，記「現在 − 最新壹根 K 棒開始時間」、「現在 − meta.regularMarketTime」、最新價有沒有在壹根 K 棒內變動
//   tw：證交所 mis：記「現在 − 最新成交時間（tlong）」
// 結果印落後的最小、中位數、最大（秒）。晚上美股開盤（台灣 22:30）、台股盤中（09:00～13:30）才量得到。
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MK = arg("--mk", "us"), MIN = +arg("--minutes", 5), EVERY = +arg("--every", 10), WAIT = arg("--wait-until", null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const US = ["NVDA", "AAPL", "QQQ"], TW = ["2330", "2454", "2317"];
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
async function us(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }), j = await r.json(), c = j.chart.result[0], ts = c.timestamp, q = c.indicators.quote[0].close;
  let i = ts.length - 1; while (i > 0 && !(q[i] > 0)) i--;
  const now = Date.now(); return { bar: (now - ts[i] * 1000) / 1000, meta: (now - c.meta.regularMarketTime * 1000) / 1000, px: q[i], bars: ts.length };
}
async function tw(code) {
  const now = Date.now(), r = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${code}.tw&json=1&delay=0&_=${now}`, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://mis.twse.com.tw/stock/fibest.jsp" }, signal: AbortSignal.timeout(8000) }), j = await r.json(), m = j.msgArray && j.msgArray[0];
  return m ? { bar: (now - Number(m.tlong)) / 1000, meta: null, px: Number(m.z), bars: null } : null;
}
(async () => {
  if (WAIT) { const [h, m] = WAIT.split(":").map(Number); for (;;) { const t = new Date(Date.now() + 8 * 3600000), mins = t.getUTCHours() * 60 + t.getUTCMinutes(); if (mins >= h * 60 + m && mins < h * 60 + m + 600) break; await sleep(20000); } }
  const syms = MK === "us" ? US : TW, rows = [], end = Date.now() + MIN * 60000; let prev = {};
  console.log(`量測 ${MK}：每 ${EVERY} 秒，${MIN} 分鐘，${syms.join("、")}（只讀）`);
  while (Date.now() < end) {
    for (const s of syms) { try { const x = await (MK === "us" ? us(s) : tw(s)); if (!x) continue; const ch = prev[s] != null && prev[s] !== x.px; prev[s] = x.px; rows.push({ s, ...x, ch }); console.log(`${new Date().toISOString().slice(11, 19)} ${s} 最新壹根/成交落後 ${x.bar.toFixed(0)} 秒${x.meta != null ? "，regularMarketTime 落後 " + x.meta.toFixed(0) + " 秒" : ""}，價 ${x.px}${ch ? "（跟上次不同）" : ""}`); } catch (e) { console.log(s, "失敗", e.message); } }
    await sleep(EVERY * 1000);
  }
  const b = rows.map(r => r.bar), m = rows.filter(r => r.meta != null).map(r => r.meta);
  console.log(`\n結果（${rows.length} 筆）：最新壹根／成交的落後 最小 ${Math.min(...b).toFixed(0)}、中位數 ${med(b).toFixed(0)}、最大 ${Math.max(...b).toFixed(0)} 秒` + (m.length ? `；regularMarketTime 落後 最小 ${Math.min(...m).toFixed(0)}、中位數 ${med(m).toFixed(0)}、最大 ${Math.max(...m).toFixed(0)} 秒` : "") + `；價有變動的比例 ${(rows.filter(r => r.ch).length / Math.max(1, rows.length) * 100).toFixed(0)}%`);
})();

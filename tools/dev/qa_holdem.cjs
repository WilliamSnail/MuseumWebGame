// QA：德州（和任何動錢的桌子）的「守恆快照」（11-21 測試 session：測 PR 956/958 時每手都要手算，寫成暫存腳本用了兩輪）。
//   npm run qa:holdem -- --set 7 [--pid 牌桌號碼] [--base 數字]
// 印：全部館友錢包＋桌上（stack＋put）＋旅客在桌上的籌碼＋莊家 bankroll＋已知世界 world＋預算 budget＋館 museum＋政府 gov。
// 守恆的總額＝錢包＋桌上（扣掉旅客籌碼，因為旅客籌碼莊家帳上已經有）＋莊家＋world＋budget＋museum＋gov；
// 第壹次跑記下 total，之後帶 --base 那個數字，每次印「差」，差不是 0 就是漏錢或多錢。
// 只算 world＋bankroll 不算 budget／museum／gov 的話，背景的世界分帳（npcCrowd 等）會讓總額每幾分鐘飄幾千（11-21 量到 −5,540，剛好等於那三格的增加量）。
// 只連 127.0.0.1 的模擬器。
const { ports } = require("./emu_lib.cjs");
const { fromFs } = require("./emu_doc.cjs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const plain = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFs(v)]));
const dataOf = doc => { const p = plain(doc); return typeof p.data === "string" ? JSON.parse(p.data) : p; };

// 純函式（測試用）：wallets＝每位的 chips 陣列；table＝{ order, seats }（可 null）；house＝casinoHouse/main 的 data
function holdemTotal(wallets, table, house) {
  const w = wallets.reduce((a, b) => a + (Number(b) || 0), 0);
  let tb = 0, npc = 0;
  if (table && table.order) for (const id of table.order) { const s = table.seats[id] || {}, v = (s.stack | 0) + (s.put | 0); tb += v; if (String(id).startsWith("npc:")) npc += v; }
  const h = house || {}, home = (h.bankroll || 0) + (h.world || 0) + (h.budget || 0) + (h.museum || 0) + (h.gov || 0);
  return { wallets: w, table: tb, npcOnTable: npc, house: home, total: w + tb - npc + home, rake: +((JSON.stringify(h).match(/"holdemRake":(\d+)/) || [0, 0])[1]) };
}
async function main() {
  const set = Number(arg("set", 8)), base = `http://127.0.0.1:${ports(set).fs}/v1/projects/demo-pepe4/databases/(default)/documents`, H = { Authorization: "Bearer owner" };
  const get = async p => { const r = await fetch(`${base}/${p}`, { headers: H }); if (!r.ok) return null; return r.json(); };
  const list = async p => ((await (await fetch(`${base}/${p}?pageSize=300`, { headers: H })).json()).documents) || [];
  const wallets = (await list("casinoWallets")).map(d => dataOf(d).chips);
  const t = arg("pid") ? await get(`casinoHoldem/${arg("pid")}`) : null, house = await get("casinoHouse/main");
  const r = holdemTotal(wallets, t ? dataOf(t) : null, house ? dataOf(house) : null);
  console.log(JSON.stringify(r));
  if (arg("base") != null) console.log("差", r.total - Number(arg("base")));
}
if (require.main === module) main().catch(e => { console.error("✗", e.message); process.exit(1); });
module.exports = { holdemTotal };

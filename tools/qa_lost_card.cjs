// QA：直接在模擬器的 Realtime Database 寫一張招領單（lostFound/{id}），測地下遇到、唸名字、送到招領處不用先讓別人理智歸零。
//   node tools/qa_lost_card.cjs --set 3 --owner <uid> [--nick 小華] [--name 迷路的阿華] [--floor 2] [--n 1]
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const SET = Number(arg("set", 8)), owner = arg("owner");
if (!owner) { console.error("要 --owner <uid>（npm run emu:doc -- --set N list members 看得到）"); process.exit(1); }
const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // 台灣時間 05:00 換日
const card = { n: Number(arg("n", 1)), id: `${owner}_${Number(arg("n", 1))}`, owner, ownerNick: arg("nick", "小華"), name: arg("name", "迷路的阿華"), job: "偵探", floor: Number(arg("floor", 2)), made: 7, d: day };
fetch(`http://127.0.0.1:${9100 + 1000 * SET}/lostFound/${card.id}.json?ns=demo-pepe4`, { method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(card) })
  .then(r => r.json()).then(j => console.log("寫好了", JSON.stringify(j))).catch(e => { console.error("✗", e.message); process.exit(1); });

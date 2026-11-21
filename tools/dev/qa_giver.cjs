// QA：交代人互動（決定 0151）的測試用：把某位館友的熟識度改成指定級、看今天誰有臨時拜託（11-21 測試 session）。
// 以前要手動 emu_doc data 改 npcRel，還要自己寫暫存腳本算「這個 uid 今天誰的拜託骰點小於出現率」。
//   npm run qa:giver -- --set 7 --nick 聊乙 --lv clerk=1,scale=2     把熟識度改成 Lv1／Lv2（xp 設成剛好到那級、今天的格子清空）
//   npm run qa:giver -- --set 7 --nick 聊乙 --offers                   印今天各位（照目前等級）會不會出拜託、是哪壹種
//   npm run qa:giver -- --offers --uid 某個uid                         不連模擬器，只用 uid 算（找哪個測試帳號今天剛好有拜託）
// 只連 127.0.0.1 的模擬器；要先有錢包文件（qa:user 會建）。
const path = require("path");
const { spawnSync } = require("./child.cjs");
const { load } = require("../../test/load_shared.cjs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(`--${k}`);
const { login } = require("./emu_lib.cjs");
const G = load();

// 某個 uid 今天每位交代人的拜託骰點（跟 shared/social/giver.js 的 giverOffers 同公式：hash 出來的 0～99，小於 NUM.npcRel.askP[lv-1] 就出）。lvs：{ 交代人id: 級 }
function offersFor(uid, day, lvs = {}) {
  return G.NPC_REL_GIVERS.map(id => {
    const roll = Math.round(G.mulberry32(G.hashStr(`${uid}|${day}|${id}|ask`))() * 100), errands = (G.GIVERS[id] && G.GIVERS[id].errands) || [], lv = lvs[id] || 1;
    const k = Math.floor(G.mulberry32(G.hashStr(`${uid}|${day}|${id}|errand`))() * (errands.length || 1)), er = errands[k];
    return { id, roll, lv, shows: lv >= 1 && roll < G.NUM.npcRel.askP[Math.min(lv, 3) - 1], kind: er ? er.kind : null };
  });
}
const lvXp = lv => (lv <= 0 ? 0 : G.NUM.npcRel.giver.lv[lv - 1]); // 到這級要的 xp（看 NUM.npcRel.lv）
async function main() {
  const set = Number(arg("set", 8)), nick = arg("nick", ""), day = arg("day", G.todayStr());
  let uid = arg("uid", "");
  if (!uid && nick) uid = (await login(set, nick)).uid; // 登入就拿得到 uid（跟網頁同壹個帳號）
  if (!uid) throw new Error("要 --nick 名字或 --uid");
  const lvs = {};
  if (arg("lv")) for (const p of arg("lv").split(",")) {
    const [id, v] = p.split("="), lv = Number(v);
    if (!G.NPC_REL_GIVERS.includes(id) || !(lv >= 0 && lv <= 3)) throw new Error(`看不懂 ${p}（id 要是 ${G.NPC_REL_GIVERS.join("、")}，級 0～3）`);
    lvs[id] = lv;
    const val = JSON.stringify({ xp: lvXp(lv), lv, day, today: { xp: 0 } });
    const r = spawnSync(process.execPath, [path.join(__dirname, "emu_doc.cjs"), "--set", String(set), "data", `casinoWallets/${uid}`, `npcRel.${id}=${val}`], { encoding: "utf8" });
    process.stdout.write(r.stdout + r.stderr);
    if (r.status) process.exit(r.status);
  }
  if (has("offers") || !arg("lv")) for (const o of offersFor(uid, day, lvs)) console.log(`${o.id.padEnd(8)} 骰點 ${String(o.roll).padStart(2)}  Lv${o.lv}${lvs[o.id] === undefined ? "（假設）" : ""} ${o.shows ? "→ 有拜託（" + o.kind + "）" : "沒有"}`);
}
if (require.main === module) main().catch(e => { console.error("✗", e.message); process.exit(1); });
module.exports = { offersFor, lvXp };

// ================================================================
//  旅客說過的話：記進交談紀錄的「旅客交談」那本（決定 0151；11-21 翊文選：另開壹本、每位旅客最多 20 句、不顯示總句數）
//  寫：travelerHeard(旅客id, 說的話, 哪裡)＝把話對回台詞檔的第幾句（content/npc 的 casino.lines／cellar.lines；沒有自己的就是預設那份），
//      組成句子 id 交給伺服器（casino act giver op heard）。同壹句這次進館只送壹次。對不上台詞的（別的字、被截斷太多）不記。
//  讀：travelerText(句子 id) → { text, tag }，圖書館的旅客頁用（ui_giver_log.js）。
//  句子 id：casino.<種類>:<序>、cellar.<種類>:<序>（旅客自己的台詞）；dcasino、dcellar 開頭＝預設那份（旅客自己沒寫）。
//  旅客 id 要是 v-、c- 開頭（劇情角色 t- 不收，伺服器也擋）。
// ================================================================
import { CAS_NPC_LINES } from "../../../shared/casino/npc.js";
import { NPC_COOP_LINES } from "../../../shared/npc/coop.js";
import { NPC_ROSTER } from "../../../shared/npc/roster.js";
import { NET } from "../core/net_firebase.js";

const WHERE = { casino: ["casino", "dcasino", CAS_NPC_LINES, 30], cellar: ["cellar", "dcellar", NPC_COOP_LINES, 200] };
export const travelerOk = id => /^[vc]-[a-z0-9][a-z0-9-]{0,37}$/.test(String(id || ""));
export const travelerName = id => { const n = NPC_ROSTER.find(x => x.id === id); return n ? n.name : id; };
const sent = new Set();
export function travelerHeard(nid, text, where) {
  const W = WHERE[where], n = NPC_ROSTER.find(x => x.id === nid), t = String(text || "");
  if (!W || !n || !t || !travelerOk(nid) || !NET.loggedIn) return;
  const own = (n[W[0]] && n[W[0]].lines) || {};
  for (const [pre, src] of [[W[0], own], [W[1], W[2]]]) {
    for (const kind of Object.keys(src)) {
      const arr = Array.isArray(src[kind]) ? src[kind] : [], i = arr.findIndex(s => String(s).slice(0, W[3]) === t.slice(0, W[3]));
      if (i < 0) continue;
      const sid = `${pre}.${kind}:${i}`, key = nid + "|" + sid;
      if (sent.has(key)) return;
      sent.add(key);
      NET.call("casino", { act: "giver", op: "heard", id: nid, ids: [sid] }).catch(() => { sent.delete(key); });
      return;
    }
  }
}
export function travelerText(nid, sid) {
  const n = NPC_ROSTER.find(x => x.id === nid), m = /^(d?)(casino|cellar)\.([a-z]+):(\d+)$/.exec(String(sid));
  if (!n || !m) return null;
  const W = WHERE[m[2]], src = m[1] ? W[2] : (n[m[2]] && n[m[2]].lines) || {}, a = src[m[3]], s = Array.isArray(a) ? a[Number(m[4])] : null;
  return s ? { text: String(s), tag: m[2] === "casino" ? "牌桌" : "地下" } : null;
}

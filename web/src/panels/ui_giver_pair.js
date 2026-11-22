// ================================================================
//  串門子：兩位交代人同時間在同壹個地方說話（11-22；規則 shared/social/giver.js 的 giverPairAt，台詞在各人檔的 pairs）
//  giverPairScene(place)＝壹張同框的卡：兩位的頭像、名字、壹人壹句輪流說。現在的時段、今天、這個地點沒有串門子就回 null。
//  place 是 pairs 裡的 where：巷口、銀行旁、夜市口、餐車、牌桌邊。各房間用 ADDONS.giverPair(place) 放（不用互相 import）。
//  看到了就記進交談紀錄（記在字母順序在前那位名下，ui_giver_log.js 兩位的本子都查得到）；同壹段壹天只記壹次。
//  樣式在 css/tasks.css（前綴 gv-pair）。介面文字用「壹」。
// ================================================================
import { giverPairAt } from "../../../shared/social/giver.js";
import { todayStr } from "../../../shared/core/logic_base.js";
import { giverName } from "../../../shared/story/core.js";
import { NET } from "../core/net_firebase.js";
import { ADDONS, h } from "../core/ui_core.js";
import { giverHeard, giverSlot } from "./ui_giver_talk.js";
import { giverAv } from "./ui_tasks.js";

const sent = new Set();
export function giverPairScene(place) {
  const day = todayStr(), p = giverPairAt(giverSlot(), day, (NET.me && NET.me.id) || "");
  if (!p || p.where !== place) return null;
  const key = day + p.sid;
  if (!sent.has(key)) { sent.add(key); giverHeard(p.a, [p.sid]); }
  const side = id => (id === p.a ? "l" : "r");
  return h("div", { class: "gv-pair", role: "note" },
    h("div", { class: "gv-pair-h" }, giverAv(p.a, { small: true }), h("small", null, `${giverName(p.a)}和${giverName(p.b)}，在${p.where}`), giverAv(p.b, { small: true })),
    h("ul", null, p.talk.map(t => h("li", { class: "s-" + side(t.by) }, h("b", null, giverName(t.by)), h("span", null, t.say)))));
}
ADDONS.giverPair = giverPairScene;

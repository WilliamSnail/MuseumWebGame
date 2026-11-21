// ================================================================
//  交代人在自己待的地方說今天交代的那句（翊文 11-21：「荷官也是壹個任務交代人吧，沒有相應的互動嗎」→ 五位交代人壹起）
//  零件：giverNote(id)＝壹位交代人的字條（頭像、名字、在哪、現在說的那句：沒做完 says、做完換 done；今天沒交代他就回 null）。
//  giverStrip([id, …])＝把有話說的字條排在壹起（都沒有就回 null）。資料來自 ui_story.js 的 giverTaskLine（內容在每週的 daily 任務），位置照 ui_tasks.js 的 GIVER_WHERE。
//  放的地方：郵差＝地圖的信箱、站內信箱；店員＝任務板「其他要做的事」、銀行；阿秤＝銀行、地圖的夜市；號碼機＝地下收藏庫（B1 小門旁）；荷官 Yuga Bot＝賭場牌桌（ui_casino.js）；堂主＝餐車（ui_casino.js 的字條，原本就有）。
//  樣式在 css/tasks.css（前綴 gv-）。介面文字用「壹」。
// ================================================================
import { giverName } from "../../../shared/story/core.js";
import { ADDONS, h } from "../core/ui_core.js";
import { giverTalk } from "./ui_giver_talk.js";
import { giverTaskLine } from "./ui_story.js";
import { GIVER_WHERE, giverAv } from "./ui_tasks.js";

// 今天有交代就說那句；沒有交代也留著（可以聊、送佩佩）。互動（閒聊、熟識度、拜託、送佩佩）在 ui_giver_talk.js（11-21）
export function giverNote(id) {
  const gl = giverTaskLine(id), name = gl ? gl.name : giverName(id);
  return h("div", { class: "gv-note" + (gl && gl.done ? " done" : ""), role: "note" }, giverAv(id, { small: true }),
    h("div", { class: "gv-t" }, h("b", null, name), h("small", null, "・在" + (GIVER_WHERE[id] || "館裡")), gl ? h("p", null, gl.text) : null, giverTalk(id)));
}
export function giverStrip(ids) {
  const list = ids.map(giverNote).filter(Boolean);
  return list.length ? h("div", { class: "gv-strip" }, list) : null;
}
ADDONS.giverStrip = giverStrip; // 各房間用 ADDONS.giverStrip([id]) 放（不用互相 import）

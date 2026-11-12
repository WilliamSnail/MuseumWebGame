// ================================================================
//  合作地下收藏庫的地圖選路畫面（地下室改版，決定 0067；規劃 docs/地下室改版規劃.md 第三節、第八節「選路的畫面」）
//  規則在 shared/coop_route.js；伺服器在 functions/coop.js（動作 route、rest、ack）。這個檔只畫伺服器給的樣子。
//  ui_coop.js 在 phase 是 route、rest、chest 的時候叫這裡：routeStage（上面的地圖）、routeCard／restCard／chestCard（下面的卡片）。
//  第八節：最上面一行寫現在要做什麼；能走的點會跳、有框、有字；點一個先看小卡（是什麼、誰投了這裡），再按「走這裡」才算投票；
//    最下面一直有「撤退」。
//  圖：web/public/cellar2/map-node.webp（探索、遭遇、寶箱、休息、守門，一條五格）、map-mark.webp（爪痕 1～3、棋子、標籤、印章）
// ================================================================
import { NUM } from "../../shared/config.js";
import { cellarFloor } from "../../shared/logic3.js";
import { describePepe, fromKey } from "../../shared/logic.js";
import { COOP_ROUTE_KIND } from "../../shared/coop_route.js";
import { btn, h, itemHTML, ptNode, snd } from "./ui_core.js";

const NODE_ICON = { explore: 0, foe: 1, chest: 2, rest: 3, gate: 4 };
const KIND_HINT = {
  explore: "原本的房間：大家壹起投票、看同壹顆骰子。",
  foe: "壹隻這壹層的怪物。打贏有壹點靈感，也可以逃。",
  chest: "壹件小事，有好有壞。",
  rest: "每個人選壹個：回壹點理智，或治好這壹趟受傷的佩佩。",
  gate: "這壹層的守門。打贏才算走完這壹層。",
};
const nameOf = (v, id) => (v.members.find(m => m.id === id) || {}).name || "";
const voterNames = (v, node) => v.members.filter(m => v.votes && v.votes[m.id] === node).map(m => m.name);
function roomTitle(v, n) {
  const f = cellarFloor(v.floor), r = f && n.room ? f.rooms.find(x => x.id === n.room) : null;
  return r ? r.title : "";
}
const icon = kind => h("span", { class: "rt-ico", style: { backgroundPosition: `${(NODE_ICON[kind] || 0) * 25}% 0` }, "aria-hidden": "true" });
const claws = rank => h("span", { class: "rt-rank", title: `等級 ${rank}`, style: { backgroundPosition: `${(Math.max(1, Math.min(3, rank)) - 1) * 20}% 0` }, "aria-label": `等級 ${rank}` });

// 上面的地圖：從上往下，現在站的點發亮，能走的下一個點會跳、有框、寫名字
// sel ＝我點開來看的那一個；onSel(id) 點了
export function routeStage(v, sel, onSel) {
  const map = v.cmap;
  if (!map) return h("div", { class: "rt-map" });
  const next = map.next || [], path = map.path || [];
  const node = n => {
    const can = next.includes(n.id), done = path.includes(n.id) && n.id !== map.at, here = n.id === map.at;
    const who = voterNames(v, n.id);
    const label = n.kind === "explore" && (can || done || here) ? ptNode(roomTitle(v, n)) : COOP_ROUTE_KIND[n.kind];
    return h("button", { type: "button", class: `rt-node k-${n.kind}` + (can ? " next" : "") + (done ? " done" : "") + (here ? " here" : "") + (sel === n.id ? " sel" : "") + (n.daily ? " daily" : ""),
      disabled: !can, "aria-pressed": String(sel === n.id), onClick: () => { if (can) { onSel(n.id); snd("click"); } } },
      icon(n.kind),
      h("b", { class: "rt-name" }, label),
      n.kind === "foe" ? claws(n.rank || 1) : null,
      n.daily ? h("span", { class: "rt-today" }, "今天") : null,
      here ? h("span", { class: "rt-here" }, "你們在這裡") : null,
      who.length ? h("span", { class: "rt-votes" }, who.join("、")) : null);
  };
  return h("div", { class: "rt-map fl" + v.floor, role: "group", "aria-label": `B${v.floor} 的地圖` },
    map.rows.map((row, i) => h("div", { class: "rt-row" + (row.some(n => next.includes(n.id)) ? " now" : "") }, h("span", { class: "rt-step" }, `${i + 1}`), row.map(node))),
    h("div", { class: "rt-row rt-gate" + (next.includes(map.gate.id) ? " now" : "") }, h("span", { class: "rt-step" }, "門"), node(map.gate)));
}

// 剛打完的路上怪物：壹行寫結果
function lastLine(v) {
  const L = v.fightLast;
  if (!L || L.kind !== "foe" || !v.routeLast || v.routeLast.kind !== "foe" || v.routeLast.node !== (v.cmap && v.cmap.at)) return null;
  if (L.over === "win") return h("p", { class: "cx-reward" }, `打倒了「${L.name}」${L.last ? "，最後壹下是 " + nameOf(v, L.last) : ""}`);
  if (L.over === "flee") return h("p", { class: "cx-text" }, `從「${L.name}」那裡逃開了。沒有獎勵，繼續往下走。`);
  if (L.over === "away") return h("p", { class: "cx-text" }, `打太久，「${L.name}」自己走掉了。`);
  return null;
}

// 選路的卡片。api ＝ { sel, mine：我投的, go(node)：投票 }
export function routeCard(v, me, api) {
  const map = v.cmap || { rows: [], next: [] };
  const can = !me.ghost && !me.guard;
  const waiting = v.members.filter(m => !m.out && !m.ghost && !m.guard && !(v.votes && v.votes[m.id] !== undefined)).map(m => m.name);
  const mine = api.mine != null ? api.mine : v.votes ? v.votes[v.me] : undefined;
  const all = map.rows.flat().concat([map.gate]).filter(Boolean);
  const n = api.sel ? all.find(x => x.id === api.sel) : null;
  const title = !can ? "等大家選路" : mine !== undefined ? (waiting.length ? `選好了。等 ${waiting.join("、")}` : "出發……") : "現在：選下壹個點";
  const leader = v.members.find(m => m.id === v.leader);
  const info = n ? h("div", { class: "rt-info k-" + n.kind },
    h("h3", null, icon(n.kind), " ", COOP_ROUTE_KIND[n.kind], n.kind === "explore" ? h("span", null, "：", ptNode(roomTitle(v, n))) : null),
    h("p", null, KIND_HINT[n.kind]),
    n.kind === "foe" ? h("p", { class: "rt-peek" }, claws(n.rank || 1), ` 等級 ${n.rank || 1}（爪痕越多越強）`, n.mood ? `・心情：${n.mood}` : "", n.color ? `・顏色：${n.color}` : "", n.daily ? "・今天才有的" : "") : null,
    n.kind === "rest" ? h("p", { class: "rt-peek" }, `回理智 +${NUM.cellarMap.restSan}（今天還有獎勵的趟才有）`) : null,
    voterNames(v, n.id).length ? h("p", { class: "rt-peek" }, `投這裡的：${voterNames(v, n.id).join("、")}`) : null,
    can ? btn(mine === n.id ? "選好了，可以改" : "走這裡", () => api.go(n.id), "primary" + (mine === n.id ? " cx-on" : ""), { "aria-pressed": String(mine === n.id) }) : null)
    : h("p", { class: "pt-hint rt-tip" }, can ? "點地圖上會跳的點，先看看是什麼，再按「走這裡」。" : "你現在不能投票，看大家怎麼走。");
  return h("div", { class: "note-card room-card cx-card rt-card" }, h("i", { class: "pin" }),
    h("h2", { class: "room-title fg-now" }, title, h("span", { class: "cx-clock" })),
    lastLine(v),
    leader ? h("p", { class: "pt-sub" }, `大家投票；平手 ${leader.name}（領隊）決定；沒投的時候先走探索房。`) : null,
    info,
    h("div", { class: "cx-card-foot" },
      can ? btn(["撤退", h("small", null, "大家壹起回地面（要過半）"), h("span", { class: "cx-vs" }, voterNames(v, "retreat"))], () => api.go("retreat"), "ghost small fg-exit" + (mine === "retreat" ? " cx-on" : ""), { "aria-pressed": String(mine === "retreat") }) : null,
      h("span", { class: "pt-hint cx-wait" }, waiting.length ? `等 ${waiting.join("、")}` : "")));
}

// 休息：每個人選壹個
export function restCard(v, me, api) {
  const can = !me.ghost && !me.guard;
  const mine = api.mine != null ? api.mine : v.votes ? v.votes[v.me] : undefined;
  const hurt = (me.got && me.got.injured) || [];
  // 受傷的佩佩已經離開隊伍（v.team 裡找不到），用 key 畫回來，旁邊寫是哪壹隻
  const item = key => { const pick = fromKey(key); return pick ? h("span", { class: "rt-hurt" }, h("span", { class: "rt-pet", html: itemHTML({ kind: "pepe", key, pick }) }), h("small", null, describePepe(pick).title)) : null; };
  const waiting = v.members.filter(m => !m.out && !m.ghost && !m.guard && !(v.votes && v.votes[m.id] !== undefined)).map(m => m.name);
  return h("div", { class: "note-card room-card cx-card rt-card" }, h("i", { class: "pin" }),
    h("h2", { class: "room-title fg-now" }, !can ? "大家在休息" : mine ? (waiting.length ? `選好了。等 ${waiting.join("、")}` : "……") : "休息：選壹個", h("span", { class: "cx-clock" })),
    h("p", { class: "cx-text" }, "油燈下面鋪著壹條毯子。守門前，喘口氣。"),
    can ? h("div", { class: "fg-acts rt-rest" },
      btn([h("b", null, "回理智"), h("small", null, `理智 +${NUM.cellarMap.restSan}（今天還有獎勵的趟才有）`)], () => api.pick("san"), "fg-act a-calm" + (mine === "san" ? " cx-on" : ""), { "aria-pressed": String(mine === "san") }),
      btn([h("b", null, "治好受傷的佩佩"), h("small", null, hurt.length ? "這壹趟受傷的：" : "這壹趟沒有受傷的"), hurt.length ? h("span", { class: "rt-pets" }, hurt.map(item)) : null], () => api.pick("heal"), "fg-act a-guard" + (mine === "heal" ? " cx-on" : ""), { disabled: !hurt.length, "aria-pressed": String(mine === "heal") }))
      : h("p", { class: "pt-hint" }, "你現在不能選。"),
    h("p", { class: "pt-hint" }, "沒選的當成回理智。"));
}

// 寶箱：開出來的東西，看完按繼續
export function chestCard(v, me, api) {
  const c = v.chest || {}, got = (c.got || {})[v.me] || null;
  const head = { good: "開到好東西", odd: "怪怪的", bad: "糟了" }[c.outcome] || "寶箱";
  const acked = !!(v.acks && v.acks[v.me]);
  const waiting = v.members.filter(m => !m.out && !(v.acks && v.acks[m.id])).map(m => m.name);
  return h("div", { class: "note-card room-card cx-card rt-card rt-chest k-" + (c.outcome || "odd") }, h("i", { class: "pin" }),
    h("h2", { class: "room-title fg-now" }, head, h("span", { class: "cx-clock" })),
    h("p", { class: "cx-text" }, c.text || ""),
    got && got.insp ? h("p", { class: "cx-reward" }, `靈感 +${got.insp}`) : null,
    got && got.san ? h("p", { class: "cx-hurtline" }, `理智 −${got.san}`) : null,
    !got && c.outcome === "good" ? h("p", { class: "pt-sub" }, "今天的獎勵趟用完了，這次沒有靈感。") : null,
    h("div", { class: "cx-card-foot" }, btn(acked ? "等大家看完" : "繼續", () => api.ack(), "primary", { disabled: acked }), h("span", { class: "pt-hint cx-wait" }, acked && waiting.length ? `等 ${waiting.join("、")}` : "")));
}

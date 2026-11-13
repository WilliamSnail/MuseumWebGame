// ================================================================
//  招領：在地下遇到別的館友以前理智歸零的參觀者（翊文 11-13；規則 shared/lostfound.js，伺服器 functions/lostfound.js）
//  不叫幽靈：他沒有變成鬼，是沒有走出去。地上有壹張招領單，夾著他的號碼牌。
//  - 進館的時候（afterEnter）叫壹次 lostSync：把自己館裡最近理智歸零的參觀者寫成公開的招領單（Jerry 那種之前的也會補上）。
//  - 單人和合作的地下，每壹層第壹次進房間擲壹次，NUM.lost.meetPct% 會遇到壹張別人的（跟 ui_work.js 的 cellarMeet 同壹套）。
// ================================================================
import { NUM } from "../../shared/config.js";
import { isFree, todayStr } from "../../shared/logic.js";
import { LOST_TEXT, lostMarkSeen, lostOpen, lostRecordText, lostSeeText } from "../../shared/lostfound.js";
import { NET } from "./net_firebase.js";
import { ADDONS, P, SAVE, UI, btn, h, persist, rerender, sanFlow, snd, updateStatus } from "./ui_core.js";
import { reloadSave } from "./ui_login.js";

const C = () => (SAVE && SAVE.profiles ? SAVE.profiles.challenge : null);
const on = () => !!(UI.net && NET.loggedIn && C() && !isFree(C()));
const fillT = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? "" : String(o[k])));

// ---------- 進館時：把自己館裡的寫上去（存檔要先傳上去，所以等壹下；壹次進館叫壹次） ----------
let syncAt = 0;
function lostSync() {
  if (!on() || Date.now() - syncAt < 5 * 60000) return;
  syncAt = Date.now();
  setTimeout(() => { NET.call("lostSync", {}).catch(() => {}); }, 4000);
}
ADDONS.lostSync = lostSync;

// ---------- 地下遇到壹張 ----------
const plans = new Map(); // 「第幾層」→ { c, roomId, done } 或 null
let listAt = 0, listVal = null;
async function readList() {
  if (Date.now() - listAt < 60000 && listVal) return listVal;
  listVal = (await NET.read("lostFound")) || {};
  listAt = Date.now();
  return listVal;
}
function lostCard(plan) {
  const c = plan.c, box = h("div", { class: "meet-card lost-card", role: "group", "aria-label": "招領單" });
  const draw = (msg, tone) => {
    const done = plan.done;
    const acts = done ? null : h("div", { class: "meet-acts" },
      btn([LOST_TEXT.ret, h("small", null, fillT(LOST_TEXT.retWhy, { insp: NUM.lost.finderInsp, owner: c.ownerNick || "館友" }))], () => giveBack(), "small"),
      btn([LOST_TEXT.read, h("small", null, LOST_TEXT.readWhy)], () => readName(), "small"),
      btn(LOST_TEXT.leave, () => leave(), "small ghost"));
    box.replaceChildren(h("p", { class: "meet-see" }, lostSeeText(c)), acts, msg ? h("p", { class: "meet-msg " + (tone || "") }, msg) : null);
  };
  const seen = () => { const Pc = C(); if (Pc && lostMarkSeen(Pc, c.id, todayStr())) persist(); };
  async function giveBack() {
    if (plan.busy) return;
    plan.busy = true;
    try {
      const r = await NET.call("lostReturn", { id: c.id });
      if (!r || !r.ok) { snd("error"); plan.done = true; seen(); draw((r && r.reason) || LOST_TEXT.gone, "bad"); }
      else {
        plan.done = true; snd("coin");
        if (r.rev) { try { await reloadSave(r.rev); } catch (e) { /* 下次存的時候會再讀 */ } }
        updateStatus(); draw(r.line, "good");
      }
    } catch (e) { draw((e && e.message) || "沒辦法", "bad"); }
    plan.busy = false;
  }
  async function readName() {
    if (plan.busy) return;
    plan.busy = true;
    plan.done = true; seen(); draw();
    await sanFlow(NUM.lost.readSan, `lost:${c.id}`, LOST_TEXT.read);
    persist(); updateStatus();
    draw(lostRecordText(c));
    plan.busy = false;
    if (P && P.dark) rerender(); // 理智用完了：交給原本的流程
  }
  function leave() { plan.done = true; seen(); draw(LOST_TEXT.leaveLine); }
  draw(c.back ? LOST_TEXT.back : null);
  return box;
}
// 單人和合作的地下，每間房都叫：這壹層遇到的那間才回壹張卡，其他回 null（先放壹個空的，名單讀到了再填）
export function cellarLost(room, floor) {
  if (!on() || !room) return null;
  const key = String(floor);
  if (plans.has(key)) { const p = plans.get(key); return p && p.roomId === room.id ? lostCard(p) : null; }
  plans.set(key, null);
  if (Math.random() * 100 >= NUM.lost.meetPct) return null; // 這壹層沒遇到（畫面的機會，跟 cellarMeet 壹樣用 Math.random）
  const slot = h("div", { class: "meet-slot" });
  readList().then(all => {
    const me = NET.me && NET.me.id, today = todayStr(), seen = (C() && C().lostSeen) || {};
    const list = Object.values(all || {}).filter(c => lostOpen(c, me, today, seen));
    if (!list.length) return;
    const plan = { c: list[Math.floor(Math.random() * list.length)], roomId: room.id, done: false };
    plans.set(key, plan);
    if (slot.isConnected) slot.replaceWith(lostCard(plan));
  }).catch(() => {});
  return slot;
}
ADDONS.cellarLost = cellarLost;

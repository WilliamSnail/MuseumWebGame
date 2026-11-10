// ================================================================
//  欠款送參觀者去地下工作的畫面（決定 0064 第二部分）
//  翊文 11-10：籌碼是負的就要選壹位自己的參觀者送去地下室工作，每天還開工那天欠款的 34%，還清才回來；
//  工作的參觀者每天理智 −5（最低 1），可以花博物館的靈感幫他補。
//  規則在 shared/casino_wallet.js 的 casWork*（錢和理智在伺服器的錢包），「誰在工作」記在存檔（shared/visitors.js 的 sendToWork、backFromWork）。
//  這裡只畫：要送人時跳的視窗（不選不能繼續玩挑戰模式）、花靈感幫他、回來的通知。伺服器改了存檔就重新讀（reloadSave）。
//  入口：連上時、進館時、「今天」清單、賭場讀到錢包時都會叫 ADDONS.workPeek / ADDONS.workCheck。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { NUM } from "../../shared/config.js";
import { CAS_TEXT } from "../../shared/casino_text.js";
import { casFill, casNum } from "../../shared/casino.js";
import { jobInfo } from "../../shared/logic3.js";
import { freeSlots, visitorName, workCandidates, workingVisitor } from "../../shared/visitors.js";
import { NET } from "./net_firebase.js";
import { ADDONS, SAVE, UI, btn, h, miniLayer, note, persist, rerender, snd } from "./ui_core.js";
import { reloadSave, refreshLogin } from "./ui_login.js";
import { addVisitorFlow } from "./ui_screens1.js";
import { casinoRefresh } from "./ui_casino.js";

const fill = casFill;
const C = () => (SAVE && SAVE.profiles ? SAVE.profiles.challenge : null);
const on = () => !!(UI.net && NET.loggedIn && C());
let layer = null, busy = false, lastPeek = 0;

async function call(act, data) {
  const r = await NET.call("casino", Object.assign({ act }, data || {}));
  return r || { ok: false, reason: "沒辦法" };
}
// 伺服器改了存檔：重新讀，畫面跟著換
async function afterSave(r) {
  if (r && r.rev) { try { await reloadSave(r.rev); } catch (e) { /* 下次存的時候會碰到衝突，再讀壹次 */ } }
  if (UI.screen === "title") refreshLogin(); else rerender();
  casinoRefresh(); // 賭場開著的話，銀行那壹塊跟著換
}

// 讀到錢包的摘要（peek 或賭場的 wallet）：r.work、r.mustWork、r.debt
export async function workPeek(r) {
  if (!r || !on()) return;
  UI.work = r.work || null;
  if (busy) return;
  const P0 = C();
  // 還清了：叫他回來
  if ((r.work && r.work.done) || (!r.work && workingVisitor(P0))) {
    busy = true;
    try {
      await NET.flush().catch(() => {});
      const x = await call("workEnd");
      if (x.ok) { UI.work = null; await afterSave(x); if (x.back && x.lines) { note(x.lines[0], "good"); snd("coin"); } }
    } catch (e) { /* 下次再試 */ }
    busy = false;
    return;
  }
  if (r.mustWork) sendLayer(Number.isFinite(r.debt) ? r.debt : r.chips < 0 ? -r.chips : 0);
}
// 自己去讀壹次（進館時）。30 秒內讀過就不讀
export async function workCheck(force) {
  if (!on() || (!force && Date.now() - lastPeek < 30000)) return;
  lastPeek = Date.now();
  try { await workPeek(await call("peek")); } catch (e) { /* 讀不到就算了，下次進館再看 */ }
}

// ---------- 要送人下去：跳壹個視窗，選壹位（沒有關掉的按鈕：不選不能繼續玩挑戰模式） ----------
function sendLayer(debt) {
  if (layer && layer.layer.isConnected) return;
  const W = NUM.casino.work, P0 = C();
  if (!P0) return;
  const pay = Math.ceil(debt * W.payPct / 100);
  layer = miniLayer(CAS_TEXT.workTitle, fill(CAS_TEXT.workBody, { debt: casNum(debt), pay: casNum(pay), pct: W.payPct, san: W.sanDay, min: W.sanMin }));
  layer.card.classList.add("work-card");
  const list = h("div", { class: "work-list" }, workCandidates(P0).map(v => {
    const j = v.job ? jobInfo(v.job) : null;
    return h("div", { class: "work-who" },
      h("span", { class: "work-name" }, h("b", null, visitorName(v)), h("small", null, [j ? j.name : "", `理智 ${v.sanity}`, P0.vid === v.vid ? "現在在場" : ""].filter(Boolean).join("・"))),
      btn(CAS_TEXT.workPick, () => send(v.vid), "primary small"));
  }));
  layer.card.append(list, h("p", { class: "sub work-note" }, "籌碼回到 0 以上（大禮包、跟 Yuga Bot 借、別人幫忙都算）他就會回來。"));
}
async function send(vid) {
  if (busy) return;
  busy = true;
  try {
    await NET.flush().catch(() => {});
    let r = await call("workStart", { vid });
    if (!r.ok && r.needNew) {
      // 現在這位是唯壹能上場的：先請壹位新的進來（取名字、擲心情、選職業），再送他下去
      const open = freeSlots(C());
      if (!open.length) { note(r.reason, "bad"); busy = false; return; }
      note(r.reason, "bad");
      if (layer) { layer.close(); layer = null; }
      await addVisitorFlow(open[0]);
      persist();
      await NET.flush().catch(() => {});
      if (C().vid === vid) { busy = false; workCheck(true); return; } // 取名字按了「算了」：還是同壹位，視窗再跳出來
      r = await call("workStart", { vid });
    }
    if (!r.ok) { note(r.reason || "沒辦法", "bad"); snd("error"); busy = false; return; }
    if (layer) { layer.close(); layer = null; }
    UI.work = r.wallet ? r.wallet.work : null;
    await afterSave(r);
    if (r.lines && r.lines[0]) note(r.lines[0], "good");
    snd("coin");
  } catch (e) { note((e && e.message) || "沒辦法", "bad"); }
  busy = false;
}

// ---------- 花靈感幫他補理智 ----------
export function workCheerLayer() {
  const x = UI.work, P0 = C();
  if (!x || !P0) { note(CAS_TEXT.workNone, "bad"); return; }
  const W = NUM.casino.work, room = Math.max(0, x.san0 - x.san);
  const m = miniLayer(fill(CAS_TEXT.workCheerTitle, { name: x.name }), fill(CAS_TEXT.workCheerBody, { n: W.inspPerSan, san0: x.san0, insp: P0.insp }));
  const go = async n => {
    if (busy) return;
    busy = true;
    try {
      await NET.flush().catch(() => {});
      const r = await call("workCheer", { n });
      if (!r.ok) { note(r.reason || "沒辦法", "bad"); snd("error"); }
      else { UI.work = r.wallet ? r.wallet.work : UI.work; m.close(); await afterSave(r); note(r.lines[0], "good"); snd("coin"); }
    } catch (e) { note((e && e.message) || "沒辦法", "bad"); }
    busy = false;
  };
  const opts = [1, 5, 10].filter(n => n < room).map(n => btn(`+${n}（${n * W.inspPerSan} 靈感）`, () => go(n), "small"));
  m.card.append(h("p", null, fill(CAS_TEXT.workLine, { name: x.name, san: x.san, san0: x.san0, debt: casNum(x.debt), days: x.days })),
    room ? h("div", { class: "work-cheer" }, opts, btn(`補滿 +${room}（${room * W.inspPerSan} 靈感）`, () => go(room), "primary small")) : h("p", { class: "sub" }, CAS_TEXT.workFull),
    h("div", { class: "work-close" }, btn("先這樣", () => m.close(), "ghost small")));
}
// 壹行字（賭場的銀行、門口的位子用）
export function workLine() {
  const x = UI.work;
  return x ? fill(CAS_TEXT.workLine, { name: x.name, san: x.san, san0: x.san0, debt: casNum(x.debt), days: x.days }) : "";
}

ADDONS.workPeek = workPeek;
ADDONS.workCheck = workCheck;
ADDONS.workCheer = workCheerLayer;
ADDONS.workLine = workLine;

// ---------- 別的館友在地下遇到他（決定 0064 第三部分） ----------
// 每壹層第壹次進房間時擲壹次：NUM.casino.work.meetPct% 會遇到壹位在工作的（不是自己的）。名單在 Realtime Database 的 workers（伺服器寫的）
const meetPlan = new Map(); // 「第幾層」→ { uid, v, roomId } 或 null
let workersAt = 0, workersVal = null;
async function readWorkers() {
  if (Date.now() - workersAt < 60000 && workersVal) return workersVal;
  workersVal = (await NET.read("workers")) || {};
  workersAt = Date.now();
  return workersVal;
}
function meetCard(plan) {
  const v = plan.v, box = h("div", { class: "meet-card", role: "group", "aria-label": `遇到${v.name}` });
  const draw = (msg, tone) => {
    const done = plan.done || {};
    const act = async (kind, tpl) => {
      if (plan.busy) return;
      plan.busy = true;
      try {
        const r = await call("workMeet", { to: plan.uid, kind, tpl });
        if (!r.ok) { snd("error"); draw(r.reason || "沒辦法", "bad"); }
        else { plan.done = Object.assign({}, done, { [kind]: true }); if (Number.isFinite(r.san)) v.san = r.san; snd("coin"); draw(r.line, "good"); }
      } catch (e) { draw((e && e.message) || "沒辦法", "bad"); }
      plan.busy = false;
    };
    const W = NUM.casino.work;
    const sel = h("select", { class: "meet-sel", "aria-label": "要留的話" }, CAS_TEXT.meetNotes.map((t, i) => h("option", { value: String(i) }, t)));
    box.replaceChildren(
      h("p", { class: "meet-see" }, fill(CAS_TEXT.meetSee, { name: v.name, owner: v.owner, san: v.san })),
      h("div", { class: "meet-acts" },
        btn(fill(CAS_TEXT.meetHello, { n: W.helloSan }), () => act("hello"), "small", { disabled: done.hello ? true : null }),
        btn(fill(CAS_TEXT.meetGive, { n: casNum(W.giveChips) }), () => act("give"), "small", { disabled: done.give ? true : null }),
        h("span", { class: "meet-note" }, sel, btn(CAS_TEXT.meetNote, () => act("note", Number(sel.value)), "small", { disabled: done.note ? true : null }))),
      msg ? h("p", { class: "meet-msg " + (tone || "") }, msg) : null);
  };
  draw();
  return box;
}
// 單人和合作的地下，每間房都叫：這壹層遇到的那間才回壹張卡，其他回 null（先放壹個空的，名單讀到了再填）
export function cellarMeet(room, floor) {
  if (!on() || !room) return null;
  const key = String(floor);
  if (meetPlan.has(key)) { const p = meetPlan.get(key); return p && p.roomId === room.id ? meetCard(p) : null; }
  meetPlan.set(key, null);
  if (Math.random() * 100 >= NUM.casino.work.meetPct) return null; // 這壹層沒遇到
  const slot = h("div", { class: "meet-slot" });
  readWorkers().then(all => {
    const me = NET.me && NET.me.id;
    const list = Object.keys(all || {}).filter(uid => uid !== me && all[uid] && all[uid].name).map(uid => ({ uid, v: all[uid] }));
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    const plan = { uid: pick.uid, v: Object.assign({}, pick.v), roomId: room.id };
    meetPlan.set(key, plan);
    if (slot.isConnected) slot.replaceWith(meetCard(plan));
  }).catch(() => {});
  return slot;
}
ADDONS.cellarMeet = cellarMeet;

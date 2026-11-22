// ================================================================
//  每個房間的「這裡現在 N 人」（翊文 11-16：「可以再每個展廳寫目前的人數然後可以像大廳那樣看誰在那裡面可以點旅客卡嗎」）
//  - 放在每個房間標題下面、「回大廳」旁邊（ui_screens1.js 的 roomHead 叫 ADDONS.roomPeople(房間)）：壹顆小按鈕「這裡現在 N 人」，點了開名單：
//    館友（matesByRoom）、旅客（名字用 npcName，點了開旅客卡）、散客（crowdSummary 併起來）。
//  - 人數＝館友＋peek 的 now.rooms[房間].n（賭場再加被館友邀去的 now.casino）。名單是 now.rooms[房間].ids／names／groups（伺服器還沒給就只寫人數）。
//  - 我的展廳（hall）用 ui_hallnow.js 原本的名單（openAll）。
//  - 資料是 ui_today.js 的 readCasino 讀 peek 時記進 UI.hallNow；讀到新的就跟著換（ui_hallnow.js 的 hallNowWatch）。開發時沒登入用假資料。
// ================================================================
import { matesByRoom } from "../../../shared/social/mates.js";
import { NET } from "../core/net_firebase.js";
import { ADDONS, FRIEND_ACTIONS, ROOM_NAMES, UI, btn, closeOnOutside, h, icon, miniLayer, roomLabel, titleTag } from "../core/ui_core.js";
import { crowdSummary, hallNowWatch, hallPeople, openAll } from "./ui_hallnow.js";
import { npcName } from "../panels/ui_npc_card.js";
import { npcSanBadge } from "../core/ui_stat.js";

// 畫面 id（也是大廳的房間 id）→ 要不要放這顆鈕
export const ROOM_PEOPLE = ["gallery", "origin", "fusion", "pillow", "codex", "commission", "workshop", "cellar", "bank", "office", "hall", "casino"];
const fake = () => import.meta.env.DEV && !NET.me;
const FAKE_ROOMS = { gallery: { n: 4, npc: 1, crowd: 3, ids: ["fake-a"], names: ["夜班的畫商"], groups: [{ label: "三位學生", n: 3 }] }, origin: { n: 2, npc: 2, crowd: 0, ids: ["fake-a", "fake-b"], names: ["夜班的畫商", "戴帽子的旅客"], groups: [] }, bank: { n: 1, npc: 1, crowd: 0, ids: ["fake-b"], names: ["戴帽子的旅客"], groups: [] } };

// 這個房間現在的人：{ mates: [{ nick }], npc: [{ id, name }], npcN, groups, crowdN, n, known }
export function roomPeople(room) {
  const by = matesByRoom(NET.roster || []), now = UI.hallNow, rooms = now && now.rooms && typeof now.rooms === "object" ? now.rooms : fake() ? FAKE_ROOMS : null;
  const mates = (by[room] || []).map(m => ({ nick: m.nick, id: m.id }));
  if (!mates.length && fake() && room === "gallery") mates.push({ nick: "阿福（開發假資料）", id: "fake-m" });
  const r = rooms && rooms[room] ? rooms[room] : {}, ids = Array.isArray(r.ids) ? r.ids.map(String) : [], names = Array.isArray(r.names) ? r.names.map(String) : [];
  const npc = ids.map((id, i) => ({ id, name: names[i] || "旅客" }));
  let npcN = Math.max(0, +r.npc || 0), crowdN = Math.max(0, +r.crowd || 0), groups = Array.isArray(r.groups) ? r.groups.map(g => ({ label: String(g.label || "散客"), n: Number(g.n) || 0, wander: !!g.wander })) : [];
  let n = mates.length + Math.max(0, +r.n || 0);
  const c = room === "casino" && now && now.casino ? now.casino : null; // 被館友邀去賭場的旅客
  if (c) {
    const cn = Array.isArray(c.names) ? c.names.map(String) : [], ci = Array.isArray(c.ids) ? c.ids.map(String) : [];
    cn.forEach((nm, i) => { if (ci[i] && !npc.some(x => x.id === ci[i])) npc.push({ id: ci[i], name: nm }); });
    const k = typeof c.n === "number" ? c.n : cn.length; n += k; npcN += k;
  }
  npcN = Math.max(npcN, npc.length);
  return { mates, npc, npcN, groups, crowdN, n, known: !!(now || rooms) };
}

// 點館友的名字：開他的小卡（燈號、稱號、在哪裡，加上館友小卡的按鈕：參觀展廳、送佩佩…；翊文 11-22：「這裡應該也可以按到 NPC 的狀態跟館友的狀態」）
// 從賭場、銀行這些面板裡開的：按了按鈕要把底下的面板一起收掉，不然走進去的畫面被蓋住
function openMate(x) {
  const p = (NET.roster || []).find(r => r.id === x.id) || { id: x.id, nick: x.nick, status: "online" };
  const m = miniLayer(p.nick, "");
  m.card.classList.add("hn-layer", "rn-mate");
  m.layer.classList.add("sp-top");
  closeOnOutside(m);
  m.card.querySelector(".sub").remove();
  const where = p.status === "offline" ? "現在不在線" : p.status === "away" ? `離開壹下・${roomLabel(p.room)}` : roomLabel(p.room);
  const acts = FRIEND_ACTIONS.filter(a => !a.show || a.show(p));
  m.card.append(h("div", { class: "rn-mate-h" }, h("i", { class: "nf-dot " + (p.status || "online"), "aria-hidden": "true" }), h("span", null, where), titleTag(p.title)),
    acts.length ? h("div", { class: "rn-acts" }, acts.map(a => btn(a.label, () => { m.close(); document.querySelectorAll(".nb-layer").forEach(l => { try { if (l.nbClose) l.nbClose(); else l.remove(); } catch (e) { l.remove(); } }); a.run(p); }, "small"))) : null,
    h("div", { class: "rn-acts" }, btn("關起來", () => m.close(), "ghost")));
}

function openRoom(room) {
  if (room === "hall") { openAll(); return; }
  const p = roomPeople(room), name = ROOM_NAMES[room] || room;
  const m = miniLayer(`${name}　現在`, p.known ? (p.n ? `這裡現在有 ${p.n} 位（館友 ${p.mates.length}・旅客 ${p.npcN}・散客 ${p.crowdN}）。` : "這裡現在沒有別人。") : "現在算不出人數。");
  m.card.classList.add("hn-layer", "rn-layer");
  m.layer.classList.add("sp-top"); // 從賭場、銀行這些面板（z 8800）裡開，要蓋得住（翊文 11-16：點了看不到）；旅客卡也是 sp-top，後開的在上面
  closeOnOutside(m);
  const sec = (title, ...kids) => h("section", { class: "rn-sec" }, h("h3", null, title), ...kids);
  const gv = ADDONS.roomGivers ? ADDONS.roomGivers(room) : null, strip = gv ? gv.strip() : null; // 這個房間的交代人（店員、阿秤、號碼機、荷官）：頭像在按鈕上，話在這裡（翊文 11-22）
  if (gv) gv.seen();
  m.card.append(
    strip ? h("section", { class: "rn-sec rn-givers" }, h("h3", null, "交代人"), strip) : null,
    p.mates.length ? sec("館友", h("p", { class: "hn-names" }, p.mates.map((x, i) => h("span", { class: "hn-nm" }, i ? "、" : "", x.id ? h("button", { type: "button", class: "npk-name", title: `看看 ${x.nick}`, "aria-label": `${x.nick}，看他的狀況`, onClick: () => openMate(x) }, x.nick) : x.nick)))) : null,
    p.npcN ? sec("旅客", p.npc.length ? h("p", { class: "hn-names" }, p.npc.map((x, i) => h("span", { class: "hn-nm" }, i ? "、" : "", npcName(x.id, x.name), npcSanBadge(x.id, { calm: true, num: false })))) : h("p", { class: "hn-empty" }, `${p.npcN} 位（名單還沒有送來）`)) : null,
    p.crowdN || p.groups.length ? sec("散客", h("p", { class: "hn-names" }, p.groups.length ? crowdSummary(p.groups.map(g => (g.wander ? Object.assign({}, g, { label: g.label + "（順路逛來）" }) : g))).join("、") : `${p.crowdN} 位`)) : null,
    h("div", { class: "rn-acts" }, btn("關起來", () => m.close(), "ghost")));
}

// 房間標題旁的小按鈕。ui_screens1.js 的 roomHead 叫它
export function roomPeopleBtn(room) {
  if (!ROOM_PEOPLE.includes(room)) return null;
  const gv = ADDONS.roomGivers ? ADDONS.roomGivers(room) : null; // 有交代人的房間：人數後面接他們的小頭像，有新話就加小點
  const b = h("button", { type: "button", class: "btn ghost small rn-pill", onClick: () => { openRoom(room); draw(); } });
  let shown = false;
  const draw = () => {
    if (shown && !b.isConnected) return false;
    if (b.isConnected) shown = true;
    const n = room === "hall" ? hallPeople().total : roomPeople(room).n, known = room === "hall" ? hallPeople().known : roomPeople(room).known;
    b.replaceChildren(icon("users"), h("span", null, h("span", { class: "rn-t" }, " 這裡現在"), known ? ` ${n} 人` : "？"),
      gv ? h("span", { class: "rn-avs" }, gv.avatars()) : null, gv && gv.fresh() ? h("i", { class: "gv-dot", "aria-label": "交代人有新的話" }) : null);
    b.title = gv ? "看看現在有誰在這裡，還有交代人" : "看看現在有誰在這裡";
    b.classList.toggle("empty", known && !n && !gv);
    return true;
  };
  hallNowWatch(draw);
  if (gv) { b.paint = draw; gv.watch(b); }
  draw();
  return b;
}
ADDONS.roomPeople = roomPeopleBtn;

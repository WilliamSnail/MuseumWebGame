// ================================================================
//  館外地圖（圖書館的「地圖」頁籤，11-16；規格 .claude/交接/主線拓展規劃稿.md 第伍節，決定 0097）
//  - 規則在 shared/map.js（哪些點看得到、亮到什麼程度），資料是 shared/map_data.js（content/map/館外.json 打包，揭露當天才寫進去）。
//  - 兩階亮度：日期到了＝只亮圖釘輪廓（「這裡有東西」）；拿到對應線索（need）＝亮字、顯示圖示、壹句話和住的人。沒線索的玩家不會被後面的揭露劇透。
//  - 畫法：壹張紙地圖（M-1 紙底鋪滿），四片透明片隨揭露疊上來：L1 城鎮（只有紙和路）、L3 已知世界（點後面蓋空心章）、L2 別的館（上緣起霧、缺角章）、L4 總帳（紙換成帳頁）。
//    圖釘是大的、有字的按鈕（點了旁邊的抽屜寫地點、壹句話、住的人；住的人是剪影章，旅客名字點了開旅客卡）。
//  - 素材在 web/public/map/（tools/assets/map_assets.py 處理翊文生的原圖）。沒有任何價格、數字、集團的錢，不寫別的館的名字和總數。
//  - 開發時資料還是空的就用假資料排版（玩家看不到）。
// ================================================================
import { todayStr } from "../../../shared/logic.js";
import { isFresh } from "../../../shared/fresh.js";
import { MAP_LAYER_NAME, mapLayersOn, mapSpots } from "../../../shared/map.js";
import { NPC_ROSTER } from "../../../shared/npc_roster.js";
import { ADDONS, P, freshTag, h, sndFile } from "../core/ui_core.js";
import { npcName } from "../panels/ui_npc_card.js";

const IMG = n => `/map/${n}.webp`;
const ICONS = new Set(["lamp", "umbrella", "shop", "market", "bridge", "gate", "mailbox", "cup", "stop", "school", "signboard", "island", "harbour", "pawn", "blank"]);
const WHO = ["umbrella", "postman", "chisel", "lantern", "hat", "abacus", "scale", "scarf", "broom", "apron"];
const hashOf = s => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n; };
const whoImg = id => IMG("who-" + WHO[hashOf(id) % WHO.length]);
const STAMP = { L3: i => "stamp-ring" + (1 + (i % 3)), L2: () => "stamp-square", L4: () => "stamp-header" }; // 每片透明片的點後面蓋哪種章

// 開發時沒有資料用的假點（玩家看不到）
const FAKE = [
  { id: "m-mailbox", name: "信箱", layer: "L1", from: "2026-11-16", x: 50, y: 87, icon: "mailbox", line: "信封每天少一封，沒有人知道去哪了。", npc: ["fake-a"] },
  { id: "m-alley", name: "巷口", layer: "L1", from: "2026-11-16", x: 30, y: 76, icon: "lamp", line: "路燈下有人在數街。", npc: ["fake-a", "fake-b", "c-x"], need: "c-fake" },
  { id: "m-market", name: "夜市", layer: "L1", from: "2026-11-16", x: 68, y: 68, icon: "market", line: "燈串下的椅子，總是空著一張。", npc: [] },
  { id: "m-bridge", name: "橋頭", layer: "L1", from: "2026-11-16", x: 42, y: 56, icon: "bridge", line: "橋頭的牌收到第壹塊，字欄空著。", npc: ["fake-b"], need: "c-fake" },
  { id: "m-ring", name: "往來", layer: "L3", from: "2026-11-23", x: 52, y: 38, icon: "blank", line: "圈裡面沒有名字。", npc: [] },
  { id: "m-port", name: "港", layer: "L3", from: "2026-11-23", x: 78, y: 30, icon: "harbour", line: "船只進不出。", npc: ["fake-a"], need: "c-fake" },
  { id: "m-gate", name: "水閘", layer: "L2", from: "2026-11-30", x: 80, y: 48, icon: "gate", line: "水聲偏了半秒。", npc: [], need: "c-fake" },
  { id: "m-page", name: "壹頁", layer: "L4", from: "2026-11-30", x: 50, y: 6, icon: "blank", line: "頁眉的分冊號空著。", npc: [] },
];
const usingFake = () => import.meta.env.DEV && !mapSpots(todayStr(), P).length;
const spotsNow = () => (usingFake() ? FAKE.map(s => Object.assign({}, s, { lit: !s.need })) : mapSpots(todayStr(), P));

// 頁籤上的數字（ui_story.js 的 storyCounts 用）：[幾個點, 0, 新的幾個]。「沒讀幾個」是書的說法，這裡不寫
export function mapTabCounts() {
  const v = spotsNow();
  return [v.length, 0, v.filter(s => isFresh(P, "origin", "map:" + s.id)).length];
}
ADDONS.mapCounts = mapTabCounts;

// 路：從「館」一路連到最近的下一個點（只連 L1 城鎮的點），畫虛線
function pathOf(spots) {
  const pts = spots.filter(s => s.layer === "L1").map(s => [s.x, s.y]);
  const out = [[50, 94]];
  while (pts.length) {
    const last = out[out.length - 1];
    pts.sort((a, b) => Math.hypot(a[0] - last[0], a[1] - last[1]) - Math.hypot(b[0] - last[0], b[1] - last[1]));
    out.push(pts.shift());
  }
  return out;
}
const svgEl = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };

const WATERY = new Set(["bridge", "harbour", "island"]); // 水邊的地點（點了有水波聲，Pixabay「Water Waves」）
function spotBtn(s, i, sel, pick) {
  const fresh = isFresh(P, "origin", "map:" + s.id), lit = s.lit;
  const icon = ICONS.has(s.icon) ? s.icon : "blank";
  const st = STAMP[s.layer];
  const b = h("button", { type: "button", class: "map-spot " + (lit ? "lit" : "out") + (fresh ? " new" : "") + (sel === s.id ? " on" : "") + " l-" + s.layer, style: { left: s.x + "%", top: s.y + "%" }, dataset: { id: s.id }, "aria-pressed": String(sel === s.id), "aria-label": lit ? `${s.name}（${MAP_LAYER_NAME[s.layer] || ""}）` : "這裡有東西，還看不清", onClick: () => { if (lit && WATERY.has(icon)) sndFile("waves-short", 0.35); pick(s.id); } }, // 橋頭、碼頭、小島：水波聲（11-16 翊文）
    st ? h("img", { class: "map-stamp", src: IMG(st(i)), alt: "", "aria-hidden": "true", draggable: "false" }) : null,
    lit ? h("img", { class: "map-ic", src: IMG("icon-" + icon), alt: "", "aria-hidden": "true", draggable: "false" }) : null,
    h("img", { class: "map-pin", src: IMG(lit ? (fresh ? "pin-new" : "pin-lit") : "pin-outline"), alt: "", "aria-hidden": "true", draggable: "false" }),
    h("span", { class: "map-lab" }, lit ? s.name : "？"));
  if (fresh) b.append(freshTag("corner"));
  return b;
}

function who(id) {
  const n = NPC_ROSTER.find(x => x.id === id), fake = /^fake/.test(id);
  const nm = n ? n.name : fake ? "夜班的畫商" : "";
  return h("li", { class: "map-who" }, h("img", { src: whoImg(id), alt: "", "aria-hidden": "true", draggable: "false" }), nm ? npcName(id, nm) : h("span", { class: "map-who-dim" }, "（還看不清）"));
}

function drawer(spots, sel) {
  const s = spots.find(x => x.id === sel);
  if (!s) return h("div", { class: "map-dr" },
    h("h3", null, "館外地圖"),
    h("p", { class: "map-hint" }, spots.length ? "點地圖上的圖釘，看看那裡有什麼。" : "地圖上還沒有任何標記。有消息的時候，會一個一個浮出來。"),
    spots.length ? h("ul", { class: "map-key" },
      h("li", null, h("img", { src: IMG("pin-lit"), alt: "" }), "亮起來的：拿到線索，看得清楚"),
      h("li", null, h("img", { src: IMG("pin-outline"), alt: "" }), "只有輪廓：這裡有東西，還沒有線索"),
      h("li", null, h("img", { src: IMG("pin-new"), alt: "" }), "金色的：剛浮出來的")) : null);
  const icon = ICONS.has(s.icon) ? s.icon : "blank";
  if (!s.lit) return h("div", { class: "map-dr" },
    h("div", { class: "map-dr-h" }, h("img", { class: "map-dr-ic", src: IMG("pin-outline"), alt: "" }), h("h3", null, "？")),
    h("p", { class: "map-hint" }, "這裡有東西，但你還沒有拿到關於這裡的線索。讀讀書、逛逛各個房間，再回來看。"));
  return h("div", { class: "map-dr" },
    h("div", { class: "map-dr-h" }, h("img", { class: "map-dr-ic", src: IMG("icon-" + icon), alt: "" }), h("h3", null, s.name), h("small", null, MAP_LAYER_NAME[s.layer] || "")),
    h("p", { class: "map-line" }, s.line),
    Array.isArray(s.npc) && s.npc.length ? h("div", null, h("h4", null, "住在這裡的人"), h("ul", { class: "map-whos" }, s.npc.map(who))) : null);
}

export function worldMap() {
  const spots = spotsNow(), layers = mapLayersOn(spots);
  let sel = null;
  const side = h("div", { class: "hn-gb-side map-side" }), canvas = h("div", { class: "map-canvas" + (layers.includes("L4") ? " ledger" : "") });
  const draw = () => {
    side.replaceChildren(drawer(spots, sel));
    canvas.querySelectorAll(".map-spot").forEach(el => { const on = el.dataset.id === sel; el.classList.toggle("on", on); el.setAttribute("aria-pressed", String(on)); });
  };
  const pick = id => { sel = sel === id ? null : id; draw(); };
  const pts = pathOf(spots);
  const svg = svgEl("svg", { class: "map-paths", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" });
  if (pts.length > 1) svg.append(svgEl("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: "#7A5A3A", "stroke-width": "1.6", "stroke-dasharray": "5 4", "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke", opacity: ".55" }));
  canvas.append(
    layers.includes("L4") ? h("div", { class: "map-ledger-sheet", "aria-hidden": "true" }) : null,
    layers.includes("L2") ? h("div", { class: "map-fog", "aria-hidden": "true" }) : null,
    svg,
    h("div", { class: "map-hall", "aria-hidden": "true" }, "館"),
    ...spots.map((s, i) => spotBtn(s, i, sel, pick)));
  draw();
  return h("div", { class: "map-page" }, side, h("div", { class: "hn-gb-main map-main" }, canvas));
}
ADDONS.worldMap = worldMap;

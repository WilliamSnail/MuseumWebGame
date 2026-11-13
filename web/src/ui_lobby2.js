// ================================================================
//  新的大廳（翊文 11-11 看過草稿 drafts/新大廳/：「可以，接進遊戲，並且把這個當大版本更新，之後有問題可以回滾」，決定 0066）
//  - 導覽圖用畫好的底圖（web/public/lobby/land.webp），11 個房間是疊在上面的透明按鈕；名字、進度、館友名牌、「新」都由程式畫。
//  - 右邊壹欄：館友證、今天要做的事（第壹張發光、做完的變淡）、4 個小圓章（週章、委託、靈感、收藏）。
//  - 活動預告、館友在線縮成兩條細橫幅，放在導覽圖上面。籌碼在狀態列。
//  - 回滾：shared/config.js 的 NUM.ui.newLobby 改成 false 就回到舊的大廳（ui_screens1.js 的 SCREENS.lobby 原封不動）；
//    玩家也可以在設定頁選「舊的大廳」（SAVE.settings.oldLobby）。
//  - 房間按鈕保留 .fp-room[data-room]：教學（ui_screens1.js 的 tutorial）照舊找得到畫廊、手作坊。
//  - 名字是玩家打的字：只用 h() 的字串（純文字）。介面文字照第 1 代用「壹」。
// ================================================================
import { NUM } from "../../shared/config.js";
import { eventBars, eventEffect, eventLeftText, eventRange, eventWhen } from "../../shared/events.js";
import { freshRooms } from "../../shared/fresh.js";
import { nextStep } from "../../shared/guide.js";
import { codexCount, dailyCommissions, isFree, num, todayStr } from "../../shared/logic.js";
import { roomProgress } from "../../shared/logic3.js";
import { matesByRoom } from "../../shared/mates.js";
import { passView } from "../../shared/pass.js";
import { storyState } from "../../shared/story.js";
import { NET } from "./net_firebase.js";
import { ADDONS, IMG, P, PANELS, ROOM_NAMES, SAVE, SCREENS, UI, every, h, icon, navTo, planPortrait, titleTag } from "./ui_core.js";
import { allEvents } from "./ui_events.js";
import { roomHasNew } from "./ui_screens1.js";
import { todayItems } from "./ui_today.js";

const L = "/lobby/"; // 素材（web/public/lobby，打包時原樣複製）
// 房間在底圖上的位置：box 是橫式底圖（land.webp，1024×572）的像素，port 是直式底圖（port.webp，572×1024，手機直拿用）的像素。icon：assets/rooms 有圖的才放
export const LOBBY2_ROOMS = [
  // cut／pcut：橫式／直式底圖上不是方的房間，照牆畫的多邊形（底圖像素）。靠中間八角大廳的房間有壹角是斜牆（翊文 11-13：「右上方不太對」「還有其他房間也是有這個問題」）
  { id: "gallery", icon: "gallery", box: [60, 48, 440, 200], port: [35, 30, 540, 160], cut: [[60, 48], [440, 48], [440, 134], [378, 200], [60, 200]] },
  { id: "hall", icon: null, box: [452, 48, 572, 134], port: [345, 165, 540, 292], pcut: [[345, 165], [540, 165], [540, 292], [394, 292], [345, 246]] },
  { id: "fusion", icon: "fusion", box: [584, 48, 782, 198], port: [35, 305, 162, 445], cut: [[584, 48], [782, 48], [782, 198], [652, 198], [584, 120]] },
  { id: "pillow", icon: null, box: [794, 48, 972, 198], port: [410, 305, 540, 445] },
  { id: "origin", icon: "library", box: [52, 208, 276, 356], port: [35, 165, 230, 292], cut: [[52, 208], [276, 208], [276, 332], [236, 332], [236, 356], [52, 356]], pcut: [[35, 165], [230, 165], [230, 238], [176, 292], [35, 292]] },
  { id: "codex", icon: null, box: [280, 208, 376, 326], port: [35, 455, 225, 612], pcut: [[35, 455], [183, 455], [225, 498], [225, 612], [35, 612]] },
  { id: "cellar", icon: "cellar", box: [760, 208, 972, 326], port: [350, 455, 540, 612], pcut: [[375, 455], [540, 455], [540, 612], [350, 612], [350, 481]] },
  { id: "workshop", icon: "workshop", box: [48, 364, 232, 524], port: [35, 620, 225, 778] },
  { id: "commission", icon: "board", box: [238, 334, 442, 524], port: [350, 620, 540, 778], cut: [[238, 334], [374, 334], [442, 407], [442, 524], [238, 524]] },
  { id: "office", icon: "office", box: [584, 334, 782, 528], port: [35, 785, 225, 948], cut: [[650, 334], [782, 334], [782, 528], [584, 528], [584, 405]] },
  // 銀行（Yuga Bot 銀行廳，翊文 11-13：放八角大廳正下方的小門廳；圖已經貼在 land.webp、port.webp）：銀行廳的畫面（SCREENS.bank）做好之前不放熱區，免得點了走到不存在的畫面
  { id: "bank", icon: null, box: [446, 408, 576, 506], port: [233, 810, 345, 947] },
  { id: "casino", icon: "casino", box: [794, 334, 972, 528], port: [350, 785, 540, 948] },
];
// 要不要用新的大廳（決定 0066）：總開關在 NUM.ui.newLobby（回滾用），玩家自己也可以選舊的
export const useLobby2 = () => !!(NUM.ui && NUM.ui.newLobby) && !(SAVE && SAVE.settings && SAVE.settings.oldLobby);

const img = (src, cls) => h("img", { class: cls || null, src, alt: "", draggable: "false" });
const progText = p => (p && p.text ? String(p.text).replace(/^✓ /, "") : "");

// ---------- 細橫幅：活動預告、館友在線 ----------
function eventStrip() {
  const box = h("div", { class: "l2-strip l2-ev", role: "status" });
  let last = null;
  const draw = () => {
    if (last !== null && !box.isConnected) { clearInterval(timer); return; }
    // 翊文 11-11：「活動細節不見了，可以上下寬壹點容納多點細節」：第壹行時間和名字，第二行效果和說明
    const bars = eventBars(allEvents(), Date.now()), b = bars[0];
    const key = b ? [b.phase, b.ev.id, b.phase === "live" ? eventLeftText(b.left) : ""].join("|") + bars.length : "none";
    if (key === last) return;
    last = key;
    if (!b) { box.replaceChildren(h("b", null, "活動預告"), h("span", { class: "l2-ev-l" }, h("span", null, "今天沒有限時活動。每週劇情、委託、地下收藏庫都在等你。"))); return; }
    const ev = b.ev;
    box.replaceChildren(h("b", null, b.phase === "live" ? "活動進行中" : "活動預告"),
      h("span", { class: "l2-ev-l" },
        h("span", { class: "l2-ev-t" }, b.phase === "live" ? `${ev.title}・還剩 ${eventLeftText(b.left)}` : `${eventWhen(ev)} ${eventRange(ev)}・${ev.title}`, bars.length > 1 ? h("small", null, `（還有 ${bars.length - 1} 場）`) : null),
        h("small", { class: "l2-ev-d" }, [eventEffect(ev), ev.words].filter(Boolean).join("　"))));
  };
  const timer = every(draw, 1000);
  draw();
  return box;
}
function matesStrip() {
  const box = h("div", { class: "l2-strip l2-mates" });
  const draw = () => {
    const by = matesByRoom(NET.roster || []);
    const list = Object.keys(by).filter(k => k !== "elsewhere").flatMap(k => by[k].map(m => ({ m, room: ROOM_NAMES[k] || "大廳" }))).concat(by.elsewhere.map(m => ({ m, room: "在別處" })));
    box.replaceChildren(h("i", { class: "l2-live", "aria-hidden": "true" }), h("b", null, "館友在線"),
      list.length ? h("span", { class: "l2-mlist" }, list.slice(0, 8).map(x => h("em", null, `${x.m.nick}・${x.room}`)))
        : h("span", null, UI.net ? "現在沒有別的館友在線。" : "登入了才看得到館友。"),
      list.length ? null : null);
    box.onclick = () => { if (PANELS.friends) PANELS.friends(); };
  };
  draw();
  return { box, draw };
}

// ---------- 導覽圖 ----------
function mapBox(step) {
  const progress = roomProgress(P);
  const imgs = Object.values(IMG).reduce((n, v) => n + (Array.isArray(v) ? v.filter(Boolean).length : v ? 1 : 0), 0);
  progress.library = { text: imgs ? `你的圖 ${imgs} 張` : "還沒放圖" };
  const fresh = new Set(Object.keys(freshRooms(P) || {})); // { 房間: 幾件新的 }
  // 手機直拿換成直式的底圖（翊文 11-11 生的 port.webp）；轉橫、轉直時 boot.js 會重畫大廳
  const portrait = planPortrait(), W = portrait ? 572 : 1024, H = portrait ? 1024 : 572;
  const map = h("div", { class: "l2-map" + (portrait ? " port" : ""), role: "group", "aria-label": "館內導覽圖：點壹間房走進去" }, img(L + (portrait ? "port.webp" : "land.webp"), "l2-land"));
  const whoBoxes = {};
  LOBBY2_ROOMS.filter(r => r.id !== "bank" || SCREENS.bank).forEach(r => {
    const [x0, y0, x1, y1] = portrait ? r.port : r.box, name = ROOM_NAMES[r.id] || r.id, sub = progText(progress[r.id]);
    const tag = h("span", { class: "l2-tag" + (r.icon ? "" : " noic") },
      r.icon ? img(`${L}room-${r.icon}.webp`) : null, h("span", { class: "l2-tn" }, name), sub ? h("small", null, sub) : null,
      fresh.has(r.id) ? h("span", { class: "l2-new" }, "新") : null); // 翊文 11-11：「新」寫在名字標籤的左上角
    const who = h("span", { class: "l2-who" });
    whoBoxes[r.id] = who;
    const b = h("button", { type: "button", class: "l2-room fp-room" + (roomHasNew(r.id) ? " has-new" : "") + (step && step.room === r.id ? " is-goal" : ""), dataset: { room: r.id },
      "aria-label": `${name}${sub ? "，" + sub : ""}${fresh.has(r.id) ? "，有新東西" : ""}`,
      style: { left: x0 / W * 100 + "%", top: y0 / H * 100 + "%", width: (x1 - x0) / W * 100 + "%", height: (y1 - y0) / H * 100 + "%" },
      onClick: () => navTo(r.id) }, tag, who);
    const cut = portrait ? r.pcut : r.cut;
    if (cut) { // 點得到的範圍和金框都照牆的形狀：按鈕用 clip-path 切掉角，框用 SVG 畫（box-shadow 畫不出斜邊）
      const w = x1 - x0, ht = y1 - y0, pts = cut.map(([x, y]) => [x - x0, y - y0]);
      b.classList.add("cut");
      b.style.clipPath = `polygon(${pts.map(([x, y]) => `${x / w * 100}% ${y / ht * 100}%`).join(",")})`;
      const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), pg = document.createElementNS(NS, "polygon");
      svg.setAttribute("class", "l2-cut"); svg.setAttribute("viewBox", `0 0 ${w} ${ht}`); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true");
      pg.setAttribute("points", pts.map(p => p.join(",")).join(" ")); pg.setAttribute("vector-effect", "non-scaling-stroke");
      svg.append(pg); b.append(svg);
    }
    map.append(b);
  });
  map.append(h("span", { class: "l2-me" }, "大廳・你在這裡"));
  // 館友名牌（綠點）：名單有變就換
  const drawWho = () => {
    const by = matesByRoom(NET.roster || []);
    LOBBY2_ROOMS.forEach(r => {
      if (!whoBoxes[r.id]) return; // 銀行的熱區還沒放
      const list = (by[r.id] || []).slice(0, 3);
      const more = (by[r.id] || []).length - list.length;
      whoBoxes[r.id].replaceChildren(...list.map(m => h("i", { class: m.status === "away" ? "away" : "" }, m.nick)), more > 0 ? h("i", { class: "more" }, `+${more}`) : "");
    });
  };
  drawWho();
  return { map, drawWho };
}

// ---------- 右邊壹欄 ----------
function passCard() {
  const v = passView(P, { today: todayStr() }), c = v.card;
  const nick = (UI.net && NET.me && NET.me.nick) || "館友";
  return h("button", { type: "button", class: "l2-pass", onClick: () => PANELS.pass && PANELS.pass() },
    h("span", { class: "l2-ph" }, img(L + "ic-nameplate.webp")),
    h("span", { class: "l2-pid" },
      h("b", null, nick, c.title ? titleTag(c.title, "ps-ttl") : null),
      h("small", null, isFree(P) ? "自由模式" : `館友證・第 ${c.dayNo} 天`),
      h("small", null, `收藏 ${num(v.pepe.have)}／${num(v.pepe.total)}`, c.stamps !== null ? `・週章 ${c.stamps} 枚` : "")));
}
function todoCards(step) {
  const items = isFree(P) ? [] : todayItems();
  const cards = [];
  if (step) cards.push({ t: step.text, s: step.why, go: () => navTo(step.room), todo: true });
  items.filter(x => x.todo).forEach(x => cards.push({ t: x.title, s: x.sub, go: x.go, todo: true }));
  items.filter(x => !x.todo).forEach(x => cards.push({ t: x.title, s: x.sub, go: x.go, todo: false }));
  const shown = cards.slice(0, 4); // 最多 4 張：再多右欄就擠出畫面（全部在導覽列的「今天」）
  if (!shown.length) return h("p", { class: "l2-empty" }, isFree(P) ? "自由模式：所有選項都打開了，到手作坊捏佩佩。" : "今天的事都做完了。");
  return h("div", { class: "l2-todos" }, shown.map((c, i) => h("button", { type: "button", class: "l2-todo" + (c.todo && i === 0 ? " on" : "") + (c.todo ? "" : " done"), onClick: () => c.go && c.go() },
    h("b", null, c.t), c.s ? h("small", null, c.s) : null)));
}
function seals() {
  if (isFree(P)) return null;
  const left = dailyCommissions(P, P.day.date).filter(c => !c.done).length, total = dailyCommissions(P, P.day.date).length;
  const S = storyState(P);
  const seal = (lab, v, pic, go, tip) => h("button", { type: "button", class: "l2-seal", title: tip, onClick: go },
    h("span", { class: "l2-s", style: { backgroundImage: `url(${L}${pic}.webp)` } }, String(v)), h("small", null, lab));
  return h("div", { class: "l2-seals" },
    seal("週章", S.stamps || 0, "seal-gold", () => PANELS.shop && PANELS.shop(), "做每週任務拿的，到兌換所換東西"),
    seal("委託", `${left}／${total}`, "seal-wine", () => navTo("commission"), "今天還沒交的委託"),
    seal("靈感", num(P.insp), "seal-green", () => navTo("gallery"), "做佩佩、解鎖選項用的；到畫廊看畫拿"),
    seal("收藏", num(codexCount(P)), "seal-dark", () => navTo("codex"), "圖鑑裡收了幾隻"));
}

// ---------- 整個大廳 ----------
export function lobby2(root) {
  const step = isFree(P) ? null : nextStep(P);
  const { map, drawWho } = mapBox(step);
  const mates = matesStrip();
  const live = ADDONS.lobbyLive ? ADDONS.lobbyLive() : null; // 有人在實況就壹小行（ui_casino_live.js）
  const side = h("aside", { class: "l2-side", "aria-label": "今天" },
    passCard(),
    h("div", { class: "l2-box l2-todobox" }, h("div", { class: "l2-h" }, "今天要做的事"), todoCards(step)), // 手機直拿：排到導覽圖上面（css/lobby2.css）
    isFree(P) ? null : h("div", { class: "l2-box" }, h("div", { class: "l2-h" }, "手上有的"), seals()));
  const wrap = h("div", { class: "l2" },
    h("section", { class: "l2-left", "aria-label": "大廳" }, h("div", { class: "l2-strips" }, eventStrip(), mates.box), live, h("div", { class: "l2-mapbox" }, map)),
    side);
  root.append(wrap);
  document.body.classList.add("lobby-wide-on"); // 大螢幕放寬（css/lobby2.css）；換房間時 ui_core 的 render 會拿掉
  // 名單有變：橫幅和名牌跟著換（換了房間就不再理）
  const offs = [];
  const onRoster = () => { if (!wrap.isConnected) { offs.forEach(f => f && f()); return; } mates.draw(); drawWho(); };
  offs.push(NET.on("roster", onRoster), NET.on("status", onRoster));
}
ADDONS.lobby2 = lobby2;
ADDONS.useLobby2 = useLobby2;

// 頂欄的圖示換成圓形底座（決定 0066）：總開關打開時，整個遊戲都是
if (NUM.ui && NUM.ui.newLobby) document.documentElement.classList.add("new-lobby-on");

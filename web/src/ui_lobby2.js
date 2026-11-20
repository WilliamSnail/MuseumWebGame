// ================================================================
//  新的大廳（翊文 11-11 看過草稿 docs/草稿/新大廳/：「可以，接進遊戲，並且把這個當大版本更新，之後有問題可以回滾」，決定 0066）
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
import { codexCount, dailyCommissions, fromKey, isFree, num, todayStr } from "../../shared/logic.js";
import { roomProgress } from "../../shared/systems.js";
import { matesByRoom } from "../../shared/mates.js";
import { passView } from "../../shared/pass.js";
import { storyState } from "../../shared/story_state.js";
import { NET } from "./net_firebase.js";
import { ADDONS, IMG, P, PANELS, ROOM_NAMES, SAVE, SCREENS, UI, every, frogHTML, h, icon, navTo, planPortrait, titleTag } from "./ui_core.js";
import { allEvents } from "./ui_events.js";
import { headlineStrip } from "./ui_headline.js";
import { mountMood } from "./ui_mood.js";
import { roomHasNew } from "./ui_screens1.js";
import { todayItems } from "./ui_today.js";
import { openStory, storyToday } from "./ui_story.js";
import { giverAv } from "./ui_tasks.js";

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
  { id: "bank", icon: "bank", box: [446, 408, 576, 506], port: [233, 810, 345, 947] },
  { id: "casino", icon: "casino", box: [794, 334, 972, 528], port: [350, 785, 540, 948] },
];
// 要不要用新的大廳（決定 0066）：總開關在 NUM.ui.newLobby（回滾用），玩家自己也可以選舊的
export const useLobby2 = () => !!(NUM.ui && NUM.ui.newLobby) && !(SAVE && SAVE.settings && SAVE.settings.oldLobby);

const img = (src, cls) => h("img", { class: cls || null, src, alt: "", draggable: "false" });
const progText = p => (p && p.text ? String(p.text).replace(/^✓ /, "") : "");

// ---------- 細橫幅：活動預告、今日要聞（跑馬燈，ui_headline.js）；館友在線在右欄 ----------
function eventStrip() {
  const box = h("div", { class: "l2-strip l2-ev", role: "status" });
  let last = null;
  const draw = () => {
    if (last !== null && !box.isConnected) { clearInterval(timer); return; }
    // 翊文 11-11：「活動細節不見了，可以上下寬壹點容納多點細節」：第壹行時間和名字，第二行效果和說明
    const bars = eventBars(allEvents(), Date.now()), b = bars[0];
    const key = b ? [b.phase, b.ev.id, b.phase === "live" ? eventLeftText(b.left) : ""].join("|") + bars.length : "none";
    if (key === last) return;
    const liveNow = !!(b && b.phase === "live"), evFlip = last !== null && liveNow !== box._live; // 活動開始／結束：大廳的音樂跟著換（11-16）
    last = key; box._live = liveNow;
    if (evFlip && ADDONS.audioState) ADDONS.audioState();
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
  const chip = h("button", { type: "button", class: "l2-pm", onClick: () => PANELS.friends && PANELS.friends() }); // 手機直拿的精簡列用
  const box = h("div", { class: "l2-box l2-matesbox l2-mates" }); // 11-15：搬到右欄館友證下面（原位置換成今日要聞跑馬燈）
  const draw = () => {
    const by = matesByRoom(NET.roster || []);
    const list = Object.keys(by).filter(k => k !== "elsewhere").flatMap(k => by[k].map(m => ({ m, room: ROOM_NAMES[k] || "大廳" }))).concat(by.elsewhere.map(m => ({ m, room: "在別處" })));
    box.replaceChildren(h("div", { class: "l2-h" }, h("i", { class: "l2-live", "aria-hidden": "true" }), "館友在線"),
      list.length ? h("span", { class: "l2-mlist" }, list.slice(0, 8).map(x => h("em", null, `${x.m.nick}・${x.room}`)))
        : h("span", null, UI.net ? "現在沒有別的館友在線。" : "登入了才看得到館友。"),
      list.length ? null : null);
    box.onclick = () => { if (PANELS.friends) PANELS.friends(); };
    chip.replaceChildren(h("i", { class: "l2-live", "aria-hidden": "true" }), h("b", null, "館友"), list.length ? ` ${list.length} 位在線` : UI.net ? " 沒有人" : " 未登入");
    chip.title = list.length ? list.map(x => `${x.m.nick}・${x.room}`).join("、") : "現在沒有別的館友在線";
  };
  draw();
  return { box, draw, chip };
}

// 各房間現在幾位（房間熱絡用，門檻在 shared/room_mood.js）＝館友（matesByRoom）＋ NPC、散客（peek 的 now.rooms[id].n，旅客＋委託人＋散客）；賭場再加被館友邀去的 NPC（now.casino）
function roomCounts() {
  const by = matesByRoom(NET.roster || []), now = UI.hallNow, rooms = now && now.rooms && typeof now.rooms === "object" ? now.rooms : {}, out = {};
  Object.keys(by).filter(k => k !== "elsewhere").forEach(k => { out[k] = by[k].length; });
  Object.keys(rooms).forEach(k => { out[k] = (out[k] || 0) + (Math.max(0, +(rooms[k] && rooms[k].n) || 0)); });
  const c = now && now.casino; if (c) out.casino = (out.casino || 0) + (typeof c.n === "number" ? c.n : Array.isArray(c.names) ? c.names.length : 0);
  return out;
}
ADDONS.roomPeopleN = id => roomCounts()[id] || 0; // 某間現在幾人（館友＋旅客＋散客＋被邀去的）：賭場人多換曲用（11-16，ui_core.js audioState）
// ---------- 導覽圖 ----------
function mapBox(step) {
  const progress = roomProgress(P);
  const imgs = Object.values(IMG).reduce((n, v) => n + (Array.isArray(v) ? v.filter(Boolean).length : v ? 1 : 0), 0);
  progress.library = { text: imgs ? `你的圖 ${imgs} 張` : "還沒放圖" };
  const fresh = new Set(Object.keys(freshRooms(P) || {})); // { 房間: 幾件新的 }
  if (UI.bankFresh > 0) fresh.add("bank"); // 銀行的股票有新行情（伺服器的 peek 給 stockFresh；打開股票頁按「看過了」才清掉）
  // 手機直拿換成直式的底圖（翊文 11-11 生的 port.webp）；轉橫、轉直時 boot.js 會重畫大廳
  const portrait = planPortrait(), W = portrait ? 572 : 1024, H = portrait ? 1024 : 572;
  const map = h("div", { class: "l2-map" + (portrait ? " port" : ""), role: "group", "aria-label": "館內導覽圖：點壹間房走進去" }, img(L + (portrait ? "port.webp" : "land.webp"), "l2-land"));
  mountMood(map, "lobby", { portrait, roomFx: "glow,folks,pill", rooms: LOBBY2_ROOMS.filter(r => r.id !== "bank" || (SCREENS.bank && ADDONS.bankOpen)), counts: roomCounts }); // 房間效果（燈光、旗、人影、怪影子）：在房間按鈕下面，不擋點擊
  const whoBoxes = {};
  LOBBY2_ROOMS.filter(r => r.id !== "bank" || (SCREENS.bank && ADDONS.bankOpen)).forEach(r => {
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
  if (ADDONS.poolMount) ADDONS.poolMount(map, portrait); // 館門口的池子（ui_pool.js，peek 的 pool；沒有就不畫）
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
    // 有挑頭像（11-13）就畫那隻佩佩；沒有就是原本的名牌
    c.avatar ? h("span", { class: "l2-ph l2-av", "aria-hidden": "true", html: frogHTML(fromKey(c.avatar)) }) : h("span", { class: "l2-ph" }, img(L + "ic-nameplate.webp")),
    h("span", { class: "l2-pid" },
      h("b", null, nick, c.title ? titleTag(c.title, "ps-ttl") : null),
      h("small", null, isFree(P) ? "自由模式" : `館友證・第 ${c.dayNo} 天`),
      h("small", null, `收藏 ${num(v.pepe.have)}／${num(v.pepe.total)}`, c.stamps !== null ? `・週章 ${c.stamps} 枚` : "")));
}
function todoCards(step) {
  const items = isFree(P) ? [] : todayItems();
  const cards = [];
  const st = isFree(P) ? null : storyToday();
  // 今天的每日任務：壹定排在前面（11-20，翊文：玩家大多看不到每日任務）。有交代人就放頭像和壹句話
  if (st && st.dailyN) {
    const g = st.giver;
    cards.push({ t: `每日任務 ${st.dailyN - st.dailyLeft}／${st.dailyN}`, s: g ? `${g.name}：${g.says}` : st.daily.find(x => !x.done) ? st.daily.find(x => !x.done).text : "今天的都做完了", go: () => openStory(), todo: st.dailyLeft > 0, giver: g && g.id });
  }
  if (step) cards.push({ t: step.text, s: step.why, go: () => navTo(step.room), todo: true });
  const rest = x => !/^(yuga|daily)-/.test(x.key);
  items.filter(x => x.todo && rest(x)).forEach(x => cards.push({ t: x.title, s: x.sub, go: x.go, todo: true }));
  items.filter(x => !x.todo && rest(x)).forEach(x => cards.push({ t: x.title, s: x.sub, go: x.go, todo: false }));
  const shown = cards.slice(0, ADDONS.hallNowBox ? 2 : 4); // 最多 2 張（右欄多了展廳現在、最近的評價）；再多右欄就擠出畫面（全部在導覽列的「今天」）
  const bar = st && st.pts ? h("button", { type: "button", class: "l2-pts", title: "打開今天的任務", onClick: () => openStory() },
    h("span", null, h("b", null, "今天 " + st.pts.td), `／${st.pts.cap}`), h("i", { class: "l2-pts-bar", "aria-hidden": "true" }, h("u", { style: `width:${Math.min(100, Math.round(st.pts.td / st.pts.cap * 100))}%` })),
    h("span", null, h("b", null, "這週 " + st.pts.wk), `／${st.pts.goal}`)) : null;
  if (!shown.length) return h("div", { class: "l2-todos" }, bar, h("p", { class: "l2-empty" }, isFree(P) ? "自由模式：所有選項都打開了，到手作坊捏佩佩。" : "今天的事都做完了。"));
  return h("div", { class: "l2-todos" }, bar, shown.map((c, i) => h("button", { type: "button", class: "l2-todo" + (c.todo && i === 0 ? " on" : "") + (c.todo ? "" : " done") + (c.giver ? " has-giver" : ""), onClick: () => c.go && c.go() },
    c.giver ? giverAv(c.giver, { small: true }) : null, h("span", { class: "l2-todo-t" }, h("b", null, c.t), c.s ? h("small", null, c.s) : null))));
}
ADDONS.lobbyTodoRedraw = () => { const box = document.querySelector(".l2-todobox"); if (!box || !P) return; const old = box.querySelector(".l2-todos, .l2-empty"); if (old) old.replaceWith(todoCards(isFree(P) ? null : nextStep(P))); };
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
    mates.box,
    h("div", { class: "l2-box l2-todobox" }, h("div", { class: "l2-h" }, "今天要做的事"), todoCards(step)), // 手機直拿：排到導覽圖上面（css/lobby2.css）
    isFree(P) || !(UI.net || import.meta.env.DEV) || !ADDONS.hallNowBox ? null : h("div", { class: "l2-box l2-hnbox" }, ADDONS.hallNowBox("lobby")), // 展廳現在幾人、最近的評價（ui_hallnow.js；登入了才有）
    isFree(P) ? null : h("div", { class: "l2-box" }, h("div", { class: "l2-h" }, "手上有的"), seals()));
  const wrap = h("div", { class: "l2" },
    h("section", { class: "l2-left", "aria-label": "大廳" }, h("div", { class: "l2-strips" }, eventStrip(), headlineStrip(), h("div", { class: "l2-pbar" }, ADDONS.hallNowBar && (UI.net || import.meta.env.DEV) && !isFree(P) ? ADDONS.hallNowBar() : null, mates.chip)), live, h("div", { class: "l2-mapbox" }, map)),
    side);
  root.append(wrap);
  document.body.classList.add("lobby-wide-on"); // 大螢幕放寬（css/lobby2.css）；換房間時 ui_core 的 render 會拿掉
  // 名單有變：橫幅和名牌跟著換（換了房間就不再理）
  const offs = [];
  const onRoster = () => { if (!wrap.isConnected) { offs.forEach(f => f && f()); return; } mates.draw(); drawWho(); if (ADDONS.moodRedraw) ADDONS.moodRedraw(); };
  offs.push(NET.on("roster", onRoster), NET.on("status", onRoster));
}
ADDONS.lobby2 = lobby2;
ADDONS.useLobby2 = useLobby2;

// 頂欄的圖示換成圓形底座（決定 0066）：總開關打開時，整個遊戲都是
if (NUM.ui && NUM.ui.newLobby) document.documentElement.classList.add("new-lobby-on");

// 大廳已經畫好了才收到 peek 的 stockFresh：直接補一個「新」在銀行的名字標籤上，不用整個大廳重畫
ADDONS.bankFresh = () => {
  const tag = document.querySelector('.l2-room[data-room="bank"] .l2-tag');
  if (!tag) return;
  const old = tag.querySelector(".l2-new");
  if (UI.bankFresh > 0 && !old) tag.append(h("span", { class: "l2-new" }, "新"));
  else if (!(UI.bankFresh > 0) && old) old.remove();
};

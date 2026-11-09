// ================================================================
//  管理員介面的畫面（第一版：只看不改，決定 0033）
//  翊文：「管理員介面呢，可以看到大家進度的部分」
//  資料從 Functions 來（functions/admin.js）；怎麼算在 shared/admin.js；樣式在 css/admin.css。
//    - 登入後問一次 adminCheck。是管理員，右上角選單才多一項「管理員」（ui_core.js 的 ADDONS.adminMenu）；不是的話畫面完全不變。
//    - 打開時抓一次 adminOverview；之後只有按「重新整理」才抓，不自動抓。
//  暱稱、參觀者的名字都是玩家打的字：一律當純文字放（不要用 h 的 html）。
//  介面文字照第 1 代用「壹」。
// ================================================================
import { adminAgo, adminPlayText, adminSortRows, adminTimeText } from "../../shared/admin.js";
import { nowMs, num } from "../../shared/logic.js";
import { NET } from "./net_firebase.js";
import { ADDONS, PANELS, btn, h, roomLabel, snd } from "./ui_core.js";
import { overlay } from "./ui_board.js";

// ---------- 誰看得到：登入後問一次 ----------
let isAdmin = false, askedFor = null, menuBox = null, menuItem = null;
function drawMenu() {
  if (!menuBox) return;
  menuBox.hidden = !isAdmin;
  menuBox.replaceChildren(...(isAdmin && menuItem ? [h("p", { class: "md-h" }, "管理"), h("div", { class: "md-group" }, menuItem("md-admin", "shield", "管理員", () => openAdmin()))] : []));
}
function setAdmin(v) { isAdmin = !!v; drawMenu(); }
export async function askAdmin() {
  const uid = NET.me && NET.me.id;
  if (!uid) return;
  askedFor = uid;
  let yes = false;
  try { const r = await NET.call("adminCheck"); yes = !!(r && r.admin === true); }
  catch (e) { /* 問不到就當不是：一般玩家的畫面不變 */ }
  if (NET.me && NET.me.id === uid) setAdmin(yes);
}
NET.on("status", s => { if ((s.state === "connecting" || s.state === "online") && NET.me && askedFor !== NET.me.id) askAdmin(); });
NET.on("logout", () => { askedFor = null; setAdmin(false); VIEW.data = null; VIEW.error = ""; VIEW.open.clear(); });
// ui_core.js 的 buildNav 叫：給它選單裡的一格（平常是空的、藏起來的）
ADDONS.adminMenu = item => {
  menuItem = item;
  menuBox = h("div", { class: "md-admin-box", hidden: true });
  drawMenu();
  return menuBox;
};

// ---------- 那張表 ----------
const VIEW = { data: null, error: "", busy: false, sort: "seen", dir: -1, open: new Set() };
let paint = null, refreshBtn = null;

const COLS = [
  { label: "暱稱" },
  { key: "seen", label: "最後上線" },
  { key: "codex", label: "圖鑑" },
  { key: "day", label: "第幾天" },
  { label: "解鎖", wide: true },
  { label: "地下", wide: true },
  { label: "理智", wide: true },
  { label: "這週簽到", wide: true },
  { label: "狀況", wide: true, flags: true },
];
const frac = x => `${num(x.have)}／${num(x.total)}`;
const whereText = r => (r.state === "offline" ? "離線" : r.state === "away" ? "離開壹下" : roomLabel(r.room));
const seenText = r => (r.state === "offline" ? adminAgo(r.lastSeenAt, nowMs()) : "現在");
const orNone = (v, none = "沒有") => (v == null || v === "" ? none : v);

// 這一列要注意的事：讀不了、還沒進館、今天沒來、燈熄了、理智歸零幾次、有怪癖
function flags(r) {
  const s = r.summary, out = [];
  if (!s.ok) out.push(["讀不了", "bad"]);
  else if (!s.entered) out.push([s.free ? "只玩自由模式" : "還沒進館", ""]);
  if (!r.todayOnline) out.push(["今天沒來", ""]);
  if (s.entered) {
    if (s.stuck.dark) out.push(["燈熄了", "warn"]);
    if (s.stuck.sanityZero) out.push([`歸零 ${num(s.stuck.sanityZero)} 次`, "warn"]);
    if (s.stuck.quirks.length) out.push([`怪癖 ${s.stuck.quirks.length}`, "warn"]);
  }
  return out;
}
const flagTags = (r, cls) => h("span", { class: "adm-tags " + cls }, flags(r).map(([t, tone]) => h("span", { class: "adm-tag " + tone }, t)));

// 展開的細節
function section(title, pairs) {
  return h("section", { class: "adm-sec" }, h("h4", null, title), h("dl", null, pairs.map(([k, v]) => [h("dt", null, k), h("dd", null, v)])));
}
function detailOf(r) {
  const s = r.summary;
  const when = section("時間", [["最後上線", r.state === "offline" ? `${adminTimeText(r.lastSeenAt)}（${adminAgo(r.lastSeenAt, nowMs())}）` : "現在"], ["最後存檔", adminTimeText(r.savedAt)], ["在哪裡", whereText(r)], ["今天上線", r.todayOnline ? "有" : "沒有"]]);
  if (!s.ok) return h("div", { class: "adm-detail-in" }, h("p", { class: "adm-bad" }, "讀不了：這位的存檔解不開，可能壞掉了。"), when);
  if (!s.entered) return h("div", { class: "adm-detail-in" }, h("p", null, s.free ? "這位只玩過自由模式，還沒有挑戰模式的博物館。" : "這位還沒有進館。"), when);
  const v = s.visitors, p = s.progress, w = s.week, k = s.stuck;
  return h("div", { class: "adm-detail-in" },
    section("參觀者", [["幾位", `${v.count} 位`], ["現在這位", v.name], ["職業", orNone(v.job, "還沒選")], ["小優點", orNone(v.perk)], ["小缺點", orNone(v.flaw)],
      ["理智", `${num(v.sanity)}／${num(v.maxSan)}`], ["心情", num(v.mood)], ["靈感", num(v.insp)], ["佩佩神話", num(v.myth)], ["第幾天", `第 ${num(v.dayNo)} 天`], ["玩了多久", adminPlayText(v.playSec)]]),
    section("進度", [["圖鑑", frac(p.codex)], ["解鎖", frac(p.unlock)], ["地下", p.deepest ? `走到 B${p.deepest}` : "還沒下去"],
      ["讀了幾本書", `${num(p.books.total)} 本（起源室 ${frac(p.books.chapters)}、這位的禁書 ${p.books.forbidden}、每週劇情 ${p.books.story}）`],
      ["結局", p.endings.length ? p.endings.map(e => e.name).join("、") : "還沒有"], ["徽章", frac(p.badges)]]),
    section("這週", [["簽到累計", `${num(w.signCount)} 次`], ["這週簽到", `${w.signWeek}／7${w.signedToday ? "（今天簽了）" : "（今天還沒簽）"}`], ["每週劇情任務", `做完 ${num(w.tasksDone)} 個`], ["週章", `${num(w.stamps)} 枚`], ["這週的書", `讀了 ${num(w.booksRead)} 本`]]),
    h("section", { class: "adm-sec" }, h("h4", null, "有沒有卡住"),
      h("dl", null, h("dt", null, "理智歸零"), h("dd", null, `${num(k.sanityZero)} 次`), k.dark ? [h("dt", null, "現在"), h("dd", null, "燈熄了（理智用完，還沒換人）")] : null),
      k.quirks.length ? h("ul", { class: "adm-quirks" }, k.quirks.map(q => h("li", null, h("b", null, q.name), `　還剩 ${q.minsLeft} 分鐘`, q.task ? `，${q.task}就好` : ""))) : h("p", { class: "adm-none" }, "現在沒有怪癖。")),
    when);
}

// 一人一列（展開的話多一列細節）。點一列的任何地方都能展開；鍵盤按暱稱那個按鈕
function rowNodes(r) {
  const s = r.summary, e = s.entered ? s : null;
  const opened = () => VIEW.open.has(r.no);
  const detail = h("tr", { class: "adm-detail" }, h("td", { colspan: String(COLS.length) }, detailOf(r)));
  const open = h("button", { type: "button", class: "adm-open", "aria-expanded": String(opened()) },
    h("span", { class: "nf-dot", "aria-hidden": "true" }),
    h("span", { class: "adm-who" }, h("b", null, r.nick), h("small", null, whereText(r)), flagTags(r, "adm-narrow")));
  const row = h("tr", { class: `adm-row ${r.state}${opened() ? " on" : ""}`, onClick: () => {
    const on = !opened();
    if (on) VIEW.open.add(r.no); else VIEW.open.delete(r.no);
    open.setAttribute("aria-expanded", String(on));
    row.classList.toggle("on", on);
    if (on) row.after(detail); else detail.remove();
    snd("click");
  } },
    h("td", { class: "adm-nick" }, open),
    h("td", null, seenText(r)),
    h("td", s.ok ? null : { class: "adm-bad" }, !s.ok ? "讀不了" : e ? frac(e.progress.codex) : "—"),
    h("td", null, e ? `第 ${num(e.visitors.dayNo)} 天` : "—"),
    h("td", { class: "adm-wide" }, e ? frac(e.progress.unlock) : "—"),
    h("td", { class: "adm-wide" }, e ? (e.progress.deepest ? `B${e.progress.deepest}` : "—") : "—"),
    h("td", { class: "adm-wide" }, e ? `${num(e.visitors.sanity)}／${num(e.visitors.maxSan)}` : "—"),
    h("td", { class: "adm-wide" }, e ? `${e.week.signWeek}／7` : "—"),
    h("td", { class: "adm-wide adm-flags" }, flagTags(r, "")));
  return opened() ? [row, detail] : [row];
}

function tableOf(data) {
  const body = h("tbody");
  const drawBody = () => body.replaceChildren(...adminSortRows(data.rows, VIEW.sort, VIEW.dir).flatMap(rowNodes));
  const heads = COLS.map(c => {
    const th = h("th", { scope: "col", class: c.flags ? "adm-wide adm-flags" : c.wide ? "adm-wide" : null });
    if (!c.key) { th.textContent = c.label; return th; }
    const arrow = h("span", { class: "adm-arrow", "aria-hidden": "true" });
    const mark = () => {
      const on = VIEW.sort === c.key;
      if (on) th.setAttribute("aria-sort", VIEW.dir < 0 ? "descending" : "ascending"); else th.removeAttribute("aria-sort");
      arrow.textContent = on ? (VIEW.dir < 0 ? "▼" : "▲") : "";
    };
    th.adMark = mark;
    mark();
    th.append(h("button", { type: "button", class: "adm-sort", onClick: () => {
      if (VIEW.sort === c.key) VIEW.dir = -VIEW.dir; else { VIEW.sort = c.key; VIEW.dir = -1; }
      heads.forEach(x => { if (x.adMark) x.adMark(); });
      drawBody();
      snd("click");
    } }, c.label, arrow));
    return th;
  });
  drawBody();
  return h("div", { class: "adm-wrap", tabindex: "0", "aria-label": "大家的進度" }, h("table", { class: "adm-table" }, h("thead", null, h("tr", null, heads)), body));
}

async function loadOverview() {
  if (VIEW.busy) return;
  VIEW.busy = true;
  VIEW.error = "";
  if (paint) paint();
  try {
    VIEW.data = await NET.call("adminOverview");
  } catch (e) {
    if (e.status === 403 || e.status === 401) { VIEW.error = "沒有權限。"; VIEW.data = null; setAdmin(false); }
    else VIEW.error = (e.status === 0 ? "連不上伺服器，等壹下再按「重新整理」。" : "讀不到大家的進度，等壹下再按「重新整理」。") + (VIEW.data ? "下面是上壹次的資料。" : "");
  }
  VIEW.busy = false;
  if (paint) paint();
}

export function openAdmin() {
  if (!isAdmin) return;
  const m = overlay("nb-admin", "管理員", "管理員介面（只能看，不能改）", "shield", () => { paint = null; refreshBtn = null; });
  refreshBtn = btn("重新整理", () => loadOverview(), "small adm-refresh");
  m.setTop(refreshBtn);
  paint = () => {
    const d = VIEW.data, old = m.surface.querySelector(".adm-wrap"), top = old ? old.scrollTop : 0;
    refreshBtn.textContent = VIEW.busy ? "整理中……" : "重新整理";
    refreshBtn.setAttribute("aria-busy", String(VIEW.busy));
    const tile = (label, n) => h("div", { class: "adm-tile" }, h("small", null, label), h("b", null, num(n)), h("small", null, "人"));
    m.surface.replaceChildren(...[
      d ? h("div", { class: "adm-tiles" }, tile("總共", d.total), tile("今天上線", d.todayOnline), tile("現在在線", d.onlineNow)) : null,
      h("p", { class: "adm-note" }, "只能看、不能改。點壹列看細節。", d ? `資料時間 ${adminTimeText(d.at)}。` : ""),
      VIEW.error ? h("p", { class: "adm-err", role: "alert" }, VIEW.error) : null,
      d ? (d.rows.length ? tableOf(d) : h("p", { class: "nb-empty" }, "館裡還沒有人。")) : VIEW.busy ? h("p", { class: "nb-empty" }, "正在讀大家的進度……") : null,
    ].filter(Boolean));
    const now = m.surface.querySelector(".adm-wrap");
    if (now) now.scrollTop = top;
  };
  paint();
  snd("flip");
  loadOverview(); // 打開時抓一次；之後只有按「重新整理」才抓
}
PANELS.admin = openAdmin;

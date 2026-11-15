// ================================================================
//  房間效果的畫面層（翊文 11-15：「大廳也可以有些效果反應這些訊息」「銀行和賭場也可以有類似的特效」；docs/大廳效果提案.md）
//  狀態（暖冷、暗、人影幾個、旗、怪影子）只由 shared/room_mood.js 的 roomMood 算；這裡收資料、畫、換狀態時慢慢淡變。
//  跟館友自己的理智效果分開（#lights、#vignette、body 的 lights-out／bout／faint／flee、ui_odd 的黑影）：
//    - 自己壹層，class 都是 rm-，不加在 body 上，不碰那些 id 和 class；
//    - 館友自己的效果優先：有熄燈、昏倒、逃跑、發作就收起來；跟著游標的黑影出現時，怪影子不出現（roomMood 的 own）。
//  用法：mountMood(host, "lobby" | "bank" | "casino", { portrait })：把效果層放進 host，回傳它。
//  素材：目前都是 SVG／CSS 畫的，沒有圖。
// ================================================================
import { roomMood } from "../../shared/room_mood.js";
import { eventBars } from "../../shared/events.js";
import { todayStr } from "../../shared/logic.js";
import { ADDONS, UI, every, h } from "./ui_core.js";
import { allEvents } from "./ui_events.js";

const LAYERS = new Set();
const NS = "http://www.w3.org/2000/svg";
const rnd = seed => { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }; // 人影的位置固定（同樣的人數看起來同樣），不用 RNG()

// ---------- 收資料 ----------
function ownFlags() {
  const c = document.body.classList;
  return { lightsOut: c.contains("lights-out"), faint: c.contains("faint"), flee: c.contains("flee"), bout: c.contains("bout"), shadow: !!document.querySelector(".odd-follower") };
}
// 開發看效果用（玩家看不到）：網址加 ?mood=good／mid／bad／dark（dark＝館友自己熄燈）
const FAKE = {
  good: { mood: 90, hall: 70, policy: true, event: true, idx: 0.8, squeeze: 0, sanLow: 0, unrest: [9, 1, 0, 0], own: {}, stocks: [{ chg: 0.03 }, { chg: 0.02 }, { chg: 0.01 }, { chg: -0.01 }] },
  mid: { mood: 45, hall: 12, policy: true, event: false, idx: 0, squeeze: 0.1, sanLow: 1, unrest: [6, 3, 1, 0], own: {}, stocks: [{ chg: 0.01 }, { chg: -0.01 }, { chg: 0 }] },
  bad: { mood: 10, hall: 2, policy: false, event: false, idx: -0.7, squeeze: 0.6, sanLow: 5, unrest: [2, 2, 4, 3], own: {}, stocks: [{ chg: -0.03 }, { chg: -0.02 }, { chg: -0.04 }, { chg: 0.01 }] },
};
FAKE.warm = Object.assign({}, FAKE.mid, { mood: 70, hall: 30 });
FAKE.dark = Object.assign({}, FAKE.bad, { own: { lightsOut: true } });
export function moodData() {
  if (import.meta.env.DEV) { const q = new URLSearchParams(location.search).get("mood"); if (q && FAKE[q]) return JSON.parse(JSON.stringify(FAKE[q])); }
  const day = todayStr(), bh = UI.headBank && UI.headBank.day === day ? UI.headBank.v : (UI.bankHall && !UI.bankHall.demo ? UI.bankHall : null);
  const w = bh && bh.econ && bh.econ.world ? bh.econ.world : null, st = w && w.states ? w.states : null;
  const total = st ? Object.values(st).reduce((n, x) => n + (+x || 0), 0) : 0;
  const pol = UI.policy && (!UI.policy.until || UI.policy.until >= day) && (!UI.policy.day || UI.policy.day <= day);
  const san = UI.npcSan && typeof UI.npcSan === "object" ? Object.values(UI.npcSan).filter(e => Array.isArray(e) && +e[0] < 40).length : 0;
  const ev = (() => { try { return eventBars(allEvents(), Date.now()).some(b => b.phase === "live"); } catch (e) { return false; } })();
  return {
    mood: Array.isArray(UI.crowdMood) ? +UI.crowdMood[0] : null,
    hall: UI.hallNow && typeof UI.hallNow.total === "number" ? UI.hallNow.total : null,
    policy: !!pol, event: ev,
    idx: bh && bh.econ ? bh.econ.idx : null,
    squeeze: total ? ((+st.squeeze || 0) + (+st.layoff || 0)) / total : null,
    sanLow: san, unrest: w && Array.isArray(w.unrestBands) ? w.unrestBands : null,
    own: ownFlags(),
    stocks: bh && bh.stocks && Array.isArray(bh.stocks.list) ? bh.stocks.list : null,
  };
}

// ---------- 畫的零件（SVG） ----------
const svg = (html, vb, cls) => { const e = document.createElementNS(NS, "svg"); e.setAttribute("viewBox", vb); e.setAttribute("class", cls || ""); e.setAttribute("aria-hidden", "true"); e.setAttribute("preserveAspectRatio", "none"); e.innerHTML = html; return e; };
// 旗：壹條粗麻繩垂著，每面旗有布的漸層、壹條摺線、縫邊和陰影；兩種顏色（政策＝紅金、活動＝青米）
const FLAG = { policy: [["#B3342A", "#7E1E18"], ["#E0B659", "#A97F2A"]], event: [["#2C7F80", "#195556"], ["#EFE6C9", "#BDB08A"]] };
function buntingSVG(kind) {
  const cols = kind === "both" ? [...FLAG.policy, ...FLAG.event] : FLAG[kind] || FLAG.policy, n = 13, W = 1000;
  const sag = x => 8 + Math.sin(x / W * Math.PI) * 26;
  let defs = "", body = `<path d="M0 8 Q${W / 2} 60 ${W} 8" fill="none" stroke="#5E4220" stroke-width="3.2" stroke-linecap="round"/><path d="M0 7 Q${W / 2} 59 ${W} 7" fill="none" stroke="#C9A468" stroke-width="1" stroke-dasharray="3 5" opacity=".7"/>`;
  cols.forEach(([a, b], i) => { defs += `<linearGradient id="rmg${kind}${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`; });
  for (let i = 0; i < n; i++) {
    const x = 40 + i * ((W - 80) / (n - 1)), y = sag(x) + 1, k = i % cols.length;
    body += `<g class="rm-flag" style="animation-delay:${(i * 0.37) % 3}s;transform-origin:${x}px ${y}px"><path d="M${x - 24} ${y} Q${x} ${y + 5} ${x + 24} ${y} L${x + 2} ${y + 56} Q${x} ${y + 60} ${x - 2} ${y + 56} Z" fill="url(#rmg${kind}${k})" stroke="rgba(40,20,10,.55)" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M${x - 15} ${y + 3} L${x - 1} ${y + 50}" stroke="rgba(0,0,0,.18)" stroke-width="2"/><path d="M${x + 12} ${y + 3} L${x + 1} ${y + 46}" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>` +
      `<path d="M${x - 20} ${y + 4} Q${x} ${y + 8} ${x + 20} ${y + 4}" fill="none" stroke="rgba(255,240,200,.65)" stroke-width="1" stroke-dasharray="2 3"/></g>`;
  }
  return svg(`<defs>${defs}</defs>${body}`, `0 0 ${W} 100`, "rm-bunt-svg");
}
// 剪影：壹個人壹張小 SVG（頭、肩、身體），四種體型；前面的深、清楚，後面的淺、糊
const BODY = [
  '<circle cx="12" cy="7" r="5.2"/><path d="M3 38 Q3 17 12 15 Q21 17 21 38 Z"/>', // 站著
  '<circle cx="12" cy="7" r="5"/><path d="M12 1 L20 6 L4 6 Z"/><path d="M2 40 Q3 17 12 15 Q21 17 22 40 Z"/>', // 戴帽子
  '<circle cx="11" cy="9" r="4.4"/><path d="M4 32 Q4 18 11 16.5 Q18 18 18 32 Z"/>', // 小孩
  '<circle cx="9" cy="7" r="4.8"/><circle cx="19" cy="9" r="4"/><path d="M1 38 Q1 17 9 15 Q14 16 15 22 Q17 18 19 17 Q26 19 26 38 Z"/>', // 兩個人靠著
];
function silhouette(i, depth, tone) {
  // 顏色、透明度、模糊都直接寫成數字（不靠 CSS 變數和 calc）：手機瀏覽器上 calc 算不出來會變成白色（翊文 11-15 手機實測人影變白）
  const t = BODY[i % BODY.length], w = i % 4 === 3 ? 27 : 24, d = +depth, a = (0.5 + d * 0.4).toFixed(2), blur = ((1 - d) * 0.7).toFixed(2);
  return `<svg class="rm-p" viewBox="0 0 ${w} 42" style="filter:blur(${blur}px)" aria-hidden="true" preserveAspectRatio="xMidYMax meet"><g fill="${tone || "rgb(44,24,18)"}" fill-opacity="${a}">${t}</g></svg>`;
}
function omenSVG() {
  // 圓圓的頭、兩邊肩膀，兩點很淡的眼睛；故意不畫五官和手腳，看起來像「多出來的壹隻」
  return svg('<defs><radialGradient id="rmo" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#1A1022" stop-opacity=".85"/><stop offset="1" stop-color="#1A1022" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="40" cy="30" rx="22" ry="24" fill="url(#rmo)"/><path d="M8 118 Q10 60 40 56 Q70 60 72 118 Z" fill="url(#rmo)"/><circle cx="32" cy="29" r="2.6" fill="#EADFC0" opacity=".5"/><circle cx="48" cy="29" r="2.6" fill="#EADFC0" opacity=".5"/>', "0 0 80 120", "rm-omen-svg");
}

// ---------- 各處的位置 ----------
// 大廳導覽圖（橫 1024×572、直 572×1024）：展廳那格、怪影子可以出現的角落（地下樓梯口、圖書館）
const LOBBY = {
  land: { W: 1024, H: 572, hall: [452, 56, 572, 134], omens: [[872, 238, 42], [118, 296, 38]] },
  port: { W: 572, H: 1024, hall: [345, 175, 540, 292], omens: [[470, 520, 40], [80, 205, 36]] },
};
const pct = (v, t) => (v / t * 100).toFixed(2) + "%";

// ---------- 賭場的熱鬧表現（翊文 11-15：四種都要）。開發時網址加 ?cas=neon,dealer 可以只看某幾種 ----------
// 全部由 roomMood 的 heat（0 冷清～3 沸騰）決定，不擋牌、按鈕、字
const CAS_FX = ["chips", "neon", "smoke", "dealer"];
const DEALER = ["今晚桌邊有點冷清，慢慢來。", "今晚人不多不少，來壹手吧。", "今晚客人不少，桌邊熱起來了。", "今晚客人好多！籌碼都在飛！"];
const CHIP_COL = [["#B33A2E", "#E8C9A8"], ["#1F2A33", "#D8B25A"], ["#2E7D4F", "#EADFB8"], ["#C9A24A", "#6B4A12"]];
function chipStack(n, col, i) {
  let coins = ""; for (let k = 0; k < n; k++) coins += `<i style="bottom:${k * 5}px;background:${CHIP_COL[col][0]};border-color:${CHIP_COL[col][1]}"></i>`;
  return `<span class="rm-stk" style="animation-delay:${(i * 0.4) % 3}s">${coins}</span>`;
}
function casinoFx(variants, m, fx) {
  fx.innerHTML = "";
  fx.classList.toggle("both-top", variants.includes("neon") && variants.includes("dealer")); // 霓虹和荷官都在標題列中間：錯開（霓虹偏左、荷官偏右）
  variants.forEach(v => casinoFx1(v, m, fx));
}
function casinoFx1(variant, m, fx) {
  const heat = m.heat;
  if (variant === "chips") { // 籌碼塔：右下角壹排，熱鬧＝塔多又高；熱鬧時偶爾滾過壹枚籌碼
    const n = 1 + heat * 2, r = rnd(31); let html = "";
    for (let i = 0; i < n; i++) html += chipStack(2 + Math.floor(r() * (2 + heat * 2)), i % 4, i);
    fx.insertAdjacentHTML("beforeend", `<div class="rm-chips">${html}</div>${heat >= 2 ? '<i class="rm-roll"></i>' : ""}`);
  } else if (variant === "neon") { // 霓虹招牌：上緣中間，熱鬧＝全亮微微閃，冷清＝幾個字暗掉
    const word = "HAMACHI CASINO", dark = [new Set([1, 4, 6, 9, 12]), new Set([4, 10]), new Set(), new Set()][heat];
    fx.insertAdjacentHTML("beforeend", `<div class="rm-neon heat${heat}" role="img">${[...word].map((ch, i) => `<b class="${dark.has(i) ? "off" : ""}" style="animation-delay:${(i * 0.31) % 2.4}s">${ch === " " ? "&nbsp;" : ch}</b>`).join("")}</div>`);
  } else if (variant === "smoke") { // 吊燈煙霧：熱鬧＝淡淡的雪茄煙從下往上飄過吊燈；冷清＝沒有煙，整個暗壹點
    const n = [0, 2, 4, 6][heat], r = rnd(53); let html = "";
    for (let i = 0; i < n; i++) html += `<i style="left:${(8 + r() * 80).toFixed(0)}%;animation-duration:${(18 + r() * 14).toFixed(0)}s;animation-delay:-${(r() * 20).toFixed(0)}s;width:${(18 + r() * 16).toFixed(0)}%"></i>`;
    fx.insertAdjacentHTML("beforeend", `<div class="rm-smoke">${html}</div>`);
  } else if (variant === "dealer") { // 荷官台詞：標題列中間壹小塊，跟著熱鬧程度換壹句
    fx.insertAdjacentHTML("beforeend", `<div class="rm-dealer heat${heat}"><b>Yuga Bot</b><span>${DEALER[heat]}</span></div>`);
  }
}
// ---------- 建一層 ----------
export function mountMood(host, kind, opts) {
  const o = opts || {}, root = h("div", { class: `rm rm-${kind}`, "aria-hidden": "true" });
  const light = h("div", { class: "rm-light" }, h("i", { class: "rm-warmglow" }), h("i", { class: "rm-coldveil" }), h("i", { class: "rm-dimveil" }), kind === "bank" ? h("i", { class: "rm-lamps" }) : null, kind === "casino" ? h("i", { class: "rm-chandelier" }) : null, kind === "bank" ? h("i", { class: "rm-board" }) : null);
  const bunt = h("div", { class: "rm-bunting" });
  const crowd = h("div", { class: "rm-crowd" });
  const omens = h("div", { class: "rm-omens" });
  const fx = h("div", { class: "rm-fx" });
  root.append(light, bunt, crowd, omens, fx);
  const L = kind === "lobby" ? (o.portrait ? LOBBY.port : LOBBY.land) : null;
  if (L) {
    const [x0, y0, x1, y1] = L.hall;
    Object.assign(crowd.style, { left: pct(x0, L.W), top: pct(y0, L.H), width: pct(x1 - x0, L.W), height: pct(y1 - y0, L.H) });
    L.omens.forEach(([x, y, sz], i) => { const e = h("div", { class: "rm-omen", style: { left: pct(x, L.W), top: pct(y, L.H), width: pct(sz, L.W) } }); e.append(omenSVG()); omens.append(e); });
  } else {
    [[6, 62, 7], [90, 58, 7]].forEach(([x, y, sz]) => { const e = h("div", { class: "rm-omen", style: { left: x + "%", top: y + "%", width: sz + "%" } }); e.append(omenSVG()); omens.append(e); });
  }
  let last = "", bk = "", shown = false, fxKey = ""; // 第壹次畫的時候還沒掛上畫面，不能拿 isConnected 判斷
  const draw = () => {
    if (root.isConnected) shown = true; else if (shown) { LAYERS.delete(draw); return; }
    const d = moodData();
    if (kind === "bank") { const e = d.idx; d.warm = e === null ? null : e > 0.3 ? 0.55 : e < -0.3 ? -0.55 : 0; }
    const m = roomMood(d);
    root.classList.toggle("rm-off", m.hide);
    root.style.setProperty("--rm-warm", Math.max(0, m.light.warm).toFixed(2));
    root.style.setProperty("--rm-cold", Math.max(0, -m.light.warm).toFixed(2));
    root.style.setProperty("--rm-dim", m.light.dim.toFixed(2));
    if (kind === "bank") { // 看板的光：多數行情漲＝綠、跌＝紅
      const up = (d.stocks || []).reduce((n, s) => n + (s.chg > 0.002 ? 1 : s.chg < -0.002 ? -1 : 0), 0), tone = !d.stocks || !d.stocks.length ? 0 : Math.max(-1, Math.min(1, up / Math.max(3, d.stocks.length / 2)));
      root.style.setProperty("--rm-up", Math.max(0, tone).toFixed(2)); root.style.setProperty("--rm-down", Math.max(0, -tone).toFixed(2));
    }
    // 旗：只有種類變了才重畫
    if (kind === "casino") { m.flags.bunting = null; m.crowd = 0; } // 賭場的介面是頁籤和表單，旗會蓋到頁籤；桌邊人影翊文不要，改成 casinoFx
    if (kind === "casino") { const q = import.meta.env.DEV ? new URLSearchParams(location.search).get("cas") : null, pick = x => (Array.isArray(x) ? x : typeof x === "string" ? x.split(",") : []).filter(y => CAS_FX.includes(y)), v = q ? pick(q) : pick(o.fx), k = v.join(",") + "|" + m.heat; if (k !== fxKey) { fxKey = k; casinoFx(v, m, fx); } }
    if (kind === "bank") m.flags.bunting = null, m.omen = 0, m.crowd = 0; // 銀行不掛旗、不放人影和怪影子（只有光和看板）
    if (m.flags.bunting !== bk) { bk = m.flags.bunting; bunt.replaceChildren(...(bk ? [buntingSVG(bk)] : [])); bunt.classList.toggle("on", !!bk); }
    // 人影：數量變了才重排（深淺、大小固定在同壹個人身上；新增的人從後面淡進來）
    const key = m.crowd + "|" + kind;
    if (key !== last) {
      last = key;
      const r = rnd(97), els = [];
      for (let i = 0; i < m.crowd; i++) {
        const depth = r(), host2 = h("span", { class: "rm-pw", style: { left: (r() * 92).toFixed(1) + "%", top: (kind === "lobby" ? 18 + r() * 70 : 55 + r() * 40).toFixed(1) + "%", "--sc": (0.78 + depth * 0.42).toFixed(2), transitionDelay: (i * 60) + "ms" }, html: silhouette(Math.floor(r() * 4), depth.toFixed(2), kind === "casino" ? "rgb(8,18,12)" : null) });
        els.push(host2);
      }
      crowd.replaceChildren(...els);
      requestAnimationFrame(() => requestAnimationFrame(() => crowd.classList.add("in")));
    }
    // 怪影子：沒有就整個關掉；有的話出現得越勤快，週期越短（偶爾閃壹下，不是壹直在）
    omens.classList.toggle("on", m.omen > 0);
    [...omens.children].forEach((e, i) => { e.style.animationDuration = Math.round(80 - m.omen * 45 + i * 23) + "s"; e.style.animationDelay = -(7 + i * 31) + "s"; });
  };
  LAYERS.add(draw);
  host.append(root);
  draw();
  every(draw, 2000); // 自己的理智效果（熄燈、昏倒、黑影）也會變，每 2 秒看壹次；換畫面時 ui_core 會清掉這個計時器
  return root;
}
// 資料變了（peek、財報讀到）叫這個
export function moodRedraw() { LAYERS.forEach(f => f()); }
ADDONS.moodRedraw = moodRedraw;

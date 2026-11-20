// ================================================================
//  公用的「數值怎麼看」畫面元件（翊文 11-15：「寫個公用的方式，這樣以後哪邊都好呼叫」；資料層是 shared/world/stat_view.js，決定 0088）
//  玩家看分級和一句話，不看數字。tone 對應的顏色只寫在 css/stat.css（sv- 開頭）。
//    statBadge(sv, { hint })        小牌：「保守」。sv 是 statView 的回傳；null 就回 null（呼叫的地方照放，h() 會略過 null）
//    statBar(items, { label })      長條：壹條切成幾段，寬度照 n；items = [{ label, n, tone }]
//    statLegend(items)              配長條的圖例：色塊＋名字＋數量
//    statBands(items, { label })    分布：壹格壹柱，高度照 n；items 同上
//    statCounts(kind, counts, order) 把「各分級幾個」（例如 { normal: 7, cut: 3 }）轉成 items，名字和 tone 都叫 statView，不自己寫
//  用法例：財報「已知世界」卡（ui_bank.js）。NPC 卡片、展廳評價之後也直接叫。
// ================================================================
import { UI, h } from "./ui_core.js";
import { NUM } from "../../../shared/core/config.js";
import { statView, statBandOf } from "../../../shared/world/stat_view.js";

const TONES = ["good", "neutral", "warn", "bad"];
const tone = t => (TONES.includes(t) ? t : "neutral");

// 數字怎麼寫（翊文 11-15：玩家看得到數字）：格式只寫這壹處，照種類。沒有數字（集團狀態）回 ""
export function statNum(kind, value) {
  if (value === null || value === undefined || !Number.isFinite(+value)) return "";
  const v = +value;
  if (kind === "budgetMult") return "×" + v.toFixed(2);
  if (kind === "unitHealth") return v.toFixed(2);
  if (kind === "npcSan" || kind === "unitUnrest" || kind === "crowdMood") return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

// opts.kind：種類（決定數字格式）；opts.num：false 就不寫數字；opts.hint：true 就把壹句話也寫出來
export function statBadge(sv, opts) {
  if (!sv) return null;
  const o = opts || {}, num = o.kind && o.num !== false ? statNum(o.kind, sv.value) : "";
  return h("span", { class: "sv-badge tone-" + tone(sv.tone), title: sv.hint || "" }, h("em", { "aria-hidden": "true" }), sv.label, num ? h("b", { class: "sv-n bank-tab-num" }, num) : null, o.hint && sv.hint ? h("small", null, sv.hint) : null);
}

export function statBar(items, opts) {
  const list = (items || []).filter(x => x && x.n > 0);
  if (!list.length) return null;
  return h("div", { class: "sv-bar", role: "img", "aria-label": (opts && opts.label) || list.map(x => `${x.label} ${x.n}`).join("、") }, list.map(x => h("i", { class: "tone-" + tone(x.tone), style: { flexGrow: x.n } })));
}

export function statLegend(items) {
  return h("div", { class: "sv-legend" }, (items || []).map(x => h("span", { class: "tone-" + tone(x.tone) }, h("em", { "aria-hidden": "true" }), x.label, h("b", { class: "bank-tab-num" }, ` ${x.n || 0}`))));
}

export function statBands(items, opts) {
  // 壹條 100% 堆疊橫條（翊文 11-18：直條圖太佔空間）：照比例切段、沿用各等級顏色；段夠寬就寫「等級 數字」，太窄的只放顏色，名字和數字改到條下面壹排小字
  const list = items || [], total = list.reduce((n, x) => n + (x.n || 0), 0);
  if (!list.length) return null;
  const share = x => (total ? (x.n || 0) / total : 0), wide = x => share(x) >= 0.2, narrow = list.filter(x => (x.n || 0) > 0 && !wide(x));
  return h("div", { class: "sv-bands", role: "img", "aria-label": (opts && opts.label) || list.map(x => `${x.label} ${x.n || 0}`).join("、") },
    h("div", { class: "sv-stack" }, list.filter(x => (x.n || 0) > 0).map(x => h("i", { class: "tone-" + tone(x.tone), style: { flexGrow: x.n }, title: `${x.label} ${x.n}` }, wide(x) ? h("span", null, x.label, h("b", { class: "bank-tab-num" }, " " + x.n)) : null))),
    narrow.length ? h("div", { class: "sv-narrow" }, narrow.map(x => h("span", { class: "tone-" + tone(x.tone) }, h("em", { "aria-hidden": "true" }), x.label, h("b", { class: "bank-tab-num" }, " " + x.n)))) : null);
}

// 沒有 id、只有「各分級幾個」的時候，用壹個代表值去問 statView 要名字和 tone（分級只寫在 stat_view.js）
function rep(kind, code) {
  if (kind === "unitState") return statView("unitState", null, code);
  if (kind === "unitHealth") {
    const C = NUM.casino.worldDoc.health, v = { tight: C.squeeze - 0.01, weak: (C.squeeze + C.cut) / 2, normal: (C.cut + 1.1) / 2, strong: 1.5 }[code];
    return v !== undefined && statBandOf("unitHealth", v) === code ? statView("unitHealth", null, v) : null; // 門檻改了、代表值不在那級，就不顯示（寧可缺也不錯）
  }
  if (kind === "unitUnrest") { const v = { calm: 10, stir: 40, uneasy: 60, turmoil: 90 }[code]; return v !== undefined && statBandOf("unitUnrest", v) === code ? statView("unitUnrest", null, v) : null; }
  if (kind === "crowdMood") { const v = { cold: 10, plain: 45, warm: 70, buzz: 95 }[code]; return v !== undefined && statBandOf("crowdMood", v) === code ? statView("crowdMood", null, v) : null; }
  if (kind === "npcSan") { const v = { edge: 10, uneasy: 30, tired: 50, steady: 80 }[code]; return v !== undefined && statBandOf("npcSan", v) === code ? statView("npcSan", null, v) : null; }
  return null;
}
export function statCounts(kind, counts, order) {
  const c = counts || {};
  return (order || Object.keys(c)).map(code => { const sv = rep(kind, code); return sv ? { code, label: sv.label, tone: sv.tone, n: +c[code] || 0 } : null; }).filter(Boolean);
}

// NPC 理智（peek 的 npcSan，決定 0090）：id → statView。還沒讀到 peek（UI.npcSan 是 undefined）回 null；讀到了沒列的就是 70
export function npcSanView(id) {
  if (!id || !UI.npcSan) return null;
  const e = UI.npcSan[id], v = Array.isArray(e) ? +e[0] : 70;
  return statView("npcSan", id, Number.isFinite(v) ? v : 70);
}
// opts.calm：true ＝ 只有不是「穩定」才畫（窄的地方用，免得壹排都是「穩定」）；其他同 statBadge
export function npcSanBadge(id, opts) {
  const sv = npcSanView(id);
  if (!sv || (opts && opts.calm && sv.band === "steady")) return null;
  return statBadge(sv, Object.assign({ kind: "npcSan" }, opts || {}));
}

// 展廳的散客氣氛（peek 的 crowdMood，決定 0091）：回 statView；沒讀到或沒有回 null
export function crowdMoodView() {
  const m = UI.crowdMood;
  return Array.isArray(m) && Number.isFinite(+m[0]) ? statView("crowdMood", null, +m[0]) : null;
}
// 壹行：小牌＋壹句話（展廳的小塊、評價視窗用）。opts.num：false 不寫數字
export function crowdMoodLine(opts) {
  const sv = crowdMoodView();
  if (!sv) return null;
  return h("p", { class: "sv-line" }, statBadge(sv, Object.assign({ kind: "crowdMood" }, opts || {})), h("span", null, sv.hint));
}

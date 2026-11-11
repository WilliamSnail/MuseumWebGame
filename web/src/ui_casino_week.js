// ================================================================
//  賭場的每週收藏的畫面（決定 0042；規則 shared/casino_week.js；內容寫在 content/weeks/<週>/week.json 的 casino）
//  這個檔只畫「伺服器給我的進度」，什麼都不算、不發獎：條件、收藏品、領週章都在伺服器（functions/casino.js 的 wk、wkclaim）。
//  兩個地方用同一份畫法：賭場的「本週收藏」頁籤（ui_casino.js）、每週劇情面板的「本週賭場收藏」（ui_story.js）。
//  進度從伺服器拿一次放在這裡（CAS_WK）；賭場每一步的回答也會更新它。沒登入、連不上就寫「進度要連上伺服器才看得到」。
//  介面上的字用「壹」。名字、說明、故事都是草稿，Yuga 可以改。
// ================================================================
import { NUM } from "../../shared/config.js";
import { casWkBase, casWkCondText, casWkProgress, casWkVisible } from "../../shared/casino_week.js";
import { NET } from "./net_firebase.js";
import { PANELS, UI, btn, h, icon, note, snd } from "./ui_core.js";

// 伺服器最後給的進度（casWkView 的樣子）。at 是拿到的時間（performance.now）
export const CAS_WK = { view: null, at: 0 };
export function setWkView(v) {
  if (v && typeof v === "object" && v.c && v.got) { CAS_WK.view = v; CAS_WK.at = performance.now(); }
}
let inflight = null;
// 向伺服器要最新的進度。15 秒內拿過就直接用；沒登入、連不上回傳 null（不丟錯）
export function loadWkView(force) {
  if (!UI.net || !NET.loggedIn) return Promise.resolve(null);
  if (!force && CAS_WK.view && performance.now() - CAS_WK.at < 15000) return Promise.resolve(CAS_WK.view);
  if (!inflight) {
    inflight = NET.call("casino", { act: "wk" }).then(r => { if (r && r.ok && r.wk) setWkView(r.wk); return CAS_WK.view; }).catch(() => null).finally(() => { inflight = null; });
  }
  return inflight;
}
// 進度是不是這一週的
const viewOf = (def, view) => (def && view && view.week === def.label ? view : null);
export const wkGotCount = (def, view) => { const v = viewOf(def, view); return v ? casWkBase(def).filter(it => v.got[it.id]).length : 0; };
// 下一步：第一件還沒拿到的（只算現在看得到的）。沒有進度（連不上）就請他去賭場看
export function wkNextText(def, view, today) {
  const v = viewOf(def, view);
  if (!def) return "";
  if (!v) return "去賭場的「本週收藏」看看進度";
  if (v.done && !v.claimed) return "去賭場領集滿的週章，讀壹小段故事";
  if (v.done) return "";
  const it = casWkVisible(def, today).find(x => !v.got[x.id]);
  return it ? `去賭場：${casWkCondText(it.when)}（${casWkProgress(v.c, it.when)}）` : "";
}

// 領集滿的週章（伺服器寫存檔，只領一次；這週，或以前集滿了還沒領的週）。成功回傳伺服器的回答，沒成功回傳 null
export async function claimWeek(label) {
  try {
    const r = await NET.call("casino", { act: "wkclaim", week: label });
    if (!r || !r.ok) { snd("error"); note((r && r.reason) || "沒辦法。", "bad"); return null; }
    setWkView(r.wk);
    snd("unlock");
    note(`領到了：週章 ${r.claimed.stamps} 枚。集滿的小故事放在圖書館書架的「每週劇情」。`, "good");
    return r;
  } catch (e) { snd("error"); note((e && e.message) || "沒辦法。", "bad"); return null; }
}

// ---------- 一件收藏品 ----------
function itemRow(it, def, view, o) {
  const v = viewOf(def, view), got = !!(v && v.got[it.id]);
  return h("li", { class: "cw-item" + (got ? " got" : "") },
    h("span", { class: "cw-badge", "aria-hidden": "true" }, icon(got ? "check" : "lock")),
    h("span", { class: "cw-name" }, h("b", null, it.name, it.extra ? "（加碼）" : ""),
      o.compact ? null : h("small", { class: "cw-desc" }, it.desc),
      h("small", { class: "cw-cond" }, got ? "收到了" : `條件：${casWkCondText(it.when)}${v ? `（${casWkProgress(v.c, it.when)}）` : ""}`)));
}

// ---------- 整週的畫面 ----------
// def：這週的收藏（casWkDefFor）；view：伺服器給的進度（可以是 null）；today：遊戲的今天
// o：{ compact（劇情面板用，不放說明和故事）, claim(週名)（按「領週章」）, pastDef(週名)（以前的週的內容，補領用）, openCasino（compact 才有）, busy }
export function weekCollection(def, view, today, o = {}) {
  if (!def) return h("p", { class: "nb-empty" }, "這週賭場沒有特別的收藏。");
  const v = viewOf(def, view), items = casWkVisible(def, today), base = casWkBase(def);
  const got = wkGotCount(def, view), notes = def.notes.filter(n => n.date <= today);
  const parts = [];
  if (!o.compact) parts.push(h("p", { class: "cw-intro" }, def.intro));
  if (notes.length) parts.push(h("p", { class: "cw-note" }, icon("scroll"), " ", notes[notes.length - 1].text));
  parts.push(h("p", { class: "cw-count" }, v ? `基本的收藏 ${got}／${base.length}${v.done ? "・集滿了" : ""}` : "進度要連上伺服器才看得到。"));
  parts.push(h("ul", { class: "cw-list" }, items.map(it => itemRow(it, def, view, o))));
  const r = def.reward, N = NUM.casino.week.stamp;
  parts.push(h("p", { class: "cw-reward" }, icon("medal"), ` 集滿基本的 ${base.length} 件：紀念品「${r.souvenir.name}」、稱號「${r.title}」${N ? `、週章 ${N} 枚` : ""}、壹小段故事。紀念品放進「財產」，可以掛展廳；稱號在「成就」。每天加碼的不算條件。`));
  if (v && v.done) {
    if (v.claimed) {
      parts.push(h("p", { class: "cw-claimed" }, icon("check"), " 週章領過了。"));
      if (!o.compact) parts.push(storyBox(def));
    } else if (o.claim) parts.push(btn("領週章，讀集滿的故事", () => o.claim(def.label), "primary small", { disabled: o.busy ? true : null }));
  }
  if (o.compact && o.openCasino) parts.push(btn([icon("dice"), " 去賭場"], () => o.openCasino(), "primary small"));
  // 以前的週：集滿了、週章還沒領的，可以補領（沒集滿的就過了，沒有懲罰）
  const late = !o.compact && v ? v.past.filter(p => p.done && !p.claimed) : [];
  if (late.length && o.claim) parts.push(h("div", { class: "cw-late" }, h("h4", null, "以前集滿、還沒領的"), late.map(p => {
    const pd = o.pastDef ? o.pastDef(p.week) : null;
    return h("div", { class: "cw-late-row" }, h("span", null, `${p.week}${pd ? `〈${pd.title}〉` : ""}`), btn("領週章", () => o.claim(p.week), "small primary", { disabled: o.busy ? true : null }));
  })));
  return h("div", { class: "cw-box" }, ...parts);
}
// 集滿後的小故事（領過週章才看得到；之後也在圖書館書架的「每週劇情」）
export function storyBox(def) {
  const s = def.reward.story;
  if (!s || !s.pages.length) return null;
  return h("div", { class: "cw-story" }, h("h4", null, s.title ? `〈${s.title}〉` : "集滿的小故事"),
    ...s.pages.map(p => h("p", null, ...String(p).split("\n").flatMap((line, i) => (i ? [h("br"), line] : [line])))),
    h("small", null, "圖書館書架的「每週劇情」也讀得到。"));
}

// 劇情面板：標題＋收藏（compact）。自己去問伺服器進度，回來再畫，不卡畫面
export function weekBox(def, today, o = {}) {
  const box = h("section", { class: "sp-sec cw-wrap", "aria-label": "本週賭場收藏" });
  const draw = () => box.replaceChildren(h("h3", null, def.title ? `本週賭場收藏：${def.title}` : "本週賭場收藏"),
    weekCollection(def, CAS_WK.view, today, Object.assign({ compact: true, openCasino: () => PANELS.casino && PANELS.casino({ tab: "week" }), claim: async label => { await claimWeek(label); if (o.after) o.after(); draw(); } }, o)),
    h("p", { class: "sp-note" }, "進度只在伺服器算（改畫面沒有用）。籌碼不是錢，這裡沒有花錢的地方。"));
  draw();
  loadWkView().then(v => { if (v && box.isConnected) draw(); });
  return box;
}

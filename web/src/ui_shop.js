// ================================================================
//  兌換所、委託櫃台的上課、地下的試煉房間的畫面（決定 0032；規則在 shared/shop.js）
//  翊文 11-09：「每周任務集滿後可以換更高級的裝備，並且提升技能」「6個職業的技能選好後要怎麼能增加也要想辦法」
//  入口：右上角「選單」的「兌換所」（ui_core.js 的 buildNav）、大廳的「本週地下收藏庫」小卡、每週劇情面板上面、委託櫃台的上課那一塊。
//  舊的檔只加小接口（ADDONS、PANELS 是 ui_core.js 的，ui_core 不能 import 這個檔）：
//    ADDONS.commission（委託櫃台：上課）、ADDONS.cellar（地下收藏庫：試煉房間）、ADDONS.sheet（館長室的名片：穿了什麼）、PANELS.shop（兌換所）。
//  蓋在畫面上的木框用 ui_board.js 的 overlay()；限定頭飾的「馬上使用」用 ui_signin.js 的 useNow。
//  介面文字照第 1 代用「壹」。名字、說明都是草稿，Yuga 可以改。
// ================================================================
import { GEAR_ITEMS, NUM, SKILLS } from "../../shared/config.js";
import { SHOP_TEXT, SKILL_TEXT } from "../../shared/content3.js";
import { isFree, todayStr } from "../../shared/logic.js";
import { limitedInfo, ownsLimited } from "../../shared/signin.js";
import { buyGear, buyLimited, buySkillUp, gearInfo, isWorn, lessonLeft, lessonState, limitedPrice, matCount, ownsGear, rangeWords, shopOnSale, skillUpState, startTrial, takeLesson, takeOffGear, tradeMats, trialRooms, trialState, wearGear, wornGear } from "../../shared/shop.js";
import { stampHow, storyState } from "../../shared/story.js";
import { ADDONS, planPortrait, P, PANELS, UI, btn, cicon, gearArt, h, icon, inspHave, limitPill, miniLayer, note, persist, rerender, showEvents, snd, updateStatus } from "./ui_core.js";
import { overlay } from "./ui_board.js";
import { visitorLabel } from "./ui_screens3.js";
import { itemArt, useNow } from "./ui_signin.js";
import { curWeek } from "./ui_story.js";
import { eventBoostText } from "../../shared/events.js";
import { eventTagNode, liveEvent } from "./ui_events.js";
import { openCoopTrial } from "./ui_coop.js";

const on = () => !!(P && !isFree(P));
const fill = (s, o) => Object.keys(o).reduce((t, k) => t.split("{" + k + "}").join(String(o[k])), s);
const costStamps = (verb, n) => `${verb}（花 ${n} 枚週章）`;
const sec = (title, ...kids) => h("section", { class: "sp-sec" }, h("h3", null, title), ...kids);
const stampsHave = need => { const have = storyState(P).stamps; return h("p", { class: "shp-have" + (need != null && have < need ? " short" : "") }, `你現在有 ${have} 枚週章`, need != null && have < need ? `，還差 ${need - have} 枚` : ""); };

// ---------- 買到東西：馬上穿上、馬上使用 ----------
function gotFlow(title, sub, row, after) {
  const m = miniLayer(title, sub);
  m.layer.classList.add("sp-top");
  const close = () => { m.close(); if (after) after(); };
  m.card.append(h("div", { class: "sp-gotlist" }, row(close)), btn("收著，關掉", close, "ghost"));
  m.layer.addEventListener("click", e => { if (e.target === m.layer) close(); });
  m.card.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  const f = m.card.querySelector(".btn"); if (f) f.focus();
}
function gearGot(id, redraw) {
  const it = gearInfo(id);
  gotFlow("換到了", "裝備放在博物館，換人還在。可以馬上穿上，也可以之後再來穿。", close => {
    const can = wornGear(P).length < NUM.shop.gearWorn;
    return h("div", { class: "sp-got" }, h("b", null, it.name), h("small", null, it.desc),
      can ? btn("馬上穿上", () => { const r = wearGear(P, id); if (!r.ok) { note(r.reason, "bad"); return; } snd("unlock"); note(`穿上了${it.name}。`, "good"); persist(); updateStatus(); close(); }, "primary small")
        : h("span", { class: "sp-keep" }, `已經穿了 ${NUM.shop.gearWorn} 件，要先脫下壹件`));
  }, redraw);
}
function limitedGot(id, r, redraw) {
  const it = limitedInfo(id);
  gotFlow("換到了", "限定的東西不算進「全部解鎖」，另外算限定收藏。", close => h("div", { class: "sp-got shp-lim-got" },
    h("span", { class: "shp-lim-art", html: itemArt(id), "aria-hidden": "true" }), h("b", null, it.name), h("small", null, it.desc),
    btn(["馬上使用 ", h("span", { "aria-hidden": "true" }, "→")], () => { close(); useNow(id); }, "primary small")), redraw);
  if (r.events && r.events.length) showEvents(r.events);
}

// ---------- 兌換所 ----------
const SHOP_TABS = [["gear", "裝備"], ["skill", "提升技能"], ["limited", "這週限定"], ["mat", "材料"]];
export function openShop(o = {}) {
  if (!P) return;
  if (isFree(P)) { note("兌換所在挑戰模式裡：自由模式什麼都打開了，也沒有裝備。"); return; }
  const m = overlay("nb-story nb-shop", SHOP_TEXT.title, SHOP_TEXT.title, "medal");
  let tab = SHOP_TABS.some(t => t[0] === o.tab) ? o.tab : "gear";
  const draw = () => {
    const S = storyState(P);
    const old = m.surface.querySelector(".sp-body"), keepY = old && old.dataset.tab === tab ? old.scrollTop : 0; // 買東西、穿脫之後重畫：停在原本的地方，不要跳回最上面
    m.setTop(h("span", { class: "sp-stamps", title: stampHow().join("\n") }, cicon("stamp"), ` 週章 ${S.stamps} 枚`));
    const tabs = h("div", { class: "nb-tabs", role: "tablist", "aria-label": SHOP_TEXT.title }, SHOP_TABS.map(([id, name]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), class: "nb-tab" + (id === tab ? " on" : ""), onClick: () => { tab = id; draw(); } }, name)));
    const body = tab === "gear" ? gearPane(draw) : tab === "skill" ? skillPane(draw) : tab === "limited" ? limitedPane(draw) : matPane(draw);
    // 週章怎麼拿（翊文 11-11）：手上沒有的時候自己打開
    const how = h("details", { class: "shp-how", open: S.stamps < 1 ? true : null }, h("summary", null, cicon("stamp"), " 週章怎麼拿"), h("ul", null, stampHow().map(t => h("li", null, t))));
    const box = h("div", { class: "sp-body", dataset: { tab } }, h("p", { class: "sp-note shp-why" }, SHOP_TEXT.why), how, body);
    m.surface.replaceChildren(tabs, box);
    box.scrollTop = keepY;
  };
  draw();
  snd("flip");
}
function gearCard(it, draw) {
  const own = ownsGear(P, it.id), worn = isWorn(P, it.id), S = storyState(P);
  const buy = () => {
    const r = buyGear(P, it.id, todayStr());
    if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
    snd("coin"); persist(); updateStatus(); draw();
    gearGot(it.id, draw);
  };
  const toggle = () => {
    const r = worn ? takeOffGear(P, it.id) : wearGear(P, it.id);
    if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
    snd("click"); persist(); updateStatus(); draw();
  };
  return h("li", { class: "shp-gear t-" + it.tier + (worn ? " worn" : "") + (own ? " own" : "") },
    gearArt(it.id),
    h("span", { class: "shp-body" }, h("b", null, it.name, worn ? h("small", { class: "shp-tag" }, "穿著") : null), h("small", null, it.desc)),
    h("span", { class: "shp-act" }, own
      ? btn(worn ? "脫下來" : "穿上", toggle, worn ? "small" : "primary small")
      : [btn(costStamps("換", it.price), buy, "primary small", { disabled: S.stamps < it.price }), S.stamps < it.price ? h("small", { class: "shp-short" }, `還差 ${it.price - S.stamps} 枚`) : null]));
}
function gearPane(draw) {
  const worn = wornGear(P).length;
  const groups = ["common", "fine", "rare"].map(t => {
    const list = GEAR_ITEMS.filter(x => x.tier === t).map(x => gearInfo(x.id));
    return sec(`${SHOP_TEXT.tiers[t]}・${NUM.shop.gearPrice[t]} 枚週章`, h("ul", { class: "shp-list" }, list.map(it => gearCard(it, draw))));
  });
  return [h("div", { class: "sp-sec shp-wearing" }, h("b", null, `${visitorLabel(P)} 穿了 ${worn}／${NUM.shop.gearWorn} 件`), h("p", { class: "sp-note" }, fill(SHOP_TEXT.gearWhy, { n: NUM.shop.gearWorn }))), ...groups];
}
function skillPane(draw) {
  if (!P.skills) return h("p", { class: "nb-empty" }, "這位參觀者還沒有技能：先選職業。");
  return sec(`幫 ${visitorLabel(P)} 提升技能`,
    h("p", { class: "sp-note" }, `花週章，指定壹個技能 +${rangeWords(NUM.shop.skillUp)}。${fill(SHOP_TEXT.skillWhy, { cap: NUM.story.skillCap })}`),
    stampsHave(),
    h("ul", { class: "shp-list" }, SKILLS.map(s => {
      const st = skillUpState(P, s);
      const up = () => {
        const r = buySkillUp(P, s);
        if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
        snd("unlock"); note(`${s} ${r.before} → ${r.after}（擲 ${r.roll.total}）`, "good"); persist(); updateStatus(); draw();
      };
      return h("li", { class: "shp-gear" }, h("span", { class: "shp-body" }, h("b", null, `${s} ${P.skills[s]}`), h("small", null, (SKILL_TEXT && SKILL_TEXT[s]) || "")),
        h("span", { class: "shp-act" }, st.full ? h("span", { class: "sp-keep" }, "到上限了") : [btn(costStamps("提升", st.price), up, "primary small", { disabled: !st.ok }), st.short ? h("small", { class: "shp-short" }, `還差 ${st.short} 枚`) : null]));
    })));
}
function limitedPane(draw) {
  const W = curWeek(), today = todayStr(), ids = shopOnSale(W, today);
  const named = !!(W && W.shop && W.shop.length);
  return sec(named ? `這週上架：配合〈${W.title}〉` : "這週上架", h("p", { class: "sp-note" }, SHOP_TEXT.limitedWhy), stampsHave(),
    h("ul", { class: "shp-limited" }, ids.map(id => {
      const it = limitedInfo(id), own = ownsLimited(P, id), price = limitedPrice(id), S = storyState(P);
      const buy = () => {
        const r = buyLimited(P, id, ids, today);
        if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
        snd("coin"); persist(); updateStatus(); draw();
        limitedGot(id, r, draw);
      };
      return h("li", { class: "shp-lim" + (own ? " own" : "") }, h("span", { class: "shp-lim-art", html: itemArt(id), "aria-hidden": "true" }),
        h("b", null, it.name), h("small", null, it.desc),
        own ? [h("span", { class: "sp-claimed" }, icon("check"), " 已經有了"), btn(["去手作坊戴上 ", h("span", { "aria-hidden": "true" }, "→")], () => useNow(id), "small")]
          : [btn(costStamps("換", price), buy, "primary small", { disabled: S.stamps < price }), S.stamps < price ? h("small", { class: "shp-short" }, `還差 ${price - S.stamps} 枚`) : null]);
    })));
}
function matPane(draw) {
  const n = matCount(P), need = NUM.shop.matToStamp;
  const trade = () => {
    const r = tradeMats(P);
    if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
    snd("coin"); note(`換到壹枚週章，現在有 ${r.stamps} 枚。`, "good"); persist(); draw();
  };
  return sec("材料換週章", h("p", { class: "sp-note" }, fill(SHOP_TEXT.matWhy, { n: need })),
    h("p", { class: "shp-have" }, `背包裡有 ${n} 份材料`),
    btn(`換壹枚週章（花 ${need} 份材料）`, trade, "primary small", { disabled: n < need }));
}

// ---------- 委託櫃台：上課 ----------
function lessonBox() {
  if (!on() || !P.skills) return null;
  const left = lessonLeft(P), price0 = SKILLS.map(s => lessonState(P, s)).filter(s => !s.full).map(s => s.price);
  const rows = SKILLS.map(s => {
    const st = lessonState(P, s);
    const take = () => {
      const r = takeLesson(P, s);
      if (!r.ok) { snd("error"); note(r.reason, "bad"); return; }
      snd("unlock"); note(`上完課了：${s} ${r.before} → ${r.after}（擲 ${r.roll.total}）`, "good"); persist(); updateStatus(); rerender();
    };
    return h("div", { class: "lesson-row" }, h("span", { class: "lesson-n" }, s, " ", h("b", null, String(P.skills[s]))),
      st.full ? h("span", { class: "lesson-full" }, "櫃台教到這裡") : btn(`上課（花 ${st.price} 靈感）`, take, "small", { disabled: !st.ok }));
  });
  return h("section", { class: "lesson-box", "aria-label": "委託櫃台的上課" },
    h("div", { class: "lesson-head" }, h("h2", null, "委託櫃台的課"), btn([icon("medal"), " 兌換所"], () => openShop(), "small ghost")),
    limitPill(left ? `今天還能上 ${left} 堂（壹天 ${NUM.shop.lessonPerDay} 堂）` : `今天的課上完了（壹天 ${NUM.shop.lessonPerDay} 堂），明天 05:00 再來`, left),
    h("p", { class: "lesson-why" }, fill(SHOP_TEXT.lessonWhy, { dice: rangeWords(NUM.shop.lessonSkill), n: NUM.shop.lessonPerDay, cap: NUM.shop.lessonCap })),
    h("div", { class: "lesson-rows" }, rows),
    inspHave(left && price0.length ? Math.min(...price0) : null));
}

// ---------- 地下收藏庫：試煉房間 ----------
function trialBox() {
  if (!on()) return null;
  const rooms = trialRooms();
  if (!rooms.length) return null;
  const team = (UI.cellarTeam || []).filter(Boolean);
  const boost = liveEvent("trialBoost");
  const card = r => {
    const st = trialState(P, r.id), open = st.state === "open";
    const go_ = () => {
      if (team.length < 3) { snd("error"); note("先在下面放滿 3 隻隊員，再進去。", "bad"); return; }
      const res = startTrial(P, r.id, UI.cellarTeam, undefined, liveEvent("trialBoost")); // 限時活動：走進去這一刻在活動內，這一間就照活動算（決定 0041，用網路時間 nowMs）
      if (!res.ok) { snd("error"); note(res.reason, "bad"); return; }
      snd("whoosh"); persist(); rerender(); window.scrollTo(0, 0);
    };
    return h("li", { class: "sc-room trial" + (open ? "" : " locked") + (st.state === "done" ? " found" : "") },
      h("span", { class: "sc-floor" }, `B${r.floor}`),
      h("span", { class: "sc-body" }, h("b", null, st.state === "locked" ? "？？？" : r.title), h("small", null, `${r.skill} +${rangeWords(NUM.shop.trialSkill)}${boost && open ? `（×${boost.mult}）` : ""}`, open ? "" : `・${st.reason}`)),
      open ? h("span", { class: "sc-btns" }, btn([icon("stairs"), " 帶隊伍進去"], go_, "primary small"), UI.net ? btn([icon("users"), " 邀館友壹起"], () => openCoopTrial(r.id), "small") : null) : h("span", { class: "sc-lock" }, icon(st.state === "done" ? "check" : "lock")));
  };
  // 收得起來：手機上、還沒有能挑戰的（新玩家）預設收著（下面還有樓層和隊伍，不要擠下去）；打開過就記著，重畫之後還是開的
  const openN = rooms.filter(r => trialState(P, r.id).state === "open").length;
  const box = h("details", { class: "story-cellar trial-box", "aria-label": "試煉房間", open: UI.trialOpen == null ? openN > 0 && !matchMedia("(max-width: 760px), (max-height: 500px)").matches : UI.trialOpen, onToggle: e => { UI.trialOpen = e.target.open; } },
    h("summary", { class: "sc-kicker trial-sum" }, icon("key"), " 試煉房間", h("small", null, openN ? `現在可以挑戰 ${openN} 間` : "現在沒有可以挑戰的")),
    boost ? h("p", { class: "ev-note" }, eventTagNode(boost), ` ${boost.title}：${eventBoostText(boost)}。`) : null,
    h("p", { class: "trial-why" }, fill(SHOP_TEXT.trialWhy, { dice: rangeWords(NUM.shop.trialSkill), n: NUM.shop.trialPerWeek })),
    h("ul", { class: "sc-rooms" }, rooms.map(card)));
  return box;
}

// ---------- 館長室的名片：穿了什麼 ----------
function sheetGear() {
  if (!on()) return null;
  const worn = wornGear(P).map(g => gearInfo(g.id));
  return h("div", { class: "sheet-gear placard" }, h("div", { class: "pl-title" }, `裝備 ${worn.length}／${NUM.shop.gearWorn}`),
    worn.length ? h("ul", { class: "sg-worn" }, worn.map(it => h("li", null, gearArt(it.id), h("span", null, h("b", null, it.name), h("small", null, it.desc)),
      btn("脫下來", () => { takeOffGear(P, it.id); snd("click"); persist(); updateStatus(); rerender(); }, "small ghost"))))
      : h("p", { class: "sub" }, "還沒有穿東西。用週章到兌換所換。"),
    btn([icon("medal"), " 到兌換所"], () => openShop(), "small"));
}

ADDONS.commission = lessonBox;
ADDONS.cellar = trialBox;
ADDONS.sheet = sheetGear;
PANELS.shop = openShop;

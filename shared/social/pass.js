// ================================================================
//  館友證和典藏冊（決定 0058；介面整合的第 2 步，docs/規劃/介面整合規劃.md）：把散在各個房間的收藏和紀錄算成壹份摘要。
//  只讀存檔，不存新的東西（「資料不寫第二份」）。畫面在 web/src/panels/ui_pass.js；測試在 test/game/pass.test.cjs。
//  賭場的籌碼、全部的紀念品、賭場成就在伺服器，這裡沒有：畫面自己接（籌碼）或連過去（紀念品、成就）。
// ================================================================

import { BADGES, CELLAR_FOES, GEAR_ITEMS, LIMITED_ITEMS, NUM, RECIPES, SKILLS, UPGRADES } from "../core/config.js";
import { BOOK_SEQUELS, RECIPE_TEXT, UNDERSTAND_TEXT, UPGRADE_TEXT } from "../core/systems_text.js";
import { BOOK4, CELLAR, ENDING_CELLAR, FOE_TEXT } from "../cellar/text.js";
import { ENDINGS, FORBIDDEN_BOOKS } from "../core/content.js";
import { CORE_TOTAL, FAILED, RARITY_ORDER, ROLLED, activeQuirks, codexCount, fromKey, hallItem, hallScore, isFree, maxSan, todayStr } from "../core/logic_base.js";
import { hallArt } from "./gifts.js";
import { SHOW_THEMES, SHOW_TIER_NAME, showPosters } from "../story/themeshow.js";
import { HALL_THEME_TEXT } from "../core/content.js";
import { describePillow, gameDayNo, quirkName } from "../core/logic.js";
import { jobInfo, jobSkill, skillOf } from "../core/legacy.js";
import { hallSize, roomProgress, upgradeState } from "../core/systems.js";
import { traitById } from "../core/logic_base.js";
import { traitDesc, traitName } from "../core/legacy.js";
import { gearInfo, matCount } from "../core/shop.js";
import { STORY_ITEMS } from "../story/state.js";
import { asList, gearItem, ownsGear, wornGear } from "../core/logic_base.js";
import { visitorSlots } from "./visitors.js";
import { limitedBox, limitedCount, limitedInfo, ownsLimited, stockOf, wornDeco } from "./signin.js";
import { storyState } from "../story/state.js";
import { UNDERSTAND_LAYERS } from "../story/clues.js";
import { casCleanSouvenirs, casCleanTitle } from "../casino/wallet.js";

// 收線那天讀懂的 id 是「u-」加謎的 id（tools/content/day_check.cjs 會擋）。讀懂這件之後館友證多壹格空白：沒有名字、按了沒反應，不算進件數。
export const PASS_BLANK_AFTER = "u-m-count";

// 典藏冊的頁籤（第壹頁是館友證本身）
export const PASS_TABS = [["card", "總覽"], ["pepe", "佩佩與書"], ["hall", "展廳"], ["casino", "賭場"], ["visitor", "參觀者"], ["deco", "裝飾"]]; // 11-21 重新設計：7 個收成 5 個（翊文選方向 A）；左邊的證件常駐
// 館友證各頁籤、各區塊的說明牌（滑鼠移過去、手機長按；字用「壹」）。title 標題、what 這是什麼、how 怎麼拿到
export const PASS_TIPS = {
  card: { title: "總覽", what: "每壹頁的進度壹眼看完，點壹塊就翻到那壹頁。", how: ["左邊是你的館友證：頭像、稱號、籌碼、週章", "手機上紀錄和帳號放在這壹頁"] },
  pepe: { title: "佩佩與書", what: "做過的佩佩、圖鑑的徽章、讀過的書和看懂的事。", how: ["在手作坊做佩佩，圖鑑就會收進來", "徽章在圖鑑室拿到", "書在圖書館讀"] },
  hall: { title: "展廳", what: "你掛在展台上的佩佩和抱枕、評分和主題、收藏的畫、海報、掛出的紀念品，還有來參觀的人。", how: ["在展廳把佩佩擺上展台", "同壹個主題的佩佩擺在壹起，評分會加分", "館友來參觀你的展廳，也看得到這些"] },
  art: { title: "收藏的畫", what: "你買到的畫，持有就替展廳加壹點分（有上限）。拍賣中的不算分。", how: ["在畫廊的拍賣和畫市買畫", "館友來參觀你的展廳，也看得到這些畫（看不到買價）"] },
  casino: { title: "賭場", what: "你在 Hamachi 賭場的成就、本週收藏、財產（紀念品）和換小獎。", how: ["打牌、吃東西、開大禮包都可能拿到", "每塊的「前往」會帶你到賭場對應的頁"] },
  visitor: { title: "參觀者", what: "現在這位參觀者的職業、技能、裝備和怪癖；上面的座位可以切到另外兩位，看他們的職業、心情、理智和裝備。", how: ["在館長室選職業、換人", "裝備用週章到兌換所換"] },
  deco: { title: "裝飾", what: "限定的收藏：每日簽到和兌換所才拿得到的裝飾。", how: ["每日簽到會有機會拿到", "拿到的可以「拿去用」"] },
  gear: { title: "隨身物", what: "兌換所換到的裝備，穿在身上才有效果。現在這位參觀者最多穿 2 件。", how: ["點壹下到參觀者頁，穿上或脫下", "裝備用週章到兌換所換，參觀者頁就能直接換"] },
  badge: { title: "徽章", what: "圖鑑室的徽章，做到壹件事就拿到壹個。", how: ["沒拿到的先顯示鎖頭", "到圖鑑室看每個怎麼拿"] },
  ach: { title: "成就", what: "在賭場做到某些事拿到的成就，可以挑壹個當稱號。", how: ["稱號展廳、館友名單、榜單上看得到"] },
  week: { title: "本週收藏", what: "這週賭場的收藏品和進度，集滿領週章、讀集滿的故事。", how: ["每週壹重算"] },
  props: { title: "財產（紀念品）", what: "餐車買到的、以前帶來的紀念品。", how: ["可以掛在自己的展廳，來參觀的館友看得到", "最多掛幾件有上限"] },
  swap: { title: "換小獎", what: "用籌碼換壹點點小東西（靈感、舊畫布、金箔）。", how: ["每樣每週有上限，週壹 05:00 重算"] },
};

// 玩了多久：「3 小時 20 分」「45 分」
export function passPlayText(sec) {
  const m = Math.floor((Number.isFinite(sec) && sec > 0 ? sec : 0) / 60), hr = Math.floor(m / 60);
  return hr ? `${hr} 小時 ${m % 60} 分` : `${m} 分`;
}

// 現在這位參觀者（翊文 11-10：「館長室跟館友證好像有重疊?」「也不是不行，把館友證補齊」）：館長室名片上有的，館友證也看得到。
// 自由模式、還沒選職業：null。只讀，不改存檔。
export function passVisitor(P) {
  if (!P || isFree(P) || !P.job) return null;
  const j = jobInfo(P.job), main = jobSkill(P.job), st = P.stats || {};
  const trait = (id, kind) => (traitById(id) ? { id, kind, name: traitName(id), desc: traitDesc(id) } : null);
  return {
    n: P.visitor || 1, name: typeof P.vname === "string" ? P.vname : "", job: P.job, jobName: j.name, desc: j.desc || "", motto: j.motto || "",
    traits: [trait(P.perk, "perk"), trait(P.flaw, "flaw")].filter(Boolean),
    stats: [["心情", `${P.mood}／99`], ["理智", `${P.sanity}／${maxSan(P)}`], ["佩佩神話", String(P.myth)], ["靈感", String(P.insp)], ["做過", `${st.made || 0} 隻`], ["融合", `${st.fused || 0} 次`]],
    // v 是已經含裝備加成的（skillOf 本來就算進去）；gear：穿著的裝備給這個技能加幾點（[{ name, v }]），畫面標「裝備 +5」
    skills: SKILLS.map(s => ({ s, v: skillOf(P, s), main: s === main, tick: !!(P.skillTicks && P.skillTicks[s]), gear: wornGear(P).filter(g => typeof g["skill:" + s] === "number" && g["skill:" + s]).map(g => ({ name: gearInfo(g.id).name, v: g["skill:" + s] })) })),
    quirks: activeQuirks(P).map(q => ({ name: quirkName(q), type: q.type })),
    gear: wornGear(P).map(g => gearInfo(g.id)).map(it => ({ id: it.id, name: it.name, desc: it.desc, tierName: it.tierName })),
    gearMax: NUM.shop.gearWorn,
  };
}

// 隨身物（11-22，docs/規劃/館友證裝備整合規劃.md 方向一）：兌換所的裝備放進館友證。
// items：全部裝備（有沒有、現在這位有沒有穿、價錢）；worn：現在這位穿著的 id（照穿的順序，封面兩格用）；
// seats：三個位子各穿什麼（只讀；要換只能現在在場的這位，規則本來就只改 P.gear）。自由模式沒有裝備，回 null。只讀，不改存檔。
export function passGear(P) {
  if (!P || isFree(P)) return null;
  const worn = wornGear(P).map(g => g.id), set = new Set(worn);
  const items = GEAR_ITEMS.map(it => { const g = gearInfo(it.id); return { id: g.id, name: g.name, desc: g.desc, tier: g.tier, tierName: g.tierName, price: g.price, own: ownsGear(P, g.id), worn: set.has(g.id) }; });
  const idsOf = v => asList(v && v.gear).filter((id, i, a) => gearItem(id) && ownsGear(P, id) && a.indexOf(id) === i).slice(0, NUM.shop.gearWorn);
  const seats = visitorSlots(P).map(s => (s ? { slot: s.slot, vid: s.vid, name: s.name, jobName: s.job ? jobInfo(s.job).name : "", current: s.current, picking: s.picking, gear: s.current ? worn : idsOf(asList(P.visitors).find(v => v && v.vid === s.vid)) } : null));
  return { max: NUM.shop.gearWorn, stamps: storyState(P).stamps || 0, worn, items, seats };
}

// 三個座位各自的職業、理智、心情（11-22 R6）：總覽寫「第幾位／共幾位」，參觀者頁切到別位時看這份。只讀。
// seats 長度＝座位數（空位是 null）；count＝在館的人數；cur＝現在在場的座位號（0 起算）。自由模式、還沒有座位回 null。
export function passSeats(P) {
  if (!P || isFree(P)) return null;
  const slots = visitorSlots(P), seats = slots.map(s => (s ? { slot: s.slot, n: s.visitor, name: s.name, current: s.current, picking: s.picking, jobName: s.job ? jobInfo(s.job).name : "", mood: s.mood, sanity: s.sanity, maxSan: s.maxSan, myth: s.myth, dark: s.dark, working: !!s.work, perk: s.perk ? traitName(s.perk) : "", flaw: s.flaw ? traitName(s.flaw) : "" } : null));
  const cur = seats.find(s => s && s.current);
  return cur ? { seats, count: seats.filter(Boolean).length, cur: cur.slot } : null;
}

// 工坊升級（11-22）：7 項各自的狀態（owned 已買／req 要先買上一級／buy 可以買，有 cost、ok＝靈感夠不夠）。自由模式沒有，回 null。只讀（要買去館長室）。
export function passUpgrades(P) {
  if (!P || isFree(P)) return null;
  const list = UPGRADES.map(u => { const t = UPGRADE_TEXT[u.id] || {}, st = upgradeState(P, u.id); return { id: u.id, name: t.name || u.id, desc: t.desc || "", state: st.state, cost: u.cost, ok: !!st.ok, date: st.state === "owned" ? ((P.upgrades && P.upgrades[u.id]) || "") : "", text: st.text || "" }; });
  return { list, have: list.filter(x => x.state === "owned").length, insp: P.insp || 0 };
}
// 遺物和歷任參觀者（11-22）：relics 是遺物櫃的快照（最新的在前）；history 是歷任牆的壹筆壹筆（最新的在前，只帶畫面要寫的欄位）。自由模式 null。
export function passLegacy(P) {
  if (!P || isFree(P)) return null;
  const relics = asList(P.relics).filter(r => r && typeof r.key === "string").map(r => ({ n: r.n, name: r.name || null, kind: r.kind, key: r.key, perfect: !!r.perfect, title: r.title || null, d: r.d || "" }));
  const history = asList(P.history).filter(Boolean).map(x => ({ n: x.n, name: x.name || null, job: x.job || null, jobName: x.job ? jobInfo(x.job).name : "", made: x.madeThis != null ? x.madeThis : null, deepest: x.deepest || 0, understood: x.understood || 0, endedBy: x.endedBy || null, d: x.d || "" }));
  return { relics, history };
}

// 收藏頁的列表（11-22）：失敗作、修復品（key＋份數）、抱枕（key、名字、份數）、隱藏配方（找到了給名字和日期，沒找到只給提示）。每種最多 limit 筆。
const countList = (o, limit) => Object.keys(o || {}).filter(k => fromKey(k)).sort().slice(0, limit).map(k => ({ key: k, n: Math.max(1, Math.floor(+o[k]) || 1) }));
const sumCount = o => Object.values(o || {}).reduce((a, x) => a + Math.max(1, Math.floor(+x) || 1), 0);
// 禁書（11-22）：本篇 3 本、地下收藏目錄、5 本補遺。read＝這位讀過（日期），allSeats＝三個位子裡有任何一位讀過的本數。禁書是每位參觀者各自讀（換人就清，logic.js），所以兩個數字都給。自由模式 null。
export function passForbidden(P) {
  if (!P || isFree(P)) return null;
  const all = [].concat(FORBIDDEN_BOOKS, [BOOK4], BOOK_SEQUELS), seats = [P].concat(asList(P.visitors));
  const readOf = (v, id) => (v && v.mythFrom && v.mythFrom[id]) || null;
  const list = all.map(b => { const r = readOf(P, b.id); return { id: b.id, title: r ? b.title : "？？？", after: b.after || null, read: r === true ? "讀過" : r }; }); // 沒讀過的不寫書名（不破梗：補遺的書名會透露劇情）
  return { list, have: list.filter(x => x.read).length, total: list.length, allSeats: all.filter(b => seats.some(v => readOf(v, b.id))).length, seats: seats.length };
}

// 看懂的事依 layer 分四組（11-22 L3）：每組 have／total 和每件（看懂了才給名字和在哪裡看懂的，沒看懂的是「？？？」，不破梗）。
// 只算固定的 UNDERSTAND_TEXT；每週的 u- 另外一份清單，不混進來（passView.books.understood 也一樣只算這份）。
export function passUnderstood(P) {
  const got = id => !!(P && P.understood && P.understood[id]);
  return UNDERSTAND_LAYERS.map(layer => { const xs = UNDERSTAND_TEXT.filter(x => x.layer === layer), list = xs.map(x => ({ id: x.id, got: got(x.id), name: got(x.id) ? x.from : "？？？", where: got(x.id) ? x.where || "" : "" })); return { layer, have: list.filter(x => x.got).length, total: list.length, list }; });
}
// 館友證的頭像（11-13）：玩家自己挑壹隻收藏過的佩佩。存檔 P.avatar 是那隻的 key。
// 選的那隻不在收藏裡（舊存檔、或之後被拿掉）就當成沒有頭像，回空字串；不會去改存檔。
// 展廳（翊文 11-22：「展廳」加進館友證，變 6 頁）：展台上的、評分和主題、收藏的畫、海報、掛出的報告、來參觀的人。只讀，不改存檔。
// 別人看到的是 cleanHallView 的子集（pub 欄位）；這裡是自己的完整版（多了排列的空位、展台升級、參觀紀錄）
export function passHall(P) {
  if (!P || isFree(P)) return null;
  let hs = { score: 0, theme: null, themes: [], artBonus: 0 };
  try { hs = hallScore(P); } catch (e) { /* 壞掉的存檔：分數當 0 */ }
  const pepes = P.pepes || {};
  const slots = (Array.isArray(P.hall) ? P.hall : []).slice(0, 12).map(sl => {
    let it = null;
    try { it = hallItem(P, sl); } catch (e) { it = null; }
    return it ? { kind: it.kind, key: it.key, perfect: !!it.perfect, title: it.kind === "pepe" && pepes[it.key] && typeof pepes[it.key].title === "string" ? pepes[it.key].title : "" } : null;
  });
  const themeName = id => (HALL_THEME_TEXT[id] || {}).name || id;
  const seen = P.themesSeen && typeof P.themesSeen === "object" ? P.themesSeen : {};
  const log = Array.isArray(P.visitorLog) ? P.visitorLog.slice(0, 5).map(x => ({ who: String((x && x.who) || "").slice(0, 20), text: String((x && x.text) || "").slice(0, 60), gain: Math.max(0, Math.floor(+(x && x.gain)) || 0) })) : [];
  const logInsp = Array.isArray(P.visitorLog) ? P.visitorLog.reduce((a, x) => a + Math.max(0, Math.floor(+(x && x.gain)) || 0), 0) : 0;
  const report = P.hallReport && Array.isArray(P.coopReports) ? P.coopReports.find(r => r && r.id === P.hallReport) || null : null;
  return {
    size: hallSize(P), slots, have: slots.filter(Boolean).length,
    ups: [["ped7", !!(P.upgrades && P.upgrades.ped7)], ["ped8", !!(P.upgrades && P.upgrades.ped8)]],
    score: hs.score || 0, artBonus: hs.artBonus || 0, theme: hs.theme || null, themeName: hs.theme ? themeName(hs.theme) : "", themes: (hs.themes || []).map(id => ({ id, name: themeName(id) })),
    themesSeen: Object.keys(seen).filter(id => HALL_THEME_TEXT[id]).length, themesTotal: Object.keys(HALL_THEME_TEXT).length,
    art: hallArt(P),
    posters: showPosters(P).map(x => ({ theme: x.theme, name: themeName(x.theme), tier: x.tier, tierName: SHOW_TIER_NAME[x.tier] || "", score: x.score, date: x.date })), postersTotal: SHOW_THEMES.length,
    report, visitors: Math.max(0, Math.floor(+P.hallVisitors) || 0), log, logInsp,
  };
}
// 地下收藏庫的紀錄（翊文 11-22：連怪物圖鑑和 B5 結局都放進館友證）：每層通關日、怪物圖鑑、結局。只讀。
// 沒打贏過的怪不寫名字（不破梗）；沒看過的結局也不寫名字
export function passCellar(P) {
  if (!P || isFree(P)) return null;
  const C = P.cellar || {}, done = C.floorsDone || {}, foes = C.foes && typeof C.foes === "object" && !Array.isArray(C.foes) ? C.foes : {}, end = P.endings || {};
  const endName = id => (id === "cellar" ? ENDING_CELLAR.title : (ENDINGS[id] || {}).title) || id;
  const foeList = CELLAR_FOES.map(f => ({ id: f.id, floor: f.floor, boss: !!f.boss, d: typeof foes[f.id] === "string" ? foes[f.id] : null }));
  foeList.forEach(f => { f.name = f.d ? (FOE_TEXT[f.id] || {}).name || "說不出名字的東西" : "？？？"; });
  return {
    best: C.best || 0, floors: CELLAR.length,
    floorList: CELLAR.map(f => ({ n: f.floor, d: typeof done[f.floor] === "string" ? done[f.floor] : done[f.floor] ? "走過" : null })),
    foes: foeList, foesGot: foeList.filter(f => f.d).length,
    endings: ["curator", "museum", "cellar"].map(id => ({ id, d: typeof end[id] === "string" ? end[id] : end[id] ? "有" : null, name: end[id] ? endName(id) : "？？？" })),
  };
}
// 簽到的摘要（o.signins 簽到幾天、o.streak = signStreak(存檔, 今天) 的結果，畫面給）。沒給就是 null
export function passSign(o) {
  if (!o || !Number.isInteger(o.signins) || !o.streak) return null;
  return { count: o.signins, cur: o.streak.cur || 0, best: o.streak.best || 0, makeups: o.streak.makeups || 0 };
}
// 換週章的材料（翊文 11-22：「換週章的材料也要，然後可以在那裡連結的兌換所」）：背包裡的舊畫布、金箔、金線，份數照兌換所的算法（金箔算 2 份）。自由模式 null。只讀。
export function passMats(P) {
  if (!P || isFree(P)) return null;
  const bag = storyState(P).bag, need = NUM.shop.matToStamp;
  const list = Object.keys(STORY_ITEMS).filter(id => STORY_ITEMS[id].kind === "material").map(id => ({ id, name: STORY_ITEMS[id].name, n: Math.max(0, Math.floor(+bag[id]) || 0), worth: STORY_ITEMS[id].worth || 1 }));
  const total = matCount(P);
  return { list, total, need, stamps: Math.floor(total / need) };
}
export function passAvatar(P) {
  const k = P && typeof P.avatar === "string" ? P.avatar : "";
  return k && P.pepes && P.pepes[k] && fromKey(k) ? k : "";
}
// 設頭像：key 是空字串＝不用頭像。不在收藏裡的不收，回 false。
export function setPassAvatar(P, key) {
  if (key === "" || key === null || key === undefined) { P.avatar = ""; return true; }
  if (typeof key !== "string" || !P.pepes || !P.pepes[key] || !fromKey(key)) return false;
  P.avatar = key; return true;
}
// 挑頭像的清單：全部收藏，最近收進來的排前面
export function avatarChoices(P) {
  return Object.keys(P.pepes || {}).filter(k => fromKey(k)).sort((x, y) => { const fx = (P.pepes[x] && P.pepes[x].first) || "", fy = (P.pepes[y] && P.pepes[y].first) || ""; return fx < fy ? 1 : fx > fy ? -1 : 0; });
}
// 館友證上要畫的那隻：有挑頭像用頭像，沒有就用最近收進來的
export function passPhoto(P) { return passAvatar(P) || avatarChoices(P)[0] || ""; }

// o：{ today, signins（簽到幾天，存檔層級的，畫面給） }
export function passView(P, o = {}) {
  const today = typeof o.today === "string" ? o.today : todayStr();
  const free = isFree(P), rp = roomProgress(P), st = P.stats || {};
  const S = free ? null : storyState(P);
  // 佩佩：每種稀有度有幾種
  const byR = {};
  const keys = Object.keys(P.pepes || {});
  keys.forEach(k => { const p = fromKey(k); if (p) byR[p[ROLLED]] = (byR[p[ROLLED]] || 0) + 1; });
  const recent = keys.map(k => ({ key: k, first: (P.pepes[k] && P.pepes[k].first) || "" })).filter(x => fromKey(x.key))
    .sort((a, b) => (a.first < b.first ? 1 : a.first > b.first ? -1 : 0)).slice(0, 6).map(x => x.key);
  const best = (P.cellar && P.cellar.best) || 0;
  const records = [
    ["做過的佩佩", `${st.made || 0} 隻`],
    ["傳說級", `${st.legends || 0} 隻`],
    ["完美的", `${st.perfects || 0} 隻`],
    ["融合", `${st.fused || 0} 次`],
    ["交出的委託", `${P.done || 0} 件`],
    ["地下收藏庫", best ? `走到 B${best}` : "還沒下去"],
  ];
  if (Number.isInteger(o.signins)) records.push(["簽到", `${o.signins} 天`]);
  if (o.streak && Number.isInteger(o.streak.cur)) records.push(["連續簽到", `${o.streak.cur} 天（最長 ${o.streak.best} 天）`]); // signStreak(SAVE, 今天) 的結果，畫面給
  records.push(["在館裡的時間", passPlayText(P.activeSec)]);
  const lim = limitedCount(P);
  return {
    free,
    card: { created: typeof P.created === "string" ? P.created : today, dayNo: gameDayNo(P, today), stamps: S ? S.stamps || 0 : null, title: casCleanTitle(P.casinoTitle), frame: isFree(P) ? null : wornDeco(P, "frame") || null, avatar: passAvatar(P) || null, photo: passPhoto(P) || null },
    records,
    visitor: passVisitor(P),
    gear: passGear(P),
    visitors: passSeats(P),
    upgrades: passUpgrades(P),
    relics: passLegacy(P),
    hall: passHall(P),
    mats: passMats(P),
    cellar: passCellar(P),
    sign: passSign(o),
    pepe: {
      have: codexCount(P), total: CORE_TOTAL, kinds: keys.length, recent,
      byRarity: RARITY_ORDER.filter(r => r !== FAILED).map(r => ({ r, n: byR[r] || 0 })),
      failed: Object.keys(P.failed || {}).length, repaired: Object.keys(P.repaired || {}).length,
      failedList: countList(P.failed, 12), failedTotal: sumCount(P.failed), repairedList: countList(P.repaired, 12), repairedTotal: sumCount(P.repaired),
      recipes: [RECIPES.filter(r => P.recipes && P.recipes[r.id]).length, RECIPES.length],
      recipeList: RECIPES.map(r => { const t = RECIPE_TEXT[r.id] || {}, d = P.recipes && P.recipes[r.id]; return { id: r.id, found: !!d, date: typeof d === "string" ? d : "", name: d ? t.name || r.id : "？？？", hint: d ? t.found || "" : t.hint || "" }; }),
      pillow: rp.pillow, hall: rp.hall,
      pillowList: Object.keys(P.pillows || {}).sort().slice(0, 8).map(k => ({ key: k, title: describePillow(k).title, n: Math.max(1, Math.floor(+P.pillows[k]) || 1) })), pillowTotal: sumCount(P.pillows),
    },
    books: {
      origin: rp.origin,
      week: S ? Object.values(S.books).filter(b => b && b.read).length : null,
      forbidden: passForbidden(P),
      understood: [UNDERSTAND_TEXT.filter(x => P.understood && P.understood[x.id]).length, UNDERSTAND_TEXT.length],
      understoodLayers: passUnderstood(P),
      blank: !!(P.understood && P.understood[PASS_BLANK_AFTER]), // 讀懂 m-count 之後，《看懂的事》「你」那排最後多壹格空的（W48 d7 的代價，翊文 11-23）
    },
    souvenirs: free ? [] : casCleanSouvenirs(P.hallSouvenirs),
    deco: {
      have: lim.have, total: lim.total,
      items: LIMITED_ITEMS.map(it => { const x = limitedInfo(it.id), own = it.kind === "mat" ? free || !!limitedBox(P).got[it.id] : ownsLimited(P, it.id); return { id: it.id, name: x.name, kindName: x.kindName, own, desc: own ? x.desc : "", origin: own ? x.origin : "", worn: it.kind === "deco" && wornDeco(P, it.slot) === it.id, kind: it.kind, n: it.kind === "mat" && !free ? stockOf(P, it.opt) : null }; }), // n：材料剩幾份（不是材料、自由模式是 null）
    },
    ach: { have: BADGES.filter(b => P.badges && P.badges[b.id]).length, total: BADGES.length, list: BADGES.map(b => ({ id: b.id, name: b.name, got: (P.badges && P.badges[b.id]) || null })) },
  };
}

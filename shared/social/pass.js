// ================================================================
//  館友證和典藏冊（決定 0058；介面整合的第 2 步，docs/規劃/介面整合規劃.md）：把散在各個房間的收藏和紀錄算成壹份摘要。
//  只讀存檔，不存新的東西（「資料不寫第二份」）。畫面在 web/src/panels/ui_pass.js；測試在 test/game/pass.test.cjs。
//  賭場的籌碼、全部的紀念品、賭場成就在伺服器，這裡沒有：畫面自己接（籌碼）或連過去（紀念品、成就）。
// ================================================================

import { BADGES, GEAR_ITEMS, LIMITED_ITEMS, NUM, RECIPES, SKILLS } from "../core/config.js";
import { UNDERSTAND_TEXT } from "../core/systems_text.js";
import { CORE_TOTAL, FAILED, RARITY_ORDER, ROLLED, activeQuirks, codexCount, fromKey, isFree, maxSan, todayStr } from "../core/logic_base.js";
import { gameDayNo, quirkName } from "../core/logic.js";
import { jobInfo, jobSkill, skillOf } from "../core/legacy.js";
import { roomProgress } from "../core/systems.js";
import { traitById } from "../core/logic_base.js";
import { traitDesc, traitName } from "../core/legacy.js";
import { gearInfo } from "../core/shop.js";
import { asList, gearItem, ownsGear, wornGear } from "../core/logic_base.js";
import { visitorSlots } from "./visitors.js";
import { limitedBox, limitedCount, limitedInfo, ownsLimited, wornDeco } from "./signin.js";
import { storyState } from "../story/state.js";
import { casCleanSouvenirs, casCleanTitle } from "../casino/wallet.js";

// 典藏冊的頁籤（第壹頁是館友證本身）
export const PASS_TABS = [["card", "總覽"], ["pepe", "佩佩與書"], ["casino", "賭場"], ["visitor", "參觀者"], ["deco", "裝飾"]]; // 11-21 重新設計：7 個收成 5 個（翊文選方向 A）；左邊的證件常駐
// 館友證各頁籤、各區塊的說明牌（滑鼠移過去、手機長按；字用「壹」）。title 標題、what 這是什麼、how 怎麼拿到
export const PASS_TIPS = {
  card: { title: "總覽", what: "每壹頁的進度壹眼看完，點壹塊就翻到那壹頁。", how: ["左邊是你的館友證：頭像、稱號、籌碼、週章", "手機上紀錄和帳號放在這壹頁"] },
  pepe: { title: "佩佩與書", what: "做過的佩佩、圖鑑的徽章、讀過的書和看懂的事。", how: ["在手作坊做佩佩，圖鑑就會收進來", "徽章在圖鑑室拿到", "書在圖書館讀"] },
  casino: { title: "賭場", what: "你在 Hamachi 賭場的成就、本週收藏、財產（紀念品）和換小獎。", how: ["打牌、吃東西、開大禮包都可能拿到", "每塊的「前往」會帶你到賭場對應的頁"] },
  visitor: { title: "參觀者", what: "現在這位參觀者的職業、技能、裝備和怪癖。", how: ["在館長室選職業、換人", "裝備用週章到兌換所換"] },
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
    skills: SKILLS.map(s => ({ s, v: skillOf(P, s), main: s === main, tick: !!(P.skillTicks && P.skillTicks[s]) })),
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

// 館友證的頭像（11-13）：玩家自己挑壹隻收藏過的佩佩。存檔 P.avatar 是那隻的 key。
// 選的那隻不在收藏裡（舊存檔、或之後被拿掉）就當成沒有頭像，回空字串；不會去改存檔。
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
  records.push(["在館裡的時間", passPlayText(P.activeSec)]);
  const lim = limitedCount(P);
  return {
    free,
    card: { created: typeof P.created === "string" ? P.created : today, dayNo: gameDayNo(P, today), stamps: S ? S.stamps || 0 : null, title: casCleanTitle(P.casinoTitle), avatar: passAvatar(P) || null, photo: passPhoto(P) || null },
    records,
    visitor: passVisitor(P),
    gear: passGear(P),
    pepe: {
      have: codexCount(P), total: CORE_TOTAL, kinds: keys.length, recent,
      byRarity: RARITY_ORDER.filter(r => r !== FAILED).map(r => ({ r, n: byR[r] || 0 })),
      failed: Object.keys(P.failed || {}).length, repaired: Object.keys(P.repaired || {}).length,
      recipes: [RECIPES.filter(r => P.recipes && P.recipes[r.id]).length, RECIPES.length],
      pillow: rp.pillow, hall: rp.hall,
    },
    books: {
      origin: rp.origin,
      week: S ? Object.values(S.books).filter(b => b && b.read).length : null,
      understood: [UNDERSTAND_TEXT.filter(x => P.understood && P.understood[x.id]).length, UNDERSTAND_TEXT.length],
    },
    souvenirs: free ? [] : casCleanSouvenirs(P.hallSouvenirs),
    deco: {
      have: lim.have, total: lim.total,
      items: LIMITED_ITEMS.map(it => { const x = limitedInfo(it.id); return { id: it.id, name: x.name, kindName: x.kindName, own: it.kind === "mat" ? free || !!limitedBox(P).got[it.id] : ownsLimited(P, it.id), worn: it.kind === "deco" && wornDeco(P, it.slot) === it.id, kind: it.kind }; }),
    },
    ach: { have: BADGES.filter(b => P.badges && P.badges[b.id]).length, total: BADGES.length, list: BADGES.map(b => ({ id: b.id, name: b.name, got: (P.badges && P.badges[b.id]) || null })) },
  };
}

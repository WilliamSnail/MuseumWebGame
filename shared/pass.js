// ================================================================
//  館友證和典藏冊（決定 0058；介面整合的第 2 步，docs/介面整合規劃.md）：把散在各個房間的收藏和紀錄算成壹份摘要。
//  只讀存檔，不存新的東西（「資料不寫第二份」）。畫面在 web/src/ui_pass.js；測試在 test/pass.test.cjs。
//  賭場的籌碼、全部的紀念品、賭場成就在伺服器，這裡沒有：畫面自己接（籌碼）或連過去（紀念品、成就）。
// ================================================================

import { BADGES, LIMITED_ITEMS, NUM, RECIPES, SKILLS } from "./config.js";
import { UNDERSTAND_TEXT } from "./content3.js";
import { CORE_TOTAL, FAILED, RARITY_ORDER, ROLLED, activeQuirks, codexCount, fromKey, gameDayNo, isFree, maxSan, quirkName, todayStr } from "./logic.js";
import { jobInfo, jobSkill, roomProgress, skillOf } from "./logic3.js";
import { traitById, traitDesc, traitName } from "./legacy.js";
import { gearInfo, wornGear } from "./shop.js";
import { limitedBox, limitedCount, limitedInfo, ownsLimited, wornDeco } from "./signin.js";
import { storyState } from "./story.js";
import { casCleanSouvenirs, casCleanTitle } from "./casino_wallet.js";

// 典藏冊的頁籤（第壹頁是館友證本身）
export const PASS_TABS = [["card", "館友證"], ["visitor", "參觀者"], ["pepe", "佩佩"], ["books", "書和看懂的事"], ["souvenir", "紀念品"], ["deco", "裝飾"], ["ach", "成就"]];

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

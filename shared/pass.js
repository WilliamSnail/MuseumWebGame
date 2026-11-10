// ================================================================
//  館友證和典藏冊（決定 0058；介面整合的第 2 步，docs/介面整合規劃.md）：把散在各個房間的收藏和紀錄算成壹份摘要。
//  只讀存檔，不存新的東西（「資料不寫第二份」）。畫面在 web/src/ui_pass.js；測試在 test/pass.test.cjs。
//  賭場的籌碼、全部的紀念品、賭場成就在伺服器，這裡沒有：畫面自己接（籌碼）或連過去（紀念品、成就）。
// ================================================================

import { BADGES, LIMITED_ITEMS, RECIPES } from "./config.js";
import { UNDERSTAND_TEXT } from "./content3.js";
import { CORE_TOTAL, FAILED, RARITY_ORDER, ROLLED, codexCount, fromKey, gameDayNo, isFree, todayStr } from "./logic.js";
import { roomProgress } from "./logic3.js";
import { limitedBox, limitedCount, limitedInfo, ownsLimited, wornDeco } from "./signin.js";
import { storyState } from "./story.js";
import { casCleanSouvenirs, casCleanTitle } from "./casino_wallet.js";

// 典藏冊的頁籤（第壹頁是館友證本身）
export const PASS_TABS = [["card", "館友證"], ["pepe", "佩佩"], ["books", "書和看懂的事"], ["souvenir", "紀念品"], ["deco", "裝飾"], ["ach", "成就"]];

// 玩了多久：「3 小時 20 分」「45 分」
export function passPlayText(sec) {
  const m = Math.floor((Number.isFinite(sec) && sec > 0 ? sec : 0) / 60), hr = Math.floor(m / 60);
  return hr ? `${hr} 小時 ${m % 60} 分` : `${m} 分`;
}

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
    card: { created: typeof P.created === "string" ? P.created : today, dayNo: gameDayNo(P, today), stamps: S ? S.stamps || 0 : null, title: casCleanTitle(P.casinoTitle) },
    records,
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

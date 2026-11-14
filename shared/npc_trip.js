// ================================================================
//  館內 NPC 的行程（11-14，docs/館內NPC規劃.md 步驟 3；翊文：「不一定每天都要去五家店，有些隨機性」）
//  純函式。每位 NPC（旅客、委託人；劇情角色 trace 一律跳過）每天各抽一次「今天去哪幾家店」，也可能哪裡都不去、整天沒來館。
//  route 的權重（0～routeMax）當成「去這家店的相對機率」：權重 10 ≈ 很常去、權重 2 ≈ 偶爾。
//  每家店當天的 NPC 平均人數壓在 NUM.casino.stockIn.npcLambda（2.8k 的 λ ＝ 2，安全性的前提）：
//    p(NPC i 去店 s) ＝ min(1, w(i,s) ÷ routeMax × scale(s))，scale(s) ＝ λ ÷ Σ w(i,s)÷routeMax（名單變了、故事線改了權重，平均還是 λ）。
//  種子含伺服器祕密（玩家算不出誰哪天去哪），同樣的輸入同樣的輸出。
// ================================================================
import { NUM } from "./config.js";
import { hashStr, mulberry32 } from "./logic.js";
import { npcCurrent } from "./npc.js";

const NT_STORES = ["food", "bj", "job", "cellar", "craft"], NT_PLACES = NT_STORES.concat(["hall"]); // 展廳排在最後（抽的順序固定，加進來不改前面五家店的結果）
// day：遊戲日；secret：伺服器祕密；list：NPC 名單（server 給 NPC_LIST）；counters：全館進度（解鎖故事線的新 route 用）
// 回傳 { visits: { npcId: [店…] }, counts: { 店: 人數 } }
export function npcTrips(day, secret, list, counters) {
  const C = NUM.casino.stockIn, M = NUM.npc.routeMax || 10, cur = npcCurrent(day, counters, list);
  const wsum = {};
  for (const s of NT_PLACES) wsum[s] = cur.reduce((a, n) => a + Math.max(0, Math.min(M, +(n.route || {})[s] || 0)) / M, 0);
  const visits = {}, counts = {};
  for (const s of NT_PLACES) counts[s] = 0;
  for (const n of cur) {
    const rnd = mulberry32(hashStr(`${secret}|${day}|${n.id}|trip`)), mine = [];
    for (const s of NT_PLACES) {
      const lam = s === "hall" ? (NUM.casino.npcSpend && NUM.casino.npcSpend.hallLambda) || 0 : C.npcLambda;
      const w = Math.max(0, Math.min(M, +(n.route || {})[s] || 0)) / M, p = wsum[s] > 0 ? Math.min(1, w * lam / wsum[s]) : 0, r = rnd(); // 每家店都抽一次（不管有沒有權重），亂數順序固定
      if (w > 0 && r < p) { mine.push(s); counts[s]++; }
    }
    if (mine.length) visits[n.id] = mine;
  }
  return { visits, counts };
}

// ================================================================
//  世界模擬的底層公式：理智、預算倍率、不安的算法（stat_view.js 要用，world.js 也要用，所以放在這裡）。
//  搬自原本的 world.js。
// ================================================================
import { NUM } from "../core/config.js";

export const wdN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);

// ================================================================
//  W3 分帳（決定 0086）：已知世界的錢（house.world）分成「頂層單位、家計、公共」。這只是帳上的分類，**不搬錢**：
//    house.wu ＝ { r: { id: 比例 }, adj: { id: 調整 } }。單位 i 現在有 floor(house.world × r_i) ＋ adj_i；公共＝house.world 減掉所有單位和家計（剩下的），所以總和永遠等於 house.world，不會對不上。
//    池子進出（館的各種來源）照比例攤（world × r 自己就會跟著變）；只有「指名的」會動 adj：每天成長按權重分（wuGrow）、新玩家的起始補助從文化部出（wuDebit）。
//    W4 起，NPC 來館花的錢從所屬集團出，會用 wuDebit。
//    公共（pub）是剩下的，所以指名的單位不夠出時由公共補；公共的比例（現在 16%）是緩衝。
// ================================================================
export const wuBox = v => !!v && typeof v === "object" && !Array.isArray(v);

// ================================================================
//  W5 連動（決定 0086，規劃 docs/規劃/世界經濟規劃.md 第 4 節）：每個頂層單位每天算一個健康值 h，每週一換狀態（一般／減薪／緊縮／裁員），
//  狀態決定 NPC 來館花錢的預算倍率（只動預算，不動 NPC 在不在場；全館不會一夜變空）。house.wh ＝ { day, base, idx, h, st, ev }。
//    h ＝ clamp(1 ＋ 景氣 b × 行業係數 ＋ 旗下館外股票這一週的漲跌 × stockW, min, max)；文化部固定 1.0、家計沒有 h（倍率 1）。
//    狀態（每週一看一次）：h ≥ cut → 一般（倍率 1～upMax）；squeeze ≤ h ＜ cut → 減薪 ×0.8；h ＜ squeeze → 連續 squeezeWeeks 週緊縮 ×0.5，連續 layoffWeeks 週裁員 ×0.3；下限 floor。
//    股價用「昨天以前」的價（house.stk.px 在換日算好之後的現價，不是盤中），每天最多留 8 天，週漲跌 ＝ 現在對 7 天前，夾在 ±chgCap（換股數比例時不會讓 h 暴衝）。
// ================================================================
export const whCfg = () => NUM.casino.worldDoc.health;
export const whClamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 集團的集體不安（沒有紀錄 ＝ 平常的值）；排程填的劇情事件用 whUnrestAdd 推（劇情決定的欄位，之後接）
export const whUnrest = (house, id) => { const v = house && house.wh && house.wh.unrest ? house.wh.unrest[id] : undefined; return v == null ? NUM.casino.worldDoc.unrest.start : whClamp(wdN(v), 0, 100); };
// NPC 預算倍率：一般 1～upMax（h 高時多一點）、減薪、緊縮、裁員；文化部、家計、沒有的單位 ＝ 1；最低 floor
export function whMult(house, unitId) {
  const w = house && wuBox(house.wh) ? house.wh : null, C = whCfg();
  if (!w || !wuBox(w.st) || !wuBox(w.st[unitId])) return 1;
  const s = w.st[unitId].s, h = +w.h[unitId] || 1;
  const m = s === "normal" ? whClamp(h, 1, C.upMax) : (C.mult[s] || 1);
  return Math.max(C.floor, m);
}

// ================================================================
//  NPC 理智（決定 0090 第一步，docs/規劃/理智值提案.md 第 1 節）：house.npcw.san[NPC id] ＝ 0～100，沒有紀錄 ＝ 初始值（NUM.casino.worldDoc.san.start）。累積型：
//    每天收盤時（casNpcLive 的整天結算）照那天的行程加減：去地下 −2（一天最多 −4）、去餐車 +1、完全沒來館 +3（休息；這兩項只補到初始值為止）、自然往初始值靠 1；被裁 −8、找到新工作 +5（W6 的 ev，那天發生的）；
//    排程填的 sanEvents（劇情決定的欄位，之後接）。一天最多變 ±daily（排程和換工作的事件不算）。夾 0～100。
//  理智低的影響（只放小的）：< lowRoute 不去地下（那一站不花錢）；< lowStars 展廳評價少 1 顆星；< lowBudget 預算 ×budgetMult（再乘 W5 的倍率，總倍率仍 ≥ health.floor）。
//  玩家看得到數字和分級（statView 的 npcSan，翊文 11-15 第 3 題）。
// ================================================================
export const nwSan = (house, id) => { const v = house && house.npcw && wuBox(house.npcw.san) ? house.npcw.san[id] : undefined; return v == null ? NUM.casino.worldDoc.san.start : whClamp(wdN(v), 0, 100); };

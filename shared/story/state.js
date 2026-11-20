// ================================================================
//  劇情存檔的基本讀寫和道具表：story.js 和 shop.js 都要用，所以放在這裡（不 import 它們）。
//  搬自原本的 story.js。
// ================================================================
import { NUM } from "../core/config.js";
import { parseDice } from "../core/logic_base.js";

// ---------- 固定的種類（排程只能從這裡挑；要新的種類得寫程式、走一般的 PR） ----------
// 獎勵的東西。skillBook：用了技能加 NUM.story.skillBook；heal：受傷的佩佩全部好；material：收著，在兌換所換週章（shared/core/shop.js 的 tradeMats）
export const STORY_ITEMS = {
  "book:偵查": { name: "技能書《放大鏡的用法》", kind: "skillBook", skill: "偵查" },
  "book:鑑賞": { name: "技能書《看畫的方法》", kind: "skillBook", skill: "鑑賞" },
  "book:神秘學": { name: "技能書《不要念出聲》", kind: "skillBook", skill: "神秘學" },
  "book:幸運": { name: "技能書《擲骰子的姿勢》", kind: "skillBook", skill: "幸運" },
  "book:手工藝": { name: "技能書《縫線入門》", kind: "skillBook", skill: "手工藝" },
  "book:說服": { name: "技能書《怎麼說好話》", kind: "skillBook", skill: "說服" },
  firstAid: { name: "急救箱", kind: "heal" },
  "mat:畫布": { name: "舊畫布", kind: "material" },
  "mat:金箔": { name: "金箔", kind: "material", worth: 2 }, // 換週章算 2 份（翊文 11-09：「幫我改金箔」，它比舊畫布貴很多）
  "mat:金線": { name: "金線", kind: "material" },
};

// ---------- 存檔 ----------
// P.story = { v, books: { id: { got, read } }, tasks: { id: { base, done, claimed } }, works: { id: 日期 }, spots: { 房間 id: 日期 },
//             weeks: { 週: { fb, first, bonus: { 第幾天: 日期 }, weekBonus } }, deep: { 日期: 走到第幾層 }, showInsp: { 日期: 拿了幾靈感 },
//             bag: { 東西 id: 幾個 }, stamps: 週章, track: 追蹤哪一條劇情線, seen: { 劇情線 id: 看過的下一步 }, log: [],
//             said: { 任務 id: 日期 } Yuga Bot 交代的任務，做完後荷官說過 done 了（ui_casino.js；舊存檔沒有，storyState 補）,
//             cas: { 週: 日期 } 賭場每週收藏集滿、領過週章的週（伺服器寫，決定 0042；書架才讀得到那週集滿的小故事） }
export const isPlain = v => !!v && typeof v === "object" && !Array.isArray(v);
export function storyState(P) {
  if (!isPlain(P.story)) P.story = {};
  const S = P.story;
  S.v = 1;
  ["books", "tasks", "works", "spots", "weeks", "deep", "showInsp", "bag", "seen", "cas", "said", "acts", "chipDue"].forEach(k => { if (!isPlain(S[k])) S[k] = {}; });
  if (!Number.isFinite(S.stamps) || S.stamps < 0) S.stamps = 0;
  if (typeof S.track !== "string") S.track = null;
  if (!Array.isArray(S.log)) S.log = [];
  return S;
}

// ---------- 獎勵 ----------
export function itemDesc(id) {
  const it = STORY_ITEMS[id];
  if (!it) return "";
  if (it.kind === "skillBook") { const p = parseDice(NUM.story.skillBook); return `用了：${it.skill} +${p.m ? `${p.n}～${p.n * p.m}` : p.flat}（最多到 ${NUM.story.skillCap}）。給現在這位參觀者。`; }
  if (it.kind === "heal") return "用了：地下收藏庫受傷的佩佩，全部馬上好。";
  return `用來換週章：到兌換所，每 ${NUM.shop.matToStamp} 份換壹枚。這個算 ${it.worth || 1} 份。`;
}

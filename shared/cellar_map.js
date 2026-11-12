// ================================================================
//  地下室改版：每一層的小地圖（決定 0067，規劃 docs/地下室改版規劃.md 第三節）
//  翊文 11-12：「有你說的隨機地圖那一些嗎」「房間探索還是要保留喔，是個重點」
//  一層 NUM.cellarMap.rows 排，一排 2～3 個點，從上往下走，最底是守門怪物。
//  房間探索是重點：
//    前面每一排一定有一間探索房（就是 content3.js CELLAR 的房間，文字、選項都不變），這一層的房間每一間都在地圖上；
//    探索房一路連到下一排的探索房，所以一趟可以把這一層的房間全部走完（跟改版前一樣）。
//    不想探索的那一排，可以改走遭遇（打怪物）或寶箱。
//  最後一排一定有休息（守門前喘口氣）。
//  每天一張：cmapOfDay(層, 日期) 用日期當種子，同一天大家的地圖一樣，可以互相報路。
//  純函式：亂數從參數 rnd 來（預設 RNG）。
//
//  地圖：{ floor, rows: [[{ id, kind, room?, foe? }]], gate: { id, kind: "gate", foe }, links: { 點 id: [下一排可以走的點 id] } }
//  kind："explore" 探索（room ＝房間 id）、"foe" 遭遇（foe ＝怪物 id）、"chest" 寶箱和怪事、"rest" 休息、"gate" 守門
// ================================================================
import { NUM } from "./config.js";
import { RNG, hashStr, mulberry32 } from "./logic.js";
import { cellarFloor } from "./logic3.js";
import { fightFoesOf } from "./cellar_fight.js";

export const CMAP_KINDS = ["explore", "foe", "chest", "rest", "gate"];
const cmPick = (arr, rnd) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];
function cmShuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rnd() * (i + 1))); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function cmapMake(floor, rnd = RNG) {
  const f = cellarFloor(floor);
  if (!f || typeof rnd !== "function") return null;
  const M = NUM.cellarMap, foes = fightFoesOf(floor), boss = fightFoesOf(floor, true)[0] || null;
  const rooms = cmShuffle(f.rooms.map(r => r.id), rnd);
  const nRows = Math.max(M.rows, rooms.length + 1); // 房間比排數多的話多加幾排，每一間都放得進去
  // 遭遇的怪物有等級 1～3，越下面越容易遇到強的；地圖上看得到等級（cmapPeek），可以決定要不要接戰
  const rankAt = r => 1 + (rnd() < M.rank2[0] + M.rank2[1] * r ? 1 : 0) + (rnd() < M.rank3[0] + M.rank3[1] * r ? 1 : 0);
  let rowNow = 0;
  const side = () => (foes.length && rnd() < 0.6 ? { kind: "foe", foe: cmPick(foes, rnd).id, rank: rankAt(rowNow) } : { kind: "chest" });
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const last = r === nRows - 1;
    rowNow = r;
    const width = rnd() < M.wide ? 3 : 2;
    let row;
    if (last) row = [{ kind: "rest" }].concat(Array.from({ length: width - 1 }, side));
    else if (r < rooms.length) row = [{ kind: "explore", room: rooms[r] }].concat(Array.from({ length: width - 1 }, side));
    else row = Array.from({ length: width }, side);
    // 打亂左右的位置（探索房不會永遠在最左邊）
    row = cmShuffle(row, rnd);
    rows.push(row.map((n, i) => Object.assign({ id: `${floor}-${r}-${i}` }, n)));
  }
  const gate = { id: `${floor}-g`, kind: "gate", foe: boss ? boss.id : null };
  // 連線：每個點連到下一排位置差不多的點，再隨機多連一個；每個點至少有一條進來的路
  const links = {};
  for (let r = 0; r < nRows; r++) {
    const a = rows[r], b = rows[r + 1];
    if (!b) { a.forEach(n => { links[n.id] = [gate.id]; }); break; }
    a.forEach(n => { links[n.id] = []; });
    a.forEach((n, i) => {
      const j = Math.round(i * (b.length - 1) / Math.max(1, a.length - 1));
      links[n.id].push(b[j].id);
      const k = j + (rnd() < 0.5 ? 1 : -1);
      if (b[k] && rnd() < 0.6) links[n.id].push(b[k].id);
    });
    b.forEach((m, j) => {
      if (a.some(n => links[n.id].includes(m.id))) return;
      const i = Math.round(j * (a.length - 1) / Math.max(1, b.length - 1));
      links[a[i].id].push(m.id);
    });
    // 探索房一路連下去：這一排的探索房一定連得到下一排的探索房（最後一排是休息）
    const from = a.find(n => n.kind === "explore"), to = b.find(n => n.kind === "explore") || b.find(n => n.kind === "rest");
    if (from && to && !links[from.id].includes(to.id)) links[from.id].push(to.id);
  }
  links[gate.id] = [];
  return { floor, rows, gate, links };
}
// 今天這一層的地圖（同一天、同一層，每個人都一樣）
export const cmapOfDay = (floor, day) => cmapMake(floor, mulberry32(hashStr(`cmap:${day}:${floor}`)));

// 今天多出來的一個點（每天的內容的 cellar 那一塊，fightDailyCheck 檢查過的）：放在中間那一排，
// 上一排每個點都走得到它，它也走得到下一排每個點（想打的人一定打得到，不想打的照原本的路走）。回傳新的地圖，不改原本的
export function cmapAddDaily(map, daily) {
  if (!map || !daily || !daily.foe || daily.floor !== map.floor) return map;
  const m = JSON.parse(JSON.stringify(map)), r = Math.floor(m.rows.length / 2);
  const node = { id: `${m.floor}-${r}-today`, kind: "foe", foe: daily.foe.id, rank: daily.foe.boss ? 1 : (daily.rank || 1), daily: true };
  if (m.rows[r].some(n => n.id === node.id)) return m;
  m.rows[r].push(node);
  (r === 0 ? [] : m.rows[r - 1]).forEach(n => { if (!m.links[n.id].includes(node.id)) m.links[n.id].push(node.id); });
  m.links[node.id] = (m.rows[r + 1] || [m.gate]).map(n => n.id);
  m.daily = { foe: daily.foe };
  return m;
}
export const cmapNodes = map => map.rows.flat().concat([map.gate]);
export const cmapNode = (map, id) => cmapNodes(map).find(n => n.id === id) || null;
// 走到之前看得到什麼：種類；遭遇多看得到等級和心情、顏色（決定帶誰、要不要接戰）。
// 怪物是誰不說（保持神祕）；known ＝這個人已經登記過的怪物 id，登記過的才看得到是哪一隻。守門只說是守門
export function cmapPeek(map, id, known = []) {
  const n = map && cmapNode(map, id);
  if (!n) return null;
  const out = { id: n.id, kind: n.kind };
  if (n.kind === "explore") out.room = n.room;
  if (n.kind === "foe") {
    const foe = n.daily && map.daily ? map.daily.foe : fightFoesOf(map.floor).find(f => f.id === n.foe);
    if (n.daily) out.daily = true; // 畫面標「今天」
    out.rank = n.rank || 1;
    if (foe) { out.mood = foe.mood || null; out.color = foe.color || null; }
    if ((known || []).includes(n.foe)) out.foe = n.foe;
  }
  if (n.kind === "gate" && (known || []).includes(n.foe)) out.foe = n.foe;
  return out;
}
// 現在站在 at（還沒出發是 null），下一步可以走哪幾個點
export function cmapNext(map, at) {
  if (!map) return [];
  if (at == null) return map.rows[0].map(n => n.id);
  return (map.links[at] || []).slice();
}
// 這條路走不走得通：ids 照順序，從第一排走到某一個點
export function cmapPathOk(map, ids) {
  let at = null;
  for (const id of ids || []) { if (!cmapNext(map, at).includes(id)) return false; at = id; }
  return true;
}
// 檢查一張地圖（測試用、伺服器讀回來也可以用）：回傳問題的清單，沒問題是空的
export function cmapCheck(map) {
  const bad = [], f = map && cellarFloor(map.floor);
  if (!f || !Array.isArray(map.rows) || !map.gate || !map.links) return ["地圖不完整"];
  const all = cmapNodes(map), ids = new Set(all.map(n => n.id));
  if (ids.size !== all.length) bad.push("點的 id 重複");
  all.forEach(n => {
    if (!CMAP_KINDS.includes(n.kind)) bad.push(`${n.id} 的種類不認得`);
    if (n.kind === "explore" && !f.rooms.some(r => r.id === n.room)) bad.push(`${n.id} 的房間不在這壹層`);
    if (n.kind === "foe" && !(Number.isInteger(n.rank) && n.rank >= 1 && n.rank <= 3)) bad.push(`${n.id} 的等級不對`);
    (map.links[n.id] || []).forEach(t => { if (!ids.has(t)) bad.push(`${n.id} 連到不存在的 ${t}`); });
    if (n.daily && !(map.daily && map.daily.foe && map.daily.foe.id === n.foe)) bad.push(`${n.id} 是今天的點，地圖上要帶著那隻怪物`);
    if (n.kind !== "gate" && !(map.links[n.id] || []).length) bad.push(`${n.id} 沒有路往下`);
  });
  // 每個點都走得到
  const seen = new Set(map.rows[0].map(n => n.id));
  let grew = true;
  while (grew) { grew = false; [...seen].forEach(id => (map.links[id] || []).forEach(t => { if (!seen.has(t)) { seen.add(t); grew = true; } })); }
  all.forEach(n => { if (!seen.has(n.id)) bad.push(`${n.id} 走不到`); });
  f.rooms.forEach(r => { if (!all.some(n => n.kind === "explore" && n.room === r.id)) bad.push(`房間 ${r.id} 不在地圖上`); });
  // 一趟走得完全部的房間
  const ex = map.rows.map(row => row.find(n => n.kind === "explore")).filter(Boolean);
  for (let i = 0; i + 1 < ex.length; i++) if (!(map.links[ex[i].id] || []).includes(ex[i + 1].id)) bad.push(`探索房 ${ex[i].id} 連不到下壹間`);
  if (!map.rows[map.rows.length - 1].some(n => n.kind === "rest")) bad.push("最後壹排沒有休息");
  return bad;
}

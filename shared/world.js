// ================================================================
//  世界經濟的「世界文件」（W2，決定 0086，規劃 docs/世界經濟規劃.md 第 5、6 節）
//  純函式。伺服器每小時的排程（functions/world.js 的 worldTick，併進 auctionTick）呼叫 wdTick：換日第一次才寫，同一天再跑什麼都不做。
//  world/main：{ v, day, pool, grownSeen, last }
//    pool        外面世界的「備用池」：house.world（館的對外帳戶）以外的那一份。現在是 0，搬錢預設關閉（NUM.casino.worldDoc.gateway ＝ 0）。
//    grownSeen   上次看到的 house.led.mint.worldGrow 累計（算「這一次之間成長了多少」）
//    last        最近一天的紀錄（同 worldDays/{日期} 那份）
//  worldDays/{日期}：每天一份紀錄 { day, houseDay, world, pool, total, grown, growth, b }。**只觀察、不改莊家**：
//    成長（worldGrow）還是在莊家文件的換日（casHouseDaily）裡算，第一個碰到莊家的交易才算；排程不替它換日，因為換日會產生破產重開的事件、要由那個交易告訴玩家和 Discord。
//    之後（W3）單位分帳、成長按權重分，才把成長搬到排程。
//  搬錢（wdSettle）：house.world 和 pool 之間搬，總和不變。預設關閉；要開之前，casBookSnap 必須把 pool 算進總量（否則對帳差不是 0）。
// ================================================================
import { NUM } from "./config.js";
import { WORLD_UNITS } from "./world_roster.js";

const wdN = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
const wdBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const wdDayOk = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function wdNew() { return { v: 1, day: null, pool: 0, grownSeen: null, last: null }; }
// 讀回來的世界文件：補欄位、壞資料變回預設
export function wdFix(w) {
  const x = wdBox(w) ? w : wdNew();
  x.v = 1;
  x.day = wdDayOk(x.day) ? x.day : null;
  x.pool = Math.max(0, wdN(x.pool));
  x.grownSeen = x.grownSeen == null ? null : wdN(x.grownSeen);
  x.last = wdBox(x.last) ? x.last : null;
  return x;
}
// 莊家文件目前累計的成長（house.led.mint.worldGrow）
export const wdGrown = house => wdN(house && house.led && house.led.mint && house.led.mint.worldGrow);
// 外面世界現在總共多少：莊家的對外帳戶（house.world）加備用池
export const wdTotal = (house, w) => wdN(house && house.world) + wdN(w && w.pool);

// 換日第一次：回傳 { skip: true }（今天已經記過）或 { skip: false, w, rec }。house 不會被改
export function wdTick(wIn, house, day) {
  const w = wdFix(wIn);
  if (!wdDayOk(day)) return { skip: true, w };
  if (w.day === day) return { skip: true, w };
  const grown = wdGrown(house), growth = w.grownSeen == null ? null : Math.max(0, grown - w.grownSeen);
  const rec = { day, houseDay: wdDayOk(house && house.day) ? house.day : null, world: wdN(house && house.world), pool: w.pool, total: wdTotal(house, w), grown, growth, b: Math.round((+(house && house.econ && house.econ.b) || 0) * 1000) / 1000 };
  w.day = day; w.grownSeen = grown; w.last = rec;
  return { skip: false, w, rec };
}

// 搬錢：house.world 和 w.pool 之間，目標是讓 house.world ＝ min(總和, gateway)，其餘放備用池。gateway ≤ 0 ＝ 關閉，不搬。回傳搬了多少（正＝house.world → pool，負＝pool → house.world）
export function wdSettle(house, wIn, gateway = NUM.casino.worldDoc ? NUM.casino.worldDoc.gateway : 0) {
  const w = wdFix(wIn);
  if (!(gateway > 0) || !house) return 0;
  const total = wdTotal(house, w), want = Math.min(total, wdN(gateway)), move = wdN(house.world) - want; // move ＞ 0：house.world 多了，放進備用池
  if (!move) return 0;
  house.world = want; w.pool = total - want;
  wIn.pool = w.pool;
  return move;
}

// ================================================================
//  W3 分帳（決定 0086）：外面世界的錢（house.world）分成「頂層單位、家計、公共」。這只是帳上的分類，**不搬錢**：
//    house.wu ＝ { r: { id: 比例 }, adj: { id: 調整 } }。單位 i 現在有 floor(house.world × r_i) ＋ adj_i；公共＝house.world 減掉所有單位和家計（剩下的），所以總和永遠等於 house.world，不會對不上。
//    池子進出（館的各種來源）照比例攤（world × r 自己就會跟著變）；只有「指名的」會動 adj：每天成長按權重分（wuGrow）、新玩家的起始補助從文化部出（wuDebit）。
//    W4 起，NPC 來館花的錢從所屬集團出，會用 wuDebit。
//    公共（pub）是剩下的，所以指名的單位不夠出時由公共補；公共的比例（現在 16%）是緩衝。
// ================================================================
export const WU_HH = "u-household"; // 家計：沒有單位的人（學生、退休、自由業）
export const WU_PUB = "pub"; // 公共：剩下的（只在 wuAmounts 的結果裡，不存在 adj）
const wuBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const wuTop = () => WORLD_UNITS.filter(u => u && u.parent == null);
// 初始比例：頂層單位用名單的 share，家計 NUM.casino.worldDoc.household，公共是剩下的
export function wuRatios() {
  const r = {}; let sum = 0;
  for (const u of wuTop()) { r[u.id] = +u.share || 0; sum += r[u.id]; }
  r[WU_HH] = +NUM.casino.worldDoc.household || 0; sum += r[WU_HH];
  r[WU_PUB] = Math.max(0, 1 - sum);
  return r;
}
// 讀回來的莊家：沒有 wu 就照現在的比例建（第一次：外面世界的錢照比例分）；壞資料變回預設
export function wuFix(house) {
  if (!wuBox(house)) return null;
  const x = wuBox(house.wu) && wuBox(house.wu.r) ? house.wu : (house.wu = { r: wuRatios(), adj: {} });
  if (!wuBox(x.adj)) x.adj = {};
  for (const id of Object.keys(x.r)) { x.r[id] = +x.r[id] || 0; if (id !== WU_PUB) x.adj[id] = wdN(x.adj[id]); }
  if (x.r[WU_PUB] == null) x.r[WU_PUB] = 0;
  return x;
}
// 現在每個單位有多少（含 pub 公共）。總和 ＝ house.world
export function wuAmounts(house) {
  const x = wuFix(house), world = wdN(house.world), out = {}; let sum = 0;
  for (const id of Object.keys(x.r)) { if (id === WU_PUB) continue; out[id] = Math.floor(world * x.r[id]) + wdN(x.adj[id]); sum += out[id]; }
  out[WU_PUB] = world - sum;
  return out;
}
// house.world 從 before 變成現在：沒有指名的單位照比例變（floor 的差），指名的（deltas { id: 變多少 }）改成指名的數字；公共吃剩下的
function wuMove(house, before, deltas) {
  const x = wuFix(house), after = wdN(house.world);
  for (const id of Object.keys(x.r)) {
    if (id === WU_PUB || !(id in deltas)) continue;
    const base = Math.floor(after * x.r[id]) - Math.floor(before * x.r[id]);
    x.adj[id] = wdN(x.adj[id]) + wdN(deltas[id]) - base;
  }
}
// 每天成長 n 已經加進 house.world 了：按權重分給單位和家計（權重 ＝ 比例 ×（1＋行業係數×景氣 b）），公共吃剩下的。b ＝ house.econ.b
export function wuGrow(house, n) {
  n = wdN(n); const x = wuFix(house);
  if (!x || n <= 0) return 0;
  const b = Math.max(-1, Math.min(1, +(house.econ && house.econ.b) || 0)), coef = NUM.casino.worldDoc.sectorCoef || {}, sector = {};
  for (const u of wuTop()) sector[u.id] = u.sector;
  const raw = {}; let tot = 0;
  for (const id of Object.keys(x.r)) { raw[id] = x.r[id] * Math.max(0, 1 + (id === WU_PUB || id === WU_HH ? 0 : (+coef[sector[id]] || 0)) * b); tot += raw[id]; }
  if (!(tot > 0)) return 0;
  const deltas = {}; for (const id of Object.keys(x.r)) if (id !== WU_PUB) deltas[id] = Math.floor(n * raw[id] / tot);
  wuMove(house, wdN(house.world) - n, deltas);
  return n;
}
// 指名一個單位出錢 n（house.world 已經少了 n）：它最多出它現在有的，剩下的由公共出（別的單位不動）。回傳那個單位實際出了多少
export function wuDebit(house, id, n) {
  n = wdN(n); const x = wuFix(house);
  if (!x || n <= 0 || !(id in x.r) || id === WU_PUB) return 0;
  const before = wdN(house.world) + n, have = Math.max(0, Math.floor(before * x.r[id]) + wdN(x.adj[id])), take = Math.min(n, have);
  const deltas = {}; for (const k of Object.keys(x.r)) if (k !== WU_PUB) deltas[k] = k === id ? -take : 0; // 別的單位不動
  wuMove(house, before, deltas);
  return take;
}

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

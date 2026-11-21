// ================================================================
//  牌桌的「押法」小遊戲共用的規則（決定 0150：佩佩轉盤、差壹畫；之後同樣形狀的遊戲也用這個，不要各寫壹份）
//  純函式，不碰 DOM、不碰資料庫。壹個遊戲只要給：
//    def = { id, name, types: [{ id, label }], outcomes: [{ w 權重, hit(typeId) → 這個結果有沒有中這種押法, …自己要帶的資料 }] }
//    cfg = { edge 莊家優勢, maxWin 單轉最多贏多少, maxBets 壹轉最多幾筆 }（NUM.casino.wheel／miscount）
//  這裡負責：賠率（跟機率成反比）、押法檢查（限額、莊家健康）、擲結果（RNG，伺服器是 cryptoRng）、結算（錢包 ↔ 莊家，守恆）。
//  錢：玩家錢包 ↔ 莊家，來源記 bj（＝報表的「牌桌」），所以 casBookGap、對帳、econ:check 不用動；莊家吃緊時照 21 點的上限（casBetMax、casPayLeft）。
//  不可能有必賺的押法：每種押法的「機率 × 賠率」都 ≤ 1 − edge，任何組合每個結果的平均回收 ＝ (1 − edge) × 總注，最壞結果必虧。
// ================================================================
import { NUM } from "../core/config.js";
import { RNG } from "../core/logic_base.js";
import { casHouseMove, casCount } from "./book.js";
import { casBetMax, casPayAdd, casPayLeft } from "./wallet.js";
import { casInSpent, casInUsed } from "./stock_in.js";

const sbInt = v => (Number.isFinite(+v) ? Math.floor(+v) : 0);
// 賠率（含本金，壹位小數、往下捨）：每種押法
export function casSbType(def, t, edge) {
  const total = def.outcomes.reduce((a, o) => a + o.w, 0), hit = def.outcomes.reduce((a, o) => a + (o.hit(t.id) ? o.w : 0), 0), p = hit / total;
  return { id: t.id, label: t.label, p, mult: p > 0 ? Math.floor((1 - edge) / p * 10 + 1e-9) / 10 : 0 };
}
export const casSbTypes = (def, edge) => def.types.map(t => casSbType(def, t, edge));
// 贏了拿回多少（含本金）：賠率壹位小數，用整數算，不會有浮點誤差
export const casSbPay = (bet, mult) => Math.floor(bet * Math.round(mult * 10) / 10);
// 今天這壹轉壹共最多能押多少（跟 21 點壹樣：莊家吃緊時變小）
export function casSbTop(house, day) {
  const left = casPayLeft(house, day);
  return Math.min(casBetMax(house), left === Infinity ? Infinity : Math.floor(left / NUM.casino.risk.betMult));
}
// 畫面要的資訊：每種押法的賠率和能押多少（單筆最多 ＝ 壹轉最多贏 maxWin 除以賠率減 1，再不超過總注上限）
export function casSbInfo(def, cfg, house, day) {
  const top = casSbTop(house, day), left = casPayLeft(house, day), win = Math.min(cfg.maxWin, left === Infinity ? cfg.maxWin : left);
  return {
    on: !!cfg.on, name: def.name, edge: cfg.edge, top, minBet: NUM.casino.minBet, maxWin: win, maxBets: cfg.maxBets,
    types: casSbTypes(def, cfg.edge).map(t => ({ id: t.id, label: t.label, p: t.p, mult: t.mult, max: Math.max(0, Math.min(top, t.mult > 1 ? Math.floor(win / (t.mult - 1)) : top)) })),
  };
}
// 檢查壹轉的押法。回傳 { ok, bets: [{ id, bet, mult }], total } 或 { ok: false, reason }
export function casSbCheck(def, cfg, w, house, day, raw) {
  if (!cfg.on) return { ok: false, reason: "這個遊戲現在不開。" };
  if (!Array.isArray(raw) || !raw.length) return { ok: false, reason: "先選要押什麼。" };
  if (raw.length > cfg.maxBets) return { ok: false, reason: `壹轉最多押 ${cfg.maxBets} 種。` };
  const seen = new Set(), bets = [];
  for (const r of raw) {
    const id = r && typeof r.id === "string" ? r.id : "", d = def.types.find(x => x.id === id), t = d && casSbType(def, d, cfg.edge), bet = sbInt(r && r.bet);
    if (!t || seen.has(id)) return { ok: false, reason: "押法不對。" };
    if (!(+(r && r.bet) === bet) || bet < NUM.casino.minBet) return { ok: false, reason: `每種最少押 ${NUM.casino.minBet}。` };
    seen.add(id); bets.push({ id, bet, mult: t.mult });
  }
  const total = bets.reduce((a, b) => a + b.bet, 0), top = casSbTop(house, day), left = casPayLeft(house, day);
  if (left <= 0 || top < NUM.casino.minBet) return { ok: false, reason: "莊家今天賠不動了，明天再來。" };
  if (total > w.chips) return { ok: false, reason: "籌碼不夠。" };
  if (total > top) return { ok: false, reason: `壹轉最多押 ${top.toLocaleString("en-US")}。` };
  // 任何結果下的淨贏都不能超過 maxWin（高賠率的押法能押的少），也不能超過莊家今天還賠得起的
  const cap = Math.min(cfg.maxWin, left === Infinity ? cfg.maxWin : left);
  let worst = -Infinity;
  for (const o of def.outcomes) { const ret = bets.reduce((a, b) => a + (o.hit(b.id) ? casSbPay(b.bet, b.mult) : 0), 0); worst = Math.max(worst, ret - total); }
  if (worst > cap) return { ok: false, reason: `壹轉最多贏 ${cap.toLocaleString("en-US")}：高賠率的押法要押少壹點。` };
  return { ok: true, bets, total };
}
// 擲、結算。壹個交易裡呼叫（伺服器的 play）；rng 預設用 RNG（伺服器已經設成 cryptoRng）。
// 回傳 { ok, outcome（那個結果的資料，去掉 hit）, rows: [{ id, bet, hit, pay }], total, ret, net, chips } 或 { ok: false, reason }
export function casSbSpin(def, cfg, w, house, day, raw, rng = RNG) {
  const c = casSbCheck(def, cfg, w, house, day, raw);
  if (!c.ok) return c;
  const sum = def.outcomes.reduce((a, o) => a + o.w, 0);
  let x = rng() * sum, o = def.outcomes[def.outcomes.length - 1];
  for (const k of def.outcomes) { if (x < k.w) { o = k; break; } x -= k.w; }
  const rows = c.bets.map(b => ({ id: b.id, bet: b.bet, hit: !!o.hit(b.id), pay: o.hit(b.id) ? casSbPay(b.bet, b.mult) : 0 }));
  const ret = rows.reduce((a, r) => a + r.pay, 0);
  w.chips -= c.total; w.chips += ret;
  casHouseMove(house, "bj", c.total - ret); // 輸的進莊家、贏的從莊家出（跟 21 點同壹條）
  casInUsed(w, house, "bj", day); casInSpent(w, house, "bj", day, c.total); // 館內股的「牌桌」營收：今天有人玩、這壹轉的注
  if (ret > c.total) casPayAdd(house, day, ret - c.total); // 今天賠付了多少（莊家吃緊時有上限）
  casCount(house, def.id + "Spins");
  w.st.chipsMax = Math.max(w.st.chipsMax || 0, w.chips);
  const out = Object.assign({}, o); delete out.hit; delete out.w;
  return { ok: true, outcome: out, rows, total: c.total, ret, net: ret - c.total, chips: w.chips };
}

// ================================================================
//  Yuga Bot 銀行：活存、定存（翊文 11-13：「規劃好了我們就上線新的銀行體系讓大家玩，可以投資了」→「照這樣做」）
//  規劃：docs/經濟體系規劃.md 玩法 2、第 2.7 節（銀行三步：活存定存 → 館債 → 館內股票）。
//  錢怎麼動（守恆，shared/casino_book.js）：
//    存進去：錢包的籌碼搬到 w.bank（還是玩家的，只是不能下注）。快照把 w.bank 算進全館的錢。
//    利息：從莊家出（casHouseMove "bankInt"），莊家 ≤ 0（破產中）就沒有利息，不印錢。
//  活存：每天換日照「昨天結束時的活存」給利息，本金最多算 saveCap；利息直接進活存。
//  定存：存 3 天或 7 天，到期那天換日自動把本金加利息放回活存；提早解約只拿回本金。同時最多 termMax 筆。
//  不用每天回來領：下壹次碰到莊家（任何賭場動作）時，把沒算的天數補算（最多 catchup 天）。
//  純函式：「今天」從參數來，不碰資料庫和 DOM。錢包欄位 w.bank：{ save, terms: [{ id, amt, days, pct, day, due }], seq, day, earned, notes }
// ================================================================
import { NUM } from "./config.js";
import { casHouseMove } from "./casino_book.js";
import { CAS_BANK } from "./casino_text.js";
import { casFill, casNum } from "./casino.js";

const cbkBox = v => !!v && typeof v === "object" && !Array.isArray(v);
const cbkN = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
const cbkDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const cbkAddDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const cbkDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// 補欄位（壞資料也不丟錯）。不換日、不算利息（那是 casBankAccrue）
export function casBankFix(w) {
  if (!cbkBox(w.bank)) w.bank = { save: 0, terms: [], seq: 0, day: null, earned: 0, notes: [] };
  const B = w.bank;
  B.save = cbkN(B.save); B.seq = cbkN(B.seq); B.earned = cbkN(B.earned);
  if (!cbkDay(B.day)) B.day = null;
  B.terms = (Array.isArray(B.terms) ? B.terms : []).filter(x => cbkBox(x) && cbkN(x.amt) > 0 && cbkDay(x.due))
    .map(x => ({ id: cbkN(x.id), amt: cbkN(x.amt), days: cbkN(x.days), pct: Math.max(0, +x.pct || 0), day: cbkDay(x.day) ? x.day : x.due, due: x.due }));
  B.notes = (Array.isArray(B.notes) ? B.notes : []).filter(s => typeof s === "string").slice(-5);
  return B;
}
// 存在銀行的全部（活存＋定存的本金）。記帳的快照用
export const casBankHeld = w => { if (!cbkBox(w && w.bank)) return 0; const B = w.bank; return cbkN(B.save) + (Array.isArray(B.terms) ? B.terms.reduce((s, x) => s + cbkN(x && x.amt), 0) : 0); };

// 莊家付利息：莊家 ≤ 0 不付；最多付到莊家的 houseCapPct%（免得被存款吸乾）。回傳真的付了多少
function cbkPay(house, want) {
  const C = NUM.casino.bank;
  if (!house || want <= 0 || house.bankroll <= 0) return 0;
  const n = Math.min(Math.floor(want), Math.floor(house.bankroll * C.houseCapPct / 100));
  if (n <= 0) return 0;
  casHouseMove(house, "bankInt", -n);
  return n;
}
// 換日補算：上次算到 B.day，今天 day。每過壹天：活存給壹天利息；到期的定存（due ≤ 那天）放回活存。
// 回傳這次的事件 { int 活存利息, back [{ amt, int }] 到期的定存 }，同時把壹句話放進 B.notes（畫面下次拿到就說）
export function casBankAccrue(w, house, day) {
  const C = NUM.casino.bank, B = casBankFix(w);
  const out = { int: 0, back: [] };
  if (!cbkDay(day)) return out;
  if (!B.day) { B.day = day; return out; }
  const n = cbkDiff(B.day, day);
  if (n <= 0) return out;
  const first = Math.max(1, n - C.catchup + 1); // 太久沒來：只補最後 catchup 天
  let broke = false;
  for (let i = first; i <= n; i++) {
    const d = cbkAddDays(B.day, i);
    // 活存：照前壹天結束時的餘額
    const base = Math.min(B.save, C.saveCap), want = Math.floor(base * C.savePct / 100);
    if (want > 0) { const got = cbkPay(house, want); if (got < want) broke = true; B.save += got; B.earned += got; out.int += got; }
    // 定存：到期日 ≤ 今天的放回活存
    const due = B.terms.filter(x => x.due <= d);
    for (const x of due) {
      const want2 = Math.floor(x.amt * x.pct / 100), got = cbkPay(house, want2);
      if (got < want2) broke = true;
      B.save += x.amt + got; B.earned += got;
      out.back.push({ amt: x.amt, int: got, days: x.days });
    }
    if (due.length) B.terms = B.terms.filter(x => !due.includes(x));
  }
  B.day = day;
  if (out.int > 0) B.notes.push(casFill(CAS_BANK.noteInt, { n: casNum(out.int) }));
  out.back.forEach(x => B.notes.push(casFill(CAS_BANK.noteBack, { days: x.days, amt: casNum(x.amt), int: casNum(x.int) })));
  if (broke) B.notes.push(CAS_BANK.noteBroke);
  B.notes = B.notes.slice(-5);
  return out;
}
// 拿走還沒說的話（畫面說完就清掉）
export function casBankTakeNotes(w) { const B = casBankFix(w); const n = B.notes; B.notes = []; return n; }

const cbkAmt = (amt, max) => (amt === "max" ? max : Math.floor(Number(String(amt == null ? "" : amt).replace(/[,，\s]/g, ""))));
// 存活存：從籌碼搬進活存
export function casBankPut(w, amt) {
  const C = NUM.casino.bank, B = casBankFix(w);
  const n = cbkAmt(amt, Math.max(0, w.chips));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BANK.bad };
  if (n < C.min) return { ok: false, reason: casFill(CAS_BANK.min, { n: casNum(C.min) }) };
  if (n > w.chips) return { ok: false, reason: CAS_BANK.poor };
  w.chips -= n; B.save += n;
  return { ok: true, n, lines: [casFill(CAS_BANK.putOk, { n: casNum(n), save: casNum(B.save) })] };
}
// 領活存：從活存搬回籌碼
export function casBankTake(w, amt) {
  const B = casBankFix(w);
  const n = cbkAmt(amt, B.save);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BANK.bad };
  if (n > B.save) return { ok: false, reason: CAS_BANK.takePoor };
  B.save -= n; w.chips += n;
  return { ok: true, n, lines: [casFill(CAS_BANK.takeOk, { n: casNum(n), save: casNum(B.save) })] };
}
// 開壹筆定存：kind 是 NUM.casino.bank.terms 的第幾種；錢從籌碼出
export function casBankTerm(w, amt, kind, day) {
  const C = NUM.casino.bank, B = casBankFix(w), T = C.terms[Math.floor(+kind)];
  if (!T || !cbkDay(day)) return { ok: false, reason: CAS_BANK.bad };
  if (B.terms.length >= C.termMax) return { ok: false, reason: casFill(CAS_BANK.termMany, { n: C.termMax }) };
  const n = cbkAmt(amt, Math.max(0, w.chips));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: CAS_BANK.bad };
  if (n < C.termMin) return { ok: false, reason: casFill(CAS_BANK.min, { n: casNum(C.termMin) }) };
  if (n > C.termCap) return { ok: false, reason: casFill(CAS_BANK.termCap, { n: casNum(C.termCap) }) };
  if (n > w.chips) return { ok: false, reason: CAS_BANK.poor };
  const x = { id: ++B.seq, amt: n, days: T.days, pct: T.pct, day, due: cbkAddDays(day, T.days) };
  w.chips -= n; B.terms.push(x);
  return { ok: true, term: x, lines: [casFill(CAS_BANK.termOk, { n: casNum(n), days: T.days, due: x.due.slice(5), int: casNum(Math.floor(n * T.pct / 100)) })] };
}
// 提早解約：只拿回本金
export function casBankBreak(w, id) {
  const B = casBankFix(w), x = B.terms.find(t => t.id === Math.floor(+id));
  if (!x) return { ok: false, reason: CAS_BANK.noTerm };
  B.terms = B.terms.filter(t => t !== x); w.chips += x.amt;
  return { ok: true, n: x.amt, lines: [casFill(CAS_BANK.breakOk, { n: casNum(x.amt) })] };
}
// 畫面要的
export function casBankView(w, day) {
  const C = NUM.casino.bank, B = casBankFix(w);
  return {
    save: B.save, earned: B.earned, savePct: C.savePct, saveCap: C.saveCap, min: C.min, termMin: C.termMin, termCap: C.termCap, termMax: C.termMax,
    perDay: Math.floor(Math.min(B.save, C.saveCap) * C.savePct / 100),
    kinds: C.terms.map((t, i) => ({ i, days: t.days, pct: t.pct })),
    terms: B.terms.map(x => ({ id: x.id, amt: x.amt, days: x.days, pct: x.pct, due: x.due, int: Math.floor(x.amt * x.pct / 100), left: cbkDay(day) ? Math.max(0, cbkDiff(day, x.due)) : null })),
    quick: C.quick,
  };
}

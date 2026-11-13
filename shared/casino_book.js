// ================================================================
//  賭場的記帳（11-13，數值平衡；docs/經濟體系規劃.md 第 2.2 節 P0）
//  純函式，不碰資料庫，也不依賴別的檔（所以 casino_wallet、econ、find、job 都可以 import）。
//  規則：籌碼只有兩種動法。
//    搬：錢包 ↔ 莊家 ↔ 預算池 ↔ 海底 ↔ 另一個錢包，總量不變。
//    憑空（mint）、消失（burn）：一定要用下面的 casMint／casBurn／casHouseMint，並且寫上來源。
//  記在哪：
//    錢包 w.led = { mint: {來源: 累計}, burn: {來源: 累計} }（這個錢包自己憑空來的、消失的）
//    莊家 house.led = { mint: {來源: 累計}, flow: {來源: 累計} }
//      mint：莊家憑空多的（破產重開）。flow：莊家的錢因為這個來源變多少（正＝進莊家，負＝出莊家）
//  每天第一次有人看財報時，伺服器把全館加總存成一份快照（casBookSnap）；兩份快照相減就是那一天的帳（casBookDiff）。
//  守恆：錢包總和 ＋ 在路上的（借款被扣、還沒交給莊家）＋ 打到一半的注 ＋ 莊家 ＋ 預算池 ＋ 海底，
//        永遠等於 開場的總和 ＋ 全部 mint － 全部 burn。測試 test/casino_book.test.cjs 擋這個。
// ================================================================
const bkNz = n => (Number.isFinite(+n) ? Math.floor(+n) : 0);
const bkBox = o => !!o && typeof o === "object" && !Array.isArray(o);

// 補欄位（casWalletFix、casHouseFix 會叫）
export function casLedFix(x, keys) {
  if (!bkBox(x.led)) x.led = {};
  for (const k of keys) if (!bkBox(x.led[k])) x.led[k] = {};
  return x.led;
}
const bkAdd = (obj, src, n) => { obj[src] = bkNz(obj[src]) + n; };

// 預算池、館方帳憑空多 n（pool："budget"｜"museum"，門票這類館外進來的錢）
export function casPoolMint(house, pool, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house[pool] = bkNz(house[pool]) + n;
  bkAdd(casLedFix(house, ["mint", "flow"]).mint, src, n);
  return n;
}

// 錢包憑空多 n（n 要是正整數）。回傳 n
export function casMint(w, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  w.chips += n;
  bkAdd(casLedFix(w, ["mint", "burn"]).mint, src, n);
  return n;
}
// 錢包的籌碼消失 n
export function casBurn(w, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  w.chips -= n;
  bkAdd(casLedFix(w, ["mint", "burn"]).burn, src, n);
  return n;
}
// 莊家的錢因為 src 變動 n（正＝進莊家，負＝出莊家）。對面一定是錢包／預算池／海底，那邊自己動
export function casHouseMove(house, src, n) {
  n = bkNz(n);
  house.bankroll += n;
  bkAdd(casLedFix(house, ["mint", "flow"]).flow, src, n);
  return n;
}
// 莊家憑空多 n（破產重開）
export function casHouseMint(house, src, n) {
  n = bkNz(n);
  if (n <= 0) return 0;
  house.bankroll += n;
  bkAdd(casLedFix(house, ["mint", "flow"]).mint, src, n);
  return n;
}

// 存在銀行的（跟 casino_bank.js 的 casBankHeld 壹樣；這個檔不 import 別的檔，所以自己算）
const bkHeld = w => (bkBox(w.bank) ? bkNz(w.bank.save) + (Array.isArray(w.bank.terms) ? w.bank.terms.reduce((s, x) => s + bkNz(x && x.amt), 0) : 0) : 0);
const bkSumObj = o => Object.values(bkBox(o) ? o : {}).reduce((s, x) => s + bkNz(x), 0);
export const casBookSumObj = bkSumObj;
const bkMerge = (into, o) => { for (const [k, v] of Object.entries(bkBox(o) ? o : {})) bkAdd(into, k, bkNz(v)); };

// 全館加總。wallets：錢包的陣列（沒有的不用給）；house：莊家；inplay：打到一半、還沒結算的注（單人的局、牌桌的座位）
// 回傳快照：{ day, wallets: n 個錢包, chips 錢包籌碼總和, transit 在路上的, inplay, mint {來源}, burn {來源},
//            house: { bankroll, budget, sea, mint {來源}, flow {來源} } }
export function casBookSnap(wallets, house, inplay, day) {
  const s = { day: day || null, wallets: 0, chips: 0, transit: 0, bank: 0, inplay: bkNz(inplay), mint: {}, burn: {},
    house: { bankroll: bkNz(house.bankroll), budget: bkNz(house.budget), sea: bkNz(house.sea), museum: bkNz(house.museum), mint: {}, flow: {} } };
  for (const w of wallets) {
    if (!bkBox(w)) continue;
    s.wallets++;
    s.chips += bkNz(w.chips);
    s.transit += bkNz(w.loan && w.loan.toHouse);
    s.bank += bkHeld(w); // 存在 Yuga Bot 銀行的（活存＋定存，shared/casino_bank.js）：還是玩家的錢
    if (bkBox(w.led)) { bkMerge(s.mint, w.led.mint); bkMerge(s.burn, w.led.burn); }
  }
  if (bkBox(house.led)) { bkMerge(s.house.mint, house.led.mint); bkMerge(s.house.flow, house.led.flow); }
  return s;
}
// 全館的錢（含莊家、預算池、海底）
export const casBookTotal = s => s.chips + s.transit + bkNz(s.bank) + s.inplay + s.house.bankroll + s.house.budget + s.house.sea + bkNz(s.house.museum);
// 全部憑空的、消失的累計
export const casBookMinted = s => bkSumObj(s.mint) + bkSumObj(s.house.mint);
export const casBookBurned = s => bkSumObj(s.burn);
// 守恆：total － minted ＋ burned 應該等於開場的總和（budgetStart ＋ houseStart；各錢包的開場籌碼也算 mint，所以不用另外加）。回傳差多少（0＝對）
export const casBookGap = (s, opening) => casBookTotal(s) - casBookMinted(s) + casBookBurned(s) - opening;

const bkDiffObj = (a, b) => {
  const out = {};
  for (const k of new Set([...Object.keys(bkBox(a) ? a : {}), ...Object.keys(bkBox(b) ? b : {})])) {
    const d = bkNz(b && b[k]) - bkNz(a && a[k]);
    if (d) out[k] = d;
  }
  return out;
};
// 兩份快照相減（a 較早，b 較晚）＝這段時間的帳。a 沒有（第一天）就從 0 算
export function casBookDiff(a, b) {
  const z = { chips: 0, transit: 0, bank: 0, inplay: 0, wallets: 0, mint: {}, burn: {}, house: { bankroll: 0, budget: 0, sea: 0, mint: {}, flow: {} } };
  a = a || z;
  return {
    from: a.day || null, to: b.day || null,
    wallets: bkNz(b.wallets) - bkNz(a.wallets),
    chips: bkNz(b.chips) - bkNz(a.chips),
    bank: bkNz(b.bank) - bkNz(a.bank),
    bankroll: bkNz(b.house.bankroll) - bkNz(a.house.bankroll),
    budget: bkNz(b.house.budget) - bkNz(a.house.budget),
    sea: bkNz(b.house.sea) - bkNz(a.house.sea),
    museum: bkNz(b.house.museum) - bkNz(a.house.museum),
    mint: bkDiffObj(a.mint, b.mint), burn: bkDiffObj(a.burn, b.burn),
    houseMint: bkDiffObj(a.house.mint, b.house.mint), flow: bkDiffObj(a.house.flow, b.house.flow),
  };
}
// 第一份快照當起點：開場總和 ＝ 現在的總和 － 憑空 ＋ 消失（開始記帳以前的籌碼不補記）
export const casBookOpening = s => casBookTotal(s) - casBookMinted(s) + casBookBurned(s);

// 決定 0136：說明、公告、確認單裡的費率要跟設定壹致（以前槓桿規則寫死 0.5%、0.15%、0.3%、壹天 3 筆、等 15 分鐘，早就跟設定不壹樣）；手續費是 0 寫「免手續費」。node test/stock/fee_text.test.cjs（npm test 也會跑）
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-16", at = (h) => Date.UTC(2026, 10, 16, h - 8, 0);
const ROOT = path.join(__dirname, "..", ".."), ui = fs.readFileSync(path.join(ROOT, "web", "src", "rooms", "bank", "ui_bank.js"), "utf8");
const levRule = G => { const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0); return G.casStockLevView(w, h, D0, at(12)).lev.rule; };
T("槓桿規則的字：手續費、利息、借券、當沖稅、筆數、冷卻都讀設定；美股 0 寫「免手續費」", G => {
  const r = levRule(G); assert.ok(r.includes("台股 0.05%") && r.includes("美股 免手續費") && r.includes("館內股 0.5%、集團股 0.2%"), r);
  assert.ok(r.includes("台股、美股 0.02%") && r.includes("台股、美股 0.08%") && r.includes("館內股和集團股 0.15%") && r.includes("館內股和集團股 0.3%"), "利息、借券費");
  assert.ok(r.includes("當沖證交稅 0.15%"), "當沖稅"); assert.ok(r.includes("壹天開幾筆不限") && r.includes("平倉後馬上可以再開"), "現在不限筆數、沒有冷卻");
  assert.ok(!/買賣各收 0\.5% 手續費|壹天最多開 3 筆|要等 15 分鐘/.test(r), "不能留舊的寫死的字");
});
T("改設定字會跟著變：手續費、利息、借券、稅、筆數、冷卻", G => {
  G.NUM.casino.stock.feeOut.tw = 0.123; G.NUM.casino.stock.feeOut.us = 0.2; G.NUM.casino.stockLev.byMk.tw.interestPct = 0.07; G.NUM.casino.stockLev.byMk.tw.taxPct = 0; G.NUM.casino.stockLev.opensDay = 4; G.NUM.casino.stockLev.coolMin = 9;
  const r = levRule(G); assert.ok(r.includes("台股 0.123%") && r.includes("美股 0.2%") && r.includes("台股、美股 0.07%") && !r.includes("當沖證交稅") && r.includes("壹天最多開 4 筆") && r.includes("要等 9 分鐘"), r);
});
T("每支的費率跟設定壹致：view 的 fee、taxPct；0 的那檔 view 是 0（畫面用「免手續費」）", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0), v = G.casStockView(w, h, D0, at(12), []);
  const S = G.NUM.casino.stock; for (const it of v.list) assert.strictEqual(it.fee, G.casStockFeePct(it.id) / 100, it.id);
  assert.strictEqual(v.feeTw, S.feeOut.tw / 100); assert.strictEqual(v.feeUs, S.feeOut.us / 100); assert.strictEqual(v.fee, S.feePct / 100); assert.strictEqual(G.casFeeText(0), "免手續費"); assert.strictEqual(G.casFeeText(0.05), "0.05%");
});
T("銀行說明（helpSections）和畫面：費率從設定讀（feeOut、byMk）、0 用「免手續費」、沒有寫死的 0.5%／0.15%／借券 0.3%", G => {
  const a = ui.indexOf("function helpSections"), b = ui.indexOf("function openHelp"), help = ui.slice(a, b);
  for (const k of ["S.feeOut.tw", "S.feeOut.us", "S.feeOut.grp", "S.feePct", "L.byMk.tw.interestPct", "L.byMk.tw.borrowPct", "L.byMk.tw.taxPct", "feeT("]) assert.ok(help.includes(k), k);
  assert.ok(ui.includes("免手續費"), "畫面有「免手續費」的字");
  const code = ui.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  for (const bad of [/手續費 0\.5%/, /利息 0\.15%/, /借券費 0\.3%/, /手續費 \$\{pctText\(S\.fee\)\}（跟台股/]) assert.ok(!bad.test(code), String(bad));
});
T("館方公告：寫費用的那則，數字跟設定壹致", G => {
  const dir = path.join(ROOT, "content", "notices"), files = fs.readdirSync(dir).filter(f => f.endsWith(".json")), S = G.NUM.casino.stock, L = G.NUM.casino.stockLev;
  const n = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).find(x => /手續費降到接近真實/.test(x.title || ""));
  assert.ok(n, "有費用公告"); const t = JSON.stringify(n);
  for (const k of [`${S.feeOut.tw}%`, `${L.byMk.tw.interestPct}%`, `${L.byMk.tw.borrowPct}%`, `${L.byMk.tw.taxPct}%`, `${S.taxPct}%`]) assert.ok(t.includes(k), k);
  assert.ok(/美股.*免手續費/.test(t), "美股寫免手續費");
});
console.log(`${pass} passed, ${fail} failed（費率的字跟設定壹致）`);
process.exit(fail ? 1 : 0);

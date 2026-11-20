// 銀行「規則與小提示」（web/src/rooms/bank/ui_bank.js 的 helpSections）不能再寫過時的話、要有這幾天新增的分頁（決定 0126～0130）。只讀原始碼，不跑畫面。node test/casino/bank_help.test.cjs（npm test 也會跑）
const assert = require("assert"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "rooms", "bank", "ui_bank.js"), "utf8");
const a = src.indexOf("function helpSections"), b = src.indexOf("function openHelp"); const help = src.slice(a, b);
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
T("有集團股、金流、佩佩銀行三個分頁，打開小提示預設會跳到對應的頁籤", () => { for (const id of ["gstock", "flow", "gbank"]) assert.ok(help.includes(`id: "${id}"`), id); assert.ok(/gstock: "gstock", flow: "flow"/.test(src)); });
T("不能再寫「外面世界」、「利息是從莊家出的」、「莊家還不出來時」", () => { for (const bad of ["外面世界", "利息是從莊家出的", "莊家還不出來時", "莊家回到起始的"]) assert.ok(!help.includes(bad), bad); });
T("存款、借款、館債寫佩佩銀行；借款寫「佩佩銀行的錢暫時不夠借」；槓桿有集團股；財報世界市場寫海外", () => { for (const k of ["利息由佩佩銀行付", "新的借款由佩佩銀行的準備金出", "佩佩銀行的錢暫時不夠借", "集團股也能開", "海外（真實市場）"]) assert.ok(help.includes(k), k); });
T("證交稅用 pc（設定是 % 的數字），不能用 pctText（會變成 30%）", () => { assert.ok(!/證交稅 \$\{pctText\(S\.taxPct\)\}/.test(help) && !/賣出證交稅 \$\{pctText/.test(help)); });
T("數字都從設定讀：集團股用 G.（C.gstock）、佩佩銀行用 BS.（C.bankSplit）", () => { for (const k of ["G.dayVolPct", "G.depthPct", "G.cover.max", "BS.reservePct", "BS.hdepW", "BS.sweepHousePct", "L.maxLev.grp"]) assert.ok(help.includes(k), k); });
console.log(`${pass} passed, ${fail} failed（銀行規則與小提示）`);
process.exit(fail ? 1 : 0);

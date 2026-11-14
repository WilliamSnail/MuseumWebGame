// 三支經濟腳本：價格總表（tools/econ_prices.cjs）、寫死金額掃描（econ_scan.cjs）、正式站帳面（econ_status.cjs，不連網路的部分）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
const P = require("../tools/econ_prices.cjs"), S = require("../tools/econ_scan.cjs"), E = require("../tools/econ_status.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const G = load({ __realMoney: true });
T("價格總表：每個路徑都找得到、有餐車、有 Markdown", () => {
  const t = P.table(G); assert.deepStrictEqual(t.miss, []);
  assert.ok(t.rows.some(r => r.name === "烤雞肉" && r.value === G.NUM && false) || t.rows.some(r => r.name === "烤雞肉" && r.value === 100));
  assert.ok(t.rows.find(r => r.path === "NUM.casino.startChips").value === G.NUM.casino.startChips);
  assert.ok(P.render(t.rows, true).includes("| 名字 | 現在 | 路徑 |"));
});
T("掃描：萬、億、逗號、純數字（要有錢的字）", () => {
  const v = l => S.amounts(l).map(a => a.value);
  assert.strictEqual(JSON.stringify(v("起始 100 萬、最多 1.5億")), "[1000000,150000000]");
  assert.strictEqual(JSON.stringify(v("壹把 2,000,000 籌碼")), "[2000000]");
  assert.strictEqual(JSON.stringify(v("花了 25000 籌碼")), "[25000]");
  assert.strictEqual(JSON.stringify(v("setTimeout(f, 7000)")), "[]", "沒有錢的字的純數字不算");
  assert.strictEqual(JSON.stringify(v("2026 年底")), "[]");
});
T("掃描：對得上 NUM 的不報、對不上的報、×40 的有提示、白名單有用", () => {
  const fs = require("fs"), os = require("os"), path = require("path"), f = path.join(os.tmpdir(), "econ_scan_t.js");
  const kn = S.known(G), start = G.NUM.casino.startChips, old = [...kn.keys()].find(k => !kn.has(k * 40) && k * 40 < 1e12);
  fs.writeFileSync(f, `a("新玩家有 ${start.toLocaleString("en-US")} 籌碼");\na("新玩家有 ${(old * 40).toLocaleString("en-US")} 籌碼");\na("壹個很怪的 12,345 籌碼");\n// 註解 99,999 籌碼\n`);
  const hits = S.scan([f], kn, {});
  assert.strictEqual(hits.length, 3);
  assert.ok(hits[0].match && !hits[1].match && hits[1].hint && !hits[2].match && !hits[2].hint);
  assert.strictEqual(S.scan([f], kn, { values: [12345] }).length, 2);
  fs.unlinkSync(f);
});
T("正式站帳面：沒有 --yes 不會跑、只留 ECON_HEX 的行、沒有就丟錯", () => {
  assert.strictEqual(E.parseArgs(["--yes"]).yes, true); assert.strictEqual(E.parseArgs([]).yes, false);
  assert.throws(() => E.parseArgs(["--亂寫"]), /沒有/);
  const t = E.pickEcon("noise\nECON_HEX H 1/1 4 abcdef12 7b7d.\nmore\n");
  assert.strictEqual(t.trim().split("\n").length, 1);
  assert.throws(() => E.pickEcon("沒有"), /ECON_HEX/);
});
console.log(`econ_scripts：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);

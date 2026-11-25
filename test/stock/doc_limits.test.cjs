// 行情文件 stocksUs/latest、stocksTw/latest 的兩個上限（11-25：美股 11-24 盤中第 97 分鐘起寫不進去，「too many index entries」）。node test/stock/doc_limits.test.cjs（npm test 也會跑）
// 1. 索引項目：Firestore 每份文件最多 4 萬個；ser、days 每支每分鐘一個數字，美股 26 支 × 391 × 6 天超過。這些欄位只用文件 ID 讀、從不查詢，所以在 firestore.indexes.json 設成不建索引。
// 2. 文件大小：Firestore 每份文件最多 1 MiB。照最滿的情況（每支整天都有、days 留滿）估，要留餘裕。
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const IDX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"));
const BIG = ["ser", "days", "R", "A", "prevReal", "lag", "stale", "log"];

T("stocksUs、stocksTw 的大欄位都設成不建索引", () => {
  for (const cg of ["stocksUs", "stocksTw"]) for (const fp of BIG) {
    const o = IDX.fieldOverrides.find(x => x.collectionGroup === cg && x.fieldPath === fp);
    assert.ok(o && Array.isArray(o.indexes) && o.indexes.length === 0, `${cg}.${fp} 要在 firestore.indexes.json 設 indexes: []`);
  }
  // 文件裡的欄位有新的大欄位（物件或陣列）卻沒登記，就要想一下要不要也不建索引
  const doc = G.twDocNew("2026-11-25"), big = Object.keys(doc).filter(k => doc[k] && typeof doc[k] === "object");
  big.forEach(k => assert.ok(BIG.includes(k), `twDocNew 多了物件欄位「${k}」：加進 firestore.indexes.json 的不建索引（stocksUs、stocksTw 各一條）和這支測試的 BIG`));
});

T("最滿的文件（今天整天＋days 留滿）小於 1 MiB 的八成", () => {
  for (const mk of ["us", "tw"]) {
    const ids = mk === "us" ? G.US_IDS : G.TW_IDS, len = G.NUM.casino.stock[mk].len, keep = 5;
    const day = () => { const ser = {}; ids.forEach(id => { ser[id] = Array.from({ length: len + 1 }, (_, i) => 12345.67 + i / 100); }); return ser; };
    const doc = G.twDocNew("2026-11-25");
    doc.ser = day(); ids.forEach(id => { doc.R[id] = { px: 123.45, lag: 1 }; doc.A[id] = 12345.67; doc.prevReal[id] = 123.45; doc.lag[id] = 1; doc.stale[id] = 0; });
    for (let d = 0; d < keep; d++) doc.days["2026-11-" + (10 + d)] = { openIdx: 0, ser: day(), close: Object.fromEntries(ids.map(id => [id, 123.45])), prev: Object.fromEntries(ids.map(id => [id, 123.45])) };
    doc.log = Array.from({ length: 200 }, (_, j) => ({ j, idx: j, lag: 0.0166, stale: 0 }));
    const kb = Buffer.byteLength(JSON.stringify(doc)) / 1024;
    assert.ok(kb < 1024 * 0.8, `${mk} 最滿約 ${Math.round(kb)} KB，太接近 1 MiB：少留幾天 days，或把 ser 拆到別的文件`);
  }
});

console.log(`${pass} passed, ${fail} failed（行情文件的上限）`);
process.exit(fail ? 1 : 0);

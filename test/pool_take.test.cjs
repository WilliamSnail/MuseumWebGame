// 決定 0133：替佩佩取名（所有佩佩）、門檻那晚過去收走壹個名字（挑最新取名的；都沒取名收融合稱號那隻）、名牌背面的館友號碼、重新取名多小圓章、短信和收據。node test/pool_take.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-19", add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const mkP = () => ({ pepes: { a: { n: 1, s: 1 }, b: { n: 1, s: 2, title: "融合的" }, c: { n: 1, s: 3 }, d: { n: 1, s: 4, title: "更後面的" } } });
const mkH = (G, take = D0) => { const h = G.casHouseFix(G.casHouseNew(), D0).house; h.pool = { uid: "u1", base: 1e9, e: 0, lv: 0.6, day: null, hold: 0, night: null, hits: 0, last: null, trace: [], take }; return h; };
T("取名：去空白、最多 PEPE_NAME.max 字、擋空白／控制字元／不雅；沒這隻就不行；每次取名 nmSeq 加壹", G => {
  const M = G.PEPE_NAME.max, P = mkP();
  assert.strictEqual(G.pepeNameClean("  小  綠 ").name, "小 綠"); assert.ok(!G.pepeNameClean("   ").ok); assert.ok(!G.pepeNameClean("a".repeat(M + 1)).ok); assert.ok(G.pepeNameClean("a".repeat(M)).ok);
  assert.ok(!G.pepeNameClean("a​b").ok, "零寬空白"); assert.ok(!G.pepeNameClean("F u c k").ok, "夾空白也擋"); assert.ok(!G.pepeNameClean(5).ok);
  assert.ok(!G.pepeRename(P, "zz", "小綠").ok); const r1 = G.pepeRename(P, "a", "小綠"), r2 = G.pepeRename(P, "c", "小藍");
  assert.ok(r1.ok && !r1.stamp); assert.strictEqual(P.pepes.a.nm, "小綠"); assert.ok(P.pepes.c.nmSeq > P.pepes.a.nmSeq); assert.ok(!G.pepeRename(P, "a", "").ok); assert.strictEqual(P.pepes.a.nm, "小綠", "壞名字不改");
});
T("門檻那晚過去：隔天日報把 pool.take 標成那壹晚", G => {
  const h = G.casHouseFix(G.casHouseNew(), D0).house; h.pool = { uid: "u1", base: 1e9, e: 0, lv: 0.6, day: null, hold: 0, night: null, hits: 0, last: null, trace: [] };
  let d = 0; while (!h.pool.night) { d++; G.casPoolDay(h, add(D0, d), 1700000000); } const night = h.pool.night; assert.ok(!h.pool.take, "晚上還沒收");
  G.casPoolDay(h, add(D0, d + 1), 1800000000); assert.strictEqual(h.pool.take, night);
});
T("收走：挑玩家自己取過名、最新取的那隻；清空名字、記 tk（號碼、天、次數、沒有圓章）、pool.take 清掉；不動錢；短信和收據", G => {
  const h = mkH(G), P = mkP(); G.pepeRename(P, "a", "小綠"); G.pepeRename(P, "c", "小藍"); G.pepeRename(P, "a", "大綠"); // a 最新
  const b0 = h.bankroll, w0 = h.world, r = G.casPoolTake(h, P, "u1", 7, "2026-11-20");
  assert.strictEqual(r.key, "a"); assert.strictEqual(r.pepe, "大綠"); assert.strictEqual(P.pepes.a.nm, ""); assert.deepStrictEqual([P.pepes.a.tk.no, P.pepes.a.tk.day, P.pepes.a.tk.n, P.pepes.a.tk.stamp], [7, D0, 1, false]); assert.strictEqual(P.pepes.c.nm, "小藍", "別隻不動");
  assert.ok(!h.pool.take); assert.strictEqual(h.pool.took.key, "a"); assert.strictEqual(h.bankroll, b0); assert.strictEqual(h.world, w0);
  assert.strictEqual(r.mails.length, 2); const [l, rc] = r.mails; assert.strictEqual(l.mail.title, "水到門檻了"); assert.strictEqual(rc.mail.title, "收據"); assert.ok(l.mail.from === "文化部" && l.mail.note.includes("「大綠」") && l.mail.note.includes("007") && rc.mail.note.includes("持牌號碼：007"), l.mail.note);
  assert.ok(!/[{}]|[A-Za-z]/.test(l.mail.note + rc.mail.note), "沒有沒填的欄位、沒有英文字"); assert.ok(/^[A-Za-z0-9_-]+$/.test(l.id) && l.id !== rc.id); assert.ok(l.mail.expire > "2026-11-20"); assert.ok(!G.mailRow || G.mailRow(l.mail));
});
T("都沒取過名：收融合稱號那隻（title、還沒被收過、序號 s 最大）；沒有可收的：清掉待收、什麼都不動", G => {
  const h = mkH(G), P = mkP(), r = G.casPoolTake(h, P, "u1", 3, D0); assert.strictEqual(r.key, "d"); assert.strictEqual(r.pepe, "更後面的"); assert.strictEqual(P.pepes.d.title, "更後面的", "稱號留著"); assert.ok(P.pepes.d.tk && !P.pepes.d.nm);
  const h2 = mkH(G), P2 = { pepes: { a: { n: 1, s: 1 } } }; assert.strictEqual(G.casPoolTake(h2, P2, "u1", 3, D0), null); assert.ok(!h2.pool.take && h2.pool.took.none, "清掉待收"); assert.ok(!P2.pepes.a.tk);
  const h3 = mkH(G), P3 = mkP(); P3.pepes.d.tk = { no: 1 }; P3.pepes.b.tk = { no: 1 }; assert.strictEqual(G.casPoolTake(h3, P3, "u1", 3, D0), null, "被收過又沒重新取名的不再收");
});
T("條件不符就不收、待收留著：不是這位館友、沒有存檔、還沒有號碼、沒有待收、關掉", G => {
  const P = mkP();
  const h = mkH(G); assert.strictEqual(G.casPoolTake(h, P, "u2", 3, D0), null); assert.strictEqual(G.casPoolTake(h, null, "u1", 3, D0), null); assert.strictEqual(G.casPoolTake(h, P, "u1", null, D0), null); assert.strictEqual(h.pool.take, D0, "待收還在");
  const h2 = mkH(G, null); assert.strictEqual(G.casPoolTake(h2, P, "u1", 3, D0), null); assert.strictEqual(G.casPoolTake({}, P, "u1", 3, D0), null);
  G.NUM.casino.poolTake.on = false; assert.strictEqual(G.casPoolTake(mkH(G), P, "u1", 3, D0), null);
});
T("再收壹次：號碼還是第壹次那個、次數 2；重新取名才有小圓章；收到壹半被收過的那隻又取了名也能再收", G => {
  const h = mkH(G), P = mkP(); G.pepeRename(P, "a", "小綠"); G.casPoolTake(h, P, "u1", 7, D0);
  const r1 = G.pepeRename(P, "a", "新名字"); assert.ok(r1.stamp && P.pepes.a.tk.stamp && P.pepes.a.nm === "新名字");
  G.pepeRename(P, "c", "小藍"); G.pepeRename(P, "a", "更新"); h.pool.take = "2026-11-30"; const r = G.casPoolTake(h, P, "u1", 99, "2026-12-01");
  assert.strictEqual(r.key, "a"); assert.strictEqual(P.pepes.a.tk.no, 7); assert.strictEqual(P.pepes.a.tk.n, 2); assert.strictEqual(P.pepes.a.tk.stamp, false); assert.ok(r.mails[0].mail.note.includes("007"));
});
console.log(`${pass} passed, ${fail} failed（收走壹個名字）`);
process.exit(fail ? 1 : 0);

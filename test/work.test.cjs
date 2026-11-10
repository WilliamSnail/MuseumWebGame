// 欠款送參觀者去地下工作（決定 0064 第二部分）：node test/work.test.cjs（npm test 也會跑）
// 要送的時機、送現在這位會換人上場、沒人可換要先開新的、每天還 34%、理智 −5 最低 1、還清回來、花靈感補理智、換人擋住、舊存檔。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } finally { G.setRng(null); } };
const D = "2026-11-10";
const plus = (d, n) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
// 兩位參觀者都選好職業的存檔
function two(G) {
  G.setRng(() => 0.5);
  const P = G.newProfile("challenge"); P.job = G.JOBS[0].id; P.vname = "阿明"; P.sanity = 40;
  G.addVisitor(P, "阿華", 1); P.job = G.JOBS[1].id; P.sanity = 30; // 現在在場的是阿華
  return P;
}
const debtW = (G, chips) => { const w = G.casWalletFix(null, D); w.chips = chips; w.loan.debtSince = D; return w; };

T("籌碼是負的又沒人在工作，就要送；沒欠款不用送", G => {
  const w = G.casWalletFix(null, D);
  assert.strictEqual(G.casMustWork(w), false);
  w.chips = -1; assert.strictEqual(G.casMustWork(w), true);
  assert.strictEqual(G.casWalletView(w, D).mustWork, true);
  const P = two(G);
  assert.ok(!G.casWorkStart(G.casWalletFix(null, D), P, P.vid, D).ok, "沒欠款");
});

T("送不在場的那位：記在存檔和錢包；他不能上場；不用再送", G => {
  const P = two(G), w = debtW(G, -300000);
  const other = P.visitors[0];
  const r = G.casWorkStart(w, P, other.vid, D);
  assert.ok(r.ok, r.reason);
  assert.ok(other.work && other.work.since === D);
  assert.strictEqual(w.work.vid, other.vid); assert.strictEqual(w.work.base, 300000); assert.strictEqual(w.work.san, 40);
  assert.strictEqual(G.casMustWork(w), false);
  assert.strictEqual(G.switchVisitor(P, other.vid), false, "工作中不能上場");
  assert.ok(G.visitorSlots(P)[other.slot].work);
  assert.ok(!G.casWorkStart(w, P, P.vid, D).ok, "已經有人在工作");
});

T("送現在這位：換別人上場；只剩他壹位要先開新的（needNew）", G => {
  const P = two(G), w = debtW(G, -100000), cur = P.vid;
  const r = G.casWorkStart(w, P, cur, D);
  assert.ok(r.ok);
  assert.notStrictEqual(P.vid, cur, "換了別人");
  assert.ok(P.visitors.find(v => v.vid === cur).work);
  const P1 = G.newProfile("challenge"); P1.job = G.JOBS[0].id;
  const r1 = G.casWorkStart(debtW(G, -100), P1, P1.vid, D);
  assert.ok(!r1.ok && r1.needNew);
  assert.ok(!P1.visitors || !P1.visitors.length, "沒動存檔");
});

T("每天換日：還開工那天欠款的 payPct%，理智 −sanDay（最低 sanMin）；還清就停在 0", G => {
  const W = G.NUM.casino.work, P = two(G), w = debtW(G, -300000);
  G.casWorkStart(w, P, P.visitors[0].vid, D);
  const pay = Math.ceil(300000 * W.payPct / 100);
  G.casWalletFix(w, plus(D, 1));
  assert.strictEqual(w.chips, -300000 + pay);
  assert.strictEqual(w.work.san, 40 - W.sanDay);
  G.casWalletFix(w, plus(D, 1)); assert.strictEqual(w.chips, -300000 + pay, "同壹天不重算");
  G.casWalletFix(w, plus(D, 5)); // 隔好幾天才回來：照天數算，還清就停
  assert.strictEqual(w.chips, 0);
  assert.ok(G.casWorkView(w).done);
  w.work.san = 2; w.work.last = plus(D, 5); w.chips = -10;
  G.casWalletFix(w, plus(D, 9));
  assert.strictEqual(w.work.san, Math.max(W.sanMin, 2 - W.sanDay));
});

T("還清才回來：存檔拿掉記號、理智換成工作完的；還沒還清不回來", G => {
  const P = two(G), w = debtW(G, -1000);
  const v = P.visitors[0];
  G.casWorkStart(w, P, v.vid, D);
  assert.ok(!G.casWorkEnd(w, P).ok, "還欠著");
  w.chips = 5; w.work.san = 12;
  const r = G.casWorkEnd(w, P);
  assert.ok(r.ok && r.back);
  assert.strictEqual(v.work, undefined); assert.strictEqual(v.sanity, 12);
  assert.strictEqual(w.work, null);
  assert.ok(G.switchVisitor(P, v.vid), "可以上場了");
});

T("花靈感補理智：1 點 inspPerSan 靈感，最多補到下去前的；靈感不夠不行", G => {
  const W = G.NUM.casino.work, P = two(G), w = debtW(G, -1000);
  G.casWorkStart(w, P, P.visitors[0].vid, D);
  w.work.san = 30; P.insp = 3 * W.inspPerSan;
  assert.ok(!G.casWorkCheer(w, P, 5).ok, "靈感不夠");
  const r = G.casWorkCheer(w, P, 3);
  assert.ok(r.ok); assert.strictEqual(w.work.san, 33); assert.strictEqual(P.insp, 0);
  P.insp = 999;
  assert.strictEqual(G.casWorkCheer(w, P, 999).n, w.work.san0 - 33);
  assert.strictEqual(w.work.san, w.work.san0);
  assert.ok(!G.casWorkCheer(w, P, 1).ok, "補滿了");
});

T("舊錢包、舊存檔：沒有 work 補 null；壞掉的記號拿掉", G => {
  assert.strictEqual(G.casWalletFix({ chips: 5 }, D).work, null);
  assert.strictEqual(G.casWalletFix({ chips: -5, work: { base: "x" } }, D).work, null);
  const P = two(G); P.visitors[0].work = "壞的";
  G.fixVisitors(P, P);
  assert.strictEqual(P.visitors[0].work, undefined);
});

T("別的館友遇到他：打招呼理智 +helloSan、塞籌碼從自己出、留話；每種壹天壹次；回來時看得到留言", G => {
  const W = G.NUM.casino.work, P = two(G), w = debtW(G, -50000), me = G.casWalletFix(null, D);
  G.casWorkStart(w, P, P.visitors[0].vid, D);
  w.work.san = 20;
  const who = { uid: "u2", nick: "小華" };
  let r = G.casWorkMeet(me, w, "hello", null, D, who);
  assert.ok(r.ok); assert.strictEqual(w.work.san, 20 + W.helloSan);
  assert.ok(!G.casWorkMeet(me, w, "hello", null, D, who).ok, "壹天壹次");
  const c0 = me.chips;
  r = G.casWorkMeet(me, w, "give", null, D, who);
  assert.ok(r.ok); assert.strictEqual(me.chips, c0 - W.giveChips); assert.strictEqual(w.chips, -50000 + W.giveChips);
  r = G.casWorkMeet(me, w, "note", 1, D, who);
  assert.ok(r.ok);
  assert.ok(!G.casWorkMeet(me, w, "note", 99, plus(D, 1), who).ok, "沒有這句");
  assert.ok(G.casWorkMeet(me, w, "hello", null, plus(D, 1), who).ok, "隔天又可以");
  const pub = G.casWorkPublic(w, "小明");
  assert.deepStrictEqual(Object.keys(pub).sort(), ["job", "name", "owner", "san"]);
  w.chips = 0;
  assert.strictEqual(G.casWorkPublic(w, "小明"), null, "還清了就不公開");
  const end = G.casWorkEnd(w, P);
  assert.ok(end.lines.join("").includes(G.CAS_TEXT.meetNotes[1]) && end.lines.join("").includes("小華"));
  const poor = G.casWalletFix(null, D); poor.chips = 5;
  const w2 = debtW(G, -10); G.casWorkStart(w2, two(G), "v1", D);
  assert.ok(!G.casWorkMeet(poor, w2, "give", null, D, who).ok, "籌碼不夠");
});

console.log(`work.test：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);

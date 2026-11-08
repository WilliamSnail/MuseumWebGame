// 館內公佈欄（shared/notices.js）和信箱（shared/mailbox.js）：node test/notice.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const fresh = G => { const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08"); return P; };
const TODAY = "2026-11-08";

T("公告：照發布、下架日期出現；置頂的排第壹", G => {
  const P = fresh(G);
  const list = G.visibleNotices(P, TODAY);
  assert.ok(list.length >= 2);
  assert.strictEqual(list[0].id, "open4");
  assert.ok(list.some(n => n.weekly), "有本週特展");
  assert.strictEqual(G.visibleNotices(P, "2026-11-07").some(n => n.id === "open4"), false, "還沒發布的看不到");
  assert.strictEqual(G.visibleNotices(P, "2028-01-01").some(n => n.id === "open4"), false, "下架的看不到");
});
T("公告：本週特展跟著遊戲裡的週換", G => {
  const P = fresh(G);
  const a = G.weeklyNotice(P).id;
  G.ensureDay(P, G.addDays("2026-11-08", 7));
  assert.notStrictEqual(G.weeklyNotice(P).id, a);
});
T("已讀：點開才算；版本加壹又變成沒讀", G => {
  const save = {}; const st = G.noticeState(save);
  const n = { id: "x", v: 1, importance: "important" };
  assert.ok(G.isUnread(st, n));
  G.markRead(st, n); assert.ok(!G.isUnread(st, n));
  n.v = 2; assert.ok(G.isUnread(st, n));
});
T("火漆印：只有沒讀的重要公告才蓋；low 不算數量", G => {
  const st = G.noticeState({});
  const list = [{ id: "a", v: 1, importance: "low" }, { id: "b", v: 1, importance: "normal" }];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.boardBadge(st, list))), { seal: false, count: 1 });
  list.push({ id: "c", v: 1, importance: "important" });
  assert.strictEqual(G.boardBadge(st, list).seal, true);
  G.markAllRead(st, list);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.boardBadge(st, list))), { seal: false, count: 0 });
});
T("登入時：緊急的直接打開；勾了今天不再打開就不打開", G => {
  const st = G.noticeState({});
  const list = [{ id: "a", v: 1, importance: "normal" }];
  assert.strictEqual(G.autoOpenPlan(st, list, TODAY).open, true);
  G.skipToday(st, TODAY);
  assert.strictEqual(G.autoOpenPlan(st, list, TODAY).open, false);
  assert.strictEqual(G.autoOpenPlan(st, list, "2026-11-09").open, true, "隔天又會打開");
  list.push({ id: "u", v: 1, importance: "urgent" });
  assert.strictEqual(G.autoOpenPlan(st, list, TODAY).urgent.id, "u", "緊急的就算勾了也打開");
});
T("信箱：公告附的獎勵只寄壹次", G => {
  const P = fresh(G);
  const list = G.visibleNotices(P, TODAY);
  assert.strictEqual(G.syncMail(P, list, TODAY), 1);
  assert.strictEqual(G.syncMail(P, list, TODAY), 0);
  assert.strictEqual(G.unclaimedCount(P, TODAY), 1);
});
T("信箱：領取加靈感；領過不能再領；過期不能領", G => {
  const P = fresh(G); const before = P.insp;
  G.syncMail(P, G.visibleNotices(P, TODAY), TODAY);
  const r = G.claimMail(P, "gift-open4", TODAY);
  assert.ok(r.ok); assert.strictEqual(P.insp, before + 10);
  assert.strictEqual(G.claimMail(P, "gift-open4", TODAY).ok, false);
  G.sendMail(P, { id: "old", title: "舊的", gift: { insp: 5 }, days: 1 }, TODAY);
  assert.strictEqual(G.claimMail(P, "old", "2026-11-10").ok, false);
  G.pruneMail(P, "2026-11-10");
  assert.ok(!P.mail.some(m => m.id === "old"));
});
T("信箱：全部領取加起來；自由模式不加靈感", G => {
  const P = fresh(G);
  G.sendMail(P, { id: "a", title: "a", gift: { insp: 3 } }, TODAY);
  G.sendMail(P, { id: "b", title: "b", gift: { insp: 4, mood: 120 } }, TODAY);
  const t = G.claimAllMail(P, TODAY);
  assert.strictEqual(t.n, 2); assert.strictEqual(t.insp, 7); assert.ok(P.mood <= 99, "心情不超過 99");
  const F = G.newProfile("free"); G.ensureDay(F, TODAY);
  G.sendMail(F, { id: "a", title: "a", gift: { insp: 3 } }, TODAY);
  const fi = F.insp; assert.ok(G.claimMail(F, "a", TODAY).ok); assert.strictEqual(F.insp, fi);
});
T("信箱：還剩幾天、禮物寫成字", G => {
  assert.strictEqual(G.daysLeft({ expire: "2026-12-08" }, TODAY), 30);
  assert.strictEqual(G.giftText({ insp: 10, mood: 5 }), "靈感 +10、心情 +5");
});

console.log(`${pass} passed, ${fail} failed（公佈欄、信箱）`);
process.exit(fail ? 1 : 0);

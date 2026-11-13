// 館內公佈欄（shared/notices.js）和信箱（shared/mailbox.js）：node test/notice.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const fresh = G => { const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08"); return P; };
const TODAY = "2026-11-08";

T("公告：照發布、下架日期出現；有發布日的，新的排前面", G => {
  const P = fresh(G);
  const list = G.visibleNotices(P, TODAY);
  assert.ok(list.length >= 2);
  assert.strictEqual(list.filter(n => n.publish)[0].id, "open4", "11-08 當天最新的是開館");
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
T("公告排序：發布日新的在最上面（置頂的也不例外）；同壹天重要的在前", G => {
  const list = G.visibleNotices(fresh(G), "2026-11-12").filter(n => n.publish);
  assert.ok(list.some(n => n.pinned), "要有置頂的公告才測得到");
  const board = G.boardNotices(fresh(G), "2026-11-12").filter(n => n.publish);
  for (let i = 1; i < board.length; i++) assert.ok(board[i - 1].publish >= board[i].publish, "公佈欄上也是新的在前");
  const R = { urgent: 3, important: 2, normal: 1, low: 0 };
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    assert.ok(a.publish > b.publish || (a.publish === b.publish && R[a.importance] >= R[b.importance]), `${a.id} 應該排在 ${b.id} 前面`);
  }
});
T("同壹天的小更新合成壹則：重要的、置頂的不合；已讀照原本各則記，多壹項就再變沒讀", G => {
  const P = fresh(G), raw = G.visibleNotices(P, "2026-11-10"), list = G.boardNotices(P, "2026-11-10");
  const day = list.find(n => n.id === "day-2026-11-10");
  assert.ok(day && day.digest && day.parts.length >= 2);
  assert.ok(day.title.includes(`${day.parts.length} 項`));
  assert.ok(day.parts.every(x => x.publish === "2026-11-10" && x.importance !== "important" && !x.pinned && !x.gift));
  assert.ok(list.some(n => n.id === "discord-yuga") && list.some(n => n.id === "open4"), "重要、置頂的還是各自壹則");
  assert.ok(!list.some(n => day.parts.includes(n)), "合進去的不再單獨出現");
  assert.strictEqual(list.reduce((s, n) => s + (n.parts ? n.parts.length : 1), 0), raw.length, "壹則都沒少");
  const state = G.noticeState({});
  assert.ok(G.isUnread(state, day));
  day.parts.slice(1).forEach(x => G.markRead(state, x));
  assert.ok(G.isUnread(state, day), "還有壹項沒讀");
  G.markRead(state, day);
  assert.ok(!G.isUnread(state, day) && day.parts.every(x => !G.isUnread(state, x)));
  // 只有壹則的那天不合
  const one = G.digestNotices([day.parts[0]]);
  assert.strictEqual(one.length, 1); assert.ok(!one[0].digest);
});
T("同壹天合壹張：不看標籤（調整、修正、維護也合）；不同天分開；重要的不合；點開算全部讀過；數字照張數", G => {
  const mk = (id, publish, tags, importance, extra) => Object.assign({ id, v: 1, cat: "館方公告", tags, importance, title: id, publish, sections: [["x", ["y"]]] }, extra);
  const list = [
    mk("a", "2026-11-13", ["更新"], "normal"), mk("b", "2026-11-13", ["調整"], "normal"), mk("c", "2026-11-13", ["修正"], "low"),
    mk("d", "2026-11-13", ["維護"], "low"), mk("imp", "2026-11-13", ["重要"], "important"), mk("pin", "2026-11-13", ["更新"], "normal", { pinned: true }),
    mk("e", "2026-11-12", ["更新"], "low"), mk("f", "2026-11-12", ["調整"], "low"), mk("solo", "2026-11-11", ["修正"], "low"),
    { id: "act", v: 1, cat: "特展活動", tags: ["活動"], importance: "normal", publish: "2026-11-13", title: "act", sections: [] },
  ];
  const out = G.digestNotices(list), ids = out.map(n => n.id);
  const d13 = out.find(n => n.id === "day-2026-11-13"), d12 = out.find(n => n.id === "day-2026-11-12");
  assert.strictEqual(d13.parts.map(x => x.id).join(), "a,b,c,d", "11-13 的四則併成壹張，順序不變");
  assert.strictEqual(d12.parts.map(x => x.id).join(), "e,f", "不同天分開");
  assert.ok(ids.includes("imp") && ids.includes("pin") && ids.includes("act") && ids.includes("solo"), "重要、置頂、活動、單壹則的不併");
  assert.strictEqual(out.length, 6);
  const state = G.noticeState({});
  const b0 = G.boardBadge(state, out);
  assert.strictEqual(b0.count, 4, "d13、imp、pin、act 各算壹張（d12、solo 是 low 不算）");
  assert.ok(b0.seal);
  G.markRead(state, d13);
  assert.ok(["a", "b", "c", "d"].every(i => state.read[i] === 1), "點開合起來的，每則都記讀過");
  assert.strictEqual(G.boardBadge(state, out).count, 3);
  // 舊存檔：只有各則的讀過紀錄也能讀
  const old = G.noticeState({ notices: { read: { a: 1, b: 1, c: 1, d: 1 } } });
  assert.ok(!G.isUnread(old, d13));
  // 真資料：11-13 壹天只剩壹張合併卡
  const real = G.boardNotices(fresh(G), "2026-11-13").filter(n => n.publish === "2026-11-13");
  assert.strictEqual(real.filter(n => n.digest).length, 1);
  assert.ok(real.every(n => n.digest || n.pinned || n.importance === "important" || n.cat !== "館方公告"));
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

T("有新版本：比對 index.html 裡的程式檔名；拿不到檔名不算", G => {
  const html = n => `<script type="module" crossorigin src="/assets/index-${n}.js"></script><link rel="stylesheet" href="/assets/index-dj0VSzgV.css">`;
  const mine = G.buildScript(html("BELxAzoR"));
  assert.strictEqual(mine, "/assets/index-BELxAzoR.js");
  assert.strictEqual(G.buildChanged(html("BELxAzoR"), mine), false);
  assert.strictEqual(G.buildChanged(html("Xy_9-ab1"), mine), true);
  assert.strictEqual(G.buildChanged("<html>維護中</html>", mine), false);
  assert.strictEqual(G.buildChanged(html("Xy_9-ab1"), null), false, "開發時沒有檔名");
  assert.strictEqual(G.buildScript("/src/main.js"), null);
});

console.log(`${pass} passed, ${fail} failed（公佈欄、信箱）`);
process.exit(fail ? 1 : 0);

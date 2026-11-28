// 全館投票（決定 0162、0166；shared/story/vote.js）：時間窗、一人一票、改票一次、名字、平手、比例、統計守恆、規則擋讀
// node test/story/vote.test.cjs（npm test 也會跑）
const assert = require("assert"), fs = require("fs"), path = require("path");
const G = require("../load_shared.cjs").load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const C = G.NUM.story.vote, TM = G.voteTimes(C), HOUR = 3600000;
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b); // vm 裡的物件原型不同，轉一手再比
const mid = TM.opensAt + HOUR, lateAt = TM.closesAt - HOUR;
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
// 一個小帳本：照順序投很多票
function room() {
  let state = null; const ballots = {};
  return {
    vote(uid, choice, at, name) { const r = G.voteCast(state, ballots[uid], { choice, name }, at, C); if (r.ok && r.changed) { state = r.state; ballots[uid] = r.mine; } return r; },
    get state() { return G.voteState(state, C); }, ballots,
  };
}

T("時間照決定 0166（台灣時間）：12-12 05:00 開、12-15 23:59:59 截止、12-16 05:00 公布；三個選項、改一次", () => {
  const tw = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 19);
  eq([tw(TM.opensAt), tw(TM.closesAt), tw(TM.resultAt)], ["2026-12-12T05:00:00", "2026-12-15T23:59:59", "2026-12-16T05:00:00"]);
  eq(C.options, ["write", "blank", "return"]); assert.ok(C.options.every(id => G.VOTE_TEXT.options[id]) && C.options.includes(C.tieWinner) && C.options.includes(C.nameChoice));
});
T("階段：開投前 before、開投那一刻到截止那一刻 open、之後 counting、公布時間起 result", () => {
  assert.strictEqual(G.votePhase(TM.opensAt - 1, C), "before"); assert.strictEqual(G.votePhase(TM.opensAt, C), "open"); assert.strictEqual(G.votePhase(TM.closesAt, C), "open");
  assert.strictEqual(G.votePhase(TM.closesAt + 1, C), "counting"); assert.strictEqual(G.votePhase(TM.resultAt - 1, C), "counting"); assert.strictEqual(G.votePhase(TM.resultAt, C), "result");
});
T("時間窗外投不了；不認得的選項擋掉", () => {
  assert.strictEqual(G.voteCast(null, null, { choice: "blank" }, TM.opensAt - 1, C).why, "before");
  assert.strictEqual(G.voteCast(null, null, { choice: "blank" }, TM.closesAt + 1, C).why, "closed");
  assert.strictEqual(G.voteCast(null, null, { choice: "blank" }, TM.resultAt + 1, C).why, "closed");
  for (const c of ["x", "", null, "__proto__", "constructor"]) assert.strictEqual(G.voteCast(null, null, { choice: c }, mid, C).why, "badChoice");
  assert.strictEqual(G.voteCast(null, null, null, mid, C).why, "badChoice");
});
T("一人一票：同樣的再送一次不加票、不算改票；改一次可以、第二次擋；票數跟投的人數一樣多", () => {
  const R = room(); assert.ok(R.vote("a", "blank", mid).changed);
  const again = R.vote("a", "blank", mid + 1); assert.ok(again.ok && !again.changed); assert.strictEqual(sum(R.state.counts), 1); assert.strictEqual(R.ballots.a.changes, 0);
  assert.ok(R.vote("a", "return", mid + 2).changed); eq(R.state.counts, { write: 0, blank: 0, return: 1 });
  const no = R.vote("a", "blank", mid + 3); assert.strictEqual(no.why, "noChange"); assert.ok(no.reason.includes(String(C.changes))); eq(R.state.counts, { write: 0, blank: 0, return: 1 });
  assert.ok(R.vote("a", "return", mid + 4).ok, "改完再送同樣的還是 ok");
});
T("傳進來的東西不會被改到", () => {
  const s = { counts: { write: 0, blank: 1, return: 0 }, late: { write: 0, blank: 0, return: 0 } }, m = { choice: "blank", name: "", at: mid, changes: 0, late: false };
  const before = JSON.stringify([s, m]); G.voteCast(s, m, { choice: "return" }, mid + 1, C); assert.strictEqual(JSON.stringify([s, m]), before);
});
T("名字：寫下名字才要；看不見的字拿掉、去頭尾；空的、超過 12 字、禁字、< > 擋掉；別的選項不存名字", () => {
  assert.strictEqual(G.voteCast(null, null, { choice: "write" }, mid, C).why, "noName");
  assert.strictEqual(G.voteCast(null, null, { choice: "write", name: "  " + String.fromCharCode(0x200b) + " " }, mid, C).why, "noName");
  const ok = G.voteCast(null, null, { choice: "write", name: " 阿" + String.fromCharCode(0x202e) + "福  先生 " }, mid, C); assert.strictEqual(ok.mine.name, "阿福 先生");
  assert.ok(G.voteName("一二三四五六七八九十甲乙", C).ok); assert.strictEqual(G.voteName("一二三四五六七八九十甲乙丙", C).why, "longName");
  assert.ok(G.voteName("😀".repeat(C.nameMax), C).ok, "表情符號算一個字");
  for (const bad of ["幹你", "F u c k", "<b>"]) assert.strictEqual(G.voteName(bad, C).why, "badName", bad);
  assert.strictEqual(G.voteName(123, C).why, "noName");
  assert.strictEqual(G.voteCast(null, null, { choice: "blank", name: "阿福" }, mid, C).mine.name, "");
});
T("改名字也算改票（票數不變）", () => {
  const R = room(); R.vote("a", "write", mid, "甲"); const r = R.vote("a", "write", mid + 1, "乙"); assert.ok(r.changed); assert.strictEqual(r.mine.changes, 1);
  eq(R.state.counts, { write: 1, blank: 0, return: 0 }); assert.strictEqual(R.vote("a", "write", mid + 2, "丙").why, "noChange");
});
T("最後 24 小時另外記：早投晚改要搬過去；晚投只改名字不重算時間；統計守恆", () => {
  const R = room(); R.vote("a", "blank", mid); R.vote("b", "return", lateAt); R.vote("c", "write", mid, "甲");
  R.vote("a", "return", lateAt); eq(R.state.counts, { write: 1, blank: 0, return: 2 }); eq(R.state.late, { write: 0, blank: 0, return: 2 });
  R.vote("b", "blank", lateAt + 1); eq(R.state.late, { write: 0, blank: 1, return: 1 });
  R.vote("c", "write", lateAt + 2, "乙"); assert.strictEqual(R.state.late.write, 0);
  assert.strictEqual(sum(R.state.counts), 3); assert.strictEqual(G.voteCast(null, null, { choice: "blank" }, TM.closesAt - C.tieLateHours * HOUR, C).mine.late, false);
});
T("亂投很多次：票數永遠等於投過的人數，late 不超過 counts、不是負的", () => {
  const R = room(); let x = 7; const rnd = n => { x = (x * 48271) % 2147483647; return x % n; };
  for (let i = 0; i < 800; i++) R.vote("u" + rnd(40), C.options[rnd(3)], TM.opensAt + rnd(TM.closesAt - TM.opensAt), "名" + rnd(3));
  const s = R.state; assert.strictEqual(sum(s.counts), Object.keys(R.ballots).length);
  for (const id of C.options) { assert.strictEqual(s.counts[id], Object.values(R.ballots).filter(m => m.choice === id).length); assert.strictEqual(s.late[id], Object.values(R.ballots).filter(m => m.choice === id && m.late).length); }
});
T("多數和平手：多的贏；平手看最後 24 小時；還平、沒人投＝不寫", () => {
  const W = (c, l) => G.voteWinner({ counts: c, late: l || {} }, C);
  assert.strictEqual(W({ write: 3, blank: 2, return: 1 }), "write");
  assert.strictEqual(W({ write: 3, blank: 1, return: 3 }, { write: 0, blank: 0, return: 1 }), "return");
  assert.strictEqual(W({ write: 3, blank: 1, return: 3 }, { write: 1, blank: 1, return: 1 }), "blank");
  assert.strictEqual(W({ write: 2, blank: 2, return: 2 }), "blank"); assert.strictEqual(W({}), "blank");
  assert.strictEqual(W({ write: 3, blank: 3, return: 1 }, { write: 2, blank: 0 }), "write", "平手但最後幾小時比較多的贏，就算另一邊是不寫");
});
T("比例：5 的倍數、加起來 100、沒人投全 0", () => {
  eq(G.voteShare({ write: 1, blank: 1, return: 1 }, C), { write: 35, blank: 35, return: 30 });
  eq(G.voteShare({}, C), { write: 0, blank: 0, return: 0 });
  eq(G.voteShare({ blank: 9 }, C), { write: 0, blank: 100, return: 0 });
  for (let a = 0; a < 13; a++) for (let b = 0; b < 13; b++) for (let c = 0; c < 13; c++) { if (!a && !b && !c) continue; const s = G.voteShare({ write: a, blank: b, return: c }, C); assert.ok(sum(s) === 100 && Object.values(s).every(v => v % C.shareStep === 0 && v >= 0), `${a} ${b} ${c}`); }
});
T("結算：公布時間前不算、到了算一次、算過不重算；館史沒有名字和票數", () => {
  const R = room(); R.vote("a", "write", mid, "秘密名字"); R.vote("b", "write", mid, "另一個");
  assert.ok(!G.voteSettle(R.state, TM.closesAt, C).settled); assert.ok(!G.voteSettle(R.state, TM.resultAt - 1, C).settled);
  const s = G.voteSettle(R.state, TM.resultAt, C); assert.ok(s.settled); eq(s.state.result, { winner: "write", share: { write: 100, blank: 0, return: 0 }, at: TM.resultAt });
  assert.ok(!G.voteSettle(s.state, TM.resultAt + 1, C).settled);
  const h = G.voteHistory(s.state.result, C), str = JSON.stringify(h);
  assert.ok(h.id === C.id && h.at === TM.resultAt && h.text === G.VOTE_TEXT.history.text.write && C.options.every(id => G.VOTE_TEXT.history.text[id].includes(G.VOTE_TEXT.options[id])) && !str.includes("秘密") && !str.includes("counts"));
  assert.strictEqual(G.voteHistory(null, C), null);
});
T("給畫面的包：公布前沒有任何票數、比例、結果；只有自己的票和還能改幾次", () => {
  const R = room(); R.vote("a", "write", mid, "甲"); R.vote("b", "blank", mid);
  for (const t of [mid, TM.closesAt + 1]) { const v = G.voteView(R.state, R.ballots.a, t, [], C), str = JSON.stringify(v); assert.strictEqual(v.result, null); assert.ok(!str.includes("counts") && !str.includes("share") && !str.includes("late"), str); }
  const v = G.voteView(R.state, R.ballots.a, mid, [], C); eq(v.mine, { choice: "write", name: "甲", at: mid }); assert.strictEqual(v.changesLeft, 1); assert.strictEqual(G.voteView(null, null, mid, null, C).mine, null);
  const done = G.voteSettle(R.state, TM.resultAt, C).state, w = G.voteView(done, null, TM.resultAt, [], C); eq(Object.keys(w.result), ["winner", "share"]);
});
T("伺服器和規則：函式有匯出、投票和館史的路徑 firestore.rules 沒開（走最下面的一律不准）、正式環境不吃 testNow", () => {
  const rd = f => fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8");
  assert.ok(rd("functions/index.js").includes("export { storyVote }"));
  const rules = rd("firestore.rules"); assert.ok(!rules.includes("storyVotes") && !rules.includes("houseHistory") && rules.includes("match /{document=**}"));
  assert.ok(rd("functions/game/vote.js").includes("EMULATOR && Number.isFinite(d.testNow)"));
});
// ---- 內容分版 ----
const OPTS = C.options;
const three = (base, extra = {}) => OPTS.map(vote => Object.assign({ id: `${base}-${vote}`, vote }, extra));
const variantDay = () => ({ date: "2026-12-16", board: "公佈欄。", voteBoard: { write: "寫了。", blank: "沒寫。", return: "還了。" },
  books: [{ id: "n1", title: "中性" }].concat(three("end", { title: "結局", clue: "c-end" })),
  show: { works: [{ id: "w0" }].concat(three("w")) }, adds: [], understand: three("u-end", { text: "字", need: ["c-end"] }) });
T("voteDay：沒結果時分版的全部不給（不預設不寫）；有結果只留勝方、拿掉 vote；公佈欄接勝方那句；原本的檔沒被改", () => {
  const d = variantDay(), before = JSON.stringify(d);
  const none = G.voteDay(d, null); eq(none.books.map(b => b.id), ["n1"]); eq(none.show.works.map(w => w.id), ["w0"]); eq(none.understand, []); assert.strictEqual(none.board, "公佈欄。"); assert.ok(!("voteBoard" in none));
  const w = G.voteDay(d, "return"); eq(w.books.map(b => b.id), ["n1", "end-return"]); eq(w.show.works.map(x => x.id), ["w0", "w-return"]); assert.strictEqual(w.board, "公佈欄。還了。"); assert.ok(!JSON.stringify(w).includes("\"vote"));
  assert.strictEqual(JSON.stringify(d), before);
  const plain = { books: [{ id: "a" }], board: "x" }; assert.strictEqual(G.voteDay(plain, "write"), plain);
});
T("storyLibrary 帶勝方：整週內容和線索目錄只看得到那一版", () => {
  const files = { "2026-W51/week.json": { title: "週" }, "2026-W51/d3.json": variantDay() };
  const books = vote => G.storyWeekAt(G.storyLibrary(files, vote), "2026-W51", "2026-12-16").books.map(b => b.id);
  eq(books(), ["2026-W51/n1"]); eq(books("write"), ["2026-W51/n1", "2026-W51/end-write"]);
  const clues = vote => G.clueCatalog(G.storyLibrary(files, vote), "2026-12-16").sources.map(s => s.sid);
  eq(clues(), []); eq(clues("blank"), ["2026-W51/end-blank"]);
});
const V = require("../../tools/content/vote_check.cjs");
const shape = day => V.voteShape({ "2026-W51/d3.json": day }, G);
T("分版檢查：寫齊的過；少壹版、id 重複、線索不同、公佈欄缺句、特展沒有中性畫、放錯地方、公布前的日子、備用週都擋", () => {
  eq(shape(variantDay()), { has: true, errors: [] }); eq(V.voteShape({ "2026-W48/d1.json": { books: [] } }, G), { has: false, errors: [] });
  const bad = (mut, word) => { const d = variantDay(); mut(d); const e = shape(d).errors; assert.ok(e.some(x => x.includes(word)), word + " → " + JSON.stringify(e)); };
  bad(d => d.books.pop(), "三版要齊全"); bad(d => { d.books[1].id = d.books[2].id; }, "重複"); bad(d => { d.books[1].clue = "c-other"; }, "同壹個 clue");
  bad(d => { delete d.voteBoard.blank; }, "三句都要有字"); bad(d => d.show.works.shift(), "不分版的畫"); bad(d => { d.daily = [{ id: "t", vote: "write" }]; }, "不能寫在這裡");
  bad(d => { d.books[1].vote = "maybe"; }, "只能是"); bad(d => { d.weeklyWords = [{ vote: "write" }]; }, "不能寫在這裡");
  assert.ok(V.voteShape({ "2026-W51/d2.json": variantDay() }, G).errors.some(x => x.includes("公布日")));
  assert.ok(V.voteShape({ "備用/常青/d1.json": variantDay() }, G).errors.some(x => x.includes("正式週")));
});
T("week_check：有分版時三個結果各跑壹遍，錯誤併起來；只有某版有的標出來；沒有分版的跟以前壹樣", () => {
  const m = V.voteMerge(OPTS.map(vote => ({ vote, result: { errors: ["共同"].concat(vote === "write" ? ["只有寫"] : []) } })), "errors");
  eq(m, ["共同", "（投票結果 write 的版本）只有寫"]);
  const WC = require("../../tools/content/week_check.cjs"), { files, bad } = WC.readWeeks();
  const base = WC.checkContent({ files, bad, today: "2026-11-28" });
  const label = Object.keys(files).filter(k => /^2026-W4[0-9]\/d1[.]json$/.test(k)).pop();
  const changed = Object.assign({}, files, { [label]: Object.assign({}, files[label], { voteBoard: { write: "甲。", blank: "乙。", return: "丙。" } }) });
  const r = WC.checkContent({ files: changed, bad, today: "2026-11-28" });
  assert.ok(r.errors.some(x => x.includes("公布日"))); assert.ok(r.errors.length >= base.errors.length && r.lib.weeks);
});
console.log(fail ? `全館投票：${fail} 項沒過` : `全館投票：${pass} 項都過`); process.exit(fail ? 1 : 0);

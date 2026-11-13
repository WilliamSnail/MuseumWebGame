// 招領（shared/lostfound.js，翊文 11-13）：node test/lostfound.test.cjs（npm test 也會跑）
// 理智歸零的參觀者做成招領單、只公開該公開的、幾天內遇得到、自己的遇不到、送回去壹次、送的人和原本的館友拿到什麼、舊存檔。數字讀 NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } finally { G.setRng(null); } };
const D = "2026-11-13";
// 壹份存檔：第 1 位參觀者在 B3 理智歸零（D 那天），第 2 位退休（不是理智歸零）
function saveOf(G, d = D) {
  G.setRng(() => 0.5);
  const P = G.newProfile("challenge"); P.job = G.JOBS[0].id; P.vname = "阿明";
  P.visit = Object.assign({}, P.visit, { where: "cellar:3:b3x", made: 12 });
  const rec = Object.assign(G.visitorRecord(P, "russia8"), { d });
  const other = Object.assign(G.visitorRecord(P, "retire"), { n: 99, d });
  P.history = [rec, other];
  const S = G.newSave(); S.profiles.challenge = P;
  return { S, P, rec };
}

T("理智歸零的做成招領單；退休的不算；只放暱稱、名字、職業、層、做了幾隻、日期", G => {
  const { S, rec } = saveOf(G);
  const cards = G.lostCards(S, "u1", "Jerry", D);
  assert.strictEqual(cards.length, 1);
  const c = cards[0];
  assert.strictEqual(c.id, `u1_${rec.n}`);
  assert.deepStrictEqual(Object.keys(c).sort(), ["d", "floor", "id", "job", "made", "n", "name", "owner", "ownerNick"].sort());
  assert.strictEqual(c.ownerNick, "Jerry"); assert.strictEqual(c.name, "阿明"); assert.strictEqual(c.floor, 3); assert.strictEqual(c.made, 12);
  assert.ok(c.job && c.job.length > 0, "職業寫名字");
  assert.ok(G.lostSeeText(c).includes("Jerry") && G.lostSeeText(c).includes("阿明"));
  assert.ok(G.lostRecordText(c).includes("B3") && G.lostRecordText(c).includes("12"));
});

T("只放最近 NUM.lost.days 天的；沒有存檔、沒有 history 不會壞", G => {
  const days = G.NUM.lost.days;
  const old = saveOf(G, G.addDays(D, -days)).S, edge = saveOf(G, G.addDays(D, -(days - 1))).S;
  assert.strictEqual(G.lostCards(old, "u1", "J", D).length, 0, "太舊");
  assert.strictEqual(G.lostCards(edge, "u1", "J", D).length, 1, "剛好第 days 天還在");
  assert.strictEqual(G.lostCards(null, "u1", "J", D).length, 0);
  const S = G.newSave(); S.profiles.challenge = G.newProfile("challenge"); S.profiles.challenge.history = null;
  assert.strictEqual(G.lostCards(S, "u1", "J", D).length, 0);
});

T("遇得到的：不是自己的、還沒送回去、還沒看過、還在期限內", G => {
  const c = G.lostCards(saveOf(G).S, "u1", "Jerry", D)[0];
  assert.ok(G.lostOpen(c, "u2", D, {}));
  assert.ok(!G.lostOpen(c, "u1", D, {}), "自己的");
  assert.ok(!G.lostOpen(Object.assign({}, c, { back: "小華" }), "u2", D, {}), "送回去了");
  assert.ok(!G.lostOpen(c, "u2", D, { [c.id]: D }), "看過了");
  assert.ok(!G.lostOpen(c, "u2", G.addDays(D, G.NUM.lost.days), {}), "過期");
  const P = G.newProfile("challenge"); delete P.lostSeen;
  assert.ok(G.lostMarkSeen(P, c.id, D) && P.lostSeen[c.id] === D, "舊存檔沒有 lostSeen 會補");
  assert.ok(!G.lostMarkSeen(P, c.id, D), "記過就不再記");
});

T("送到招領處：送的人 +靈感、記成看過；原本的館友收到壹封信、心情 +ownerMood；不能送自己的、送過的", G => {
  const c = G.lostCards(saveOf(G).S, "u1", "Jerry", D)[0], L = G.NUM.lost;
  const me = G.newProfile("challenge"); me.job = G.JOBS[1].id; const i0 = me.insp;
  const r = G.lostReturnStep({ card: c, me: { uid: "u2", nick: "小華" }, finderP: me, today: D, mailDays: G.MAIL_DAYS });
  assert.ok(r.ok);
  assert.strictEqual(me.insp, i0 + L.finderInsp); assert.strictEqual(r.insp, L.finderInsp);
  assert.ok(me.lostSeen[c.id]);
  assert.strictEqual(r.mail.gift.mood, L.ownerMood); assert.strictEqual(r.mail.gift.insp, 0);
  assert.ok(r.mail.note.includes("小華") && r.mail.note.includes("阿明"));
  assert.ok(G.mailRow(r.mail), "信的格式跟館友送的壹樣");
  assert.ok(!G.lostReturnStep({ card: c, me: { uid: "u1", nick: "Jerry" }, finderP: me, today: D }).ok, "自己的");
  assert.ok(!G.lostReturnStep({ card: Object.assign({}, c, { back: "小華" }), me: { uid: "u3", nick: "小美" }, finderP: me, today: D }).ok, "送過了");
  const free = G.newProfile("free");
  assert.strictEqual(G.lostReturnStep({ card: c, me: { uid: "u3", nick: "小美" }, finderP: free, today: D }).insp, 0, "自由模式不給靈感");
});

T("畫面上的字用壹不用一", G => {
  Object.values(G.LOST_TEXT).forEach(s => assert.ok(!String(s).includes("一"), s));
});

console.log(`招領：${pass} 過，${fail} 沒過`);
if (fail) process.exit(1);

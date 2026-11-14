// 參觀館友的展廳、送佩佩、伺服器的信：Functions 每一步要做的事（shared/visit.js，多人版 M2）：node test/visit.test.cjs（npm test 也會跑）
// functions/visit.js 只讀資料庫、叫這裡的 step…、把結果在同一個交易裡寫回去，所以這裡測「讀到什麼 → 要寫什麼」。
// 真的跟資料庫一起跑要開模擬器（維護日誌寫了怎麼測的）。
// 數字一律讀 SOCIAL、NUM；從 vm 拿出來的物件要先過 JSON 才能比（見 docs/架構.md 第 6 節）。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const J = x => JSON.parse(JSON.stringify(x));
const DAY = "2026-11-09", NEXT = "2026-11-10";
const A = { uid: "ua", nick: "小明" }, B = { uid: "ub", nick: "小華" };
const OPEN = () => ({ open: true, slots: [], score: 0, theme: null, deco: null, frame: null });
function saveWith(fn) {
  const s = G.newSave();
  const P = s.profiles.challenge = G.newProfile("challenge");
  G.ensureDay(P, DAY);
  if (fn) fn(P);
  return s;
}
const keyOf = (o = {}) => G.pepeKey(Object.assign({}, G.DEFAULT_PICK, o));
const colors = () => G.allOpts("顏色");
const visit = (book, me, today, at, more = {}) => G.stepVisitHall(Object.assign({ view: OPEN(), book, me, owner: "owner", today, at }, more));
const act = (book, me, kind, text, today = DAY, at = 2000, open = true) => G.stepHallAct({ open, book, kind, text, me, owner: "owner", today, at });

// ---------- 展廳給別人看的部分 ----------
T("展廳：給別人的只有展台、分數、主題、裝飾，不漏靈感、理智、信、收藏", () => {
  const k = keyOf();
  const s = saveWith(P => {
    P.pepes[k] = { n: 3, perfect: true, s: 1, d: DAY, title: "小綠" };
    P.hall[0] = { kind: "pepe", key: k };
    P.insp = 987654; P.sanity = 43;
    P.mail = [{ id: "m1", title: "祕密的信", gift: {}, sent: DAY, expire: NEXT, claimed: false }];
    P.limited = { got: {}, wear: { stand: "stand-velvet", frame: "frame-vine" } };
  });
  s.email = "someone@example.com";
  const v = J(G.cleanHallView(G.hallView(s)));
  assert.deepStrictEqual(Object.keys(v).sort(), ["art", "deco", "frame", "open", "posters", "report", "score", "slots", "souvenirs", "theme", "title"]);
  assert.deepStrictEqual(v.slots[0], { kind: "pepe", key: k, perfect: true, title: "小綠" });
  assert.strictEqual(v.deco, "stand-velvet");
  assert.strictEqual(v.frame, "frame-vine");
  const txt = JSON.stringify(v);
  for (const leak of ["987654", "祕密的信", "example.com", "sanity", "\"n\":"]) assert.ok(!txt.includes(leak), "不該有 " + leak);
});
T("展廳：別人存檔裡亂寫的東西不能相信（壞的 key、抱枕、裝飾、分數都擋）", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const v = J(G.cleanHallView({ open: true, score: 99999, theme: null, deco: evil, frame: "stand-velvet",
    slots: [{ kind: "pepe", key: evil }, { kind: "pillow", key: `${evil}|棉布|軟綿綿` }, { kind: "pillow", key: `標準|棉布|軟綿綿|p:${evil}` }, { kind: "hack", key: keyOf() }, null, "字串"] }));
  assert.deepStrictEqual(v.slots, [null, null, null, null, null, null]);
  assert.strictEqual(v.deco, null);
  assert.strictEqual(v.frame, null, "裝飾的位置不對也不行");
  assert.strictEqual(v.score, 100);
  assert.ok(!JSON.stringify(v).includes("onerror"));
});
T("展廳：抱枕、失敗作、修復品照樣看得到；名字太長截斷；展台太多只給上限", () => {
  const k = keyOf();
  const pillow = `標準|棉布|軟綿綿|p:${k}`;
  const many = Array.from({ length: G.NUM.guest.slotsMax + 5 }, () => ({ kind: "failed", key: k }));
  const v = J(G.cleanHallView({ open: true, score: 10, slots: [{ kind: "pillow", key: pillow, printPerfect: true }, { kind: "repaired", key: k }, { kind: "pepe", key: k, title: "名".repeat(99) }].concat(many) }));
  assert.strictEqual(v.slots.length, G.NUM.guest.slotsMax);
  assert.deepStrictEqual(v.slots[0], { kind: "pillow", key: pillow, perfect: false, title: null, printPerfect: true });
  assert.strictEqual(v.slots[1].kind, "repaired");
  assert.strictEqual([...v.slots[2].title].length, 40);
  assert.strictEqual(v.slots[3].kind, "failed");
});
T("展廳：還沒開館（自由模式、沒存檔）什麼都不記、不寄", () => {
  assert.deepStrictEqual(J(G.cleanHallView(G.hallView(null))), { open: false });
  const r = G.stepVisitHall({ view: { open: false }, book: null, me: A, owner: "owner", today: DAY, at: 1 });
  assert.ok(r.ok && !r.open);
  assert.strictEqual(r.book, null);
  assert.strictEqual(r.mail, null);
});

// ---------- 來訪的靈感 ----------
T("來訪：今天第一次來記一筆、寄一封 +2 的信；同一天再來不再給", () => {
  const S = G.SOCIAL;
  const r = visit(null, A, DAY, 1000);
  assert.ok(r.ok && r.first);
  assert.strictEqual(r.gain, S.visitInsp);
  assert.strictEqual(r.mail.gift.insp, S.visitInsp);
  assert.strictEqual(r.mail.id, G.visitMailId("ua", DAY));
  assert.ok(r.mail.title.includes("小明"));
  assert.strictEqual(r.mail.expire, G.dayPlus(DAY, S.mailDays));
  assert.strictEqual(J(r.book).log.length, 1);
  const again = visit(J(r.book), A, DAY, 2000);
  assert.strictEqual(again.first, false);
  assert.strictEqual(again.gain, 0);
  assert.strictEqual(again.mail, null);
  assert.strictEqual(again.book, null, "沒有改就不用寫");
});
T("來訪：一天最多給 visitInspMax 次；第 6 位照樣記，但不寄信；換日重新算", () => {
  const S = G.SOCIAL;
  let book = null, paid = 0;
  for (let i = 0; i < S.visitInspMax + 2; i++) {
    const r = visit(book, { uid: "u" + i, nick: "館友" + i }, DAY, 1000 + i);
    if (r.mail) paid++;
    book = J(r.book);
  }
  assert.strictEqual(paid, S.visitInspMax);
  assert.strictEqual(book.log.length, S.visitInspMax + 2, "都有記");
  assert.strictEqual(G.guestPaidToday(G.fixGuestBook(book), DAY), S.visitInspMax);
  const tomorrow = visit(book, { uid: "u0", nick: "館友0" }, NEXT, 9000);
  assert.ok(tomorrow.first, "隔天又是第一次");
  assert.strictEqual(tomorrow.gain, S.visitInsp);
});
T("來訪：不能參觀自己的", () => {
  assert.strictEqual(G.stepVisitHall({ view: OPEN(), book: null, me: A, owner: "ua", today: DAY, at: 1 }).ok, false);
});
T("訪客簿：超過上限丟舊的，今天的不會被擠掉（上限要算今天的）", () => {
  const max = G.NUM.guest.logMax;
  const old = Array.from({ length: max }, (_, i) => ({ uid: "old" + i, nick: "舊", day: "2026-11-01", at: 100 + i, like: false, note: null, paid: true }));
  let book = { log: old, likes: 0, seenAt: 0 };
  for (let i = 0; i < 3; i++) book = J(visit(book, { uid: "n" + i, nick: "新" + i }, DAY, 5000 + i).book);
  assert.strictEqual(book.log.length, max);
  assert.strictEqual(book.log.filter(x => x.day === DAY).length, 3);
  assert.strictEqual(book.log[0].uid, "n2", "最新的在前面");
});

// ---------- 按讚、留言 ----------
T("按讚：每天每間一次；隔天可以再按；累計讚數", () => {
  const b0 = J(visit(null, A, DAY, 1000).book);
  const r = act(b0, A, "like");
  assert.ok(r.ok && r.likes === 1 && r.mine.liked);
  assert.strictEqual(r.first, false, "已經走進來過了，不再算一次來訪");
  assert.strictEqual(r.mail, null);
  const b1 = J(r.book);
  const again = act(b1, A, "like");
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.code, "already");
  const next = act(b1, A, "like", null, NEXT, 3000);
  assert.ok(next.ok);
  assert.strictEqual(next.likes, 2);
  const other = act(b1, B, "like");
  assert.ok(other.ok && other.likes === 2, "別人也可以按");
});
T("留言：清乾淨、50 字、每天每間一次；看不見的字、太長都擋，擋了什麼都沒寫", () => {
  const b0 = J(visit(null, A, DAY, 1000).book);
  assert.strictEqual(act(b0, A, "note", "佩".repeat(G.SOCIAL.noteMax + 1)).code, "too_long");
  assert.strictEqual(act(b0, A, "note", "好​看").code, "invisible");
  assert.strictEqual(act(b0, A, "note", "   ").code, "empty");
  const r = act(b0, A, "note", "  好可愛\n的展廳 ");
  assert.ok(r.ok);
  assert.strictEqual(r.text, "好可愛 的展廳");
  assert.strictEqual(r.mine.noted, "好可愛 的展廳");
  assert.deepStrictEqual(J(r.notes), [{ nick: "小明", text: "好可愛 的展廳", day: DAY }]);
  assert.strictEqual(act(J(r.book), A, "note", "再一句").code, "already");
  assert.ok(act(J(r.book), A, "note", "隔天再一句", NEXT, 5000).ok);
  assert.ok(act(J(r.book), A, "like").ok, "留了話還可以按讚");
});
T("按讚、留言：自己的不行、沒開館不行、不認得的動作不行", () => {
  assert.strictEqual(G.stepHallAct({ open: true, book: null, kind: "like", me: A, owner: "ua", today: DAY, at: 1 }).code, "self");
  assert.strictEqual(act(null, A, "like", null, DAY, 1, false).code, "not_open");
  assert.strictEqual(act(null, A, "hack").ok, false);
});
T("按讚：過了 05:00 才按（今天還沒走進來）：順便算一次來訪，只給一次", () => {
  const b0 = J(visit(null, A, DAY, 1000).book);
  const r = act(b0, A, "like", null, NEXT, 9000);
  assert.ok(r.ok && r.first);
  assert.strictEqual(r.gain, G.SOCIAL.visitInsp);
  assert.ok(r.mail);
  const again = visit(J(r.book), A, NEXT, 9500);
  assert.strictEqual(again.gain, 0);
});
T("主人看得到：誰來過、按讚、留了什麼話、哪些是新的；看過就不算新的；不給 uid", () => {
  let b = J(visit(null, A, DAY, 1000).book);
  b = J(act(b, A, "note", "好看", DAY, 1100).book);
  b = J(visit(b, B, DAY, 1200).book);
  b = J(act(b, B, "like", null, DAY, 1300).book);
  const n = J(G.guestNews(b));
  assert.strictEqual(n.unseen, 2);
  assert.strictEqual(n.likes, 1);
  assert.deepStrictEqual(n.list.map(x => [x.nick, x.like, x.note, x.fresh]), [["小華", true, null, true], ["小明", false, "好看", true]]);
  assert.ok(!JSON.stringify(n).includes("ua"), "不給 uid");
  b.seenAt = 1250;
  const after = J(G.guestNews(b));
  assert.strictEqual(after.unseen, 1);
  assert.deepStrictEqual(after.list.map(x => x.fresh), [true, false]);
  assert.strictEqual(G.guestNews(null).unseen, 0);
});
T("主人看得到：新的再多都列出來；館友看到的留言最多 notesShown 則", () => {
  const S = G.SOCIAL;
  const log = Array.from({ length: S.notesShown + G.NUM.guest.shown + 3 }, (_, i) => ({ uid: "u" + i, nick: "館友" + i, day: DAY, at: 1000 + i, like: false, note: "話" + i, paid: false }));
  assert.strictEqual(J(G.guestNews({ log, likes: 0, seenAt: 0 })).list.length, log.length);
  assert.strictEqual(J(G.guestNews({ log, likes: 0, seenAt: 99999 })).list.length, G.NUM.guest.shown);
  const b = G.fixGuestBook({ log: log.slice().reverse() });
  assert.strictEqual(G.guestNotes(b).length, S.notesShown);
  assert.ok(!JSON.stringify(G.guestNotes(b)).includes("u1"), "不給 uid");
});
T("訪客簿：壞掉的資料讀得起來", () => {
  assert.deepStrictEqual(J(G.fixGuestBook("亂")), { log: [], likes: 0, seenAt: 0 });
  assert.deepStrictEqual(J(G.fixGuestBook({ log: [null, { uid: 1 }, { uid: "a", day: DAY }], likes: -3 })).log.length, 1);
});

// ---------- 跟館友學的接口 ----------
T("跟館友學：今天第一次來才叫，拿得到兩邊的 P，改了我的存檔會回傳；再來一次不叫", () => {
  const mine = saveWith(P => { P.skills = { 美術: 10 }; }), theirs = saveWith(P => { P.skills = { 美術: 50 }; });
  let calls = 0;
  const learn = (myP, ownerP) => { calls++; myP.skills.美術 += ownerP.skills.美術 > myP.skills.美術 ? 1 : 0; return { gained: true, to: myP.skills.美術 }; };
  const r = visit(null, A, DAY, 1000, { learn, mySave: mine, ownerSave: theirs });
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(J(r.learn), { gained: true, to: 11 });
  assert.strictEqual(mine.profiles.challenge.skills.美術, 11);
  const again = visit(J(r.book), A, DAY, 2000, { learn, mySave: mine, ownerSave: theirs });
  assert.strictEqual(calls, 1);
  assert.strictEqual(again.learn, null);
  assert.strictEqual(visit(null, B, DAY, 1000).learn, null, "現在沒接上：learn 沒給就是 null");
});

// ---------- 送佩佩 ----------
const send = (save, item, to = "ub") => G.stepSendGift({ save, item, me: A, to, today: DAY, mailId: "gift-1" });
T("送：從收藏拿掉一隻、做好要寄的信；最後一隻整個拿掉", () => {
  const k = keyOf();
  const s = saveWith(P => { P.pepes[k] = { n: 2, perfect: false, s: 1, d: DAY }; });
  const r = send(s, { kind: "pepe", key: k });
  assert.ok(r.ok);
  assert.strictEqual(s.profiles.challenge.pepes[k].n, 1);
  assert.strictEqual(r.mail.id, "gift-1");
  assert.strictEqual(r.mail.from, "小明");
  assert.strictEqual(r.mail.gift.pepe.key, k);
  assert.strictEqual(r.mail.expire, G.dayPlus(DAY, G.SOCIAL.mailDays));
  assert.ok(r.text);
  assert.ok(send(s, { kind: "pepe", key: k }).ok);
  assert.strictEqual(s.profiles.challenge.pepes[k], undefined);
  assert.strictEqual(send(s, { kind: "pepe", key: k }).code, "missing", "第三次沒有了：不會複製");
});
T("送：自己、沒開館、受傷的、在地下的、展台上唯一一隻、抱枕都不行；不行就什麼都不改", () => {
  const k = keyOf(), k2 = keyOf({ 顏色: colors()[1] }), k3 = keyOf({ 顏色: colors()[2] });
  const s = saveWith(P => {
    P.pepes[k] = { n: 1, s: 1, d: DAY };
    P.pepes[k2] = { n: 1, s: 2, d: DAY };
    P.pepes[k3] = { n: 1, s: 3, d: DAY };
    P.injured = { [k]: "2026-11-20" };
    P.hall[0] = { kind: "pepe", key: k2 };
    P.cellar.run = { team: [k3] };
    P.pillows.x = 1;
  });
  const before = JSON.stringify(s);
  assert.strictEqual(G.stepSendGift({ save: s, item: { kind: "pepe", key: k }, me: A, to: "ua", today: DAY, mailId: "x" }).code, "self");
  assert.strictEqual(G.stepSendGift({ save: G.newSave(), item: { kind: "pepe", key: k }, me: A, to: "ub", today: DAY, mailId: "x" }).code, "no_museum");
  assert.strictEqual(send(s, { kind: "pepe", key: k }).code, "injured");
  assert.strictEqual(send(s, { kind: "pepe", key: k2 }).code, "on_show");
  assert.strictEqual(send(s, { kind: "pepe", key: k3 }).code, "in_cellar");
  assert.strictEqual(send(s, { kind: "pillow", key: "x" }).code, "bad_kind");
  assert.strictEqual(send(s, null).code, "bad_kind");
  assert.strictEqual(JSON.stringify(s), before);
});

// ---------- 領信 ----------
const claim = (save, mails, today = DAY) => G.stepClaimMail({ save, mails: J(mails), today });
const giftMailOf = (k, id = "gift-1") => J(G.giftMail({ id, fromNick: "小明", gift: { kind: "pepe", key: k, perfect: false, title: null }, today: DAY }));
T("整件事：小明送、小華領；兩邊加起來不變，信寫成領過就不能再領", () => {
  const k = keyOf();
  const ming = saveWith(P => { P.pepes[k] = { n: 1, perfect: true, s: 1, d: DAY, title: "小綠" }; });
  const hua = saveWith();
  const s = send(ming, { kind: "pepe", key: k });
  assert.ok(s.ok);
  assert.strictEqual(ming.profiles.challenge.pepes[k], undefined, "小明少一隻");
  assert.strictEqual(hua.profiles.challenge.pepes[k], undefined, "小華還沒領");
  const doc = J(s.mail); // 資料庫裡的信
  const r = claim(hua, [doc]);
  assert.ok(r.ok);
  assert.strictEqual(r.total.pepes, 1);
  assert.deepStrictEqual(J(r.done).map(x => x.id), ["gift-1"]);
  const got = hua.profiles.challenge.pepes[k];
  assert.ok(got.gift && got.perfect, "完美跟著走");
  assert.strictEqual(got.title, "小綠");
  // Functions 寫回：信標成領過
  doc.claimed = true;
  const r2 = claim(hua, [doc]);
  assert.strictEqual(r2.done.length, 0);
  assert.strictEqual(r2.skipped[0].reason, "已經領過了");
  assert.strictEqual(hua.profiles.challenge.pepes[k].n, 1, "不能領兩次");
});
T("領信：信還沒標成領過、可是存檔裡已經有了（寫到一半那種）：只補標，不再給一次", () => {
  const k = keyOf();
  const hua = saveWith();
  const doc = giftMailOf(k);
  assert.strictEqual(claim(hua, [doc]).total.pepes, 1);
  const r = claim(hua, [doc]);
  assert.strictEqual(r.total.pepes, 0);
  assert.deepStrictEqual(J(r.done), [{ id: "gift-1", stale: true }]);
  assert.strictEqual(hua.profiles.challenge.pepes[k].n, 1);
});
T("領信：領了搬進 P.mail，日期照信上的；信箱看得到已領取的那一封", () => {
  const k = keyOf();
  const hua = saveWith();
  const doc = giftMailOf(k);
  claim(hua, [doc], NEXT);
  const m = J(hua.profiles.challenge.mail);
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].claimed, true);
  assert.strictEqual(m[0].sent, DAY);
  assert.strictEqual(m[0].expire, doc.expire);
  assert.strictEqual(m[0].gift.pepe.key, k);
  assert.strictEqual(G.unclaimedCount(hua.profiles.challenge, NEXT), 0);
  assert.ok(J(G.mailList(hua.profiles.challenge, NEXT)).some(x => x.id === "gift-1" && x.claimed));
});
T("領信：來訪的謝禮加靈感；好幾封一起領算得出加起來多少", () => {
  const k = keyOf();
  const hua = saveWith(P => { P.insp = 5; });
  const v1 = J(G.visitMail({ id: "visit-a", fromNick: "小明", insp: 2, today: DAY }));
  const v2 = J(G.visitMail({ id: "visit-b", fromNick: "小美", insp: 2, today: DAY }));
  const r = claim(hua, [v1, giftMailOf(k), v2]);
  assert.deepStrictEqual(J(r.total), { insp: 4, mood: 0, pepes: 1, n: 3 });
  assert.ok(hua.profiles.challenge.insp >= 9, "靈感加上去（可能還有徽章）");
});
T("領信：過期、讀不到的不動；還沒開館不能領；別封照領", () => {
  const k = keyOf();
  const hua = saveWith();
  const gone = J(G.giftMail({ id: "old", fromNick: "小明", gift: { kind: "pepe", key: k }, today: "2026-01-01" }));
  const r = claim(hua, [gone, null, { id: "gift-x", gone: true }, giftMailOf(k)]);
  assert.strictEqual(r.total.n, 1);
  assert.deepStrictEqual(J(r.skipped).map(x => x.reason), ["這封信過期了", "找不到這封信", "找不到這封信"]);
  assert.strictEqual(hua.profiles.challenge.mailSeen.old, undefined, "過期的沒有記成寄過");
  assert.strictEqual(claim(G.newSave(), [giftMailOf(k)]).code, "no_museum");
});
T("領信：送的佩佩解開徽章，事件傳得回來（JSON 過得去）", () => {
  const hua = saveWith();
  const mails = G.allOpts("心情").filter(x => x !== "俄國8+9").map((mood, i) => giftMailOf(keyOf({ 心情: mood, 顏色: colors()[i % colors().length] }), "gift-" + i));
  G.setRng(G.mulberry32(1));
  const r = claim(hua, mails);
  G.setRng(null);
  assert.strictEqual(r.total.pepes, mails.length);
  assert.ok(Array.isArray(J(r.events)));
});
T("信給畫面看的樣子：多的欄位不給；壞的不給", () => {
  const row = J(G.mailRow(Object.assign({}, giftMailOf(keyOf()), { fromId: "ua", createdAt: { x: 1 } })));
  assert.deepStrictEqual(Object.keys(row).sort(), ["claimed", "expire", "from", "gift", "id", "note", "sent", "title"]);
  assert.strictEqual(G.mailRow(null), null);
  assert.strictEqual(G.mailRow({ id: "x" }), null);
});
T("存檔：領信不會弄壞舊存檔（沒有 mail、mailSeen 的舊資料）；存檔整理過還在", () => {
  const k = keyOf();
  const hua = saveWith(P => { delete P.mail; delete P.mailSeen; });
  assert.strictEqual(claim(hua, [giftMailOf(k)]).total.pepes, 1);
  const back = G.migrateSave(J(hua));
  assert.strictEqual(back.profiles.challenge.pepes[k].n, 1);
  assert.strictEqual(back.profiles.challenge.mail[0].claimed, true);
  assert.strictEqual(back.profiles.challenge.mailSeen["gift-1"], true);
});

T("跟館友學接上了：今天第一次走進去，對方拿手的比我高就有機會；同一天再來不再學", () => {
  const learn = (myP, ownerP) => G.learnFromFriend(myP, G.friendTalent(ownerP));
  const job = p => { G.assignJob(p, "detective"); p.skills.偵查 = 20; };
  const mine = saveWith(job), owner = saveWith(p => { G.assignJob(p, "detective"); p.skills.偵查 = 70; });
  G.setRng(() => 0); // 擲到最小，一定學會
  const r = visit(null, A, DAY, 1, { learn, mySave: mine, ownerSave: owner });
  G.setRng(null);
  assert.ok(r.learn && r.learn.gained);
  assert.strictEqual(mine.profiles.challenge.skills.偵查, 20 + G.NUM.shop.learnGain);
  assert.ok(G.learnText(r.learn, "小明").includes("跟 小明 學了壹招"));
  const r2 = visit(r.book, A, DAY, 2, { learn, mySave: mine, ownerSave: owner });
  assert.strictEqual(r2.learn, null); assert.strictEqual(mine.profiles.challenge.skills.偵查, 20 + G.NUM.shop.learnGain);
});

T("展覽海報：參觀時看得到，壞的、不認識的主題拿掉（別人存檔裡的東西）", () => {
  const v = G.cleanHallView({ open: true, slots: [], score: 50, posters: [{ theme: "legend", tier: 3, score: 96, date: "2026-11-09" }, { theme: "<b>壞</b>", tier: 9 }, null, { theme: "joy", tier: 99, score: 500, date: "x" }] });
  assert.deepStrictEqual(J(v.posters), [{ theme: "legend", tier: 3, score: 96, date: "2026-11-09" }, { theme: "joy", tier: 3, score: 100, date: null }]);
  assert.deepStrictEqual(J(G.cleanHallView({ open: true, slots: [] }).posters), []);
});


T("掛在牆上的探險報告：館友看得到，檢查過、限制長度；沒掛就沒有", () => {
  const rep = { id: "r1", title: "走完了", date: "2026-11-09", floors: [1, 2], members: [{ name: "小明", san0: 50, san1: 41, insp: 12, secret: "不該給" }], lines: [{ k: "scary", t: "最驚險的壹間" }], extra: "不該給" };
  const v = J(G.cleanHallView({ open: true, slots: [], score: 1, report: rep }));
  assert.strictEqual(v.report.title, "走完了");
  assert.strictEqual(v.report.members[0].san1, 41);
  assert.ok(!JSON.stringify(v).includes("不該給"), "只給要的欄位");
  const evil = J(G.cleanHallView({ open: true, slots: [], score: 1, report: { title: "字".repeat(500), date: "<img>", floors: ["x", 99999], members: [null, { name: 3 }], lines: [{ k: "<b>", t: "字".repeat(900) }, 7] } }));
  assert.strictEqual(Array.from(evil.report.title).length, 40);
  assert.strictEqual(evil.report.date, null);
  assert.deepStrictEqual(evil.report.floors, [999]);
  assert.strictEqual(evil.report.members[0].name, "館友");
  assert.strictEqual(evil.report.lines.length, 1);
  assert.strictEqual(evil.report.lines[0].k, "x");
  assert.strictEqual(Array.from(evil.report.lines[0].t).length, 200);
  assert.strictEqual(J(G.cleanHallView({ open: true, slots: [], score: 1 })).report, null);
});

// ---------- 比每週特展（11-09，取代特展碼） ----------
const WEEK = 2900;
const weekOf = (fn, week = WEEK) => { // 對方存檔 → 伺服器給的那一小部分
  const s = saveWith(P => { P.weekly = { w: WEEK, theme: "start32", slots: [null, null, null, null, null, null], best: 61 }; if (fn) fn(P); });
  return G.stepWeeklyView({ view: G.weeklyView(s), me: A, owner: "ub", week, theme: "start32" });
};
T("比特展：同一週給最高分和展台，不給存檔裡的主題、名字、收藏", () => {
  const k = keyOf();
  const r = J(weekOf(P => { P.pepes[k] = { n: 1, perfect: true, s: 1, d: DAY, title: "祕密名字" }; P.weekly.slots[1] = { kind: "pepe", key: k }; P.weekly.theme = "<b>亂寫</b>"; P.insp = 987654; }));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.open, true); assert.strictEqual(r.started, true);
  assert.deepStrictEqual(Object.keys(r).sort(), ["best", "ok", "open", "slots", "started", "theme", "week"]);
  assert.strictEqual(r.best, 61); assert.strictEqual(r.week, WEEK);
  assert.strictEqual(r.theme, "start32", "主題用伺服器算的，不用存檔裡的");
  assert.deepStrictEqual(r.slots[1], { kind: "pepe", key: k, perfect: true, title: null });
  const txt = JSON.stringify(r);
  for (const leak of ["祕密名字", "亂寫", "987654"]) assert.ok(!txt.includes(leak), "不該有 " + leak);
});
T("比特展：不是同一週、沒擺過、沒開館：只回旗標，不給舊資料", () => {
  const old = J(weekOf(null, WEEK + 1)); // 對方存的是上一週
  assert.deepStrictEqual(old, { ok: true, open: true, started: false });
  const none = J(G.stepWeeklyView({ view: { open: true, w: null, theme: null, best: 0, slots: [] }, me: A, owner: "ub", week: WEEK, theme: "start32" }));
  assert.deepStrictEqual(none, { ok: true, open: true, started: false });
  const closed = J(G.stepWeeklyView({ view: { open: false }, me: A, owner: "ub", week: WEEK, theme: "start32" }));
  assert.deepStrictEqual(closed, { ok: true, open: false, started: false });
  assert.deepStrictEqual(J(G.stepWeeklyView({ view: null, me: A, owner: "ub", week: WEEK, theme: "x" })), { ok: true, open: false, started: false });
});
T("比特展：不能比自己；壞資料不丟錯、不能信（壞的格子、超大的分數、太多格子）", () => {
  const self = G.stepWeeklyView({ view: { open: true, w: WEEK, best: 5, slots: [] }, me: A, owner: A.uid, week: WEEK, theme: "x" });
  assert.strictEqual(self.ok, false); assert.strictEqual(self.code, "self");
  const evil = "<img src=x onerror=alert(1)>";
  const r = J(G.stepWeeklyView({ view: { open: true, w: String(WEEK), best: 99999, slots: [{ kind: "pepe", key: evil }, { kind: "hack", key: keyOf() }, "字串", null, null, null, { kind: "pepe", key: keyOf() }, { kind: "pepe", key: keyOf() }] }, me: A, owner: "ub", week: WEEK, theme: "start32" }));
  assert.strictEqual(r.best, 100);
  assert.strictEqual(r.slots.length, 6, "最多 6 格");
  assert.deepStrictEqual(r.slots.slice(0, 3), [null, null, null]);
  assert.deepStrictEqual(J(G.stepWeeklyView({ view: { open: true, w: "abc", best: -5, slots: "壞" }, me: A, owner: "ub", week: WEEK, theme: "x" })), { ok: true, open: true, started: false });
  assert.strictEqual(J(G.stepWeeklyView({ view: { open: true, w: WEEK, best: -5, slots: "壞" }, me: A, owner: "ub", week: WEEK, theme: "x" })).best, 0);
});

// ---------- 請館友來看（11-09，取代分享碼） ----------
const call = (more = {}) => G.stepHallCall(Object.assign({ open: true, me: A, to: "ub", today: DAY, at: 5000 }, more));
T("請館友來看：給通知的內容，編號是日期加上請的人（同一天同一位只有一則）", () => {
  const r = J(call());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, G.callId(DAY, A.uid));
  assert.deepStrictEqual(r.call, { fromId: A.uid, from: A.nick, day: DAY, at: 5000, seen: false });
  assert.notStrictEqual(G.callId(DAY, A.uid), G.callId(NEXT, A.uid), "隔天是新的一則");
  assert.notStrictEqual(G.callId(DAY, A.uid), G.callId(DAY, B.uid), "不同的人是不同的一則");
  assert.ok(!JSON.stringify(r).includes("gift"), "沒有獎勵");
});
T("請館友來看：同一位可以一直請（翊文 11-09），還是同一則、變回沒看過；自己不行、自己的展廳沒開館不行", () => {
  const first = J(call()), again = J(call({ at: 9000 }));
  assert.strictEqual(again.ok, true);
  assert.strictEqual(again.id, first.id, "同一天同一個人只留一則，不會堆起來");
  assert.strictEqual(again.call.at, 9000);
  assert.strictEqual(again.call.seen, false);
  assert.strictEqual(call({ to: A.uid }).code, "self");
  assert.strictEqual(call({ open: false }).code, "not_open");
});
T("請館友來看：通知給畫面看的樣子只留該給的欄位，壞的拿掉，暱稱最多 12 字", () => {
  const raw = { fromId: "ua", from: "小明", day: DAY, at: 5000, seen: false, createdAt: "x", secret: "不該給" };
  const row = J(G.callRow(raw, "call-1"));
  assert.deepStrictEqual(row, { id: "call-1", fromId: "ua", from: "小明", day: DAY, at: 5000 });
  assert.strictEqual(G.callRow(null, "c"), null);
  assert.strictEqual(G.callRow({ fromId: "a/b", day: DAY }, "c"), null, "uid 有斜線不行（會拿去組路徑）");
  assert.strictEqual(G.callRow({ fromId: "ua" }, "c"), null, "沒有日期不行");
  assert.strictEqual(G.callRow(raw, 5), null, "編號不是字串不行");
  assert.strictEqual(Array.from(G.callRow({ fromId: "ua", day: DAY, from: "字".repeat(60) }, "c").from).length, 12);
  assert.strictEqual(G.callRow({ fromId: "ua", day: DAY, at: "x" }, "c").at, 0);
  assert.strictEqual(G.callRow({ fromId: "ua", day: DAY }, "c").from, "館友");
});

console.log(`${pass} passed, ${fail} failed（參觀展廳、送佩佩、伺服器的信）`);
process.exit(fail ? 1 : 0);

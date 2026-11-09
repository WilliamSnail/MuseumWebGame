// 館友之間的規則（shared/gifts.js，多人版 M2）：node test/gifts.test.cjs（npm test 也會跑）
// 台灣時間 05:00 換日、來訪靈感的上限、留言的檢查、展廳給別人看的部分（不漏存檔）、
// 送佩佩（能不能送、拿出來、放進去、完美作品、失敗作、修復品）、信（送、領、領兩次、過期、自由模式）。
// 數字一律讀 SOCIAL。
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { load } = require("./load_shared.cjs");
let G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡的物件拿出來比（見 docs/架構.md 第 6 節）
const DAY = "2026-11-08";
const fresh = (mode = "challenge") => { const P = G.newProfile(mode); G.ensureDay(P, DAY); return P; };
// 壹隻指定顏色、心情的佩佩的 key
const keyOf = (o = {}) => G.pepeKey(Object.assign({}, G.DEFAULT_PICK, o));
const colors = () => G.allOpts("顏色");

// ---------- 換日 ----------
T("台灣時間 05:00 換日：04:59 還是前壹天，05:00 是新的壹天", () => {
  assert.strictEqual(G.taipeiDay(Date.parse("2026-11-08T20:59:59Z")), "2026-11-08"); // 台灣 11-09 04:59
  assert.strictEqual(G.taipeiDay(Date.parse("2026-11-08T21:00:00Z")), "2026-11-09"); // 台灣 11-09 05:00
  assert.strictEqual(G.taipeiDay(Date.parse("2026-11-08T00:00:00Z")), "2026-11-08"); // 台灣 08:00
  assert.strictEqual(G.taipeiDay(Date.parse("2026-12-31T21:00:00Z")), "2027-01-01");
  assert.throws(() => G.taipeiDay(), /毫秒/, "不給時間要丟錯誤（不能偷用瀏覽器的時鐘）");
});
T("dayPlus：跨月、跨年、閏年", () => {
  assert.strictEqual(G.dayPlus(DAY, G.SOCIAL.mailDays), "2026-12-08");
  assert.strictEqual(G.dayPlus("2026-12-20", 15), "2027-01-04");
  assert.strictEqual(G.dayPlus("2028-02-28", 1), "2028-02-29");
  assert.strictEqual(G.dayPlus(DAY, -1), "2026-11-07");
});

// ---------- 來訪、按讚、留言 ----------
T("來訪靈感：每位館友每天第壹次來才給；壹天最多 visitInspMax 次", () => {
  const S = G.SOCIAL;
  assert.strictEqual(G.visitGain({ open: true, paidToday: 0 }), S.visitInsp);
  assert.strictEqual(G.visitGain({ open: true, again: true, paidToday: 0 }), 0, "今天來過了");
  assert.strictEqual(G.visitGain({ open: true, self: true }), 0, "自己的展廳");
  assert.strictEqual(G.visitGain({ open: false }), 0, "還沒開館");
  // 6 位館友各來壹次（第 1 位又來壹次）：只有前 visitInspMax 位給
  let paid = 0, total = 0;
  const seen = new Set();
  for (const who of [1, 2, 1, 3, 4, 5, 6]) {
    const g = G.visitGain({ open: true, again: seen.has(who), paidToday: paid });
    seen.add(who);
    if (g) paid++;
    total += g;
  }
  assert.strictEqual(paid, S.visitInspMax);
  assert.strictEqual(total, S.visitInsp * S.visitInspMax);
});
T("留言：去頭尾空白、換行變空白；最多 noteMax 個字（照字數，不照位元組）", () => {
  const S = G.SOCIAL;
  assert.deepStrictEqual(J(G.cleanHallNote("  好可愛\n\n的展廳  ")), { ok: true, text: "好可愛 的展廳" });
  assert.strictEqual(G.cleanHallNote("佩".repeat(S.noteMax)).ok, true);
  assert.strictEqual(G.cleanHallNote("佩".repeat(S.noteMax + 1)).code, "too_long");
  assert.strictEqual(G.cleanHallNote("😀".repeat(S.noteMax)).ok, true, "表情符號算壹個字");
  assert.strictEqual(G.cleanHallNote("   ").code, "empty");
  assert.strictEqual(G.cleanHallNote(42).ok, false);
});
T("留言：控制字元、零寬空白、方向控制字元都擋", () => {
  for (const bad of ["好​看", "好\u0007看", "‮反過來", "好﻿看", "好⁠看"]) {
    const r = G.cleanHallNote(bad);
    assert.strictEqual(r.code, "invisible", JSON.stringify(bad));
    assert.ok(r.reason);
  }
});
T("按讚、留言：自己的不行、沒開館不行、今天做過不行", () => {
  assert.strictEqual(G.checkHallAct("like", { self: true, open: true }).code, "self");
  assert.strictEqual(G.checkHallAct("note", { open: false }).code, "not_open");
  assert.strictEqual(G.checkHallAct("like", { open: true, done: true }).code, "already");
  assert.ok(/留過言/.test(G.checkHallAct("note", { open: true, done: true }).reason));
  assert.strictEqual(G.checkHallAct("note", { open: true }).ok, true);
});

// ---------- 展廳給別人看的部分 ----------
T("展廳：只給展台、分數、主題；不給靈感、收藏、理智", () => {
  const P = fresh();
  const k = keyOf({ 顏色: colors()[1] });
  P.pepes[k] = { n: 3, perfect: true, s: 1, d: DAY, title: "小綠" };
  P.pepes[keyOf()] = { n: 1, perfect: false, s: 2, d: DAY };
  P.hall[0] = { kind: "pepe", key: k };
  P.hall[2] = { kind: "pepe", key: "不存在|的|佩|佩|x|y|z" }; // 收藏裡沒有：當空的
  const v = J(G.hallView({ profiles: { challenge: P, free: null } }));
  assert.deepStrictEqual(Object.keys(v).sort(), ["deco", "frame", "open", "posters", "report", "score", "slots", "theme", "themes"]); // deco、frame：簽到拿的展台裝飾、名牌框（只是好看，11-09，決定 0030）
  assert.strictEqual(v.open, true);
  assert.strictEqual(v.slots.length, P.hall.length);
  assert.deepStrictEqual(v.slots[0], { kind: "pepe", key: k, perfect: true, title: "小綠" });
  assert.strictEqual(v.slots[1], null);
  assert.strictEqual(v.slots[2], null);
  assert.strictEqual(v.score, G.hallScore(P).score);
  const text = JSON.stringify(v);
  assert.ok(!text.includes(keyOf()), "沒擺出來的收藏不給");
  assert.ok(!/insp|sanity|mail/.test(text));
});
T("展廳：只有自由模式、還沒開始、壞掉的存檔都是「還沒開館」", () => {
  assert.deepStrictEqual(J(G.hallView({ profiles: { challenge: null, free: fresh("free") } })), { open: false });
  assert.deepStrictEqual(J(G.hallView(null)), { open: false });
  assert.deepStrictEqual(J(G.hallView({ profiles: { challenge: { mode: "challenge" } } })), { open: false });
});

// ---------- 送佩佩：能不能送 ----------
T("能送：佩佩、失敗作、修復品；抱枕、自由模式、收藏裡沒有、看不懂的 key 不能送", () => {
  const P = fresh();
  const k = keyOf();
  P.pepes[k] = { n: 1, s: 1 }; P.failed[k] = 2; P.repaired[k] = 1;
  assert.ok(G.canGive(P, { kind: "pepe", key: k }).ok);
  assert.ok(G.canGive(P, { kind: "failed", key: k }).ok);
  assert.ok(G.canGive(P, { kind: "repaired", key: k }).ok);
  assert.strictEqual(G.canGive(P, { kind: "pillow", key: k }).code, "bad_kind");
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: keyOf({ 顏色: colors()[2] }) }).code, "missing");
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: "亂打的" }).code, "bad_key");
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: k.split("|").map((x, i) => i ? x : "沒有這種").join("|") }).code, "bad_key");
  const F = fresh("free"); F.pepes[k] = { n: 1 };
  assert.strictEqual(G.canGive(F, { kind: "pepe", key: k }).code, "free");
});
T("不能送：受傷的、正在地下的（現在這位和不在場那位的都算）", () => {
  const P = fresh();
  const k = keyOf();
  P.pepes[k] = { n: 5, s: 1 };
  P.injured[k] = G.dayPlus(DAY, 2);
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: k }).code, "injured");
  delete P.injured[k];
  P.cellar.run = { floor: 1, idx: 0, team: [k, "a", "b"], used: {}, log: [] };
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: k }).code, "in_cellar", "兩隻以上也不行（壹隊用的是這壹種）");
  P.cellar.run = null;
  P.visitors = [{ vid: "v2", cellarRun: { floor: 2, team: ["x", k, "y"] } }];
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: k }).code, "in_cellar");
  P.visitors = [];
  assert.ok(G.canGive(P, { kind: "pepe", key: k }).ok);
});
T("展台、每週特展上的：只有壹隻不能送；兩隻以上送多的那隻，展台照樣有", () => {
  const P = fresh();
  const k = keyOf();
  P.pepes[k] = { n: 1, s: 1 };
  P.hall[0] = { kind: "pepe", key: k };
  assert.strictEqual(G.canGive(P, { kind: "pepe", key: k }).code, "on_show");
  P.pepes[k].n = 2;
  const r = G.takeGift(P, { kind: "pepe", key: k });
  assert.ok(r.ok);
  assert.strictEqual(P.pepes[k].n, 1);
  assert.ok(G.hallItem(P, P.hall[0]), "展台上那隻還在");
  P.hall[0] = null;
  P.failed[k] = 1;
  P.weekly = { w: 1, theme: "failedOnly", slots: [{ kind: "failed", key: k }, null], best: 0 };
  assert.strictEqual(G.canGive(P, { kind: "failed", key: k }).code, "on_show");
});

// ---------- 送佩佩：拿出來、放進去 ----------
T("拿出來：最後壹隻就整個拿掉；完美作品有兩隻以上時，送普通的那隻", () => {
  const P = fresh();
  const a = keyOf(), b = keyOf({ 顏色: colors()[1] });
  P.pepes[a] = { n: 1, perfect: true, s: 1, title: "阿綠" };
  P.pepes[b] = { n: 2, perfect: true, s: 2 };
  const ra = G.takeGift(P, { kind: "pepe", key: a });
  assert.deepStrictEqual(J(ra.gift), { kind: "pepe", key: a, perfect: true, title: "阿綠" });
  assert.ok(!P.pepes[a], "最後壹隻送出去，收藏沒有了");
  const rb = G.takeGift(P, { kind: "pepe", key: b });
  assert.strictEqual(rb.gift.perfect, false, "完美的留在自己這裡");
  assert.deepStrictEqual(J(P.pepes[b]), { n: 1, perfect: true, s: 2 });
  P.failed[a] = 2; P.repaired[a] = 1;
  assert.ok(G.takeGift(P, { kind: "failed", key: a }).ok);
  assert.strictEqual(P.failed[a], 1);
  assert.ok(G.takeGift(P, { kind: "repaired", key: a }).ok);
  assert.ok(!(a in P.repaired), "數到 0 就拿掉");
  assert.strictEqual(G.takeGift(P, { kind: "repaired", key: a }).code, "missing", "沒有了不能再送");
});
T("放進去：新的壹隻記成館友送的；已經有的加壹隻、完美和名字照留", () => {
  const P = fresh();
  const a = keyOf(), b = keyOf({ 顏色: colors()[1] });
  const s0 = P.serial;
  const r = G.putGift(P, { kind: "pepe", key: a, perfect: true, title: "阿綠" }, "2026-11-09");
  assert.ok(r.ok && r.isNew);
  assert.deepStrictEqual(J(P.pepes[a]), { n: 1, perfect: true, s: s0 + 1, d: "2026-11-09", gift: true, title: "阿綠" });
  assert.ok(Array.isArray(r.events));
  P.pepes[b] = { n: 1, perfect: true, s: 9, title: "原本的名字" };
  const r2 = G.putGift(P, { kind: "pepe", key: b, perfect: false, title: "別的名字" });
  assert.ok(r2.ok && !r2.isNew);
  assert.deepStrictEqual(J(P.pepes[b]), { n: 2, perfect: true, s: 9, title: "原本的名字" });
  assert.ok(G.putGift(P, { kind: "failed", key: a }).ok);
  assert.ok(G.putGift(P, { kind: "failed", key: a }).ok);
  assert.strictEqual(P.failed[a], 2);
  assert.ok(G.putGift(P, { kind: "repaired", key: a }).ok);
  assert.strictEqual(P.repaired[a], 1);
});
T("放進去：壞掉的禮物、抱枕、自由模式都不收；舊名字換成新名字", () => {
  const P = fresh();
  for (const bad of [null, "x", { kind: "pillow", key: keyOf() }, { kind: "pepe", key: "a|b" }, { kind: "pepe", key: keyOf().replace(/^[^|]+/, "<b>x</b>") }]) {
    assert.strictEqual(G.putGift(P, bad).ok, false, JSON.stringify(bad));
  }
  assert.strictEqual(G.putGift(fresh("free"), { kind: "pepe", key: keyOf() }).code, "free");
  const old = Object.keys(G.RENAMED)[0];
  if (old) {
    const cat = G.CATS.find(c => G.allOpts(c).includes(G.RENAMED[old]));
    const r = G.putGift(P, { kind: "pepe", key: keyOf({ [cat]: old }) });
    assert.ok(r.ok);
    assert.strictEqual(r.key, keyOf({ [cat]: G.RENAMED[old] }));
  }
  const t = G.cleanGiftItem({ kind: "failed", key: keyOf(), perfect: true, title: "x" });
  assert.deepStrictEqual(J(t), { kind: "failed", key: keyOf(), perfect: false, title: null }, "失敗作沒有完美、沒有名字");
});
T("禮物寫成字：名字、完美作品、失敗作、修復品", () => {
  const k = keyOf();
  const d = G.describePepe(G.fromKey(k)).title;
  assert.strictEqual(G.giftItemText({ kind: "pepe", key: k, perfect: true, title: "阿綠" }), `「阿綠」${d}（完美作品）`);
  assert.strictEqual(G.giftItemText({ kind: "failed", key: k }), `${G.describePepe(G.fromKey(k), { failed: true }).title}（失敗作）`);
  assert.strictEqual(G.giftItemText({ kind: "repaired", key: k }), `${d}（修復品）`);
  assert.ok(G.giftItemText(null).includes("壹隻"));
});

// ---------- 信：送、領、領兩次、過期 ----------
T("送佩佩整件事：送的人少壹隻、對方的信箱多壹封、領了多壹隻；兩邊加起來不變", () => {
  const A = fresh(), B = fresh();
  const k = keyOf({ 顏色: colors()[1] });
  A.pepes[k] = { n: 1, perfect: false, s: 1 };
  const count = () => G.giftCount(A, "pepe", k) + G.giftCount(B, "pepe", k);
  const before = count();
  const r = G.sendGift(A, { kind: "pepe", key: k }, { id: "s1", fromNick: "小明", today: DAY });
  assert.ok(r.ok);
  assert.strictEqual(G.giftCount(A, "pepe", k), 0);
  assert.strictEqual(r.mail.title, "小明送你壹隻佩佩");
  assert.strictEqual(r.mail.from, "小明");
  assert.strictEqual(r.mail.sent, DAY);
  assert.strictEqual(r.mail.expire, G.dayPlus(DAY, G.SOCIAL.mailDays));
  assert.strictEqual(r.mail.claimed, false);
  assert.deepStrictEqual(J(r.mail.gift.pepe), { kind: "pepe", key: k, perfect: false, title: null });
  assert.strictEqual(count(), before - 1, "信還沒領：兩邊都沒有（在信裡）");
  // 收到的人：信放進信箱（格式跟本機的信壹樣）、領取
  assert.ok(G.sendMail(B, Object.assign({}, r.mail), DAY));
  assert.strictEqual(G.unclaimedCount(B, DAY), 1);
  assert.ok(G.giftText(B.mail[0].gift).startsWith("壹隻佩佩："));
  const c = G.claimMail(B, "s1", DAY);
  assert.ok(c.ok, c.reason);
  assert.strictEqual(G.giftCount(B, "pepe", k), 1);
  assert.strictEqual(B.pepes[k].gift, true);
  assert.strictEqual(count(), before, "領了：只有收到的人有");
  assert.strictEqual(G.claimMail(B, "s1", DAY).ok, false, "同壹封不能領兩次");
  assert.strictEqual(G.giftCount(B, "pepe", k), 1);
  assert.ok(!G.sendMail(B, Object.assign({}, r.mail), DAY), "同壹封不會寄進來兩次");
});
T("信：過期不能領，佩佩也不會進收藏", () => {
  const B = fresh(), k = keyOf();
  G.sendMail(B, G.giftMail({ id: "s2", fromNick: "小華", gift: { kind: "pepe", key: k }, today: DAY }), DAY);
  const late = G.dayPlus(DAY, G.SOCIAL.mailDays + 1);
  assert.strictEqual(G.claimMail(B, "s2", late).ok, false);
  assert.strictEqual(G.giftCount(B, "pepe", k), 0);
  assert.strictEqual(G.claimMail(B, "s2", G.dayPlus(DAY, G.SOCIAL.mailDays)).ok, true, "最後壹天還可以領");
});
T("信：自由模式領不了佩佩，信留著（回挑戰模式再領）", () => {
  const F = fresh("free"), k = keyOf();
  G.sendMail(F, G.giftMail({ id: "s3", fromNick: "小華", gift: { kind: "failed", key: k }, today: DAY }), DAY);
  const r = G.claimMail(F, "s3", DAY);
  assert.strictEqual(r.ok, false);
  assert.ok(/自由模式/.test(r.reason));
  assert.strictEqual(F.mail[0].claimed, false);
});
T("信：來訪的信附靈感；全部領取算得出領了幾隻佩佩", () => {
  const B = fresh(), k = keyOf();
  const insp0 = B.insp;
  const v = G.visitMail({ id: "v1", fromNick: "小明", insp: G.SOCIAL.visitInsp, today: DAY });
  assert.strictEqual(v.title, "小明來參觀你的展廳");
  assert.strictEqual(v.gift.pepe, null);
  G.sendMail(B, v, DAY);
  G.sendMail(B, G.giftMail({ id: "s4", fromNick: "小明", gift: { kind: "pepe", key: k }, today: DAY }), DAY);
  G.sendMail(B, { id: "x", title: "壞掉的附件", gift: { pepe: { kind: "pepe", key: "a|b" } } }, DAY);
  assert.ok(!("pepe" in B.mail[2].gift), "壞掉的佩佩不附");
  const t = G.claimAllMail(B, DAY);
  assert.strictEqual(t.n, 3);
  assert.strictEqual(t.pepes, 1);
  assert.strictEqual(t.insp, G.SOCIAL.visitInsp);
  assert.ok(B.insp >= insp0 + G.SOCIAL.visitInsp, "來訪的靈感加進去了（收到的佩佩可能另外解開徽章、多拿靈感）");
  assert.ok(G.giftText(t).includes("佩佩 1 隻"));
  assert.strictEqual(G.giftText({ insp: 10, mood: 5 }), "靈感 +10、心情 +5", "舊的寫法不變");
});

// ---------- 真正的 ES 模組（伺服器、Firebase 的 Cloud Functions 會這樣用） ----------
(async () => {
  try {
    const url = f => pathToFileURL(path.join(__dirname, "..", "shared", f)).href;
    const logic = await import(url("logic.js"));
    const gifts = await import(url("gifts.js"));
    const mailbox = await import(url("mailbox.js"));
    for (const [k, v] of Object.entries(gifts)) assert.notStrictEqual(v, undefined, "gifts." + k);
    const A = logic.newProfile("challenge"); logic.ensureDay(A, DAY);
    const B = logic.newProfile("challenge"); logic.ensureDay(B, DAY);
    const k = logic.pepeKey(logic.DEFAULT_PICK);
    A.pepes[k] = { n: 1, s: 1 };
    const r = gifts.sendGift(A, { kind: "pepe", key: k }, { id: "m1", fromNick: "小明", today: logic.taipeiDay(Date.parse("2026-11-08T12:00:00Z")) }); // taipeiDay 11-09 搬到 logic.js（todayStr 也用它）
    assert.ok(r.ok);
    mailbox.sendMail(B, r.mail, DAY);
    assert.ok(mailbox.claimMail(B, "m1", DAY).ok);
    assert.ok(B.pepes[k] && !A.pepes[k]);
    pass++;
  } catch (e) { fail++; console.log("FAIL ES 模組載得起來、接得上\n   ", e.message); }
  console.log(`${pass} passed, ${fail} failed（送佩佩、參觀展廳）`);
  process.exit(fail ? 1 : 0);
})();

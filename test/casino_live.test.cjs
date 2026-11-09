// 實況和斗內（決定 0053）：node test/casino_live.test.cjs（npm test 也會跑）
// 開播、搶不走、到期可接手、離線算下播、斗內金額範圍和守恆、不能斗自己、不夠錢、每日上限、收款上限、換日、壞資料、實況主沒有錢包、文字界線、資料庫規則。數字讀 NUM。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const D1 = "2026-11-09", D2 = "2026-11-10";
const T0 = Date.parse("2026-11-09T12:00:00+08:00");
const JS = x => JSON.parse(JSON.stringify(x));
const wallet = (G, chips, day = D1) => { const w = G.casWalletFix(G.casWalletNew(), day); if (chips != null) w.chips = chips; return w; };
const donor = (G, uid, chips, nick = "小明") => ({ uid, nick, w: wallet(G, chips) });
const on = (G, uid = "s1", nick = "阿播", t = T0) => G.liveStart(G.liveNew(), { uid, nick }, t, null).st;
// rnd：讓 k 剛好是某個整數（1～kMax）
const atK = (G, k) => (k - 1 + 0.5) / G.NUM.casino.live.kMax;

T("數字：預設值，金額 2 萬～26 萬", G => {
  const C = G.NUM.casino.live;
  assert.deepStrictEqual([C.base, C.step, C.kMax, C.durationMs, C.perDay, C.receiveCap], [10000, 10000, 25, 3600000, 3, 1000000]);
  assert.strictEqual(C.base + C.step * 1, 20000); assert.strictEqual(C.base + C.step * C.kMax, 260000);
});
T("金額：k 是 1～kMax，邊界和亂數壞掉都在範圍內", G => {
  const C = G.NUM.casino.live, lo = C.base + C.step, hi = C.base + C.step * C.kMax;
  assert.strictEqual(G.liveRoll(() => 0), lo);
  assert.strictEqual(G.liveRoll(() => 0.9999999), hi);
  assert.strictEqual(G.liveRoll(() => 1), hi); assert.strictEqual(G.liveRoll(() => -3), lo);
  assert.strictEqual(G.liveRoll(() => NaN), lo); assert.strictEqual(G.liveRoll(null), lo);
  for (let k = 1; k <= C.kMax; k++) assert.strictEqual(G.liveRoll(() => atK(G, k)), C.base + C.step * k);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) { const n = G.liveRoll(Math.random); assert.ok(n >= lo && n <= hi && n % C.step === 0); seen.add(n); }
  assert.strictEqual(seen.size, C.kMax, "25 種金額都有");
});
T("開播：成為實況主，播 1 小時；沒人在播的畫面", G => {
  const C = G.NUM.casino.live;
  const r = G.liveStart(G.liveNew(), { uid: "s1", nick: "阿播" }, T0, null);
  assert.ok(r.ok && r.st.uid === "s1" && r.st.nick === "阿播" && r.st.since === T0 && r.st.until === T0 + C.durationMs && r.st.seq === 1);
  assert.ok(G.liveActive(r.st, T0 + 1, null));
  assert.ok(!G.liveActive(G.liveNew(), T0, null));
});
T("搶不走：別人正在播不能開播；自己重複開也不行；狀態不變", G => {
  const st = on(G), before = JS(st);
  let r = G.liveStart(st, { uid: "s2", nick: "搶的" }, T0 + 1000, null);
  assert.ok(!r.ok && r.reason.includes("阿播") && r.st.uid === "s1");
  r = G.liveStart(st, { uid: "s1", nick: "阿播" }, T0 + 1000, null);
  assert.ok(!r.ok && r.reason === G.CAS_LIVE.already);
  assert.deepStrictEqual(JS(st), before, "輸入不被改");
  assert.ok(!G.liveStart(st, { uid: "", nick: "x" }, T0, null).ok && !G.liveStart(st, null, T0, null).ok);
});
T("到期（伺服器用到期時間判斷）可以接手；剛好到期那一刻也算下播", G => {
  const C = G.NUM.casino.live, st = on(G);
  assert.ok(G.liveActive(st, T0 + C.durationMs - 1, null));
  assert.ok(!G.liveActive(st, T0 + C.durationMs, null));
  const r = G.liveStart(st, { uid: "s2", nick: "接手" }, T0 + C.durationMs, null);
  assert.ok(r.ok && r.st.uid === "s2" && r.st.seq === st.seq + 1);
  assert.ok(!G.liveStart(st, { uid: "s2", nick: "接手" }, T0 + C.durationMs - 1, null).ok);
});
T("本人下播；別人不能代下播；下播後別人可以接", G => {
  const st = on(G);
  assert.ok(!G.liveStop(st, "s2").ok && G.liveStop(st, "s2").reason === G.CAS_LIVE.notYou);
  assert.ok(!G.liveStop(G.liveNew(), "s1").ok);
  const r = G.liveStop(st, "s1");
  assert.ok(r.ok && r.st.uid === null && r.st.seq === st.seq + 1);
  assert.ok(G.liveStart(r.st, { uid: "s2", nick: "接手" }, T0 + 5, null).ok);
  const old = G.liveStop(st, "s1"); // 到期了本人按也算
  assert.ok(old.ok);
});
T("關掉遊戲：實況主離線超過寬限就算下播，剛斷線不算，沒有資料不算", G => {
  const C = G.NUM.casino.live, st = on(G), t = T0 + 10 * 60000;
  const off = at => ({ state: "offline", at });
  assert.ok(G.liveActive(st, t, { state: "online", at: t }));
  assert.ok(G.liveActive(st, t, { state: "away", at: t - 999999 }), "離開（away）不算");
  assert.ok(G.liveActive(st, t, off(t - C.graceMs)), "剛好寬限內");
  assert.ok(!G.liveActive(st, t, off(t - C.graceMs - 1)));
  assert.ok(G.liveActive(st, t, null) && G.liveActive(st, t, {}) && G.liveActive(st, t, off("x")) && G.liveActive(st, t, 5));
  assert.ok(G.liveStart(st, { uid: "s2", nick: "接手" }, t, off(t - C.graceMs - 1)).ok, "離線太久的可以被接手");
  assert.ok(!G.liveStart(st, { uid: "s2", nick: "接手" }, t, off(t)).ok);
});
T("斗內：金額在範圍內，錢從自己扣、進實況主，兩邊加起來不變", G => {
  const C = G.NUM.casino.live;
  const st = on(G), d = donor(G, "d1", 1000000), sw = wallet(G, 500000);
  const sum0 = d.w.chips + sw.chips;
  const r = G.liveDonate(st, d, sw, D1, T0 + 100, null, () => atK(G, 7));
  assert.ok(r.ok && r.n === C.base + C.step * 7);
  assert.strictEqual(d.w.chips, 1000000 - r.n); assert.strictEqual(sw.chips, 500000 + r.n);
  assert.strictEqual(d.w.chips + sw.chips, sum0);
  assert.strictEqual(d.w.lv.n, 1); assert.strictEqual(d.w.lv.sent, r.n); assert.strictEqual(sw.lv.got, r.n); assert.strictEqual(sw.lv.n, 0);
  assert.deepStrictEqual(JS(r.st.msg), { id: r.st.seq, at: T0 + 100, from: "小明", to: "阿播", toUid: "s1", n: r.n });
  assert.strictEqual(r.st.seq, st.seq + 1);
  assert.strictEqual(r.line, `小明 斗內了 ${G.casNum(r.n)}！實況主感謝 小明 的斗內～`);
  assert.strictEqual(st.msg, null, "輸入的狀態不被改");
  assert.ok(sw.st.chipsMax >= sw.chips);
});
T("守恆：很多人斗內很多次，全館籌碼總數不變", G => {
  const st0 = on(G), ds = ["a", "b", "c", "d", "e"].map((u, i) => donor(G, u, 2000000, "人" + i)), sw = wallet(G, 123456);
  const sum0 = ds.reduce((s, d) => s + d.w.chips, 0) + sw.chips;
  let st = st0, got = 0;
  for (let round = 0; round < 6; round++) for (const d of ds) {
    const r = G.liveDonate(st, d, sw, D1, T0 + 5, null, Math.random);
    if (r.ok) { st = r.st; got += r.n; }
  }
  assert.strictEqual(ds.reduce((s, d) => s + d.w.chips, 0) + sw.chips, sum0);
  assert.strictEqual(sw.lv.got, got); assert.ok(got <= G.NUM.casino.live.receiveCap);
});
T("不能斗自己；沒人在播；到期後不能斗內；都不扣錢", G => {
  const st = on(G, "s1"), d = { uid: "s1", nick: "阿播", w: wallet(G, 900000) }, sw = d.w;
  let r = G.liveDonate(st, d, sw, D1, T0 + 1, null, () => 0.5);
  assert.ok(!r.ok && r.reason === G.CAS_LIVE.self && d.w.chips === 900000 && !d.w.lv);
  const d2 = donor(G, "d2", 900000), sw2 = wallet(G, 0);
  r = G.liveDonate(G.liveNew(), d2, sw2, D1, T0, null, () => 0.5);
  assert.ok(!r.ok && r.reason === G.CAS_LIVE.noOne && d2.w.chips === 900000 && sw2.chips === 0);
  r = G.liveDonate(st, d2, sw2, D1, T0 + G.NUM.casino.live.durationMs, null, () => 0.5);
  assert.ok(!r.ok && r.reason === G.CAS_LIVE.noOne);
  r = G.liveDonate(st, d2, sw2, D1, T0 + 1, { state: "offline", at: T0 - 9e6 }, () => 0.5);
  assert.ok(!r.ok && r.reason === G.CAS_LIVE.noOne);
  assert.ok(!G.liveDonate(st, null, sw2, D1, T0, null).ok && !G.liveDonate(st, d2, null, D1, T0, null).ok);
});
T("不夠錢：你才沒那麼有錢，不會變負的，不算一次，剛好夠就能斗", G => {
  const C = G.NUM.casino.live, st = on(G), n = C.base + C.step * 10;
  const d = donor(G, "d1", n - 1), sw = wallet(G, 0);
  let r = G.liveDonate(st, d, sw, D1, T0, null, () => atK(G, 10));
  assert.ok(!r.ok && r.reason === "你才沒那麼有錢");
  assert.strictEqual(d.w.chips, n - 1); assert.strictEqual(sw.chips, 0); assert.strictEqual(d.w.lv.n, 0); assert.strictEqual(sw.lv.got, 0);
  d.w.chips = n;
  r = G.liveDonate(st, d, sw, D1, T0, null, () => atK(G, 10));
  assert.ok(r.ok && d.w.chips === 0 && sw.chips === n);
  const z = donor(G, "d3", 0);
  assert.ok(!G.liveDonate(st, z, sw, D1, T0, null, Math.random).ok && z.w.chips === 0);
});
T("每日上限：一人一天 3 次，第 4 次被擋，換日又有", G => {
  const C = G.NUM.casino.live, st = on(G), d = donor(G, "d1", 9e6), sw = wallet(G, 0);
  const sw2 = wallet(G, 0);
  for (let i = 0; i < C.perDay; i++) assert.ok(G.liveDonate(st, d, i % 2 ? sw2 : sw, D1, T0, null, () => 0).ok, "第 " + (i + 1) + " 次");
  const c = d.w.chips;
  const r = G.liveDonate(st, d, sw, D1, T0, null, () => 0);
  assert.ok(!r.ok && r.reason === G.CAS_LIVE.limit && d.w.chips === c);
  assert.strictEqual(G.liveMyView(d.w, D1).left, 0);
  assert.ok(G.liveDonate(st, d, sw, D2, T0, null, () => 0).ok, "05:00 換日");
  assert.strictEqual(d.w.lv.n, 1); assert.strictEqual(d.w.lv.times, C.perDay + 1, "累計不歸零");
});
T("收款上限：實況主一天最多收 100 萬，超過回今天收夠了；換日重算", G => {
  const C = G.NUM.casino.live, st = on(G), sw = wallet(G, 0);
  const max = C.base + C.step * C.kMax; // 每次都是最大 26 萬
  let got = 0;
  for (let i = 0; i < 6; i++) {
    const d = donor(G, "d" + i, 9e6), r = G.liveDonate(st, d, sw, D1, T0, null, () => 0.9999);
    if (got + max <= C.receiveCap) { assert.ok(r.ok, "第 " + i); got += max; } else { assert.ok(!r.ok && r.reason === "今天收夠了" && d.w.chips === 9e6 && d.w.lv.n === 0); }
  }
  assert.strictEqual(sw.lv.got, got); assert.ok(sw.lv.got <= C.receiveCap);
  const small = donor(G, "x", 9e6); // 小額的在剩下的空間裡還收得進去（剛好收滿也行）
  sw.lv.got = C.receiveCap - (C.base + C.step);
  assert.ok(G.liveDonate(st, small, sw, D1, T0, null, () => 0).ok && sw.lv.got === C.receiveCap);
  assert.ok(!G.liveDonate(st, donor(G, "y", 9e6), sw, D1, T0, null, () => 0).ok, "收滿了");
  const nd = donor(G, "z", 9e6); nd.w.lv = null;
  assert.ok(G.liveDonate(st, nd, sw, D2, T0, null, () => 0).ok, "換日重算");
  assert.strictEqual(sw.lv.day, D2); assert.strictEqual(sw.lv.got, C.base + C.step);
});
T("實況主沒有錢包：先給開場籌碼再加，不蓋掉、錢不憑空多出或消失", G => {
  const C = G.NUM.casino.live, st = on(G), d = donor(G, "d1", 1000000);
  const sw = G.casWalletFix(null, D1); // 伺服器沒讀到錢包時的樣子
  assert.strictEqual(sw.chips, G.NUM.casino.startChips);
  const r = G.liveDonate(st, d, sw, D1, T0, null, () => atK(G, 3));
  assert.ok(r.ok);
  assert.strictEqual(sw.chips, G.NUM.casino.startChips + r.n);
  assert.strictEqual(1000000 - d.w.chips, r.n);
  for (const bad of [undefined, 5, "x", [], { chips: "abc" }]) { // 壞資料也補起來
    const w = G.casWalletFix(bad, D1), d2 = donor(G, "d2", 1000000), s0 = w.chips;
    const x = G.liveDonate(st, d2, w, D1, T0, null, () => 0);
    assert.ok(x.ok && w.chips === s0 + x.n && w.chips >= 0);
  }
});
T("錢包的 lv 壞資料、舊錢包沒有：補起來不丟錯", G => {
  const st = on(G);
  for (const bad of [undefined, null, 5, "x", [], { n: "abc", day: 7, got: -3, sent: NaN, times: 1e400 }]) {
    const d = donor(G, "d1", 1e6), sw = wallet(G, 0); d.w.lv = bad; sw.lv = bad;
    const v = G.liveMyView(d.w, D1);
    assert.ok(v.left === G.NUM.casino.live.perDay && v.got === 0 && v.sent === 0, JSON.stringify(bad));
    assert.ok(G.liveDonate(st, d, sw, D1, T0, null, () => 0).ok);
  }
  const huge = donor(G, "d9", 1e6); huge.w.lv = { day: D1, n: 99 };
  assert.ok(!G.liveDonate(st, huge, wallet(G, 0), D1, T0, null, () => 0).ok, "次數壞成很大也擋");
});
T("壞狀態：不丟錯，當沒人在播；暱稱清理", G => {
  for (const bad of [undefined, null, 5, "x", [], {}, { uid: 7 }, { uid: "a b" }, { uid: "s1" }, { uid: "s1", until: "abc" }, { uid: "s1", until: -5 }, { uid: "../x", until: 99 }]) {
    const s = G.liveFix(bad);
    assert.strictEqual(s.uid, null, JSON.stringify(bad));
    assert.ok(!G.liveActive(bad, T0, null));
    assert.ok(G.liveStart(bad, { uid: "s1", nick: "a" }, T0, null).ok);
  }
  const s = G.liveFix({ uid: "s1", nick: "​\u0007 很長很長很長很長很長很長很長很長的暱稱 ", until: T0 + 5, seq: "3", msg: { id: 3, n: -5 } });
  assert.ok(s.nick.length > 0 && [...s.nick].length <= G.NUM.casino.titleMax && !/[​\u0007]/.test(s.nick));
  assert.strictEqual(s.msg, null); assert.strictEqual(s.seq, 3);
  assert.strictEqual(G.liveName(""), "館友"); assert.strictEqual(G.liveName(null), "館友");
  const m = G.liveFix({ seq: 2, msg: { id: 2, at: T0, from: "甲", to: "乙", toUid: "u 1", n: 50000 } }).msg;
  assert.ok(m && m.toUid === null && m.n === 50000);
});
T("鏡像到 Realtime Database 的樣子：沒有 null、沒有 undefined、不放 email 或錢包", G => {
  const st = on(G), d = donor(G, "d1", 1e6), sw = wallet(G, 0);
  const r = G.liveDonate(st, d, sw, D1, T0, null, () => 0.3);
  const node = G.liveNode(r.st);
  assert.deepStrictEqual(Object.keys(node).sort(), ["msg", "nick", "seq", "since", "uid", "until"]);
  assert.deepStrictEqual(Object.keys(node.msg).sort(), ["at", "from", "id", "n", "to", "toUid"]);
  assert.ok(!JSON.stringify(node).includes("null") && !JSON.stringify(G.liveNode(G.liveNew())).includes("null"));
  assert.deepStrictEqual(JS(G.liveNode(G.liveNew())), { seq: 0 });
  assert.deepStrictEqual(JS(G.liveFix(JS(node))), JS(r.st), "讀回來一樣");
  const ended = G.liveStop(r.st, "s1").st;
  assert.deepStrictEqual(Object.keys(G.liveNode(ended)).sort(), ["msg", "seq"], "下播後保留最近一則感謝，沒有 uid");
});
T("斗內的 seq 單調加一，msg.id 不重複（鏡像靠它擋掉舊的）", G => {
  let st = on(G), last = st.seq;
  for (let i = 0; i < 3; i++) { const r = G.liveDonate(st, donor(G, "d" + i, 1e6), wallet(G, 0), D1, T0, null, () => 0); assert.ok(r.ok && r.st.seq === last + 1 && r.st.msg.id === r.st.seq); st = r.st; last = st.seq; }
});
T("文字界線：只有暱稱；失敗的話不含別人的錢；用壹不用一", G => {
  const L = G.CAS_LIVE, all = Object.values(L).join("");
  assert.ok(!/破產|email|信箱/.test(all));
  assert.strictEqual(L.poor, "你才沒那麼有錢");
  assert.ok(!/[^\d]一[^般]/.test(all.replace(/一般/g, "")), "介面文字用壹：" + all.match(/.{0,4}一.{0,4}/));
  const st = on(G), d = donor(G, "d1", 5), r = G.liveDonate(st, d, wallet(G, 0), D1, T0, null, () => 0);
  assert.ok(!r.ok && !r.reason.includes("d1") && !r.reason.includes("阿播"), "沒錢的只回給按的人，不寫名字");
});
T("資料庫規則：casinoLive 館友讀、沒有人寫；既有節點的規則沒變", G => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "database.rules.json"), "utf8")).rules;
  const c = rules.casinoLive;
  assert.ok(c, "有 casinoLive");
  assert.ok(/root\.child\('members'\)\.child\(auth\.uid\)\.exists\(\)/.test(c[".read"]) && c[".read"].includes("auth != null"));
  assert.strictEqual(c[".write"], false);
  assert.strictEqual(rules[".read"], false); assert.strictEqual(rules[".write"], false);
  assert.strictEqual(rules.titles[".write"], false); assert.strictEqual(rules.status[".read"], "auth != null && root.child('members').child(auth.uid).exists()");
  assert.strictEqual(rules.members[".read"], false);
  assert.strictEqual(rules.invites[".read"], false); assert.strictEqual(rules.coopTalkLog[".read"], false);
  // 驗證只准白名單欄位
  const v = JSON.stringify(c);
  for (const k of ["seq", "uid", "nick", "since", "until", "msg"]) assert.ok(c[k] || c.msg && c.msg[k], "有 " + k);
  assert.ok(c["$other"] && c["$other"][".validate"] === false, "其他欄位不准");
});
console.log(`casino_live：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

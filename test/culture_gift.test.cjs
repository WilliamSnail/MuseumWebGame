// 決定 0131：文化部資助壹位館友（只壹次、不是借款）：錢從文化部（u-culture）出到錢包，守恆；信的內容讀 CAS_GIFT；金流圖有 文化部 → 館友 的線。node test/culture_gift.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({ __realMoney: true }); G.NUM.casino.grants = []; G.NUM.casino.houseLoan.fix.on = false; G.NUM.casino.bankSplit.on = false; try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const D0 = "2026-11-19", NICK = "YUGa Chu";
const mk = G => { const h = G.casHouseFix(G.casHouseNew(), D0).house, w = G.casWalletFix(G.casWalletNew(), D0); return { h, w }; };
const inv = (G, s) => { const x = G.casBookSnap([s.w], s.h, 0, null); return G.casBookTotal(x) - G.casBookMinted(x) + G.casBookBurned(x); };
T("該收的人：10 億從文化部到錢包；已知世界少 10 億、文化部帳少 10 億（別的集團不動）；錢守恆；不是借款；莊家、博物館資金不動", G => {
  const s = mk(G), G0 = G.NUM.casino.cultureGift, t0 = inv(G, s), a0 = G.wuAmounts(s.h), c0 = s.w.chips, w0 = s.h.world, bank0 = s.h.bankroll, bud0 = s.h.budget, debt0 = JSON.stringify(s.h.debt);
  const r = G.casCultureGift(s.w, s.h, NICK, D0, 1e12); assert.ok(r, "要寄信"); assert.strictEqual(r.got, G0.amt);
  const a1 = G.wuAmounts(s.h); assert.strictEqual(s.w.chips - c0, G0.amt); assert.strictEqual(w0 - s.h.world, G0.amt); assert.strictEqual(a0["u-culture"] - a1["u-culture"], G0.amt); for (const k of Object.keys(a0)) if (!["u-culture"].includes(k)) assert.strictEqual(a1[k], a0[k], k);
  assert.strictEqual(inv(G, s), t0, "守恆"); assert.strictEqual(s.h.bankroll, bank0); assert.strictEqual(s.h.budget, bud0); assert.strictEqual(JSON.stringify(s.h.debt), debt0, "不記成債"); assert.strictEqual(s.h.led.world.cultureGift, -G0.amt);
  assert.strictEqual(s.h.led.units["cultureGift|u-culture|players"], G0.amt);
});
T("只撥壹次：第二次什麼都不做（錢包記著、莊家文件也記著）；別的暱稱、關掉都不撥", G => {
  const s = mk(G); assert.ok(G.casCultureGift(s.w, s.h, "  yuga  CHU ", D0, 1e12), "暱稱去空白、小寫比對"); const c1 = s.w.chips; assert.strictEqual(G.casCultureGift(s.w, s.h, NICK, D0, 1e12), null); assert.strictEqual(s.w.chips, c1);
  const s2 = mk(G); s2.w.gifts = {}; assert.strictEqual(G.casCultureGift(s2.w, s2.h, "小明", D0, 1e12), null); assert.strictEqual(s2.w.chips, mk(G).w.chips);
  const s3 = mk(G); const id = G.NUM.casino.cultureGift.id; s3.h.cg = { [id]: D0 }; assert.strictEqual(G.casCultureGift(s3.w, s3.h, NICK, D0, 1e12), null, "莊家文件記著就不撥（錢包被重建也不會再撥）");
  G.NUM.casino.cultureGift.on = false; assert.strictEqual(G.casCultureGift(mk(G).w, mk(G).h, NICK, D0, 1e12), null); assert.ok(!G.casGiftWho(NICK));
});
T("信：從文化部、標題、內文讀 CAS_GIFT（收信人暱稱填進去、一行一行），沒有附件，一年後過期；沒有提到謎底", G => {
  const s = mk(G), r = G.casCultureGift(s.w, s.h, NICK, D0, 1e12), m = r.mail, T0 = G.CAS_GIFT;
  assert.strictEqual(m.from, T0.name); assert.strictEqual(m.title, T0.title); assert.ok(m.note.startsWith("館友 " + NICK + "：")); assert.ok(m.note.includes("拾億") && m.note.split("\n").length >= 15, "多行"); assert.strictEqual(JSON.stringify(m.gift), JSON.stringify({ insp: 0, mood: 0 })); assert.strictEqual(m.claimed, false); assert.ok(m.expire > D0);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(m.id) && m.id === r.id, "信的編號能當文件名");
  const mr = G.mailRow(m); assert.ok(mr && mr.title === T0.title, "信箱讀得進去");
});
T("已知世界付不出（池子吃緊）就先不撥，不會撥一半；撥完文化部帳還夠", G => {
  const s = mk(G); s.h.world = 5e8; assert.strictEqual(G.casCultureGift(s.w, s.h, NICK, D0, 1e12), null); assert.ok(!(s.h.cg && s.h.cg[G.NUM.casino.cultureGift.id]));
  const s2 = mk(G); G.casCultureGift(s2.w, s2.h, NICK, D0, 1e12); assert.ok(G.wuAmounts(s2.h)["u-culture"] >= 0);
});
T("金流圖：文化部（w:u-culture）→ 館友 的線，不再從整個已知世界出來；標籤是「文化部資助」", G => {
  const s = mk(G), D1 = "2026-11-19", s0 = G.casBookSnap([], G.casHouseFix(G.casHouseNew(), D0).house, 0, D1); G.casCultureGift(s.w, s.h, NICK, D0, 1e12); s.h.econ = Object.assign({}, s.h.econ, { day: D1, led0: G.casFlowLed0(s0) });
  const r = G.casFlowHub(s.h, D1), e = r.edges.find(x => x.from === "w:u-culture" && x.to === "players"); assert.ok(e && e.amt === G.NUM.casino.cultureGift.amt && e.srcs[0].label === "文化部資助", JSON.stringify(r.edges.filter(x => x.to === "players")));
  assert.ok(!r.edges.some(x => x.from === "world" && x.srcs.some(y => y.src === "cultureGift")));
});
console.log(`${pass} passed, ${fail} failed（文化部資助）`);
process.exit(fail ? 1 : 0);

// 每日重要事件清單（shared/headlines.js）：node test/headlines.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load({}); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, e.message); } };
const D = "2026-11-16";

T("沒有資料、壞資料都回空陣列，不丟錯", G => {
  assert.strictEqual(G.todayHeadlines(null, D).length, 0);
  assert.strictEqual(G.todayHeadlines({ policy: 5, econ: "x", market: {}, events: null, notices: 3 }, D).length, 0);
});
T("只放今天的：過去的政策、換狀態、市場新聞、公告都不放", G => {
  const r = G.todayHeadlines({
    policy: { name: "舊政策", day: "2026-11-10", until: "2026-11-12" },
    econ: { world: { events: [{ day: "2026-11-14", text: "舊消息" }, { day: D, text: "島上科技集團減薪了" }] } },
    market: [{ day: "2026-11-15", items: [{ title: "昨天", line: "" }] }, { day: D, items: [{ title: "今天", line: "有事", tone: "up" }] }],
    notices: [{ title: "舊", importance: "important", publish: "2026-11-15" }, { title: "新", importance: "important", publish: D }] }, D);
  const t = r.map(x => x.text).join("|");
  assert.ok(!/舊/.test(t), t); assert.ok(/島上科技集團減薪了/.test(t) && /今天：有事/.test(t) && /新/.test(t));
});
T("每種有上限、總數不超過 HL.max、預告最多壹則且排最後並標 upcoming", G => {
  const many = n => Array.from({ length: n }, (_, i) => ({ day: D, text: "e" + i, title: "m" + i, importance: "important", publish: D }));
  const r = G.todayHeadlines({ econ: { news: "景氣", world: { events: many(9) }, report: [["a", 1], ["b", 2], ["c", 3]] }, market: [{ day: D, items: many(9) }], notices: many(9), events: many(9),
    upcoming: [{ text: "明天開簽收窗口", date: "2026-11-17" }, { text: "後天", date: "2026-11-18" }] }, D);
  assert.ok(r.length <= G.HL.max, r.length);
  assert.strictEqual(r.filter(x => x.kind === "world").length, G.HL.world); assert.strictEqual(r.filter(x => x.kind === "market").length, G.HL.market);
  assert.strictEqual(r.filter(x => x.upcoming).length, 1); assert.ok(r[r.length - 1].upcoming && /^預告：/.test(r[r.length - 1].text));
});
T("預告已經是今天或過去就不算預告；公告只放重要以上；tone 和 link 合法", G => {
  const r = G.todayHeadlines({ upcoming: [{ text: "今天", date: D }], notices: [{ title: "普通", importance: "normal", publish: D }, { title: "急", importance: "urgent", publish: D }],
    econ: { news: "壞", idx: -0.8 }, policy: { name: "P", effect: "門票多一成", day: D, until: D } }, D);
  assert.ok(!r.some(x => x.upcoming) && !r.some(x => x.text === "普通"));
  assert.strictEqual(r[0].kind, "policy"); assert.ok(/門票多一成/.test(r[0].text));
  assert.strictEqual(r.find(x => x.kind === "mood").tone, "bad");
  assert.ok(r.every(x => ["good", "neutral", "warn", "bad"].includes(x.tone) && ["bank", "board", "casino", "events"].includes(x.link)));
});
T("播放順序洗牌：內容不增不減、同壹次停留順序不變、新來的不重洗舊的", G => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ kind: "world", text: "t" + i, tone: "neutral", link: "bank" }));
  let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ranks = new Map(), a = G.orderHeadlines(mk(8), ranks, rng), b = G.orderHeadlines(mk(8), ranks, rng);
  assert.deepStrictEqual(a.map(x => x.text).sort(), mk(8).map(x => x.text).sort(), "內容壹樣");
  assert.deepStrictEqual(a.map(x => x.text), b.map(x => x.text), "同壹次停留順序不變");
  assert.notDeepStrictEqual(a.map(x => x.text), mk(8).map(x => x.text), "順序有換");
  const c = G.orderHeadlines(mk(8).concat([{ kind: "world", text: "新", tone: "neutral", link: "bank" }]), ranks, rng).map(x => x.text);
  assert.deepStrictEqual(c.filter(t => t !== "新"), a.map(x => x.text), "舊的相對順序沒變");
  const d = G.orderHeadlines(mk(8), new Map(), rng).map(x => x.text);
  assert.notDeepStrictEqual(d, a.map(x => x.text), "新的壹次停留會重洗");
  assert.strictEqual(G.orderHeadlines(null, new Map(), rng).length, 0);
});
console.log(`每日重要事件：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);

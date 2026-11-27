// 傍晚行情（11-27，翊文：「傍晚行情 這個還不錯，可以也排成發嗎」）：node test/discord/evening.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
const G = load();
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const NAMES = Object.fromEntries(G.OUT_STOCKS.map(s => [s.id, s.name]));
const mk = (day, rows, fx) => ({ day, openIdx: 0, fx, R: Object.fromEntries(rows.map(([id, c]) => [id, { px: c }])), prevReal: Object.fromEntries(rows.map(([id, , p]) => [id, p])) });
const TW = mk("2026-11-27", [["islandforge", 2180, 2145], ["cloudcabinet", 1670, 1570], ["customchip", 3595, 3735], ["pillpot", 103, 100]]);
const US = mk("2026-11-27", [["nightindex", 649.43, 633.93], ["greeneye", 155.6, 149.3], ["redclaw", 427, 406.03], ["oldgamestore", 26.9, 26.97], ["bluefireyard", 37.13, 37.13]], 32.93);
const base = o => Object.assign({ day: "2026-11-27", usDay: "2026-11-27", tw: TW, us: US, names: NAMES, twIds: G.TW_IDS, usIds: G.US_IDS, twSyms: { islandforge: "2330", cloudcabinet: "6669" }, usSyms: { greeneye: "NVDA" } }, o);

T("兩邊都有：台股收盤、美股盤前（指數、每支壹行、遊戲價 ＝ 匯率 × 真實價）、家數、評語；用壹不用一", () => {
  const t = G.dcEveningText(base({ early: true }));
  assert.ok(t.includes("傍晚行情") && t.includes("兩本帳"), t);
  assert.ok(/🏮 \*\*台股收盤\*\*（11-27）\n📈 漲得最兇：\n大戶櫃匠 6669 ▲6\.4%（1,670）/.test(t), t);
  assert.ok(t.includes("🌙 **美股盤前**") && /綠眼顯卡 NVDA ▲4\.2%（5,124）/.test(t), t);
  assert.ok(t.includes("匯率 32.93") && t.includes("💬 ") && t.includes("⏰ 美股今天提早收盤"), t);
  assert.ok(!/一/.test(t));
});
T("只有壹邊：台股沒開就只寫美股、美股沒開就只寫台股；兩邊都沒開回空字串", () => {
  const usOnly = G.dcEveningText(base({ tw: mk("2026-11-26", [["islandforge", 1, 1], ["pillpot", 1, 1], ["customchip", 1, 1]]) }));
  assert.ok(!usOnly.includes("台股收盤") && usOnly.includes("美股盤前"), usOnly);
  const twOnly = G.dcEveningText(base({ us: Object.assign({}, US, { closed: true }) }));
  assert.ok(twOnly.includes("台股收盤") && !twOnly.includes("美股盤前") && !twOnly.includes("⏰"), twOnly);
  assert.strictEqual(G.dcEveningText(base({ day: "2026-11-28", usDay: "2026-11-28" })), "");
});
T("評語照兩邊的心情挑；同壹天同壹句", () => {
  const T2 = G.EVENING_TALK, talk = o => (G.dcEveningText(base(o)).split("\n").find(l => l.startsWith("💬 ")) || "").slice(3);
  assert.ok(T2.twDownUsUp.includes(talk({ tw: mk("2026-11-27", [["islandforge", 95, 100], ["pillpot", 95, 100], ["customchip", 99, 100]]) })), "台股跌、美股盤前漲");
  assert.ok(T2.bothUp.includes(talk({})), "兩邊都漲");
  assert.strictEqual(talk({}), talk({}));
  Object.values(T2).flat().forEach(s => assert.ok(!/一/.test(s), s));
});

console.log(`${pass} passed, ${fail} failed（傍晚行情）`);
process.exit(fail ? 1 : 0);

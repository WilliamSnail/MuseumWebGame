// Yuga Bot 交代的任務、沒錢可以借（決定 0051 補）：node test/yuga.test.cjs（npm test 也會跑）
// 看：giver 的文字進不進得了遊戲、說過 done 不重複、舊存檔、壞資料、Discord 的訊息（有 says、不帶理智）、借錢的共用規則。
// 真的叫模擬器的 /pepe-借錢 要用 node tools/discord_fake.cjs（tools/README.md）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const { readWeeks } = require("../tools/week_check.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setNowClock(null); G.setRng(null); } };
const clone = o => JSON.parse(JSON.stringify(o));
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const FILES = Object.fromEntries(Object.entries(readWeeks().files).filter(([k]) => k.startsWith("備用/")));
const BAD = /理智|怪癖|靈感|[\w.+-]+@[\w-]+\.[\w.]+/;
// 正式週 2026-W47，d2 的第 1 個每日任務換成 Yuga 交代的（extra 可以改欄位）
function lib(G, extra) {
  const files = clone(FILES);
  const wk = clone(files["備用/常青1/week.json"]); wk.week = "2026-W47"; wk.start = "2026-11-16";
  files["2026-W47/week.json"] = wk;
  for (let n = 1; n <= 7; n++) { const d = clone(files[`備用/常青1/d${n}.json`]); d.date = G.addDays("2026-11-16", n - 1); files[`2026-W47/d${n}.json`] = d; }
  Object.assign(files["2026-W47/d2.json"].daily[0], { giver: "yuga", says: "R，我剛想到壹件事。B2 那邊你幫我數壹下。", done: "R。我就知道。" }, extra || {});
  return G.storyLibrary(files);
}
const D2 = "2026-11-17", D3 = "2026-11-18";
const person = (G, date) => { const P = G.newProfile("challenge"); G.ensureDay(P, date); return P; };

T("giver 任務進得了遊戲：今天的 giver、says、done", G => {
  const P = person(G, D2), W = G.storyWeek(lib(G), D2, P);
  const t = G.yugaTaskOf(W);
  assert.strictEqual(t.giver, "yuga"); assert.strictEqual(t.says, "R，我剛想到壹件事。B2 那邊你幫我數壹下。"); assert.strictEqual(t.done, "R。我就知道。");
  assert.strictEqual(G.taskText(t, W).includes("R"), false, "任務本身的字還是遊戲產生的，不含荷官的話");
});
T("沒有 giver 的天：沒有；隔天也沒有（只看今天）", G => {
  const P = person(G, D3), W = G.storyWeek(lib(G), D3, P);
  assert.strictEqual(G.yugaTaskOf(W), null); assert.strictEqual(G.yugaLine(P, W), null);
  const P1 = person(G, "2026-11-16"); assert.strictEqual(G.yugaTaskOf(G.storyWeek(lib(G), "2026-11-16", P1)), null);
});
T("沒做完說 says；做完說 done 一次；說完不重複；明天不說", G => {
  const P = person(G, D2), W = G.storyWeek(lib(G), D2, P), t = G.yugaTaskOf(W);
  let l = G.yugaLine(P, W);
  assert.strictEqual(l.kind, "says"); assert.ok(l.text.includes("B2"));
  assert.strictEqual(G.yugaLine(P, W).kind, "says", "沒做完，每次都說（機率 100%）");
  G.storyState(P).tasks[t.id] = { base: 0, done: D2, claimed: null };
  l = G.yugaLine(P, W);
  assert.strictEqual(l.kind, "done"); assert.strictEqual(l.text, "R。我就知道。");
  G.yugaMarkSaid(P, l.id, D2);
  assert.strictEqual(G.yugaLine(P, W), null, "說過就不再說");
  assert.strictEqual(P.story.said[t.id], D2, "記在存檔");
  const P2 = person(G, D3); P2.story = clone(P.story);
  assert.strictEqual(G.yugaLine(P2, G.storyWeek(lib(G), D3, P2)), null);
});
T("做完了但沒寫 done：什麼都不說", G => {
  const P = person(G, D2), W = G.storyWeek(lib(G, { done: undefined }), D2, P), t = G.yugaTaskOf(W);
  G.storyState(P).tasks[t.id] = { base: 0, done: D2 };
  assert.strictEqual(G.yugaLine(P, W), null);
});
T("舊存檔（沒有 said）、壞資料不丟錯", G => {
  const P = person(G, D2), W = G.storyWeek(lib(G), D2, P), t = G.yugaTaskOf(W);
  delete P.story; assert.strictEqual(G.yugaLine(P, W).kind, "says");
  P.story = { v: 1, tasks: {}, said: "壞掉" }; assert.strictEqual(G.yugaLine(P, W).kind, "says"); assert.deepStrictEqual(clone(P.story.said), {});
  P.story.tasks[t.id] = { done: D2 }; P.story.said = null; assert.strictEqual(G.yugaLine(P, W).kind, "done");
  assert.strictEqual(G.yugaLine(null, W), null); assert.strictEqual(G.yugaLine(P, null), null);
  const old = G.newProfile("challenge"); G.ensureDay(old, D2); G.storyState(old); // 舊存檔補欄位
  assert.deepStrictEqual(clone(old.story.said), {});
});
T("壞的 giver：不是 yuga、沒有字、太長、不是字串 → 當作沒有", G => {
  const check = (extra, ok) => { const P = person(G, D2), W = G.storyWeek(lib(G, extra), D2, P); assert.strictEqual(!!G.yugaTaskOf(W), ok, JSON.stringify(extra)); };
  check({ giver: "boss" }, false); check({ says: "" }, false); check({ says: "   " }, false); check({ says: 123 }, false); check({ says: null }, false);
  check({ giver: undefined }, false); check({}, true);
  const P = person(G, D2), W = G.storyWeek(lib(G, { says: "字".repeat(80), done: ["x"] }), D2, P), t = G.yugaTaskOf(W);
  assert.strictEqual([...t.says].length, G.YUGA_MAX); assert.strictEqual(t.done, "");
});
T("自由模式、過去的週：不說", G => {
  const P = G.newProfile("free"); G.ensureDay(P, D2);
  assert.strictEqual(G.yugaLine(P, G.storyWeek(lib(G), D2, P)), null);
  const Q = person(G, "2026-11-30"); assert.strictEqual(G.yugaLine(Q, G.storyWeekAt(lib(G), "2026-W47", "2026-11-30")), null);
});
T("備用週、備用的壹天的 giver 不收", G => {
  const files = clone(FILES); Object.assign(files["備用/常青1/d1.json"].daily[0], { giver: "yuga", says: "R，測試。" });
  const L = G.storyLibrary(files), P = person(G, "2026-11-09"), W = G.storyWeek(L, "2026-11-09", P);
  assert.ok(W.fallback); assert.strictEqual(G.yugaTaskOf(W), null);
});
T("過了八週的 said 會清掉", G => {
  const P = person(G, D2), S = G.storyState(P);
  S.said["2026-W30/d1a"] = "2026-07-20"; S.said["2026-W47/d2a"] = D2;
  G.pruneStory(S, D2);
  assert.ok(!("2026-W30/d1a" in S.said)); assert.ok("2026-W47/d2a" in S.said);
});

// ---------- Discord ----------
const INFO = { week: "2026-W47", yuga: { id: "d2a", says: "R，我剛想到壹件事。B2 那邊你幫我數壹下。" } };
T("Discord：dcYugaLine 沒做完有 says；做完、沒有任務、壞資料都沒有；不含理智", G => {
  assert.strictEqual(G.dcYugaLine(INFO, null), INFO.yuga.says);
  assert.strictEqual(G.dcYugaLine(INFO, { profiles: { challenge: { story: { tasks: {} } } } }), INFO.yuga.says);
  assert.strictEqual(G.dcYugaLine(INFO, { profiles: { challenge: { story: { tasks: { "2026-W47/d2a": { done: "x" } } } } } }), "");
  assert.strictEqual(G.dcYugaLine({ week: "2026-W47" }, null), ""); assert.strictEqual(G.dcYugaLine(null, null), "");
  assert.strictEqual(G.dcYugaLine({ week: "w", yuga: { id: "a", says: 5 } }, null), "");
  assert.strictEqual(G.dcYugaLine({ week: "w", yuga: { id: "a", says: "這句有理智" } }, null), "", "頻道裡不放理智");
  assert.strictEqual(G.dcYugaLine({ week: "w", yuga: { says: "沒有 id" } }, 7), "");
  assert.ok(!BAD.test(G.dcYugaLine(INFO, {})));
});
T("Discord：今日活動（公開）不帶 Yuga 交代的事", G => {
  const t = G.dcTodayText("2026-11-17", [], Object.assign({ title: "測", n: 2, board: "公佈欄", real: [] }, INFO));
  assert.ok(!t.includes("B2") && !t.includes("數壹下"));
});
T("打包：copy_shared 只放 says 和 id，不放任務種類、答案、獎勵", () => {
  const src = read("tools/copy_shared.cjs");
  const m = /\.yuga = \{[^}]*\}/.exec(src);
  assert.ok(m && /id: g\.id, says:/.test(m[0]) && !/kind|reward|need|exhibit|room|book/.test(m[0]), m && m[0]);
});

// ---------- 借錢 ----------
T("借錢規則只有壹套：casCanRelief 跟 casLoanWhyNot 同步，數字讀 NUM", G => {
  const C = G.NUM.casino.loan, w = G.casWalletFix(null, "2026-11-17");
  assert.strictEqual(G.casCanRelief(w), true, "有錢也能借（決定 0064）");
  assert.strictEqual(G.casWalletView(w, "2026-11-17").canRelief, true);
  w.chips = -1; assert.strictEqual(G.casCanRelief(w), true, "欠款中也能借（翊文 11-10）");
  w.chips = 0; w.loan.limit = C.min - 1; assert.strictEqual(G.casCanRelief(w), false, "額度不夠");
  assert.strictEqual(G.casCanRelief(null), false);
});
T("錢不夠的原因認得出來（下注、餐車、換小獎、斗內），別的原因不是", G => {
  const bet = G.casBetCheck("999999999", 500).line, diner = G.casFill(G.CAS_TEXT.dinerBroke, { chips: "500" });
  [bet, diner, G.CAS_LIVE.poor, "籌碼不夠（要 5,000）"].forEach(s => assert.ok(G.casPoorReason(s), s));
  ["最少要下 100", "今天借完了", "", null, undefined, "你還有籌碼，不用借"].forEach(s => assert.ok(!G.casPoorReason(s), String(s)));
});
T("Discord：dcBorrowTip 只有錢不夠而且借得到才有；/pepe-借錢 成功的訊息", G => {
  const w = G.casWalletFix(null, "2026-11-17"); w.chips = 10;
  const poor = G.casBetCheck("5000", 10).line;
  assert.ok(G.dcBorrowTip(poor, w).includes("/pepe-借錢"));
  assert.strictEqual(G.dcBorrowTip("最少要下 100", w), "");
  w.loan.limit = 0; assert.strictEqual(G.dcBorrowTip(poor, w), "", "借不到了不用提醒");
  const w3 = G.casWalletFix(null, "2026-11-17"); w3.chips = 0;
  const r = G.casRelief(w3, "2026-11-17"), txt = G.dcBorrowText(Object.assign({}, r, { wallet: { chips: w3.chips } }));
  assert.ok(txt.includes("Yuga 借你") && txt.includes("利息") && txt.includes(G.dcNum(w3.chips)), txt);
  assert.strictEqual(w3.chips, G.NUM.casino.loan.discord, "Discord 壹次借 NUM.casino.loan.discord");
  assert.ok(!BAD.test(txt) && !BAD.test(G.DC_TEXT.borrowTip));
});
T("指令 /pepe-借錢：在清單裡、無選項、在 PLAY_COMMANDS 和 handler、走 playCore 同壹個動作", G => {
  const c = G.dcCommands().find(x => x.name === "pepe-借錢");
  assert.ok(c && c.options === undefined && c.description.length <= 100 && c.description.length >= 1);
  assert.strictEqual(G.dcCommandKey("pepe-借錢"), "borrow");
  const d = read("functions/discord_play.js"), cs = read("functions/casino.js");
  assert.ok(/borrow: cmdBorrow/.test(d) && /DC_CMD\.borrow\]/.test(d));
  assert.ok(d.includes('playCore(me, "", {}, actRelief)'));
  assert.ok(cs.includes("case \"relief\": return play(req, me, {}, actRelief)"), "遊戲跟 Discord 用同壹個動作");
  assert.ok(!/casRelief\(/.test(d), "Discord 不自己寫規則");
});
T("遊戲畫面：借錢那壹條在每個頁籤上方，平常就看得到，借和還都走伺服器", () => {
  const u = read("web/src/ui_casino.js");
  assert.ok(u.includes("replaceChildren(...[tabs, reliefBar()"), "頁籤下面每頁都有");
  assert.strictEqual((u.match(/act\("relief"/g) || []).length, 0, "遊戲改用 borrow");
  assert.ok(u.includes('act("borrow"') && u.includes('act("repay"'));
  assert.ok(u.includes("casPoorReason(r.reason)"));
});

console.log(`${fail ? "✗" : "✓"} Yuga Bot 交任務、沒錢可以借：${pass} 項通過${fail ? `、${fail} 項沒過` : ""}`);
process.exit(fail ? 1 : 0);

// 全館投票的畫面判斷（shared/story/vote_screen.js）：入口什麼時候看得到、畫哪壹種、名字和送出鈕、備用句子、比例、館友證、跟伺服器回的形狀對得上
// node test/story/vote_screen.test.cjs（npm test 也會跑）
const assert = require("assert"), fs = require("fs"), path = require("path");
const { load } = require("../load_shared.cjs");
const G = load(), C = G.NUM.story.vote, T = G.voteTimes(C), H = 3600000, D = 24 * H;
const J = v => JSON.parse(JSON.stringify(v));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
// 照伺服器的規則做壹包回應
const view = (now, mine, state) => { const s = G.voteSettle(state || null, now, C).state; return J(G.voteView(s, mine || null, now, s.result ? [G.voteHistory(s.result, C)] : [], C)); };
const mine = (o = {}) => Object.assign({ choice: "write", name: "小明", at: T.opensAt + H, changes: 0, late: false }, o);

t("開投前壹天起才看得到入口；公布後留七天，館友證壹直看得到", () => {
  const times = G.voteUiTimes(null);
  assert.deepStrictEqual(J(times), J(T));
  assert.strictEqual(G.voteUiShow(Date.parse("2026-11-28T12:00:00+08:00"), times), false);
  assert.strictEqual(G.voteUiShow(Date.parse("2026-12-11T04:59:59+08:00"), times), false);
  assert.strictEqual(G.voteUiShow(Date.parse("2026-12-11T05:00:00+08:00"), times), true);
  assert.strictEqual(G.voteUiShow(T.resultAt + 6 * D, times), true);
  assert.strictEqual(G.voteUiShow(T.resultAt + 7 * D, times), false);
  assert.strictEqual(G.voteUiEver(T.resultAt + 100 * D, times), true);
  assert.strictEqual(G.voteUiEver(T.opensAt - D - 1, times), false);
  assert.strictEqual(G.voteUiEntry(T.opensAt - 2 * D, null), null);
});
t("照時間算的階段跟伺服器同壹個切法（截止那壹刻還開著）", () => {
  for (const now of [T.opensAt - 1, T.opensAt, T.closesAt, T.closesAt + 1, T.resultAt - 1, T.resultAt]) assert.strictEqual(G.voteUiPhaseAt(now, G.voteUiTimes(null)), G.votePhase(now, C), String(now));
});
t("三個時間以伺服器回的為準", () => {
  const v = view(T.opensAt + H); v.closesAt = T.closesAt - D;
  assert.strictEqual(G.voteUiTimes(v).closesAt, T.closesAt - D);
  assert.strictEqual(G.voteUiPhaseAt(T.closesAt - H, G.voteUiTimes(v)), "counting");
});
t("畫哪壹種：能不能投壹律看 phase（公布以後 changesLeft 還是 1 也不能投）", () => {
  assert.strictEqual(G.voteUiMode(view(T.opensAt - H)), "before");
  assert.strictEqual(G.voteUiMode(view(T.opensAt + H)), "pick");
  assert.strictEqual(G.voteUiMode(view(T.opensAt + H, mine())), "mine");
  assert.strictEqual(G.voteUiMode(view(T.opensAt + H, mine({ changes: 1 }))), "locked");
  const counting = view(T.closesAt + H), result = view(T.resultAt + H);
  assert.strictEqual(counting.changesLeft, 1); assert.strictEqual(result.changesLeft, 1);
  assert.strictEqual(G.voteUiMode(counting), "counting"); assert.strictEqual(G.voteUiMode(result), "result");
  assert.strictEqual(G.voteUiMode(null), null);
});
t("名字：空的、太長只擋送出不砍字；算字數跟伺服器壹樣（連續空白算壹個、表情算壹個）", () => {
  assert.strictEqual(G.voteUiName("   ").why, "noName");
  const long = "壹".repeat(C.nameMax + 1), n = G.voteUiName(long);
  assert.strictEqual(n.why, "longName"); assert.strictEqual(n.name, long); assert.strictEqual(n.len, C.nameMax + 1);
  assert.strictEqual(G.voteUiName("壹".repeat(C.nameMax)).ok, true);
  assert.strictEqual(G.voteUiName(" 阿  明 ").len, 3);
  assert.strictEqual(G.voteUiName("🐸🐸").len, 2);
  assert.strictEqual(G.voteUiName("<b>").why, "badName");
});
t("送出鈕：沒選、名字不行、跟現在這票壹樣都不能按；送的就是玩家選的和打的", () => {
  assert.strictEqual(G.voteUiForm({ choice: null, name: "" }, null).ok, false);
  assert.strictEqual(G.voteUiForm({ choice: "write", name: "" }, null).hint, G.VOTE_TEXT.no.noName);
  assert.ok(G.voteUiForm({ choice: "write", name: "壹".repeat(13) }, null).hint.includes(String(C.nameMax)));
  assert.deepStrictEqual(J(G.voteUiForm({ choice: "write", name: " 小明 " }, null).data), { op: "vote", choice: "write", name: "小明" });
  assert.deepStrictEqual(J(G.voteUiForm({ choice: "blank", name: "留著沒送的字" }, null).data), { op: "vote", choice: "blank" });
  assert.strictEqual(G.voteUiForm({ choice: "write", name: "小明" }, mine()).ok, false);
  assert.strictEqual(G.voteUiForm({ choice: "write", name: "小華" }, mine()).ok, true);
  assert.strictEqual(G.voteUiForm({ choice: "blank", name: "" }, mine({ choice: "blank", name: "" })).ok, false);
  assert.strictEqual(G.voteUiForm({ choice: "return", name: "" }, mine()).ok, true);
});
t("每個 why 都有備用句子；伺服器有給理由就用它的", () => {
  for (const why of ["before", "closed", "badChoice", "noName", "longName", "badName", "noChange"]) {
    const s = G.voteUiWhy(why); assert.ok(s && !s.includes("{"), why); assert.notStrictEqual(s, G.VOTE_SCREEN_TEXT.otherNo);
  }
  assert.strictEqual(G.voteUiWhy("noChange"), G.voteUiSay(G.VOTE_TEXT.no.noChange, { n: C.changes }));
  assert.strictEqual(G.voteUiWhy("whatever"), G.VOTE_SCREEN_TEXT.otherNo);
  assert.strictEqual(G.voteUiWhy("toString"), G.VOTE_SCREEN_TEXT.otherNo);
  assert.strictEqual(G.voteUiWhy("closed", "伺服器的話"), "伺服器的話");
});
t("時間的字：台灣時間、倒數", () => {
  assert.strictEqual(G.voteUiWhen(T.opensAt), "12/12（六）05:00");
  assert.strictEqual(G.voteUiWhen(T.closesAt), "12/15（二）23:59");
  assert.strictEqual(G.voteUiWhen(T.resultAt), "12/16（三）05:00");
  assert.strictEqual(G.voteUiLeft(D + 3 * H + 1000), "1 天 3 小時");
  assert.strictEqual(G.voteUiLeft(2 * H + 5 * 60000), "2 小時 5 分");
  assert.strictEqual(G.voteUiLeft(65000), "1 分 5 秒");
  assert.strictEqual(G.voteUiLeft(-5), "0 秒");
});
t("理智低的門檻跟怪事同壹個（NUM.sanFx.tiers[0]）；燈熄了也算", () => {
  const edge = G.NUM.sanFx.tiers[0];
  assert.strictEqual(G.voteUiShaky(edge, false), false);
  assert.strictEqual(G.voteUiShaky(edge - 1, false), true);
  assert.strictEqual(G.voteUiShaky(0, false), true);
  assert.strictEqual(G.voteUiShaky(80, true), true);
  assert.strictEqual(G.voteUiShaky(undefined, false), false);
});
t("比例：固定照三個選項的順序、不排名、只有百分比", () => {
  const rows = G.voteUiShares({ winner: "blank", share: { write: 35, blank: 45, return: 20 } });
  assert.deepStrictEqual(J(rows.map(r => [r.id, r.pct, r.win])), [["write", 35, false], ["blank", 45, true], ["return", 20, false]]);
  assert.ok(rows.every(r => r.label === G.VOTE_TEXT.options[r.id] && Object.keys(r).join() === "id,label,pct,win"));
  assert.deepStrictEqual(J(G.voteUiShares(null).map(r => r.pct)), [0, 0, 0]);
});
t("還有幾頁沒翻：看 u-m-you；資料還沒有就安靜地不顯示", () => {
  assert.strictEqual(G.voteUiPages([{ id: "u-m-you", left: 2 }, { id: "u-x", left: 9 }]), 2);
  for (const near of [undefined, null, [], [{ id: "u-x", left: 1 }], [{ id: "u-m-you", left: 0 }]]) assert.strictEqual(G.voteUiPages(near), 0);
  const P = G.newProfile("challenge");
  assert.strictEqual(G.voteUiPages(G.understandView(P, {}, "2026-12-12").near), 0);
});
t("大廳和任務板那張卡：每個階段的字和要不要提醒", () => {
  const e = (now, v) => G.voteUiEntry(now, v);
  assert.strictEqual(e(T.opensAt - H, view(T.opensAt - H)).key, "before");
  const open = e(T.opensAt + H, view(T.opensAt + H));
  assert.deepStrictEqual([open.key, open.todo], ["open", true]);
  const unknown = e(T.opensAt + H, null);
  assert.deepStrictEqual([unknown.todo, unknown.sub.includes("沒投")], [false, false], "還沒問到伺服器不能說你還沒投");
  const voted = e(T.opensAt + H, view(T.opensAt + H, mine({ choice: "return", name: "" })));
  assert.deepStrictEqual([voted.key, voted.todo], ["voted", false]); assert.ok(voted.sub.includes(G.VOTE_TEXT.options.return));
  assert.strictEqual(e(T.closesAt + H, view(T.opensAt + H)).key, "counting", "手上的回應舊了：照時間畫");
  assert.strictEqual(e(T.resultAt + H, view(T.opensAt + H)).key, "resultWait");
  const result = e(T.resultAt + H, view(T.resultAt + H, null, { counts: { write: 3, blank: 1, return: 0 } }));
  assert.ok(result.key === "result" && result.sub.includes(G.VOTE_TEXT.options.write));
  assert.ok(![open, voted, result].some(x => x.sub.includes("{") || x.sub.includes("小明")), "卡上不寫名字");
});
t("館友證：只有寫下名字才有名字；公布後沒投的人也看得到館史；什麼都沒有就不畫", () => {
  assert.strictEqual(G.voteUiPass(null), null);
  assert.strictEqual(G.voteUiPass(view(T.opensAt + H)), null);
  assert.deepStrictEqual(J(G.voteUiPass(view(T.opensAt + H, mine()))), { name: "小明", choice: G.VOTE_TEXT.options.write, history: false });
  assert.strictEqual(G.voteUiPass(view(T.opensAt + H, mine({ choice: "blank", name: "" }))).name, "");
  assert.deepStrictEqual(J(G.voteUiPass(view(T.resultAt + H))), { name: "", choice: "", history: true });
});
t("館友證的摘要：給了才有 vote，對外的展廳沒有", () => {
  const P = G.newProfile("challenge");
  assert.strictEqual(G.passView(P, {}).vote, null);
  assert.strictEqual(G.passView(P, { vote: { name: "小明" } }).vote.name, "小明");
  assert.ok(!Object.keys(G.cleanHallView({ open: true, vote: { name: "小明" } })).includes("vote"));
});
t("接線：只呼叫 storyVote、時間窗裡才問、畫面不寫死時間和上限、別的畫面不 import 投票畫面", () => {
  const rd = f => fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8"), ui = rd("web/src/panels/ui_vote.js");
  assert.ok(ui.includes('NET.call("storyVote"') && !/NET\.call\("casino/.test(ui));
  const code = (ui + rd("shared/story/vote_screen.js")).split("\n").map(l => l.split("//")[0]).join("\n"); // 註解裡的例子不算
  assert.ok(!/2026-12-|nameMax: 12/.test(code), "時間和上限從 NUM.story.vote 來");
  assert.ok(!/maxlength/i.test(code), "不幫玩家砍名字");
  for (const f of ["web/src/panels/ui_pass.js", "web/src/panels/ui_today.js", "web/src/rooms/ui_lobby2.js"]) assert.ok(!/from "[^"]*ui_vote\.js"/.test(rd(f)), f);
  assert.ok(rd("web/src/core/main.js").indexOf("ui_vote.js") < rd("web/src/core/main.js").indexOf('import("./boot.js")'));
});
console.log(`${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);

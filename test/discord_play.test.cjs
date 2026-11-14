// Discord 聯動第三步（在 Discord 玩）的文字和按鈕（shared/discord_play.js，決定 0051）：node test/discord_play.test.cjs（npm test 也會跑）
// 指令清單、按鈕的 custom_id、21 點的訊息、餐車選單、「不放 email 理智 怪癖 靈感」的清理、21 點併單的規則、原始碼上的檢查（規則只有壹套、不先回再做）。
// 真的打牌、按按鈕、共用次數、存檔要用模擬器測：node tools/discord_fake.cjs（tools/README.md）
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const J = x => JSON.parse(JSON.stringify(x));
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const BAD = /理智|怪癖|靈感|[\w.+-]+@[\w-]+\.[\w.]+/;
// 一手牌：player、dealer 各兩張，deck 是剩下的牌（從尾巴抽）。牌的編號 0～51：0 是 A，1 是 2…12 是 K（點數 = casPoint）
const round = (G, o = {}) => G.casNewRound(Object.assign({ id: "r1", bet: 1000, san: 99, deck: o.deck || [30, 31, 32, 33, 2, 3, 4, 5, 6, 7] }, o));

T("指令清單：多了 6 個遊戲指令，選項合 Discord 的規定", G => {
  const list = J(G.dcCommands()), by = n => list.find(c => c.name === n);
  for (const k of ["bj", "pack", "food", "econ", "live", "donate"]) assert.ok(by(G.DC_CMD[k]), k);
  assert.strictEqual(by("pepe-21點").options[0].name, G.DC_BET_OPT); assert.strictEqual(by("pepe-21點").options[0].type, 3); assert.strictEqual(by("pepe-21點").options[0].required, false);
  assert.deepStrictEqual(by("pepe-大禮包").options[0], { type: 4, name: G.DC_PACK_OPT, description: by("pepe-大禮包").options[0].description, required: false, min_value: 1, max_value: G.NUM.casino.maxPacksAtOnce });
  assert.deepStrictEqual(by("pepe-實況").options[0].choices.map(c => c.value), ["on", "off"]);
  assert.strictEqual(by("pepe-餐車").options, undefined);
  for (const c of list) { assert.ok(c.description.length <= 100, c.name); for (const o of c.options || []) { assert.ok(o.description.length <= 100); assert.ok(/^[-_\p{L}\p{N}]{1,32}$/u.test(o.name)); } }
  assert.ok(list.length <= 100);
});

T("dcParse：按鈕和選單的 custom_id、元件型別、選的值；亂寫的當作空的", G => {
  const p = G.dcParse({ type: 3, guild_id: "123456789", member: { user: { id: "55555" } }, data: { custom_id: "bj:hit:3:55555", component_type: 2 } });
  assert.deepStrictEqual(J({ k: p.kind, c: p.customId, t: p.componentType, v: p.values, d: p.discordId }), { k: "component", c: "bj:hit:3:55555", t: 2, v: [], d: "55555" });
  const m = G.dcParse({ type: 3, member: { user: { id: "55555" } }, data: { custom_id: "food:55555", component_type: 3, values: ["tea", 5, null, "x".repeat(300)] } });
  assert.deepStrictEqual(J(m.values), ["tea", "x".repeat(100)]);
  const bad = G.dcParse({ type: 3, data: { custom_id: 5, component_type: "2", values: "no" } });
  assert.strictEqual(bad.customId, ""); assert.strictEqual(bad.componentType, 0); assert.deepStrictEqual(J(bad.values), []);
  assert.strictEqual(G.dcParse({ type: 3 }).customId, "");
  assert.strictEqual(G.dcParse({ type: 3, data: { custom_id: "a".repeat(500) } }).customId.length, 100);
});

T("custom_id：解得回來；別人的、亂寫的、過長的都解不出來；按鈕都在 100 字以內", G => {
  const did = "851743309602498400";
  assert.deepStrictEqual(J(G.dcCustomParse(G.dcBjId("hit", 3, did))), { kind: "bj", act: "hit", seq: 3, discordId: did });
  assert.deepStrictEqual(J(G.dcCustomParse(G.dcBjId("stand", 0, did))), { kind: "bj", act: "stand", seq: 0, discordId: did });
  assert.deepStrictEqual(J(G.dcCustomParse(G.dcFoodId(did))), { kind: "food", discordId: did });
  for (const bad of ["", null, undefined, "bj:hit:x:1", "bj:split:1:12345", "bj:hit:1", "bj:hit:1:abc", "food:", "food:abc", "hit", "bj:hit:1234567:12345", "bj:hit:1:12345:extra"]) assert.strictEqual(G.dcCustomParse(bad), null, String(bad));
  for (const c of G.dcBjButtons(5, did)[0].components) { assert.ok(c.custom_id.length <= 100); assert.ok(c.label.length <= 80); assert.strictEqual(c.type, 2); }
  assert.deepStrictEqual(J(G.dcBjButtons(5, did)[0].components.map(c => G.dcCustomParse(c.custom_id).act)), ["hit", "stand"]);
});

T("dcScrub：把「理智」的字拿掉（心情照留），整行是理智的丟掉，email 的丟掉", G => {
  assert.deepStrictEqual(J(G.dcScrub(["心情 +2，理智 +1"])), ["心情 +2"]);
  assert.deepStrictEqual(J(G.dcScrub(["理智 +1"])), []);
  assert.deepStrictEqual(J(G.dcScrub(["連輸三把，手心冒汗（理智 -1）"])), ["連輸三把，手心冒汗"]);
  assert.deepStrictEqual(J(G.dcScrub(["手氣順了三把，心情好了壹點（心情 +1）"])), ["手氣順了三把，心情好了壹點（心情 +1）"]);
  assert.deepStrictEqual(J(G.dcScrub([G.CAS_TEXT.foodFull])), ["今天吃飽了：還是吃得下，只是心情不會再加了"]);
  assert.deepStrictEqual(J(G.dcScrub(["你的怪癖很多", "靈感用完了", "mail me a@b.co", "沒事"])), ["沒事"]);
  assert.deepStrictEqual(J(G.dcScrub("單壹行")), ["單壹行"]);
  assert.deepStrictEqual(J(G.dcScrub(undefined)), []);
  // 遊戲裡真的會出現的字：連勝連敗、餐車的心情／理智
  const lines = G.casSkLines(1, 1); assert.ok(lines.some(l => /理智/.test(l)));
  assert.ok(!G.dcScrub(lines).join("").includes("理智"));
  assert.ok(G.dcScrub(lines).join("").includes("手心冒汗"));
});

T("21 點的訊息：打到一半（底牌是？、有按鈕用的 seq）、打完（翻牌、輸贏、籌碼餘額）；沒有理智、email", G => {
  G.setRng(() => 0.5);
  const r = round(G), v = { round: J(G.casRoundView(r, "")), settle: null, wallet: { chips: 99000 } };
  const t = G.dcBjText(v);
  assert.ok(t.includes("21 點") && t.includes("下注 1,000") && t.includes("你的牌：") && t.includes("莊家：？") && t.includes("你現在有 99,000 籌碼"), t);
  assert.ok(!t.includes("淨賺") && !BAD.test(t), t);
  G.casStand(r, 0);
  const out = r.out, tv = G.dcBjText({ round: J(G.casRoundView(r, "")), settle: { ach: [{ id: "first", name: "初次入座" }], lines: [], houseBroke: false, streak: ["連輸三把，手心冒汗（理智 -1）", "手氣順了三把，心情好了壹點（心情 +1）"] }, ticket: true, wallet: { chips: 100000 } });
  assert.ok(!tv.includes("？"), "打完全部翻開：" + tv);
  assert.ok(/淨賺 \+|輸了 |不賺不賠/.test(tv) && tv.includes("你現在有 100,000 籌碼") && tv.includes("初次入座") && tv.includes("手心冒汗") && tv.includes("心情好了壹點") && tv.includes(G.CAS_TEXT.packWon), tv);
  assert.ok(!BAD.test(tv) && !tv.includes("（理智"), tv);
  assert.ok(out.kind && tv.length < 1000);
  // 備註放最前面
  assert.ok(G.dcBjText(v, { note: "（畫面不是最新的）" }).startsWith("（畫面不是最新的）"));
});

T("21 點的結果每一種都有字：爆牌、莊家爆、贏、輸、平手、黑傑克、五張過關、21 點平手莊家贏", G => {
  const mk = (kind, why, net) => ({ round: { id: "x", seq: 1, state: "done", bet: 1000, bonusPct: 0, player: { cards: [0, 9], total: 21, soft: true }, dealer: { cards: [10, 11], total: 20 }, warped: false, out: { kind, why, net, bonus: 0 }, slips: [] }, settle: null, wallet: { chips: 5 } });
  const cases = [["lose", "bust", -1000, G.CAS_TEXT.bust], ["lose", "lower", -1000, G.CAS_TEXT.lose], ["lose", "tie21", -1000, G.CAS_TEXT.push21], ["push", "tie", 0, G.CAS_TEXT.push], ["win", "higher", 1000, G.CAS_TEXT.win], ["win", "dealerBust", 1000, G.CAS_TEXT.dealerBust[0]], ["blackjack", "natural", 1500, G.CAS_TEXT.blackjack], ["charlie", "five", 2000, G.CAS_TEXT.charlie[0]]];
  for (const [k, w, net, line] of cases) { const t = G.dcBjText(mk(k, w, net)); assert.ok(t.includes(line), `${k}/${w}：${t}`); assert.ok(!BAD.test(t)); assert.ok(net > 0 ? t.includes(`淨賺 +${G.dcNum(net)}`) : net < 0 ? t.includes("輸了 1,000") : t.includes("不賺不賠"), t); }
  const bonus = mk("win", "higher", 1100); bonus.round.out.bonus = 100; assert.ok(G.dcBjText(bonus).includes("含加成 +100"));
});

T("21 點看錯牌：打到一半只說「眼睛有點花」，打完說看錯了幾張；從頭到尾不寫理智", G => {
  const r = round(G, { san: 5, id: "warp-test-1" });
  const mid = G.dcBjText({ round: J(G.casRoundView(r, "")), settle: null, wallet: { chips: 1 } });
  const view = J(G.casRoundView(r, "")); view.warped = true;
  assert.ok(G.dcBjText({ round: view, settle: null, wallet: { chips: 1 } }).includes("眼睛有點花"));
  const done = J(G.casRoundView(Object.assign(r, G.casStand(r, 0) && {}), "")); done.slips = [{ who: "player", i: 0, saw: 3, real: 4 }, { who: "dealer", i: 1, saw: 2, real: 9 }];
  const t = G.dcBjText({ round: done, settle: null, wallet: { chips: 1 } });
  assert.ok(t.includes("你剛剛有 2 張牌看錯了"), t);
  for (const x of [mid, t]) assert.ok(!BAD.test(x), x);
});

T("餐車選單：9 樣、值是餐點的 id、字數合規定；選單上沒有理智；餐車回覆把理智拿掉", G => {
  const row = J(G.dcFoodMenu("12345678"))[0], sel = row.components[0];
  assert.strictEqual(sel.type, 3); assert.strictEqual(sel.custom_id, "food:12345678"); assert.strictEqual(sel.options.length, G.CAS_MENU.length);
  assert.ok(sel.options.length <= 25);
  assert.deepStrictEqual(sel.options.map(o => o.value), J(G.CAS_MENU.map(it => it.id)));
  assert.ok(sel.options.every(o => o.label.length <= 100 && o.description.length <= 100 && o.value.length <= 100 && !BAD.test(o.label + o.description)));
  assert.ok(sel.options.find(o => o.value === "tea").label.includes("45"));
  const t = G.dcFoodText(1000000, ["您好，餐車收銀是 Yuga Bot", "給你壹杯冰涼麥茶！", "心情 +1，理智 +1", "謝謝"]);
  assert.ok(t.includes("冰涼麥茶") && t.includes("心情 +1") && t.includes("1,000,000") && !BAD.test(t), t);
  assert.ok(G.dcFoodText(5).includes("你現在有 5 籌碼"));
});

T("大禮包、拚經濟、斗內的字：只有暱稱；暱稱是 @everyone 也不會 tag；拚經濟的整段演出一次列完", G => {
  G.setRng(() => 0.5);
  const packs = [{ stars: 1, name: "壹星大禮包", chips: 10000 }, { stars: 5, name: "五星億萬大禮包", chips: 100000000 }];
  const pt = G.dcPackText("@everyone", { packs, total: 100010000, wallet: { packsLeft: 1 }, ach: [{ name: "金色籌碼" }] });
  assert.ok(pt.includes("五星億萬大禮包　+100,000,000") && pt.includes("合計 +100,010,000") && pt.includes("剩下 1 個大禮包") && pt.includes("金色籌碼"), pt);
  assert.ok(!pt.includes("@"), pt);
  const w = G.casWalletFix(null, "2026-11-10"), house = { bankroll: 1e8 };
  const e = G.casEconPlay(w, house, "2026-11-10", () => 0.9);
  const et = G.dcEconText("<@123>小明", { econ: Object.assign(G.casEconView(w, "2026-11-10"), { lines: e.lines }) });
  assert.ok(et.includes("拚 經濟，做 就對了！") && et.includes("今天還能拚 2 次") && !/@|<|>/.test(et) && !BAD.test(et), et);
  assert.ok(e.lines.every(l => et.includes(l)), "每壹行都在");
  const dt = G.dcDonateText({ line: "小明 斗內了 11 萬！實況主感謝 小明 的斗內～", to: "@here" });
  assert.ok(dt.includes("實況主：here") && !dt.includes("@"), dt);
  assert.ok(G.dcLiveOnText("主播", Date.UTC(2026, 10, 9, 13, 0)).includes("21:00"), "台灣時間 = UTC + 8");
  assert.ok(G.dcLiveOffText("@everyone").includes("everyone 下播了") && !G.dcLiveOffText("@everyone").includes("@"));
  assert.strictEqual(G.dcClock(NaN), "");
});

T("遊戲自己的拒絕話（錢不夠、拚夠了、沒有禮包…）原樣回，但會過濾；空的退成「櫃檯出了狀況」", G => {
  assert.strictEqual(G.dcReasonText("今天拚夠了，明天 05:00 再來"), "今天拚夠了，明天 05:00 再來");
  assert.strictEqual(G.dcReasonText(undefined), G.DC_TEXT.oops);
  assert.strictEqual(G.dcReasonText("理智不夠"), G.DC_TEXT.oops);
});

T("回覆壹律不 @ 任何人；按鈕的訊息用 type 7 換掉原本那則，不另外開新的", G => {
  const r = J(G.dcReply("hi", true, G.dcBjButtons(0, "12345")));
  assert.strictEqual(r.type, 4); assert.strictEqual(r.data.flags, 64); assert.deepStrictEqual(r.data.allowed_mentions, { parse: [] }); assert.strictEqual(r.data.components.length, 1);
  const u = J(G.dcUpdate("新的", [])); assert.strictEqual(u.type, 7); assert.deepStrictEqual(u.data.components, []); assert.deepStrictEqual(u.data.allowed_mentions, { parse: [] });
  assert.strictEqual(J(G.dcReply("x", false)).data.components, undefined);
});

T("21 點併單（同一個人 5 分鐘內連打）：累計手數、勝負平、淨賺賠；只有暱稱和輸贏，沒有籌碼餘額", G => {
  let a = G.dcOutBjAdd(null, "win", 1000);
  assert.deepStrictEqual(J(a), { hands: 1, wins: 1, losses: 0, pushes: 0, net: 1000 });
  const t1 = G.dcOutBjText("小明", a); assert.ok(t1.includes("小明 打了壹手 21 點，贏了") && t1.includes("淨賺 1,000"), t1);
  a = G.dcOutBjAdd(a, "lose", -3000); a = G.dcOutBjAdd(a, "push", 0); a = G.dcOutBjAdd(a, "blackjack", 1500);
  assert.deepStrictEqual(J(a), { hands: 4, wins: 2, losses: 1, pushes: 1, net: -500 });
  const t2 = G.dcOutBjText("@everyone", a); assert.ok(t2.includes("連打了 4 手 21 點：2 勝 1 敗 1 平（輸了 500）") && !t2.includes("@"), t2);
  assert.ok(G.dcOutBjText("甲", G.dcOutBjAdd(null, "lose", -5)).includes("輸了 5"));
  assert.ok(G.dcOutBjText("甲", G.dcOutBjAdd(null, "push", 0)).includes("平手（不賺不賠）"));
  assert.deepStrictEqual(J(G.dcOutBjAdd({ hands: "壞", net: "壞" }, "win", "壞")), { hands: 1, wins: 1, losses: 0, pushes: 0, net: 0 }, "壞資料不丟錯");
  for (const t of [t1, t2]) assert.ok(!BAD.test(t) && !t.includes("你現在有"), t);
  const ev = G.dcOutEvent("bj", { nick: "小華", key: "round1", bj: { kind: "win", net: 2000 } });
  assert.strictEqual(ev.id, "bj-round1"); assert.ok(ev.text.includes("小華") && ev.bj.net === 2000 && ev.bj.kind === "win");
  assert.strictEqual(G.dcOutEvent("bj", { nick: "x", key: "r", bj: { kind: "亂寫", net: "x" } }).bj.kind, "push");
});

T("併單的視窗：5 分鐘內且第壹則已經發出去才併；還在發（沒有 messageId）不併；超過 5 分鐘重新開始", G => {
  const N = G.NUM.discord, t0 = 1e12, M = 60000;
  assert.strictEqual(N.outBjMin, 5);
  assert.strictEqual(G.dcOutBjWindow(null, t0), "new");
  assert.strictEqual(G.dcOutBjWindow({ since: t0, messageId: "m1" }, t0 + 1), "merge");
  assert.strictEqual(G.dcOutBjWindow({ since: t0, messageId: "m1" }, t0 + 5 * M - 1), "merge");
  assert.strictEqual(G.dcOutBjWindow({ since: t0, messageId: "m1" }, t0 + 5 * M), "new");
  assert.strictEqual(G.dcOutBjWindow({ since: t0, messageId: "" }, t0 + 1000), "busy");
  assert.strictEqual(G.dcOutBjWindow({ since: "壞" }, t0), "new");
  assert.strictEqual(G.dcOutBjWindow({ since: t0, messageId: "m" }, NaN), "new");
});

// ---------- 原始碼上的檢查 ----------
T("規則只有壹套：Discord 這層只呼叫 casino.js 的 playCore 和 act… 函式，不重寫牌、錢包、莊家的規則；遊戲的 switch 也走同壹批", () => {
  const d = read("functions/discord_play.js"), c = read("functions/casino.js");
  assert.ok(d.includes("playCore") && /actDeal|actHitStand|actPack|actBuy|actEcon|liveAct/.test(d));
  assert.ok(!/casStep|casBuy|casOpenPacks|casEconPlay|liveDonate|casSettle|casFinish|casShuffle|casHit\(|casStand\(/.test(d.replace(/\/\/.*$/gm, "")), "不重寫規則");
  assert.ok(!/runTransaction/.test(d), "交易只在 casino.js");
  for (const a of ["actDeal(ctx, d)", "actHitStand(act, ctx, d)", "actPack(ctx, d)", "actBuy(ctx, d)", "play(req, me, {}, actEcon)"]) assert.ok(c.includes(a), a);
  assert.ok(c.includes("export async function playCore(me, email, opts, fn)") && c.includes("const play = (req, me, opts, fn) => playCore(me, emailOf(req), opts, fn);"));
});

T("3 秒：回覆當場做完，不先回再繼續做（沒有 follow-up、webhook、編輯訊息、setTimeout）", () => {
  const code = f => read(f).split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  const d = code("functions/discord_play.js") + code("functions/discord.js");
  assert.ok(!/webhooks\/|interactions\/|setTimeout|setImmediate|process\.nextTick|waitUntil/.test(d), "不在回覆之後做事");
  assert.ok(!/type:\s*5\b|type:\s*6\b|DEFERRED/.test(d), "不回「處理中」");
  assert.ok(/res\.status\(code\)|J\(res, 200, out\)/.test(read("functions/discord.js")));
});

T("Discord 回覆裡的字全都過 dcScrub／dcPlain／dcNick：play 這層沒有把原始的遊戲暱稱或 email 直接塞進訊息", () => {
  const d = read("functions/discord_play.js").replace(/\/\/.*$/gm, "");
  assert.ok(!/email/i.test(d.replace(/playCore\(me, ""/g, "")), "play 這層不碰 email");
  assert.ok(d.includes('playCore(me, "", '), "認領舊資料用的 email 不傳（Discord 不做）");
  assert.ok(!/legacy/.test(d), "不搬舊錢包認領");
  assert.ok(!/casTable|casinoTable/.test(d), "不搬同桌 21 點");
  assert.ok(!/casExchange|casHang|casSetTitle/.test(d), "不搬籌碼換小獎");
});

console.log(`${fail ? "✗" : "✓"} Discord 聯動第三步的文字和按鈕：${pass} 項通過${fail ? `、${fail} 項沒過` : ""}`);
process.exit(fail ? 1 : 0);

// 限定帽子的能力（決定 0085，docs/限定配件能力提案.md）：node test/limited_fx.test.cjs（npm test 也會跑）
// 探索加成、打怪招式、館內效果、說明文字跟實際算的壹樣；數字一律讀 LIMITED_FX、NUM。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let G = load(), pass = 0, fail = 0;
const T = (name, fn) => { try { G = load(); fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 3).join("\n    ")); } };
const mk = o => ({ pick: Object.assign({ 稀有度: "普通", 心情: "傷心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), perfect: false });
const fresh = () => { const P = G.newProfile("challenge"); G.ensureDay(P, "2026-11-08"); G.CATS.forEach(c => G.PEPE_PARTS.find(p => p.name === c).options.forEach(o => { if (!o.forbidden && !o.mutant && !o.mix && !o.gift && !o.limited && !o.key && !P.unlocked[c].includes(o.name)) P.unlocked[c].push(o.name); })); P.insp = 500; return P; };
const none = o => Object.keys(o).length === 0;
const hats = () => G.PEPE_PARTS.find(p => p.name === "帽子").options.filter(o => o.limited && o.limited !== "show" ? true : o.limited).map(o => o.name);

T("每頂限定帽子都有能力、有說明、有短標", () => {
  const L = hats(); assert.ok(L.length >= 23, "限定帽子 " + L.length);
  for (const h of L) { assert.ok(G.LIMITED_FX[h], h + " 沒有設定"); assert.ok(G.cellarPartFx("帽子", h).length > 0, h + " 沒有說明"); assert.ok(G.cellarFxShort("帽子", h), h + " 沒有短標"); }
});
T("全隊強度：金冠 +3、火氣頭帶 +4；加起來最多 +teamCap；躺平眼罩 −1", () => {
  const base = G.teamPower(null, [mk({}), mk({}), mk({})], null).total, tp = t => G.teamPower(null, t, null).total - base;
  assert.strictEqual(tp([mk({ 帽子: "傳說的金冠" }), mk({}), mk({})]), 3);
  assert.strictEqual(tp([mk({ 帽子: "火氣頭帶" }), mk({}), mk({})]), 4);
  assert.strictEqual(tp([mk({ 帽子: "火氣頭帶" }), mk({ 帽子: "傳說的金冠" }), mk({ 帽子: "金瓜子項鍊" })]), G.NUM.limitedFx.teamCap, "三頂疊起來夾在 teamCap");
  assert.strictEqual(tp([mk({ 帽子: "躺平眼罩" }), mk({}), mk({})]), -1);
  const pk = [mk({ 顏色: "粉" }), mk({}), mk({})], base2 = G.teamPower(null, pk, null).total; assert.strictEqual(G.teamPower(null, [mk({ 帽子: "花環" })].concat(pk.slice(0, 2).map(x => x)), null).total - G.teamPower(null, [mk({})].concat(pk.slice(0, 2)), null).total, 1, "隊裡有粉色才 +1"); assert.strictEqual(tp([mk({ 帽子: "花環" }), mk({}), mk({})]), 0);
  { const w = G.teamPower(null, [mk({ 帽子: "彩虹圍巾", 顏色: "紅" }), mk({ 顏色: "藍" }), mk({ 顏色: "綠" })], null).total, wo = G.teamPower(null, [mk({ 顏色: "紅" }), mk({ 顏色: "藍" }), mk({ 顏色: "綠" })], null).total; assert.strictEqual(w - wo, 3, "三種顏色 +3"); } assert.strictEqual(tp([mk({ 帽子: "歡笑花環", 心情: "開心" }), mk({}), mk({})]), 3);
});
T("摺紙帽、縫過的領結：失敗作也有最低強度", () => {
  assert.strictEqual(G.memberPower(mk({ 稀有度: "失敗作", 帽子: "摺紙帽" }), null), 1); assert.strictEqual(G.memberPower(mk({ 稀有度: "失敗作", 帽子: "縫過的領結" }), null), 2); assert.strictEqual(G.memberPower(mk({ 稀有度: "失敗作" }), null), 0);
});
T("探索：技能 +、少扣理智（最少 1）、擋理智損失、回理智、第壹層多扣", () => {
  const P = fresh(); P.sanity = 30; P.insp = 100;
  const mkp = o => G.finishMake(P, Object.assign({ 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: "沒有", 姿勢: "站著" }, o), { natural: 50 }).key;
  const run = hs => { P.cellar.won = {}; P.cellar.cleared = {}; P.cellar.run = null; G.startCellar(P, 1, hs.map((h, i) => mkp({ 帽子: h, 顏色: ["紅", "綠", "黃"][i] }))); assert.ok(P.cellar.run, "下得去"); return G.currentRoom(P); };
  const loss = (res, san) => G.cellarApply(P, Object.assign({ room: G.currentRoom(P), type: "power", success: false, choice: { success: {}, fail: { san } } }, res || {}));
  let room = run(["黃雨帽", "沒有", "沒有"]); assert.strictEqual(loss(null, "3").sanLoss, 2, "黃雨帽少扣 1"); assert.strictEqual(loss(null, "1").sanLoss, 1, "最少扣 1");
  room = run(["三層帽", "沒有", "沒有"]); const a = loss(null, "3"), b = loss(null, "3"), c = loss(null, "3"), d = loss(null, "3"); assert.deepStrictEqual([a.sanLoss, b.sanLoss, c.sanLoss, d.sanLoss], [0, 0, 0, 3], "三層帽擋 3 次");
  P.cellar.cleared = {}; P.cellar.won = {};
  room = run(["枕頭睡帽", "沒有", "沒有"]); P.sanity = 10; const r = loss(null, "0"); assert.ok(r.sanGain > 0 || r.rested, "第壹次走回理智");
  P.cellar.cleared = {}; room = run(["火氣頭帶", "沒有", "沒有"]); assert.strictEqual(loss(null, "0").sanLoss, 1, "火氣頭帶每層第壹次多扣 1");
  assert.strictEqual(G.limitedFx([mk({ 帽子: "瓜子項鍊" }), mk({ 帽子: "黑絨領結" })]).skill, 12, "技能 + 取最高，不疊");
});
T("館內效果：看頭像那隻戴的帽子；廚師帽、金瓜子項鍊（餐車）、瓜子項鍊（簽到）、枕頭睡帽（換日）、礦工帽（過關）", () => {
  const P = fresh(); P.mood = 50; P.sanity = 20;
  const wear = h => { const r = G.finishMake(P, { 稀有度: "普通", 心情: "開心", 顏色: "紅", 帽子: h, 姿勢: "站著" }, { natural: 50 }); P.avatar = r.key; };
  assert.ok(none(G.limitedHome(P))); wear("廚師帽"); assert.strictEqual(G.limitedHome(P).foodMood, 1); wear("沒有"); assert.ok(none(G.limitedHome(P)));
  const w = G.casWalletFix(null, "2026-11-16"), it = G.CAS_MENU.find(x => x.id === "chicken");
  const m0 = P.mood; G.casFoodEffect(w, it, P, "2026-11-16"); const plain = P.mood - m0;
  P.mood = 50; w.food = null; wear("廚師帽"); G.casFoodEffect(w, it, P, "2026-11-16"); assert.strictEqual(P.mood - 50, plain + 1, "廚師帽多 1 心情");
  P.mood = 98; w.food = null; G.casFoodEffect(w, it, P, "2026-11-16"); assert.ok(P.mood <= 99);
  const w2 = G.casWalletFix(null, "2026-11-16"), tea = G.CAS_MENU.find(x => x.id === "tea"); w2.food = { day: "2026-11-16", mood: 0, san: G.NUM.casino.foodCap.san }; P.sanity = 10;
  wear("沒有"); assert.strictEqual(G.casFoodEffect(w2, tea, P, "2026-11-16").san, 0, "沒戴：理智上限滿了"); wear("金瓜子項鍊"); assert.strictEqual(G.casFoodEffect(w2, tea, P, "2026-11-16").san, 1, "金瓜子：每天上限 +1");
  wear("瓜子項鍊"); const save = { signin: null }; const s1 = P.insp; // 簽到：這週第壹次多 1
  const S = G.signIn(save, P, "2026-11-16"); assert.ok(S.ok); assert.ok(S.gains.some(g => g.why === "hat" && g.n === 1), "這週第壹次簽到多 1 靈感"); const S2 = G.signIn(save, P, "2026-11-17"); assert.ok(!S2.gains.some(g => g.why === "hat"), "同壹週第二天沒有");
  wear("枕頭睡帽"); P.sanity = 10; const day0 = P.day.date; G.ensureDay(P, G.addDays(day0, 1)); assert.ok(P.day.sanBack >= 2, "換日多回 2：" + P.day.sanBack);
});
T("打怪招式：限定帽子借用原本招式的算法，數字照 LIMITED_FX", () => {
  const seat = hat => ({ id: "a", pepes: [{ pick: mk({ 帽子: hat }).pick, power: 3, down: false, perfect: false }], used: {}, san: 10 });
  const A = G.fightAlias(seat("傳說的金冠"), "crown"); assert.strictEqual(A.uses, 2); assert.strictEqual(G.fightMoveUses(seat("傳說的金冠"), "crown"), 2);
  assert.ok(G.fightHasMove(seat("蝴蝶結"), "wizard")); assert.ok(!G.fightHasMove(seat("沒有"), "wizard"));
  assert.strictEqual(G.fightMoveUses(seat("三層帽"), "cap"), 2); assert.strictEqual(G.fightMoveUses(seat("小枕頭髮夾"), "squat"), 1);
  assert.strictEqual(G.fightAlias(seat("金瓜子項鍊"), "wizard").n, 4);
});
T("打怪壹回合：淚滴耳環全隊回理智、火氣頭帶的推不扣理智、蝴蝶結的推 +1", () => {
  const seat = (id, hat, san) => { const key = G.pepeKey(G.fullPick({ 稀有度: "稀有", 心情: "俄國8+9", 顏色: "黃", 帽子: hat, 姿勢: "站著" })); return { id, name: id, helper: false, san, brave: 0, skills: { 偵查: 20, 神秘學: 20, 說服: 20 }, pepes: [{ key, pick: G.fromKey(key), perfect: false, power: 3, down: false }], used: {}, out: false, ghost: false }; };
  const st = seats => G.fightStart("f1b", seats, { noTrait: true, rest: true });
  let f = st([seat("a", "淚滴耳環", 30), seat("b", "沒有", 30)]); assert.ok(f, "開得了");
  G.setRng(() => 0.5); const r = G.fightRound(f, { a: { act: "beanie" }, b: { act: "guard" } }); G.setRng(null); // 骰子固定：不然怪物那回合的扣理智會讓下面的比較偶爾差 1～2
  const mv = r.events.find(e => e.t === "move" && e.move === "beanie"); assert.ok(mv && mv.team && mv.n === G.LIMITED_FX.淚滴耳環.fight.n, "全隊回 n");
  assert.ok(f.seats.find(x => x.id === "b").san >= 30 + G.LIMITED_FX.淚滴耳環.fight.n - 1 && true, "隊友也回了");
  f = st([seat("a", "火氣頭帶", 30)]); const op = G.fightOptions(f, "a").find(o => o.act === "tentacle"); assert.ok(op && op.noSan && op.hat === "火氣頭帶", "按鈕選項標明不扣理智、帶帽子名字（畫面提示用）"); const r2 = G.fightRound(f, { a: { act: "tentacle" } }); const pe = r2.events.find(e => e.t === "push" && e.mode === "tentacle"); assert.ok(pe && pe.san == null, "不扣理智"); assert.strictEqual(pe.hat, "火氣頭帶", "紀錄寫那頂帽子的名字，不寫觸手帽");
  const A = st([seat("a", "蝴蝶結", 30), seat("b", "沒有", 30)]), B = st([seat("a", "沒有", 30), seat("b", "沒有", 30)]);
  G.setRng(() => 0.5); const ra = G.fightRound(A, { a: { act: "wizard" }, b: { act: "push" } }), rb = G.fightRound(B, { a: { act: "push" }, b: { act: "push" } }); G.setRng(null);
  const pa = ra.events.find(e => e.t === "push" && e.id === "b"), pb = rb.events.find(e => e.t === "push" && e.id === "b"); assert.strictEqual(pa.n - pb.n, G.LIMITED_FX.蝴蝶結.fight.n, "隊友的推多 n");
});
console.log(`限定帽子：${pass} 過，${fail} 沒過`); process.exit(fail ? 1 : 0);

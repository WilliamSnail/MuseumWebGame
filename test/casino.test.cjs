// Hamachi 賭場（決定 0040）：node test/casino.test.cjs（npm test 也會跑）
// 21 點的規則、真的牌組、賠率、理智低看錯牌、錢包（救濟、大禮包、餐車、換小獎）、成就和財產、舊資料認領、單人每一步。
// 數字讀 NUM；用到亂數的固定骰子（G.setRng）。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } finally { G.setRng(null); } };
const JS = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepStrictEqual(JS(a), JS(b)); // vm 裡出來的物件跟這裡的不是同一個 realm，先過 JSON 再比
const DAY = "2026-11-09";
const NUM_food = G => G.NUM.casino.foodCap;
const seeded = (G, n = 1) => G.setRng(G.mulberry32(n));
// 牌：點數 + 花色*13。a(1)=A，k=13
const card = (r, s = 0) => (r - 1) + s * 13;
const A = card(1), K = card(13), Q = card(12), J = card(11), T10 = card(10);
const c = (...rs) => rs.map(r => card(r));
// 做一局，牌照順序發：玩家1、莊家底牌、玩家2、莊家明牌，之後依序補（deck 從尾巴抽，所以倒過來給）
const rig = (G, { player, dealer, rest = [], bet = 1000, bonusPct = 0, san = 99 }) => {
  const deal = [player[0], dealer[0], player[1], dealer[1]];
  const deck = rest.slice().reverse().concat(deal.slice().reverse());
  const filler = G.casDeck().filter(x => !deal.concat(rest).includes(x));
  return G.casNewRound({ id: "r1", bet, bonusPct, san, deck: filler.concat(deck) });
};
const fresh = G => ({ w: G.casWalletFix(G.casWalletNew(), DAY), house: G.casHouseFix(G.casHouseNew(), DAY).house });
const ctxOf = (G, extra = {}) => Object.assign(fresh(G), { round: null, P: null, day: DAY, id: "r" + Math.random() }, extra);
const pf = (G, job, luck = 40) => { const P = G.newProfile("challenge"); G.ensureDay(P, DAY); G.assignJob(P, job); P.skills["幸運"] = luck; return P; };

// ---------- 點數 ----------
T("點數：A 先當 11，爆了才變 1；J Q K 是 10；黑傑克只有前兩張", G => {
  assert.strictEqual(G.casHand([A, K]).total, 21); assert.ok(G.casHand([A, K]).blackjack);
  assert.strictEqual(G.casHand([A, A]).total, 12);
  assert.strictEqual(G.casHand([A, A, card(9)]).total, 21);
  assert.strictEqual(G.casHand([A, A, A, A]).total, 14);
  assert.strictEqual(G.casHand([K, Q, J]).total, 30); assert.ok(G.casHand([K, Q, J]).bust);
  assert.strictEqual(G.casHand([A, card(6)]).total, 17); assert.ok(G.casHand([A, card(6)]).soft);
  assert.strictEqual(G.casHand([A, card(6), K]).total, 17); assert.ok(!G.casHand([A, card(6), K]).soft);
  assert.ok(!G.casHand(c(7, 7, 7)).blackjack, "三張牌 21 不是黑傑克（舊的 bug：任何 21 都算）");
  assert.strictEqual(G.casHand(c(7, 7, 7)).total, 21);
  assert.ok(G.casHand(c(2, 2, 2, 2, 2)).charlie && !G.casHand(c(2, 2, 2, 2)).charlie);
  assert.ok(!G.casHand(c(10, 10, 10, 5, 5)).charlie, "五張但爆了不算");
  assert.strictEqual(G.casPoint(card(10)), 10); assert.strictEqual(G.casPoint(card(2)), 2);
});
T("金額：一萬以下照寫，一萬以上換成萬、億；無條件捨去；負的也可以（翊文：數字太多換成中文）", G => {
  const f = G.casNum;
  assert.strictEqual(f(0), "0");
  assert.strictEqual(f(9999), "9,999");
  assert.strictEqual(f(10000), "1 萬");
  assert.strictEqual(f(1000000), "100 萬");
  assert.strictEqual(f(985001), "98.5 萬");
  assert.strictEqual(f(12999), "1.29 萬", "不進位，不會把錢寫多");
  assert.strictEqual(f(99999999), "9999.99 萬");
  assert.strictEqual(f(100000000), "1 億");
  assert.strictEqual(f(760610000), "7.6 億");
  assert.strictEqual(f(-25000), "-2.5 萬");
  assert.strictEqual(f("壞的"), "0");
  assert.strictEqual(G.casExact(1234567), "1,234,567");
});
T("下注可以打「10萬」「1.5億」「1,000」；打壞的照樣被擋", G => {
  const big = { chips: 1e9 };
  assert.strictEqual(G.casBetCheck("10萬", 1e9).n ?? G.casBetCheck("10萬", 1e9).bet, 100000);
  assert.strictEqual(G.casBetCheck("1,000", 1e9).ok, true);
  assert.strictEqual(G.casBetCheck("萬", 1e9).ok, false);
  assert.strictEqual(G.casBetCheck("0.00001萬", 1e9).ok, false, "換算後不到最小注");
  assert.strictEqual(G.casBetCheck("abc", 1e9).ok, false);
  assert.ok(big);
});
T("拉霸機的停法：幾顆星就從左邊停幾個 ★；2 顆以上才拖長；斷了之後很快；全開不拖", G => {
  for (let n = 1; n <= 5; n++) {
    const p = G.casSlotPlan(n);
    assert.strictEqual(p.length, 5);
    assert.strictEqual(p.filter(x => x.star).length, n, n + " 顆星");
    assert.ok(p.slice(0, n).every(x => x.star), "星都在左邊");
    assert.ok(p.every(x => x.dur > 0));
  }
  assert.strictEqual(G.casSlotPlan(1).filter(x => x.tease).length, 0, "壹顆星不用吊胃口");
  assert.deepStrictEqual(JS(G.casSlotPlan(3).map(x => x.tease)), [false, false, true, true, false], "第 3、4 輪拖長：有沒有再中");
  assert.strictEqual(G.casSlotPlan(5)[4].tease, true, "最後壹顆也拖長");
  assert.strictEqual(G.casSlotPlan(2)[2].near, true, "斷掉的那壹輪，下面那格是 ★");
  assert.strictEqual(G.casSlotPlan(2)[3].near, false);
  assert.ok(G.casSlotPlan(5, true).every(x => !x.tease && x.dur <= 150), "全開很快");
  assert.strictEqual(G.casSlotPlan("壞的").filter(x => x.star).length, 0, "壞資料不丟錯");
});
T("餐車的吃的加心情、理智：有每天上限、換日重算、券和自由模式沒有效果、燈熄了不加理智", G => {
  const newP = () => { const P = G.newProfile("challenge"); P.mood = 10; P.sanity = 20; return P; };
  const house = G.casHouseNew();
  let w = G.casWalletNew(); w.chips = 1e9;
  let P = newP();
  const r = G.casBuy(w, house, 1, DAY, undefined, P);
  assert.strictEqual(r.mood, 2); assert.strictEqual(P.mood, 12);
  const tea = G.casBuy(w, house, 2, DAY, undefined, P);
  assert.strictEqual(tea.mood, 1); assert.strictEqual(tea.san, 1); assert.strictEqual(P.sanity, 21);
  // 上限
  for (let i = 0; i < 12; i++) G.casBuy(w, house, 6, DAY, undefined, P);
  assert.strictEqual(P.mood, 10 + NUM_food(G).mood);
  assert.strictEqual(P.sanity, 20 + NUM_food(G).san);
  { // 快到上限：實際加的比菜單少，要說為什麼（翊文 11-09：「餐車吃的食物跟加的心情似乎也對不上」）
    const w2 = G.casWalletFix(null, DAY), h2 = { bankroll: 1e9 }, Q = G.newProfile("challenge");
    w2.chips = 1e8; Q.mood = 10; w2.food = { day: DAY, mood: G.NUM.casino.foodCap.mood - 1, san: 0 };
    const cut = G.casBuy(w2, h2, 6, DAY, undefined, Q);
    assert.strictEqual(cut.mood, 1);
    assert.ok(cut.lines.some(l => l.includes("本來是 +5")));
    assert.strictEqual(G.casFoodLeft(w2, DAY), 0);
    assert.strictEqual(G.casFoodOf(G.CAS_MENU.find(x => x.id === "snack")).mood, 2, "零食其實是烤雞，菜單要寫 +2");
    assert.ok(G.dcFoodMenu("123456")[0].components[0].options.find(o => o.value === "juice").description.includes("心情 +4"));
    assert.ok(G.dcFoodMenu("123456")[0].components[0].options.find(o => o.value === "snack").description.includes("心情 +2"));
  }
  { // 菜單寫的要跟真的加的壹樣：每壹樣都實際買過（翊文 11-09：屬性不要寫錯）
    for (const it of G.CAS_MENU) {
      if (it.ticket) { assert.strictEqual(G.casFoodWords(it).join("・"), "", `${it.id} 是券，沒有效果`); continue; }
      const w3 = G.casWalletFix(null, DAY), h3 = { bankroll: 1e9 }, Q = G.newProfile("challenge");
      w3.chips = 1e8; Q.mood = 10; Q.sanity = 10; Q.dark = false;
      const m0 = Q.mood, s0 = Q.sanity, r = G.casBuy(w3, h3, it.n, DAY, undefined, Q);
      assert.ok(r.ok, it.id);
      const dm = Q.mood - m0, ds = Q.sanity - s0, want = [dm ? `心情 +${dm}` : "", ds ? `理智 +${ds}` : ""].filter(Boolean);
      assert.strictEqual(G.casFoodWords(it).join("・"), want.join("・"), `${it.id}：菜單和真的加的不壹樣`);
      assert.ok(dm > 0 || ds > 0, `${it.id}：是吃的就要有效果`);
      if (dm) assert.ok(r.lines.some(l => l.includes(`心情 +${dm}`)), `${it.id}：買完要說心情加多少`);
      const d = G.dcFoodMenu("123456")[0].components[0].options.find(o => o.value === it.id).description;
      if (dm) assert.ok(d.includes(`心情 +${dm}`), `${it.id}：Discord 選單要寫心情`);
      assert.ok(!d.includes("理智"), `${it.id}：Discord 不放理智`);
    }
    const fs = require("fs"), path = require("path"), src = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    for (const f of ["web/src/ui_casino.js", "shared/discord_play.js"]) assert.ok(!/\bit\.(mood|san)\b/.test(src(f)), `${f}：效果的字要用 casFoodWords，不要自己組`);
    // 換小獎的每壹樣都要有用途；背包材料的份數要跟真的換週章壹樣
    for (const x of G.NUM.casino.exchange) {
      const u = G.exchangeUse(x.id);
      assert.ok(u, `${x.id} 沒有寫用途`);
      if (x.reward.bag) {
        const P2 = G.newProfile("challenge"), S2 = G.storyState(P2); S2.bag = { [x.reward.bag]: 1 };
        assert.ok(u.includes(`算 ${G.matCount(P2)} 份`), `${x.id}：說明的份數和真的算的不壹樣`);
      }
    }
    for (const id of Object.keys(G.STORY_ITEMS).filter(k => G.STORY_ITEMS[k].kind === "material")) {
      const P2 = G.newProfile("challenge"), S2 = G.storyState(P2); S2.bag = { [id]: 1 };
      assert.ok(G.itemDesc(id).includes(`算 ${G.matCount(P2)} 份`), `${id}：背包說明的份數不對`);
    }
  }
  const full = G.casBuy(w, house, 1, DAY, undefined, P);
  assert.strictEqual(full.mood, 0); assert.ok(full.lines.includes(G.CAS_TEXT.foodFull));
  assert.strictEqual(full.ok, true, "吃飽了還是買得到");
  // 換日
  const next = G.casBuy(w, house, 1, "2026-11-10", undefined, P);
  assert.strictEqual(next.mood, 2);
  // 券沒有效果
  w.pk.opened = 1; const before = P.mood; G.casBuy(w, house, 8, "2026-11-10", undefined, P); assert.strictEqual(P.mood, before);
  // 沒有參觀者、自由模式
  w = G.casWalletNew(); w.chips = 1e7;
  assert.strictEqual(G.casBuy(w, house, 1, DAY).mood, 0);
  const F = G.newProfile("free"); F.mood = 3; assert.strictEqual(G.casBuy(w, house, 1, DAY, undefined, F).mood, 0);
  // 心情到頂、燈熄了
  P = newP(); P.mood = 99; assert.strictEqual(G.casBuy(w, house, 1, DAY, undefined, P).mood, 0); assert.strictEqual(P.mood, 99);
  P = newP(); P.dark = true; P.sanity = 0; w = G.casWalletNew(); w.chips = 1e7; assert.strictEqual(G.casBuy(w, house, 2, DAY, undefined, P).san, 0); assert.strictEqual(P.sanity, 0);
});
T("牌名", G => {
  assert.strictEqual(G.casCardName(0), "A♠"); assert.strictEqual(G.casCardName(51), "K♣"); assert.strictEqual(G.casCardName(9), "10♠");
});

// ---------- 真的牌組 ----------
T("每一副都是 52 張、不重複；洗牌看 RNG（同一個種子洗出一樣的）", G => {
  seeded(G, 5);
  for (let i = 0; i < 200; i++) {
    const d = G.casShuffle();
    assert.strictEqual(d.length, 52); assert.strictEqual(new Set(d).size, 52);
    assert.ok(d.every(x => Number.isInteger(x) && x >= 0 && x < 52));
  }
  seeded(G, 9); const a = G.casShuffle(); seeded(G, 9); const b = G.casShuffle();
  eq(a, b);
  seeded(G, 10); assert.notDeepStrictEqual(a, G.casShuffle());
});
T("一局裡發出去的牌 ＋ 剩下的牌 ＝ 整副 52 張，沒有重複", G => {
  seeded(G, 3);
  for (let i = 0; i < 300; i++) {
    const r = G.casNewRound({ id: "x", bet: 100 });
    while (r.state === "playing" && G.casHand(r.player).total < 17) G.casHit(r, r.seq);
    if (r.state === "playing") G.casStand(r, r.seq);
    const all = r.player.concat(r.dealer, r.deck);
    assert.strictEqual(all.length, 52); assert.strictEqual(new Set(all).size, 52);
  }
});

// ---------- 賠率 ----------
T("賠率：贏 1:1、黑傑克 3:2、五張牌 2:1、平手退注、輸掉 0", G => {
  const b = 1000;
  eq(G.casPayout(b, "win"), { payout: 2000, profit: 1000, bonus: 0, net: 1000 });
  assert.strictEqual(G.casPayout(b, "blackjack").payout, 2500);
  assert.strictEqual(G.casPayout(b, "charlie").payout, 3000);
  assert.strictEqual(G.casPayout(b, "push").payout, 1000);
  eq(G.casPayout(b, "lose"), { payout: 0, profit: 0, bonus: 0, net: -1000 });
  assert.strictEqual(G.casPayout(101, "blackjack").payout, 101 + 151, "奇數的注，賺的捨去小數");
});
T("玩家贏 21 點（黑傑克）：莊家 18 點，前兩張 A+K → 3:2", G => {
  const r = rig(G, { player: [A, K], dealer: [card(8), card(10)] }); // 底牌 8，明牌 10 ＝ 18
  assert.strictEqual(r.state, "done", "前兩張就 21：自動翻牌");
  assert.strictEqual(r.out.kind, "blackjack"); assert.strictEqual(r.out.payout, 2500);
});
T("三張牌湊成 21 只算普通的贏（1:1），不是黑傑克", G => {
  const r = rig(G, { player: c(7, 7), dealer: [card(8), card(10)], rest: c(7) });
  assert.strictEqual(r.state, "playing");
  G.casHit(r, 0);
  assert.strictEqual(r.state, "done", "剛好 21：不用再問");
  assert.strictEqual(r.out.kind, "win"); assert.strictEqual(r.out.payout, 2000);
});
T("21 點平手莊家贏；其他平手退注", G => {
  const a = rig(G, { player: [A, K], dealer: [card(5), A], rest: c(5) }); // 莊家 A+5 → 要牌 5 → 21（三張）
  assert.strictEqual(G.casHand(a.dealer).total, 21);
  assert.strictEqual(a.out.kind, "lose"); assert.strictEqual(a.out.why, "tie21");
  const b = rig(G, { player: c(10, 8), dealer: [card(10), card(8)] });
  G.casStand(b, 0);
  assert.strictEqual(b.out.kind, "push"); assert.strictEqual(b.out.payout, b.bet);
});
T("五張牌沒爆：馬上贏 2:1，莊家不用補牌", G => {
  const r = rig(G, { player: c(2, 3), dealer: [card(10), card(9)], rest: c(2, 2, 2) });
  G.casHit(r, 0); G.casHit(r, 1);
  assert.strictEqual(r.state, "playing");
  G.casHit(r, 2);
  assert.strictEqual(r.state, "done"); assert.strictEqual(r.out.kind, "charlie"); assert.strictEqual(r.out.payout, 3000);
  assert.strictEqual(r.dealer.length, 2);
});
T("爆牌輸、莊家不補牌；莊家爆了玩家贏", G => {
  const a = rig(G, { player: c(10, 6), dealer: [card(10), card(9)], rest: c(10) });
  G.casHit(a, 0);
  assert.strictEqual(a.out.kind, "lose"); assert.strictEqual(a.out.why, "bust"); assert.strictEqual(a.dealer.length, 2);
  const b = rig(G, { player: c(10, 8), dealer: [card(6), card(10)], rest: c(10) }); // 莊家 16 → 要牌 10 → 26
  G.casStand(b, 0);
  assert.strictEqual(b.out.kind, "win"); assert.strictEqual(b.out.why, "dealerBust"); assert.strictEqual(b.dealer.length, 3);
});
T("莊家 16 點以下要牌、17 點（含軟 17）停", G => {
  const hit16 = rig(G, { player: c(10, 8), dealer: [card(10), card(6)], rest: c(2) });
  G.casStand(hit16, 0);
  assert.strictEqual(hit16.dealer.length, 3, "16 要牌");
  const stand17 = rig(G, { player: c(10, 8), dealer: [card(10), card(7)], rest: c(2) });
  G.casStand(stand17, 0);
  assert.strictEqual(stand17.dealer.length, 2, "17 停");
  const soft17 = rig(G, { player: c(10, 8), dealer: [A, card(6)], rest: c(2) });
  G.casStand(soft17, 0);
  assert.strictEqual(soft17.dealer.length, 2, "軟 17 停（舊的 A 先當 11）");
  const soft16 = rig(G, { player: c(10, 8), dealer: [A, card(5)], rest: c(2) });
  G.casStand(soft16, 0);
  assert.strictEqual(soft16.dealer.length, 3);
});
T("連點兩下「要牌」：第二下的 seq 是舊的，被擋，不會多發一張", G => {
  const r = rig(G, { player: c(2, 3), dealer: [card(10), card(9)], rest: c(2, 2) });
  assert.ok(G.casHit(r, 0).ok);
  const again = G.casHit(r, 0);
  assert.strictEqual(again.ok, false);
  assert.strictEqual(r.player.length, 3);
  assert.strictEqual(G.casStand(r, 0).ok, false);
  assert.ok(G.casStand(r, 1).ok);
});

// ---------- 加成 ----------
T("賭徒、幸運的小加成：只加在「贏的那把賺的錢」上；輸、平手沒有", G => {
  eq(G.casPayout(1000000, "win", 1), { payout: 2010000, profit: 1000000, bonus: 10000, net: 1010000 });
  assert.strictEqual(G.casPayout(1000000, "blackjack", 1).bonus, 15000);
  assert.strictEqual(G.casPayout(1000000, "push", 5).bonus, 0);
  assert.strictEqual(G.casPayout(1000000, "lose", 5).payout, 0);
  assert.strictEqual(G.casPayout(1000, "win", 0.2).bonus, 2, "小注也有（捨去）");
  assert.strictEqual(G.casPayout(100, "win", 0.2).bonus, 0);
});
T("casBonusPct：賭徒 ＋ 幸運技能；自由模式、沒職業是 0；加成小（<= 1%）", G => {
  const b = G.NUM.casino.bonus;
  const g = pf(G, "gambler", 60), d = pf(G, "detective", 60);
  const luck = G.skillOf(d, "幸運");
  assert.ok(Math.abs(G.casBonusPct(d) - luck / 100 * b.luckPct) < 0.006);
  assert.ok(G.casBonusPct(g) > G.casBonusPct(d), "賭徒比較多");
  assert.ok(G.casBonusPct(g) < 1, "小加成");
  assert.strictEqual(G.casBonusPct(null), 0);
  assert.strictEqual(G.casBonusPct(G.newProfile("free")), 0);
  const noJob = G.newProfile("challenge"); assert.strictEqual(G.casBonusPct(noJob), 0, "還沒選職業");
  assert.ok(G.casBonusPct(pf(G, "gambler", 99)) <= b.gamblerPct + b.luckPct + 0.01);
});
T("加成真的會進派彩：同一手牌，賭徒贏得比較多，輸的時候一樣", G => {
  const base = { player: [A, K], dealer: [card(8), card(10)], bet: 1000000 };
  assert.ok(rig(G, Object.assign({ bonusPct: 0.5 }, base)).out.payout > rig(G, base).out.payout);
  const l1 = rig(G, { player: c(10, 6), dealer: [card(10), card(9)], bet: 1000, bonusPct: 1 }); G.casStand(l1, 0);
  assert.strictEqual(l1.out.payout, 0);
});
T("莊家優勢沒被加成弄反：每種打法、含最大的加成，跑 40000 手（固定種子）", G => {
  seeded(G, 11);
  const bp = G.NUM.casino.bonus.gamblerPct + G.NUM.casino.bonus.luckPct * 0.99;
  const strat = r => { const h = G.casHand(r.player); return h.total < 17; }; // 跟莊家一樣：最差的實際打法
  const basic = r => {
    const h = G.casHand(r.player), u = G.casPoint(r.dealer[1]), ua = r.dealer[1] % 13 === 0;
    if (h.soft) return h.total <= 17 || (h.total === 18 && (ua || u >= 9));
    if (h.total >= 17) return false;
    if (h.total >= 13 && u >= 2 && u <= 6 && !ua) return false;
    if (h.total === 12 && u >= 4 && u <= 6 && !ua) return false;
    return true;
  };
  for (const st of [strat, basic]) {
    let net = 0; const n = 40000;
    for (let i = 0; i < n; i++) {
      const r = G.casNewRound({ id: "s", bet: 1000000, bonusPct: bp });
      while (r.state === "playing" && st(r)) G.casHit(r, r.seq);
      if (r.state === "playing") G.casStand(r, r.seq);
      net += r.out.net;
    }
    assert.ok(net / n / 1000000 < 0.01, "一般打法莊家要贏（不會被加成翻過來）：" + (net / n / 1000000));
  }
});

// ---------- 理智低：看錯牌 ----------
T("理智夠：看到的就是真的牌；理智低：有一部分看成別張，而且每次看都一樣", G => {
  assert.strictEqual(G.casWarpP(60), 0); assert.strictEqual(G.casWarpP(40), 0);
  assert.strictEqual(G.casWarpP(39), 0.2); assert.strictEqual(G.casWarpP(24), 0.4); assert.strictEqual(G.casWarpP(5), 0.6);
  assert.strictEqual(G.casWarpCard(card(5), "s", 80), card(5));
  let diff = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const real = i % 52, s = G.casWarpCard(real, "seed" + i, 5); if (s !== real) { diff++; assert.notStrictEqual(s % 13, real % 13, "看成別的點數"); assert.strictEqual(Math.floor(s / 13), Math.floor(real / 13), "花色不變"); } assert.strictEqual(s, G.casWarpCard(real, "seed" + i, 5), "同一個位置永遠看成同一張"); }
  assert.ok(Math.abs(diff / n - 0.6) < 0.04, "理智 5：約 60% 的牌看錯 " + diff / n);
});
T("換牌（假牌）不影響結算：算點數、派彩都用真的牌；結算後畫面翻回真的", G => {
  const r = rig(G, { player: c(10, 8), dealer: [card(10), card(7)], san: 3 });
  const v = G.casRoundView(r, "u1");
  assert.strictEqual(v.dealer.cards[0], -1, "底牌還沒給");
  assert.ok(v.player.cards.length === 2);
  assert.strictEqual(r.out, null);
  G.casStand(r, 0);
  assert.strictEqual(r.out.kind, "win");
  const real = G.casHand(r.player).total;
  const v2 = G.casRoundView(r, "u1");
  eq(v2.player.cards, r.player, "結算後翻回真的");
  eq(v2.dealer.cards, r.dealer);
  assert.strictEqual(v2.player.total, real);
  // 找一局真的看錯過的，確認 slips 有記
  let found = false;
  for (let i = 0; i < 50 && !found; i++) {
    const q = rig(G, { player: c(10, 8), dealer: [card(10), card(7)], san: 3 });
    const vv = G.casRoundView(q, "x" + i);
    if (vv.warped) { found = true; G.casStand(q, 0); const e = G.casRoundView(q, "x" + i); assert.ok(e.slips.length >= 1 && e.slips.every(s => s.saw !== s.real)); assert.strictEqual(q.out.kind, "win"); }
  }
  assert.ok(found, "理智 3 的時候應該很快就看過錯牌");
});
T("給畫面的樣子：打牌中莊家的底牌和剩下的牌都不給", G => {
  seeded(G, 21);
  const r = G.casNewRound({ id: "v", bet: 500 });
  if (r.state === "done") return;
  const v = G.casRoundView(r, "u");
  const text = JSON.stringify(v);
  assert.strictEqual(v.dealer.cards[0], -1);
  assert.ok(!("deck" in v) && !text.includes('"deck"'));
  assert.strictEqual(v.dealer.total, null);
  assert.strictEqual(v.dealer.up, G.casPoint(r.dealer[1]));
  assert.strictEqual(v.out, null);
});

// ---------- 下注（舊的挑剔） ----------
T("下注：不是數字、≤0、比錢包多，荷官各有一句；打的字只當純文字（長度有限、看不見的字拿掉）", G => {
  const n = G.casBetCheck("abc", 1000000);
  assert.ok(!n.ok && n.line === "你再下壹次abc給我試試看");
  assert.ok(G.casBetCheck("-5", 1000000).line.includes("奇怪的數字"));
  assert.ok(G.casBetCheck("0", 1000000).line.includes("奇怪的數字"));
  assert.ok(G.casBetCheck("", 1000000).line.includes("奇怪的數字"));
  assert.ok(G.casBetCheck("1.5", 1000000).line.includes("奇怪的數字"));
  assert.ok(G.casBetCheck("2000000", 1000000).line.includes("你才沒那麼有錢") && G.casBetCheck("2000000", 1000000).line.includes("100 萬"));
  assert.ok(G.casBetCheck(G.NUM.casino.minBet - 1, 1e9).line.includes("最少"));
  assert.ok(G.casBetCheck(G.NUM.casino.maxBet + 1, 1e12).line.includes("最多"));
  const ok = G.casBetCheck("1,000", 5000); assert.ok(ok.ok && ok.bet === 1000);
  const RLO = String.fromCharCode(0x202e), ZW = String.fromCharCode(0x200b);
  const evil = G.casBetCheck("<b>壞</b>" + "x".repeat(50) + RLO + ZW, 1000);
  assert.ok(!evil.ok && evil.line.length < 40 && !evil.line.includes(RLO) && !evil.line.includes(ZW));
  assert.ok(G.casBetCheck({ a: 1 }, 100).line.includes("你再下壹次"), "物件也不會丟錯");
});

// ---------- 單人每一步 ----------
T("下注 → 發牌：扣注、一局開始；還有沒打完的不能再下；沒打完時不能領救濟的 round 狀態也維持", G => {
  seeded(G, 33);
  const ctx = ctxOf(G);
  const start = ctx.w.chips;
  let r = G.casStepDeal(ctx, "10000");
  assert.ok(r.ok);
  if (ctx.round.state === "playing") {
    assert.strictEqual(ctx.w.chips, start - 10000);
    assert.strictEqual(G.casStepDeal(ctx, "10000").ok, false, "還有壹手沒打完");
    assert.strictEqual(ctx.w.chips, start - 10000);
  }
  assert.ok(r.view.player.cards.length === 2);
  // 壞的注：荷官的話，錢不動
  const c2 = ctxOf(G); const s2 = c2.w.chips;
  const bad = G.casStepDeal(c2, "你好");
  assert.ok(!bad.ok && bad.gag && bad.reason.includes("你好")); assert.strictEqual(c2.w.chips, s2); assert.strictEqual(c2.round, null);
});
T("結算只算一次：重複結算不再派彩、不再動莊家", G => {
  const ctx = ctxOf(G); ctx.w.chips = 50000;
  ctx.round = rig(G, { player: c(10, 8), dealer: [card(10), card(7)], bet: 10000 });
  ctx.w.chips -= 10000;
  const h0 = ctx.house.bankroll;
  const a = G.casStepStand(ctx, 0);
  assert.ok(a.ok && a.settle.ok);
  const chips1 = ctx.w.chips, house1 = ctx.house.bankroll;
  assert.strictEqual(chips1, 40000 + 20000); assert.strictEqual(house1, h0 - 10000);
  assert.strictEqual(G.casStepStand(ctx, 1).ok, false, "打完了不能再停牌");
  assert.strictEqual(G.casStepHit(ctx, 1).ok, false);
  const again = G.casSettle(ctx.w, ctx.house, ctx.round, { day: DAY });
  assert.ok(!again.ok && again.already);
  assert.strictEqual(ctx.w.chips, chips1); assert.strictEqual(ctx.house.bankroll, house1);
  assert.strictEqual(ctx.w.st.hands, 1);
});
T("籌碼不會憑空來：幾千手下來，玩家的籌碼變化 ＋ 莊家的變化 ＝ 0", G => {
  seeded(G, 77);
  const ctx = ctxOf(G); ctx.w.chips = 1e9; const w0 = ctx.w.chips, h0 = ctx.house.bankroll;
  for (let i = 0; i < 3000; i++) {
    ctx.round = null;
    G.casStepDeal(ctx, "5000");
    while (ctx.round.state === "playing") {
      const hit = G.casHand(ctx.round.player).total < 15;
      (hit ? G.casStepHit : G.casStepStand)(ctx, ctx.round.seq);
    }
  }
  assert.strictEqual((ctx.w.chips - w0) + (ctx.house.bankroll - h0), 0);
  assert.strictEqual(ctx.w.st.hands, 3000);
  assert.strictEqual(ctx.w.st.wins + ctx.w.st.losses + ctx.w.st.pushes, 3000);
});
T("全下並贏：記全下；贏了有機率多一張大禮包券（要先開過今天的）", G => {
  seeded(G, 2);
  const ctx = ctxOf(G); ctx.w.chips = 5000;
  ctx.round = rig(G, { player: [A, K], dealer: [card(8), card(10)], bet: 5000 }); ctx.round.allin = true; ctx.w.chips = 0;
  const s = G.casSettle(ctx.w, ctx.house, ctx.round, { day: DAY });
  assert.ok(s.ok && ctx.w.st.allinWins === 1);
  assert.ok(ctx.w.ach.allin && ctx.w.ach.bj && ctx.w.ach.win1);
  const w = ctx.w; w.pk.opened = 0;
  G.setRng(() => 0.0); assert.strictEqual(G.casWinTicket(w), false, "沒開過今天的大禮包：沒有");
  w.pk.opened = 1; assert.strictEqual(G.casWinTicket(w), true); assert.strictEqual(w.tickets, 1);
  G.setRng(() => 0.9999); assert.strictEqual(G.casWinTicket(w), false);
});
T("莊家被你打到破產：記成就；破產中換日 Yuga 借他重新開張", G => {
  const ctx = ctxOf(G); ctx.house.bankroll = 500; ctx.w.chips = 100000;
  ctx.round = rig(G, { player: [A, K], dealer: [card(8), card(10)], bet: 100000 }); ctx.w.chips -= 100000;
  const s = G.casSettle(ctx.w, ctx.house, ctx.round, { day: DAY });
  assert.ok(ctx.house.bankroll < 0 && s.houseBroke && ctx.w.ach.houseBroke);
  assert.ok(G.casHouseLines(ctx.house).includes("（破產中）"));
  ctx.house.day = DAY;
  const next = G.casHouseFix(ctx.house, "2026-11-10");
  assert.strictEqual(next.house.bankroll, G.NUM.casino.houseReset); assert.ok(next.reopen && next.reopen.includes("重新開張"));
  const same = G.casHouseFix(G.casHouseFix(Object.assign(G.casHouseNew(), { bankroll: -5, day: DAY }), DAY).house, DAY);
  assert.strictEqual(same.house.bankroll, -5, "同一天不重開");
});

// ---------- 錢包：破產救濟 ----------
T("新玩家 NUM.casino.startChips；破產（低於門檻）可以領救濟，一天有上限，換日重算；有錢不能領", G => {
  const { w } = fresh(G);
  assert.strictEqual(w.chips, G.NUM.casino.startChips); assert.strictEqual(G.NUM.casino.startChips, 1000000);
  assert.strictEqual(G.casRelief(w, DAY).ok, false, "有錢");
  w.chips = 0;
  for (let i = 0; i < G.NUM.casino.reliefPerDay; i++) {
    const r = G.casRelief(w, DAY); assert.ok(r.ok, "第 " + (i + 1) + " 次"); assert.strictEqual(w.chips, G.NUM.casino.reliefTo); w.chips = 10;
  }
  const no = G.casRelief(w, DAY); assert.ok(!no.ok && no.reason.includes("明天")); assert.strictEqual(w.chips, 10);
  G.casWalletFix(w, "2026-11-10");
  assert.ok(G.casRelief(w, "2026-11-10").ok, "換日重算");
  assert.ok(w.ach.relief);
});
T("破產不會卡死：沒錢、救濟用完，每天還有免費大禮包", G => {
  const { w, house } = fresh(G); w.chips = 0; w.rel.n = 99;
  assert.ok(G.casPacksLeft(w) >= 1);
  seeded(G, 8);
  const r = G.casOpenPacks(w, house, 1, DAY);
  assert.ok(r.ok && w.chips >= 10000);
});

// ---------- 大禮包 ----------
T("大禮包：五星機率 50／30／14.5／4.5／1（固定種子 20 萬包）；錢由莊家出", G => {
  seeded(G, 123);
  const n = 200000, cnt = [0, 0, 0, 0, 0, 0]; let sum = 0;
  for (let i = 0; i < n; i++) { const d = G.casPackDraw(); cnt[d.stars]++; sum += d.chips; assert.ok(d.chips >= 10000); }
  const want = [0, 50, 30, 14.5, 4.5, 1];
  for (let s = 1; s <= 5; s++) assert.ok(Math.abs(cnt[s] / n * 100 - want[s]) < (s === 5 ? 0.2 : 0.6), `${s} 星 ${cnt[s] / n * 100}`);
  assert.ok(Math.abs(sum / n - 1.71e6) < 1.5e5);
  const { w, house } = fresh(G); const c0 = w.chips, h0 = house.bankroll;
  const r = G.casOpenPacks(w, house, 1, DAY);
  assert.strictEqual(w.chips - c0, r.total); assert.strictEqual(house.bankroll - h0, -r.total);
});
T("大禮包：每天 NUM.casino.dailyPacks 包；用完沒有；隔天重算、不累積；券另外算；一次最多 11 包", G => {
  seeded(G, 4);
  const { w, house } = fresh(G);
  assert.strictEqual(G.casPacksLeft(w), G.NUM.casino.dailyPacks);
  const r = G.casOpenPacks(w, house, 99, DAY);
  assert.ok(r.ok && r.packs.length === G.NUM.casino.dailyPacks);
  assert.strictEqual(G.casOpenPacks(w, house, 1, DAY).ok, false);
  assert.strictEqual(w.pk.opened, G.NUM.casino.dailyPacks);
  G.casWalletFix(w, "2026-11-10"); assert.strictEqual(G.casPacksLeft(w), G.NUM.casino.dailyPacks); assert.strictEqual(w.pk.opened, 0);
  w.tickets = 30; G.casWalletFix(w, "2026-11-10");
  const big = G.casOpenPacks(w, house, 30, "2026-11-10");
  assert.strictEqual(big.packs.length, G.NUM.casino.maxPacksAtOnce);
  assert.strictEqual(G.casOpenPacks(w, house, 0, DAY).ok, false);
  assert.strictEqual(G.casOpenPacks(w, house, "abc", DAY).ok, false);
});
T("抽到五星：記成就、金色籌碼進財產", G => {
  const { w, house } = fresh(G);
  G.setRng(() => 0.9999); // 1000 → 五星
  const r = G.casOpenPacks(w, house, 1, DAY);
  assert.strictEqual(r.packs[0].stars, 5); assert.strictEqual(r.packs[0].chips, 100000000);
  assert.ok(w.ach.star5 && w.props.gold);
});

// ---------- 餐車 ----------
T("餐車：扣錢、進財產、買不起不扣；零食會被換成烤雞肉；莊家收錢", G => {
  seeded(G, 6);
  const { w, house } = fresh(G); const h0 = house.bankroll, c0 = w.chips;
  const price = n => G.CAS_MENU.find(x => x.n === n).price;
  const r = G.casBuy(w, house, 1, DAY);
  assert.ok(r.ok && w.chips === c0 - price(1) && house.bankroll === h0 + price(1)); assert.strictEqual(w.props.chicken.n, 1);
  const s = G.casBuy(w, house, 5, DAY);
  assert.ok(s.ok && w.chips === c0 - price(1) - price(1), "零食：付的是烤雞肉的錢"); assert.strictEqual(w.props.chicken.n, 2);
  assert.ok(s.lines.some(l => l.includes("烤雞肉串")));
  const sushi = G.casBuy(w, house, 7, DAY); assert.ok(sushi.lines.some(l => l.includes("Hamachi")));
  w.chips = 100; const broke = G.casBuy(w, house, 6, DAY);
  assert.ok(!broke.ok && broke.reason.includes("滾") && w.chips === 100 && !w.props.admiral);
  assert.strictEqual(G.casBuy(w, house, 99, DAY).ok, false);
});
T("餐車：大禮包券要先開過今天的大禮包才能買；買了券就多、不進財產；只有開過今天的才有機會抽到券", G => {
  seeded(G, 7);
  const { w, house } = fresh(G);
  w.chips = 1e9;
  const no = G.casBuy(w, house, 8, DAY); assert.ok(!no.ok && no.reason.includes("先領")); assert.strictEqual(w.tickets, 0);
  w.pk.opened = 1;
  const one = G.casBuy(w, house, 8, DAY); assert.ok(one.ok && w.tickets === 1 && !w.props.ticket1);
  const eleven = G.casBuy(w, house, 9, DAY); assert.ok(eleven.ok && w.tickets === 12);
  // 沒開過今天的：吃東西不抽
  const w2 = fresh(G).w; G.setRng(() => 0); const r = G.casBuy(w2.chips ? w2 : w2, fresh(G).house, 1, DAY);
  assert.strictEqual(r.tickets, 0);
  const w3 = fresh(G).w; w3.pk.opened = 1; G.setRng(() => 0); assert.strictEqual(G.casBuy(w3, fresh(G).house, 1, DAY).tickets, 3, "5% 抽中：3 張");
});
T("成就「吃遍餐車」：餐點每種都買過", G => {
  seeded(G, 1);
  const { w, house } = fresh(G); w.chips = 1e10;
  [1, 2, 3, 4, 6, 7].forEach(n => G.casBuy(w, house, n, DAY));
  assert.ok(w.ach.diner);
});

// ---------- 籌碼換小獎：每週有上限 ----------
T("換小獎：換靈感、扣籌碼；每週有上限，用完不能換、不扣；下個週一重算；籌碼不夠不能換；自由模式不能換", G => {
  const { w } = fresh(G); const P = G.newProfile("challenge"); G.ensureDay(P, DAY);
  const it = G.NUM.casino.exchange.find(x => x.id === "insp");
  w.chips = it.chips * (it.perWeek + 3);
  const i0 = P.insp, c0 = w.chips;
  for (let i = 0; i < it.perWeek; i++) assert.ok(G.casExchange(w, "insp", P).ok);
  assert.strictEqual(P.insp, i0 + it.perWeek); assert.strictEqual(w.chips, c0 - it.chips * it.perWeek);
  const no = G.casExchange(w, "insp", P);
  assert.ok(!no.ok && no.reason.includes("換完")); assert.strictEqual(w.chips, c0 - it.chips * it.perWeek); assert.strictEqual(P.insp, i0 + it.perWeek);
  G.casWalletFix(w, "2026-11-15"); // 同一週（週日）
  assert.strictEqual(G.casExchange(w, "insp", P).ok, false, "同一週還是換完");
  G.casWalletFix(w, "2026-11-16"); // 下週一
  assert.ok(G.casExchange(w, "insp", P).ok, "下週重算");
  const poor = fresh(G).w; poor.chips = it.chips - 1;
  assert.ok(!G.casExchange(poor, "insp", P).ok && poor.chips === it.chips - 1);
  assert.strictEqual(G.casExchange(fresh(G).w, "insp", G.newProfile("free")).ok, false);
  assert.strictEqual(G.casExchange(fresh(G).w, "insp", null).ok, false);
  assert.strictEqual(G.casExchange(fresh(G).w, "沒有", P).ok, false);
});
T("換小獎的數字是「小」的：靈感一週最多幾點、材料；沒有真錢的字", G => {
  const ex = G.NUM.casino.exchange;
  assert.ok(ex.every(x => x.perWeek >= 1 && x.perWeek <= 5 && x.chips >= 100000));
  const insp = ex.find(x => x.id === "insp"); assert.ok(insp.perWeek * insp.reward.insp <= 5, "靈感一週最多 5 點");
  const P = G.newProfile("challenge"); G.ensureDay(P, DAY);
  const { w } = fresh(G); w.chips = 1e9;
  assert.ok(G.casExchange(w, "canvas", P).ok);
  assert.strictEqual(G.storyState(P).bag["mat:畫布"], 1);
});

// ---------- 成就、稱號、財產（紀念品） ----------
T("成就：打滿條件才拿，只拿一次；統計對得上", G => {
  const ctx = ctxOf(G);
  ctx.round = rig(G, { player: c(10, 8), dealer: [card(10), card(7)], bet: 1000 }); ctx.w.chips -= 1000;
  G.casStepStand(ctx, 0);
  assert.ok(ctx.w.ach.first && ctx.w.ach.win1 && !ctx.w.ach.bj);
  assert.strictEqual(G.casAchCheck(ctx.w, DAY).length, 0, "不會重複拿");
  assert.strictEqual(ctx.w.st.wins, 1);
  ctx.w.st.bestLose = 5; assert.ok(G.casAchCheck(ctx.w, DAY).some(a => a.id === "lose5"));
});
T("稱號：只能選自己有的成就；選了寫進博物館（給展廳看）；取消", G => {
  const { w } = fresh(G); const P = G.newProfile("challenge");
  assert.strictEqual(G.casSetTitle(w, P, "bj").ok, false, "還沒有");
  w.ach.bj = { d: DAY };
  assert.ok(G.casSetTitle(w, P, "bj").ok);
  eq(P.casinoTitle, { id: "bj", name: "天生壹對" }); assert.strictEqual(w.title, "bj");
  assert.ok(G.casSetTitle(w, P, null).ok); assert.strictEqual(P.casinoTitle, null); assert.strictEqual(w.title, null);
});
T("財產掛展廳：要有才能掛、最多 NUM.casino.hangMax 件、可以拿下來；參觀的館友看得到的是過濾過的", G => {
  const { w, house } = fresh(G); const P = G.newProfile("challenge"); G.ensureDay(P, DAY);
  w.chips = 1e9; seeded(G, 1);
  assert.strictEqual(G.casHang(w, P, "chicken", true).ok, false, "沒有");
  ["chicken", "tea", "feast", "juice"].forEach((id, i) => G.casBuy(w, house, G.CAS_MENU.find(x => x.id === id).n, DAY));
  assert.ok(G.casHang(w, P, "chicken", true).ok && G.casHang(w, P, "tea", true).ok && G.casHang(w, P, "feast", true).ok);
  const full = G.casHang(w, P, "juice", true); assert.ok(!full.ok && full.reason.includes(String(G.NUM.casino.hangMax)));
  assert.strictEqual(P.hallSouvenirs.length, 3);
  assert.ok(G.casHang(w, P, "tea", false).ok); assert.strictEqual(P.hallSouvenirs.length, 2);
  assert.strictEqual(G.casHang(w, G.newProfile("free"), "chicken", true).ok, false);
  const save = G.newSave(); save.profiles.challenge = P; P.hall = P.hall || [];
  const v = G.hallView(save);
  assert.strictEqual(v.souvenirs.length, 2);
  const clean = JSON.parse(JSON.stringify(G.cleanHallView(Object.assign({}, v, { souvenirs: v.souvenirs.concat([{ id: "<img src=x>", name: "壞" }, { id: "old:p:abc", name: "舊的<b>東西</b>" + "長".repeat(80) }, { id: "chicken", name: "改過的名字" }]) , title: { id: "old:a:zz", name: "<script>" } }))));
  assert.ok(clean.souvenirs.every(s => G.CAS_PROPS[s.id] || /^old:p:/.test(s.id)));
  assert.strictEqual(clean.souvenirs.find(s => s.id === "chicken").name, "烤雞肉", "名字以清單為準，不信存檔裡的");
  assert.ok(clean.souvenirs.length <= G.NUM.casino.hangMax);
  const old = clean.souvenirs.find(s => s.id === "old:p:abc");
  assert.ok(old && [...old.name].length <= G.NUM.casino.titleMax);
  assert.ok(clean.title === null || clean.title.name.length <= G.NUM.casino.titleMax + 2, "舊稱號的名字也只收短的純文字");
});

// ---------- 舊資料認領 ----------
const fakeLegacy = () => ({ chips: 7777777, achievements: ["假的成就甲", { name: "假的成就乙" }, "假的成就甲", "<b>x</b>"], properties: ["假的紀念品", { name: "假的紀念品二", n: 3 }] });
T("認領：籌碼、成就、財產進來；只能領一次；再領不加錢", G => {
  const { w } = fresh(G); const c0 = w.chips;
  const peek = G.casLegacyPeek(w, fakeLegacy());
  assert.ok(peek && peek.chips === 7777777 && peek.ach.length === 3 && peek.props.length === 2);
  const r = G.casLegacyClaim(w, fakeLegacy(), "uid1", DAY);
  assert.ok(r.ok && r.chips === 7777777 && r.ach === 3 && r.props === 4);
  assert.strictEqual(w.chips, c0 + 7777777);
  eq(r.mark, { claimedBy: "uid1", claimedDay: DAY });
  assert.strictEqual(Object.keys(w.ach).length, 3); assert.strictEqual(Object.values(w.props).reduce((s, p) => s + p.n, 0), 4);
  const again = G.casLegacyClaim(w, fakeLegacy(), "uid1", DAY);
  assert.ok(!again.ok && again.reason.includes("已經")); assert.strictEqual(w.chips, c0 + 7777777);
  assert.strictEqual(G.casLegacyPeek(w, fakeLegacy()), null, "領過就不再跳認領卡");
});
T("認領：資料庫那邊標了 claimedBy 也不能再領（換錢包也不行）；沒有資料、壞資料不丟錯", G => {
  const doc = Object.assign(fakeLegacy(), { claimedBy: "uid1" });
  const w2 = fresh(G).w;
  assert.strictEqual(G.casLegacyPeek(w2, doc), null);
  assert.strictEqual(G.casLegacyClaim(w2, doc, "uid2", DAY).ok, false); assert.strictEqual(w2.chips, G.NUM.casino.startChips);
  assert.strictEqual(G.casLegacyClaim(w2, doc, "uid1", DAY).ok, false);
  for (const bad of [null, undefined, 5, "x", [], {}, { chips: -5 }, { chips: "abc", achievements: 7 }]) {
    assert.strictEqual(G.casLegacyPeek(fresh(G).w, bad), null);
    assert.strictEqual(G.casLegacyClaim(fresh(G).w, bad, "u", DAY).ok, false);
  }
  const huge = G.casLegacyClean({ chips: 1e30, achievements: new Array(500).fill("多"), properties: new Array(500).fill({ name: "多", n: 999 }) });
  assert.ok(huge.chips <= 1e12 && huge.ach.length <= 80 && huge.props.length <= 80 && huge.props.every(p => p.n <= 99));
});
T("認領進來的舊成就可以當稱號、舊財產可以掛展廳", G => {
  const { w } = fresh(G); const P = G.newProfile("challenge"); G.ensureDay(P, DAY);
  G.casLegacyClaim(w, fakeLegacy(), "u", DAY);
  const aid = Object.keys(w.ach).find(id => w.ach[id].name === "假的成就乙");
  assert.ok(G.casSetTitle(w, P, aid).ok); assert.strictEqual(P.casinoTitle.name, "假的成就乙");
  const pid = Object.keys(w.props).find(id => w.props[id].name === "假的紀念品二");
  assert.ok(G.casHang(w, P, pid, true).ok);
  const view = G.casWalletView(w, DAY);
  assert.ok(view.ach.some(a => a.old && a.name === "假的成就乙") && view.props.some(p => p.old && p.n === 3 && p.hung));
});

// ---------- 錢包壞掉、舊資料 ----------
T("錢包讀回來缺欄位、壞掉都補得回來；每天的東西換日重算", G => {
  for (const bad of [null, {}, { chips: "abc" }, { chips: -50, pk: 5, ex: [], st: "x" }, { ach: [], props: 3 }]) {
    const w = G.casWalletFix(bad, DAY);
    assert.ok(Number.isFinite(w.chips) && w.chips >= 0); assert.ok(w.pk.left >= 0 && w.st.hands === 0 && typeof w.ex.n === "object");
    G.casWalletView(w, DAY);
  }
  const h = G.casHouseFix({ bankroll: "x" }, DAY).house; assert.strictEqual(h.bankroll, G.NUM.casino.houseStart);
});
T("單人的時候不能同時坐在牌桌上", G => {
  const ctx = ctxOf(G); ctx.w.tablePid = "p1";
  const r = G.casStepDeal(ctx, "1000");
  assert.ok(!r.ok && r.reason.includes("牌桌")); assert.strictEqual(ctx.w.chips, G.NUM.casino.startChips);
});

// ---------- 文字：沒有品牌、沒有真錢的暗示、畫面用「壹」 ----------
T("文字：不出現酒、炸雞、手機和餐廳品牌、真錢的字；畫面上的字用「壹」不用「一」", G => {
  const strings = [];
  const walk = x => { if (typeof x === "string") strings.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
  walk(G.CAS_TEXT); walk(G.CAS_MENU.map(m => [m.name, m.line])); walk(G.CAS_PROPS); walk(G.CAS_ACH.map(a => [a.name, a.desc])); walk(G.CAS_PACKS.map(p => p.name));
  const banned = ["酒", "啤", "炸雞", "肯德基", "KFC", "ASHAHI", "SAMSUNG", "三星手機", "白蘭地", "爭鮮", "麥當勞", "現金", "真錢", "儲值", "提款", "台幣", "美金", "NT$", "$"];
  for (const s of strings) {
    for (const b of banned) assert.ok(!s.includes(b), `「${s}」不能有「${b}」`);
    assert.ok(!s.includes("一"), `「${s}」畫面上的字用壹`);
  }
  assert.ok(G.CAS_TEXT.series.includes("Casino Hamachi System") && G.CAS_TEXT.series.includes("Museum Series"));
  assert.strictEqual(G.CAS_MENU.length, 9); assert.strictEqual(G.CAS_PACKS.length, 5);
  eq(G.CAS_PACKS.map(p => p.upTo), [500, 800, 945, 990, 1000]);
  eq(G.CAS_MENU.map(m => m.price), [3000, 1750, 20000, 100000, 50, 2000000, 2000, 1500000, 10000000]);
  assert.ok(G.CAS_TEXT.idle.includes("可是我肚子還是有點痛") && G.CAS_TEXT.bust === "你爆了ㄏㄏ" && G.CAS_TEXT.dealerBust[0] === "RRRRR我爆了");
});
T("每個成就、財產都有名字和說明；成就 id 不重複", G => {
  assert.strictEqual(new Set(G.CAS_ACH.map(a => a.id)).size, G.CAS_ACH.length);
  G.CAS_ACH.forEach(a => { assert.ok(a.name && a.desc && Object.keys(a.rule).length); });
  Object.keys(G.CAS_PROPS).forEach(k => assert.ok(G.CAS_PROPS[k].name && G.CAS_PROPS[k].desc));
  G.CAS_MENU.filter(m => !m.ticket && !m.redirect).forEach(m => assert.ok(G.CAS_PROPS[m.id], m.id + " 要進財產"));
});

console.log(`${pass} passed, ${fail} failed（賭場）`);
process.exit(fail ? 1 : 0);

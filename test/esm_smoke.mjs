// 用「真正的 ES 模組」載入 shared/，確定 import／export 都接得上（伺服器之後就是這樣用）。
// logic.js 和 logic3.js 會互相用到對方的函式，這裡也確定兩邊都叫得到。
import assert from "node:assert";
import * as config from "../shared/config.js";
import * as content from "../shared/content.js";
import * as content3 from "../shared/content3.js";
import * as logic from "../shared/logic.js";
import * as logic3 from "../shared/logic3.js";
import * as legacy from "../shared/legacy.js";
import * as fresh from "../shared/fresh.js";
import * as holidays from "../shared/holidays.js";
import * as signin from "../shared/signin.js";
import * as story from "../shared/story.js";
import * as coop from "../shared/coop.js";
import * as coopFlow from "../shared/coop_flow.js";
import * as coopText from "../shared/coop_text.js";
import * as coopFun from "../shared/coop_fun.js";
import * as coopTrace from "../shared/coop_trace.js";
import * as admin from "../shared/admin.js";
import * as shop from "../shared/shop.js";
import * as visit from "../shared/visit.js";
import * as themeshow from "../shared/themeshow.js";
import * as casinoText from "../shared/casino_text.js";
import * as casino from "../shared/casino.js";
import * as casinoWeek from "../shared/casino_week.js";
import * as casinoWallet from "../shared/casino_wallet.js";
import * as casinoTable from "../shared/casino_table.js";
import * as casinoFind from "../shared/casino_find.js";
import * as board from "../shared/board.js";
import * as events from "../shared/events.js";

let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok("每個模組都有匯出東西，而且沒有 undefined", () => {
  for (const [name, mod] of Object.entries({ config, content, content3, logic, logic3, fresh, story, coop, coopFlow, coopText, coopFun, coopTrace, admin, shop, visit, themeshow, board, casinoText, casino, casinoWeek, casinoWallet, casinoTable, casinoFind, events })) {
    const keys = Object.keys(mod);
    assert.ok(keys.length > 0, name + " 沒有匯出");
    for (const k of keys) assert.notStrictEqual(mod[k], undefined, `${name}.${k} 是 undefined`);
  }
});
ok("logic 用得到 config、content", () => {
  const P = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-08");
  assert.strictEqual(logic.possibilities(P), 32);
  assert.ok(logic.dailyCommissions(P, "2026-11-08").length > 0);
});
ok("logic 叫得到 logic3（hallSize）、logic3 叫得到 logic", () => {
  const P = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-08");
  assert.strictEqual(typeof logic3.hallSize(P), "number");
  assert.ok(Array.isArray(logic.progressEvents(P)));
});
ok("骰子：setRng 之後，別的模組讀到的 RNG 也跟著變（live binding）", () => {
  logic.setRng(() => 0.5);
  assert.strictEqual(logic.RNG(), 0.5);
  logic.setRng(null);
});
ok("fresh 叫得到 logic、logic3（新解開的東西，11-08）", () => {
  const P = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-08");
  P.insp = 30;
  assert.ok(fresh.scanFresh(P, "lobby").some(f => f.room === "office"));
  assert.strictEqual(fresh.freshRooms(P).office, 2);
});
ok("名字：第 4 版", () => {
  assert.strictEqual(config.GEN_TEXT.museum, "佩佩博物館2"); // 決定 0022
});
ok("簽到、節日接得上 logic、logic3（11-09，決定 0030）", () => {
  const save = logic.newSave();
  const P = save.profiles.challenge = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-09-25");
  const r = signin.signIn(save, P, "2026-09-25");
  assert.ok(r.ok && r.holiday.key === "midautumn");
  assert.strictEqual(holidays.holidayOf("2026-09-25").name, "中秋節");
  assert.strictEqual(logic.exhibitById("hx-midautumn-0").holiday, "midautumn");
});
ok("管理員介面的摘要接得上每個規則檔（決定 0033）", () => {
  const save = logic.newSave();
  save.profiles.challenge = logic.newProfile("challenge");
  const s = admin.adminSummary(JSON.stringify(save));
  assert.ok(s.ok && s.entered);
  assert.strictEqual(s.progress.codex.total, logic.CORE_TOTAL);
  assert.strictEqual(admin.adminSummary("{壞掉").ok, false);
});
ok("兌換所接得上 legacy、story（11-09，決定 0032）：穿著的裝備算進 traitSum", () => {
  const P = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-09");
  story.storyState(P).stamps = 99;
  assert.ok(shop.buyGear(P, "abacus", "2026-11-09").ok);
  assert.ok(shop.wearGear(P, "abacus").ok);
  assert.strictEqual(legacy.traitSum(P, "deal"), config.GEAR_ITEMS.find(x => x.id === "abacus").deal);
});
ok("參觀展廳、送佩佩接得上 gifts、mailbox、logic（11-09）", () => {
  const save = logic.newSave();
  const P = save.profiles.challenge = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-09");
  const key = logic.pepeKey(Object.assign({}, logic.DEFAULT_PICK));
  P.pepes[key] = { n: 2, perfect: false, s: 1, d: "2026-11-09" };
  const r = visit.stepSendGift({ save, item: { kind: "pepe", key }, me: { uid: "a", nick: "小明" }, to: "b", today: "2026-11-09", mailId: "gift-1" });
  assert.ok(r.ok && r.mail.gift.pepe.key === key);
  assert.strictEqual(P.pepes[key].n, 1);
  const save2 = logic.newSave();
  const P2 = save2.profiles.challenge = logic.newProfile("challenge");
  logic.ensureDay(P2, "2026-11-09");
  const c = visit.stepClaimMail({ save: save2, mails: [r.mail], today: "2026-11-09" });
  assert.ok(c.ok && c.total.pepes === 1 && P2.pepes[key].n === 1);
});
ok("主題展接得上 logic、logic3、signin（11-09，決定 0035）", () => {
  const P = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-09");
  assert.deepStrictEqual(themeshow.syncShow(P, "2026-11-09"), []);
  assert.strictEqual(themeshow.showItemOf("legend").opt, "傳說的金冠");
  logic3.weeklyState(P);
});
ok("賭場接得上 config、logic、logic3、story（11-09，決定 0040）", () => {
  logic.setRng(logic.mulberry32(7));
  const w = casinoWallet.casWalletFix(casinoWallet.casWalletNew(), "2026-11-09");
  assert.strictEqual(w.chips, config.NUM.casino.startChips);
  const house = casinoWallet.casHouseNew();
  const P = logic.newProfile("challenge");
  const ctx = { w, house, round: null, P, day: "2026-11-09", id: "t1" };
  const r = casinoWallet.casStepDeal(ctx, "1000");
  assert.ok(r.ok && r.view.player.cards.length === 2);
  assert.strictEqual(casino.casHand([0, 12]).total, 21);
  logic.setRng(null);
});
ok("地下撿籌碼接得上 config、content3、logic、casino_text（決定 0047）", () => {
  logic.setRng(logic.mulberry32(3));
  const w = casinoWallet.casWalletFix(casinoWallet.casWalletNew(), "2026-11-09");
  const room = content3.CELLAR[0].rooms[0].id;
  const r = casinoFind.casCellarFind(w, casinoWallet.casHouseNew(), room, "2026-11-09", () => 0);
  assert.ok(r.ok && r.found >= config.NUM.casino.cellarFind.min);
  assert.ok(!casinoFind.casCellarFind(w, null, room, "2026-11-09", () => 0).ok);
  logic.setRng(null);
});
ok("每週排行榜接得上 admin、story、shop、themeshow（決定 0039）", () => {
  const save = logic.newSave();
  const P = save.profiles.challenge = logic.newProfile("challenge");
  logic.ensureDay(P, "2026-11-09");
  const wk = board.boardWeekOf(Date.parse("2026-11-16T05:15:00+08:00"));
  assert.strictEqual(wk.label, "2026-W46");
  const stats = board.boardStatsOf(JSON.stringify(save), wk);
  assert.ok(stats.ok && stats.entered);
  const r = board.boardCompute([{ uid: "a", nick: "小明", stats }], null, wk);
  assert.ok(r.doc.first && r.snapshot.people.a);
});
console.log(`${n} passed, 0 failed（ES 模組載入）`);

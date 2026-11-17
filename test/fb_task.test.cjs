// tools/fb_task.cjs：Firebase 的固定動作只做得到那幾件事（不會連 Firebase）
const assert = require("assert");
const { ACTIONS, parseTask, planTask, econPick, advisorRulesMail } = require("../tools/fb_task.cjs");

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + "\n    " + e.message); } };

T("只有固定的動作，其他一律不做", () => {
  assert.deepStrictEqual(ACTIONS, ["invite", "admin-on", "admin-off", "disable", "enable", "stats", "stock-reroll", "house-ledger", "stock-status", "econ-status", "stock-tw-peg", "house-size", "fn-errors", "world-status", "player-invest", "invest-status", "advisor-rules-mail"]);
  assert.deepStrictEqual(parseTask({ action: "stock-reroll" }), { action: "stock-reroll" }, "重算股價不用 email");
  // 工作流程的下拉選單要跟程式的清單壹樣，不然按得到的動作程式不認得（或反過來）
  const yml = require("fs").readFileSync(require("path").join(__dirname, "..", ".github/workflows/firebase-task.yml"), "utf8");
  const menu = yml.match(/options: \[([^\]]+)\]/)[1].split(",").map(x => x.trim()).sort();
  assert.deepStrictEqual(menu, ACTIONS.slice().sort(), "firebase-task.yml 的選單和 ACTIONS 對不上");
  for (const a of ["delete", "", "wipe", undefined]) {
    assert.throws(() => parseTask({ action: a, email: "a@b.com" }), /沒有這個動作/);
  }
});
T("email 轉小寫；格式不對就擋，錯誤訊息裡沒有 email", () => {
  assert.strictEqual(parseTask({ action: "invite", email: " Friend.A@Gmail.COM " }).email, "friend.a@gmail.com");
  for (const bad of ["", "abc", "a@b", "a b@c.com", "../x@y.com", "a/b@c.com", "a@b/c.com"]) {
    try { parseTask({ action: "invite", email: bad }); assert.fail("應該要擋：" + bad); }
    catch (e) { assert.ok(/格式不對/.test(e.message), bad + "：" + e.message); assert.ok(!bad || !e.message.includes(bad)); }
  }
});
T("stats 不用 email", () => { assert.deepStrictEqual(parseTask({ action: "stats", email: "" }), { action: "stats" }); });
T("player-invest 要填名字（不用 email）", () => { assert.deepStrictEqual(parseTask({ action: "player-invest", name: " YUGA chu " }), { action: "player-invest", name: "YUGA chu" }); assert.throws(() => parseTask({ action: "player-invest", name: "" }), /要填名字/); });
T("名字：去掉控制字元、最多 20 字", () => {
  assert.strictEqual(parseTask({ action: "invite", email: "a@b.com", name: "  小\n明 " }).name, "小明");
  assert.strictEqual(Array.from(parseTask({ action: "invite", email: "a@b.com", name: "字".repeat(50) }).name).length, 20);
});
T("邀請：新的一筆、已經有的；被停用的會恢復；沒給名字不蓋掉原本的名字", () => {
  const t = parseTask({ action: "invite", email: "a@b.com", name: "小明" });
  assert.deepStrictEqual(planTask(t, false, null).write, { disabled: false, name: "小明" });
  const noName = parseTask({ action: "invite", email: "a@b.com" });
  assert.deepStrictEqual(planTask(noName, true, { name: "舊", disabled: true }).write, { disabled: false });
  assert.deepStrictEqual(planTask(noName, false, null).write, { disabled: false, name: "" });
});
T("管理員：要先在名單上；寫真的布林值", () => {
  const on = parseTask({ action: "admin-on", email: "a@b.com" }), off = parseTask({ action: "admin-off", email: "a@b.com" });
  assert.strictEqual(planTask(on, false, null).write, null); assert.ok(planTask(on, false, null).fail);
  assert.strictEqual(planTask(on, true, {}).write.admin, true);
  assert.strictEqual(planTask(off, true, { admin: true }).write.admin, false);
});
T("停用、恢復：要先在名單上；不會刪資料", () => {
  const dis = parseTask({ action: "disable", email: "a@b.com" }), en = parseTask({ action: "enable", email: "a@b.com" });
  assert.ok(planTask(dis, false, null).fail); assert.strictEqual(planTask(dis, true, {}).write.disabled, true);
  assert.strictEqual(planTask(en, true, { disabled: true }).write.disabled, false);
  for (const t of [dis, en]) assert.deepStrictEqual(planTask(t, true, {}).remove, []);
});
T("訊息裡沒有 email 和名字", () => {
  for (const a of ["invite", "admin-on", "admin-off", "disable", "enable"]) {
    for (const ex of [true, false]) {
      const m = planTask(parseTask({ action: a, email: "secret@b.com", name: "祕密名" }), ex, {}).message;
      assert.ok(!m.includes("secret") && !m.includes("祕密名"), m);
    }
  }
});
T("工作流程先遮再做、金鑰用完就刪、輸入不經過環境變數", () => {
  const y = require("fs").readFileSync(require("path").join(__dirname, "..", ".github", "workflows", "firebase-task.yml"), "utf8");
  assert.ok(y.indexOf("--mask") > 0 && y.indexOf("--mask") < y.indexOf("FIREBASE_SERVICE_ACCOUNT"), "先遮");
  assert.ok(!/\$\{\{\s*(github\.event\.)?inputs\./.test(y), "不要把輸入直接放進工作流程");
  assert.ok(/rm -f/.test(y) && /if: always\(\)/.test(y), "金鑰用完就刪");
});

T("econ-status 只印經濟欄位的白名單：名字、uid、email、祕密、錢包、畫的持有人都不會出現", () => {
  const h = { bankroll: 5, budget: 6, museum: 1, sea: 0, world: 9, day: "2026-11-20", debt: { budget: 1, culture: 2, world: 3, uid: "U1" }, secret: "祕密", email: "a@b.com", nick: "小明", wallets: { u1: { chips: 5 } },
    art: { own: { x: 1 }, byUser: { u1: 1 } }, npcs: { day: "d", ticket: 1, shop: 2, total: 3, people: 1, who: ["x"] }, inv: { sum: { hold: [{ name: "綠眼顯卡", n: 2, uid: "U" }], pnl: 5 }, pool: { house: { own: {} } } }, led: { world: { stockBuy: 10 }, mint: { start: 1 } } };
  const s = JSON.stringify(econPick(h));
  for (const bad of ["祕密", "a@b.com", "小明", "U1", "wallets", "art", "byUser", "who", "mint", "pool"]) assert.ok(!s.includes(bad), "不該印出：" + bad);
  const o = econPick(h); assert.strictEqual(o.world, 9); assert.strictEqual(o.debt.culture, 2); assert.strictEqual(o.led.world.stockBuy, 10); assert.strictEqual(o.inv.sum.hold[0].n, 2);
});
// 借款新規定的信：用假的 Firestore 跑（不連 Firebase）：有借款的寄、沒借款的不寄、重跑不重寄
const pending = [];
pending.push((async () => {
  try {
    const mkW = loans => ({ chips: 100, loan: { list: loans, limit: 1000000 } });
    const store = { a: mkW([{ id: 1, amt: 1000000, owe: 1090000, day: "2026-11-10", due: "2026-11-17" }]), b: mkW([]), c: mkW([{ id: 1, amt: 500000, owe: 545000, day: "2026-11-12", due: "2026-11-19" }]) };
    const mails = {}, FieldValue = { serverTimestamp: () => "TS" };
    const db = {
      collection: () => ({ get: async () => ({ docs: Object.keys(store).map(id => ({ id, ref: { id, kind: "wallet" } })) }) }),
      doc: p => ({ path: p, kind: "mail" }),
      runTransaction: async fn => fn({ get: async r => ({ exists: true, data: () => ({ data: JSON.stringify(store[r.id]) }) }), set: (r, v) => { if (r.kind === "wallet") store[r.id] = JSON.parse(v.data); else mails[r.path] = v; } }),
    };
    const logs = [], old = console.log; console.log = (...a) => logs.push(a.join(" "));
    try { await advisorRulesMail(db, FieldValue); await advisorRulesMail(db, FieldValue); } finally { console.log = old; }
    assert.deepStrictEqual(Object.keys(mails).sort(), ["mail/a/items/advisor-rules", "mail/c/items/advisor-rules"], "只有有借款的兩位，各壹封");
    assert.ok(store.a.adv && store.a.adv.rules && !store.b.adv, "錢包記著寄過了");
    assert.ok(/寄出 2 封/.test(logs[0]) && /寄出 0 封/.test(logs[1]), logs.join("|"));
    assert.ok(!logs.join("").includes("mail/a"), "紀錄不印 uid");
    assert.ok(mails["mail/a/items/advisor-rules"].note.includes("1,090,000") || mails["mail/a/items/advisor-rules"].note.includes("109"), "帶自己的數字");
    pass++;
  } catch (e) { fail++; console.log("FAIL advisor-rules-mail: " + e.message); }
})());
Promise.all(pending).then(() => { console.log(pass + " passed, " + fail + " failed（Firebase 的固定動作）"); process.exit(fail ? 1 : 0); });

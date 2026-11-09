// 大廳導覽圖上的館友（shared/mates.js）：node test/mates.test.cjs（npm test 也會跑）
// 名單 → 每間房有誰：只算 online／away、自己和 offline 不算、room 只認白名單、reveal 對到手作坊、放不下的「+N」。
const assert = require("assert");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { const G = load(); try { fn(G); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
const J = x => JSON.parse(JSON.stringify(x)); // vm 裡的物件拿出來比（見 docs/架構.md 第 6 節）
const P = (id, nick, status, room, extra = {}) => Object.assign({ id, nick, status, room }, extra);

T("導覽圖上的每間房都認得；名單和 art.js 的 PLAN 對得上", G => {
  const fs = require("fs");
  const art = fs.readFileSync(require("path").join(__dirname, "..", "web/src/art.js"), "utf8");
  const plan = art.match(/const PLAN = \{[\s\S]*?\n  \};/)[0];
  const keys = [...plan.matchAll(/\["([a-z]+)", \d+, \d+, \d+, \d+\]/g)].map(m => m[1]);
  assert.ok(keys.length >= 11);
  for (const k of keys) assert.strictEqual(G.mateSpot(k), k, k);
  for (const k of G.MATE_ROOMS.filter(x => x !== "lobby")) assert.ok(keys.includes(k), k + " 不在 PLAN");
});
T("reveal 算手作坊、cellar:b2 算地下收藏庫、門口和設定放「在別處」", G => {
  assert.strictEqual(G.mateSpot("reveal"), "workshop");
  assert.strictEqual(G.mateSpot("cellar"), "cellar");
  assert.strictEqual(G.mateSpot("cellar:b2"), "cellar");
  assert.strictEqual(G.mateSpot("title"), "elsewhere");
  assert.strictEqual(G.mateSpot("settings"), "elsewhere");
});
T("ending、darkroom（隱藏內容）和不認得的 room 一律不顯示", G => {
  for (const r of ["ending", "darkroom", "nope", "", "LOBBY", "constructor", "__proto__", "toString", "cellar:", "cellar:<b>", "gallery ", "<script>", null, undefined, 5, {}, []]) assert.strictEqual(G.mateSpot(r), null, String(r));
});
T("只算 online 和 away：自己、offline、不認得的狀態都不算", G => {
  const m = J(G.matesByRoom([P("a", "甲", "online", "gallery"), P("b", "乙", "away", "gallery"), P("c", "丙", "offline", "gallery"), P("d", "丁", "online", "gallery", { me: true }), P("e", "戊", "invisible", "gallery"), P("f", "己", undefined, "gallery")]));
  assert.deepStrictEqual(m.gallery.map(x => x.nick), ["甲", "乙"]);
  assert.strictEqual(m.gallery[1].status, "away");
});
T("在線的排前面，同狀態照暱稱、再照 id；跟名單的順序無關", G => {
  const a = [P("3", "丙", "away", "hall"), P("2", "乙", "online", "hall"), P("1", "乙", "online", "hall"), P("4", "甲", "away", "hall")];
  const x = J(G.matesByRoom(a)).hall.map(p => p.id), y = J(G.matesByRoom(a.slice().reverse())).hall.map(p => p.id);
  assert.deepStrictEqual(x, ["1", "2", "3", "4"]);
  assert.deepStrictEqual(x, y);
});
T("每個人只在一格；同一個 id 只算一次；沒有暱稱、沒有 id 的不算", G => {
  const m = J(G.matesByRoom([P("a", "甲", "online", "fusion"), P("a", "甲", "online", "office"), P("", "乙", "online", "fusion"), P("c", "  ", "online", "fusion")]));
  assert.strictEqual(m.fusion.length, 1);
  assert.strictEqual(m.office.length, 0);
});
T("分到各格；在別處那格帶著「在哪裡」", G => {
  const m = J(G.matesByRoom([P("a", "甲", "online", "reveal"), P("b", "乙", "online", "cellar:b3"), P("c", "丙", "away", "title"), P("d", "丁", "online", "lobby"), P("e", "戊", "online", "ending")]));
  assert.deepStrictEqual(m.workshop.map(x => x.id), ["a"]);
  assert.deepStrictEqual(m.cellar.map(x => x.id), ["b"]);
  assert.deepStrictEqual(m.lobby.map(x => x.id), ["d"]);
  assert.deepStrictEqual(m.elsewhere.map(x => [x.id, x.where]), [["c", "在門口"]]);
  const all = Object.values(m).reduce((n, l) => n + l.length, 0);
  assert.strictEqual(all, 4); // 戊（結局）不在任何一格
});
T("暱稱當純文字原樣帶過（不改、不拆），壞輸入不丟錯", G => {
  const nick = "<img src=x onerror=alert(1)>";
  assert.strictEqual(J(G.matesByRoom([P("a", nick, "online", "codex")])).codex[0].nick, nick);
  for (const bad of [null, undefined, "x", 5, {}, [null, undefined, 3, "s", {}]]) assert.doesNotThrow(() => G.matesByRoom(bad));
  assert.strictEqual(J(G.matesByRoom(null)).gallery.length, 0);
});
T("放不下：顯示前幾個加「+N」，「+N」的位子先留好", G => {
  const l = ["a", "b", "c", "d", "e"], w = [40, 40, 40, 40, 40];
  assert.deepStrictEqual(J(G.fitMates(l, w, 1000, 20)), { shown: l, more: 0 });           // 全放得下，不用留 +N
  assert.deepStrictEqual(J(G.fitMates(l, w, 100, 20)), { shown: ["a"], more: 4 });        // 兩個 + 「+N」要 40+4+40+4+20=108，超過 100，只放 1 個
});
T("fitMates：寬度剛好的邊界", G => {
  const l = ["a", "b", "c"], w = [40, 40, 40];
  assert.deepStrictEqual(J(G.fitMates(l, w, 132, 20)), { shown: l, more: 0 });             // 40+44+44=128
  assert.deepStrictEqual(J(G.fitMates(l, w, 127, 20)).more, 1);                            // 全放不下 → 2 個 + 4 + 20 = 108 放得下
  assert.deepStrictEqual(J(G.fitMates(l, w, 107, 20)).shown.length, 1);
  assert.deepStrictEqual(J(G.fitMates(l, w, 30, 20)), { shown: [], more: 3 });
  assert.deepStrictEqual(J(G.fitMates([], [], 100, 20)), { shown: [], more: 0 });
});
T("ES 模組載得起來", G => { assert.strictEqual(typeof G.matesByRoom, "function"); });

(async () => {
  const { pathToFileURL } = require("url");
  try {
    const m = await import(pathToFileURL(require("path").join(__dirname, "..", "shared", "mates.js")).href);
    assert.strictEqual(m.mateSpot("reveal"), "workshop"); pass++;
  } catch (e) { fail++; console.log("FAIL 當 ES 模組載入\n   ", e.message); }
  console.log(`${pass} passed, ${fail} failed（導覽圖上的館友）`);
  process.exit(fail ? 1 : 0);
})();

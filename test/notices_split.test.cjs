// 公告一則一個檔（11-16 公告拆檔）：node test/notices_split.test.cjs（npm test 也會跑）
//   1. 遷移：舊陣列拆成檔再合回來，id 集合和順序不變、一則都不掉、內容一樣；重複的 id 只留一份；可以重跑（main 又插了新公告）
//   2. 合成：沒有 order 的（npm run notice 新加的）排最前面；格式不對的檔會報錯；舊陣列又出現會報錯並提示
//   3. 真的 content/notices/：每個檔名跟 id 一樣、id 不重複、欄位對得上 shared/notices.js 的規則；shared/notices.js 裡沒有舊陣列
//   4. merge_main 的救援：拆檔前開的分支帶著舊的 notices.js，裡面 main 還沒有的公告會拆成檔
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const MIG = require("../tools/content/notices_migrate.cjs"), B = require("../tools/content/notices_build.cjs");
const { load } = require("./load_shared.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack || e.message); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "notices-"));

const N = (id, publish, extra = {}) => ({ id, v: 1, cat: "館方公告", tags: ["更新"], importance: "low", area: "賭場", title: "標題" + id, publish, expire: "2027-12-31", sections: [["改了什麼", ["句子" + id]]], ...extra });
const HEAD = 'import { holidayNotices } from "./holidays.js";\n\nexport const NOTICE_AREAS = ["賭場", "其他"];\n';
const oldSource = list => HEAD + "export const NOTICES = [\n" + list.map(n => "  " + JSON.stringify(n) + ",").join("\n") + "\n];\nexport function noticeLive() {}\n";
// 故意不照發布日期排（跟真的陣列一樣：有幾則的日期比前面的新）、有重複的 id（真的陣列裡有兩組）
const OLD = [N("c", "2026-11-16"), N("b", "2026-11-15"), N("dup", "2026-11-14", { v: 1 }), N("a", "2026-11-14"), N("late", "2026-11-20"), N("dup", "2026-11-14", { v: 2, title: "新版" })];
const uniqFirst = ids => ids.filter((id, i) => ids.indexOf(id) === i);

T("遷移：拆成檔再合回來，id 集合和順序不變，重複的 id 留 v 大的", () => {
  const d = tmp(), src = path.join(d, "notices.js"); fs.writeFileSync(src, oldSource(OLD));
  const r = MIG.migrate(src, path.join(d, "n"));
  assert.strictEqual(r.total, 6); assert.strictEqual(r.files, 5); assert.deepStrictEqual(r.dups, ["dup"]);
  const { list, errors } = B.load(path.join(d, "n"));
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(list.map(n => n.id), uniqFirst(OLD.map(n => n.id)), "順序跟拆檔前一樣");
  assert.strictEqual(list.find(n => n.id === "dup").v, 2); assert.strictEqual(list.find(n => n.id === "dup").title, "新版");
  const c = list.find(n => n.id === "c"); assert.deepStrictEqual(c, OLD[0], "內容一樣（只少了 order）");
  // 拆完的 notices.js：陣列沒了，改成從 notices_data.js 讀
  const out = fs.readFileSync(src, "utf8");
  assert.ok(!/^export const NOTICES = \[/m.test(out) && out.includes("export const NOTICES = NOTICES_DATA;") && out.includes('import { NOTICES_DATA } from "./notices_data.js";'));
  assert.ok(out.includes("export function noticeLive"), "後面的函式還在");
});
T("遷移：重跑——main 又在最上面插了新公告，再拆一次，一則都不掉、順序是新的在最前", () => {
  const d = tmp(), src = path.join(d, "notices.js"), nd = path.join(d, "n");
  fs.writeFileSync(src, oldSource(OLD)); MIG.migrate(src, nd);
  assert.strictEqual(MIG.migrate(src, nd), null, "已經是新寫法就什麼都不做");
  const main = [N("new2", "2026-11-17"), N("new1", "2026-11-17"), ...OLD];
  fs.writeFileSync(src, oldSource(main));
  const r = MIG.migrate(src, nd);
  assert.strictEqual(r.added, 2); assert.strictEqual(r.changed, 5, "原本的 order 往後挪了 2（內容沒變）");
  assert.deepStrictEqual(B.load(nd).list.map(n => n.id), uniqFirst(main.map(n => n.id)));
});
T("遷移：沒有 NOTICES 陣列的檔不動", () => {
  const d = tmp(), src = path.join(d, "notices.js"); fs.writeFileSync(src, "export const NOTICES = NOTICES_DATA;\n");
  assert.strictEqual(MIG.migrate(src, path.join(d, "n")), null); assert.ok(!fs.existsSync(path.join(d, "n")));
});
T("合成：沒有 order 的排最前面（at 新的在前），有 order 的照 order", () => {
  const d = tmp(), w = (n) => fs.writeFileSync(path.join(d, n.id + ".json"), JSON.stringify(n));
  w({ ...N("old1", "2026-11-10"), order: 0 }); w({ ...N("old2", "2026-11-10"), order: 1 });
  w({ ...N("n1", "2026-11-16"), at: "2026-11-16T01:00:00Z" }); w({ ...N("n2", "2026-11-16"), at: "2026-11-16T02:00:00Z" });
  const { list } = B.load(d);
  assert.deepStrictEqual(list.map(n => n.id), ["n2", "n1", "old1", "old2"]);
  assert.ok(list.every(n => !("order" in n) && !("at" in n)), "order、at 不進遊戲的資料");
});
T("合成：檔名跟 id 不一樣、壞掉的 JSON、沒標題都報錯", () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, "x.json"), JSON.stringify(N("y", "2026-11-16")));
  fs.writeFileSync(path.join(d, "bad.json"), "{ 壞的");
  fs.writeFileSync(path.join(d, "t.json"), JSON.stringify({ id: "t" }));
  const { errors } = B.load(d);
  assert.strictEqual(errors.length, 3, errors.join("\n"));
  assert.throws(() => B.write(d, path.join(d, "out.js")), /公告檔有問題/);
});
T("合成：寫出來的資料檔讀得回來、沒變就不重寫", () => {
  const d = tmp(), nd = path.join(d, "n"); fs.mkdirSync(nd);
  fs.writeFileSync(path.join(nd, "a.json"), JSON.stringify(N("a", "2026-11-16")));
  const out = path.join(d, "data.js");
  assert.strictEqual(B.write(nd, out), 1);
  const t1 = fs.statSync(out).mtimeMs; fs.utimesSync(out, new Date(1e12), new Date(1e12));
  B.write(nd, out); assert.strictEqual(fs.statSync(out).mtimeMs, 1e12, "內容一樣就不重寫（Vite 才不會一直重載）");
  const data = new Function(fs.readFileSync(out, "utf8").replace("export const NOTICES_DATA =", "return"))();
  assert.deepStrictEqual(data, [N("a", "2026-11-16")]); void t1;
});
T("舊陣列又出現在 notices.js：報錯，提示改用 npm run notice 或 notices_migrate", () => {
  const d = tmp(), src = path.join(d, "notices.js"); fs.writeFileSync(src, oldSource(OLD));
  assert.match(B.legacyProblem(src), /npm run notice/); assert.match(B.legacyProblem(src), /notices_migrate/);
  assert.throws(() => B.write(path.join(d, "n"), path.join(d, "o.js"), src), /npm run notice/);
  fs.writeFileSync(src, "export const NOTICES = NOTICES_DATA;\n"); assert.strictEqual(B.legacyProblem(src), "");
});
T("救援（併 main 用）：舊 notices.js 裡 main 還沒有的公告拆成檔，已有的不動", () => {
  const d = tmp(), nd = path.join(d, "n"); fs.mkdirSync(nd);
  fs.writeFileSync(path.join(nd, "a.json"), JSON.stringify({ ...N("a", "2026-11-14"), order: 0 }));
  const added = MIG.rescue(oldSource([N("mine", "2026-11-16"), N("a", "2026-11-14")]), nd);
  assert.deepStrictEqual(added, ["mine"]);
  assert.deepStrictEqual(B.load(nd).list.map(n => n.id), ["mine", "a"], "我的新公告排在最前面");
  assert.deepStrictEqual(MIG.rescue("export const NOTICES = NOTICES_DATA;\n", nd), []);
});
T("真的 content/notices/：檔名跟 id 一樣、id 不重複、area／cat 合法、沒有舊陣列", () => {
  const { list, errors } = B.load();
  assert.deepStrictEqual(errors, []);
  assert.ok(list.length > 200, "公告不會少：" + list.length);
  assert.strictEqual(new Set(list.map(n => n.id)).size, list.length);
  assert.strictEqual(B.legacyProblem(), "");
  const G = load();
  assert.deepStrictEqual(Array.from(G.NOTICES, n => n.id), list.map(n => n.id), "遊戲讀到的跟 content/notices 一樣");
  list.forEach(n => {
    assert.ok(G.NOTICE_CATS.includes(n.cat), n.id + " cat");
    if (n.area) assert.ok(G.NOTICE_AREAS.includes(n.area), n.id + " area");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(n.publish), n.id + " publish");
  });
});
console.log(`${pass} passed, ${fail} failed（公告一則一個檔）`);
process.exit(fail ? 1 : 0);

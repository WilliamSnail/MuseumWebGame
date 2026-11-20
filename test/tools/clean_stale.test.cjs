// tools/dev/clean_stale.cjs：只刪清單上、不在 git 裡的舊檔；進了 git 的、清單外的不碰
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const { clean, staleList } = require("../../tools/dev/clean_stale.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("✗ " + name + "：" + e.message); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-"));
const git = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
const put = (p, s = "x") => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
put("維護日誌/2026/a.md"); put("shared/notices_data.js"); put("shared/map_data.js"); put("shared/keep.js"); put("README.md");
git("add", "shared/map_data.js", "README.md"); git("commit", "-q", "-m", "init");
T("列出：清單上、不在 git 裡的才列", () => {
  const l = staleList(dir).sort();
  assert.deepStrictEqual(l, ["shared/notices_data.js", "維護日誌"].sort());
});
T("刪掉後：舊檔不見、進了 git 的和清單外的還在", () => {
  clean(dir, true);
  assert.ok(!fs.existsSync(path.join(dir, "維護日誌")));
  assert.ok(!fs.existsSync(path.join(dir, "shared/notices_data.js")));
  assert.ok(fs.existsSync(path.join(dir, "shared/map_data.js")), "進了 git 的不能刪");
  assert.ok(fs.existsSync(path.join(dir, "shared/keep.js")), "清單外的不能刪");
});
T("沒有舊檔時回傳空的", () => assert.deepStrictEqual(clean(dir, true), []));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed（搬家前的舊檔清理）`);
if (fail) process.exit(1);

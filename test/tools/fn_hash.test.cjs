// 函式這包的指紋（tools/release/fn_hash.cjs，11-16）：同樣的內容同壹個指紋；公告資料、.env 不算；函式程式改了指紋就變
const assert = require("assert"), fs = require("fs"), path = require("path");
const { fnHash } = require("../../tools/release/fn_hash.cjs");
const FN = path.join(__dirname, "..", "..", "functions");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };
T("同樣的內容算兩次壹樣", () => assert.strictEqual(fnHash().hash, fnHash().hash));
T("不算 node_modules、.env、公告資料", () => { const { list } = fnHash(); assert.ok(!list.some(f => /node_modules|^\.env|notices_data/.test(f)), list.filter(f => /node_modules|^\.env|notices_data/.test(f)).join(",")); });
T("functions/ 的程式改了指紋就變", () => {
  const f = path.join(FN, "index.js"), old = fs.readFileSync(f), h0 = fnHash().hash;
  try { fs.writeFileSync(f, Buffer.concat([old, Buffer.from("\n// test\n")])); assert.notStrictEqual(fnHash().hash, h0); }
  finally { fs.writeFileSync(f, old); }
  assert.strictEqual(fnHash().hash, h0, "改回來就回到原本的指紋");
});
T("copy_shared 複製前先清空目的資料夾：搬家後留下的舊檔會被清掉（11-20；用自己的暫存資料夾，不動真的 functions/shared/，11-21）", () => {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "copy-shared-")), d = path.join(tmp, "old_stale_dir");
  fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "x.js"), "//"); fs.writeFileSync(path.join(tmp, "stale_top.js"), "//");
  require("child_process").execFileSync(process.execPath, [path.join(__dirname, "..", "..", "tools", "release", "copy_shared.cjs")], { stdio: "ignore", env: Object.assign({}, process.env, { COPY_SHARED_TO: tmp }) });
  assert.ok(!fs.existsSync(d) && !fs.existsSync(path.join(tmp, "stale_top.js")), "舊檔要被清掉"); assert.ok(fs.existsSync(path.join(tmp, "core", "config.js")) && fs.existsSync(path.join(tmp, "day_data.js")), "新的要複製進來");
  fs.rmSync(tmp, { recursive: true, force: true });
});
console.log(`${pass} passed, ${fail} failed（函式這包的指紋）`); process.exit(fail ? 1 : 0);

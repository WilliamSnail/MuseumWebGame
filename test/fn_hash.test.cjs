// 函式這包的指紋（tools/fn_hash.cjs，11-16）：同樣的內容同壹個指紋；公告資料、.env 不算；函式程式改了指紋就變
const assert = require("assert"), fs = require("fs"), path = require("path");
const { fnHash } = require("../tools/fn_hash.cjs");
const FN = path.join(__dirname, "..", "functions");
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
console.log(`${pass} passed, ${fail} failed（函式這包的指紋）`); process.exit(fail ? 1 : 0);

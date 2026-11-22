// ui:check 不能連到別人的 dev server（11-22 美術統籌：在工作副本跑 ui:check，連到另一個 session 占著的同一個埠，量到別人的畫面）：node test/tools/ui_check_server.test.cjs
// 1. freePort 給的埠真的沒人聽；2. serverIsHere 比對 server 回的 main.js 跟這個資料夾的是不是壹樣；
// 3. 預設的埠被別人占著時，startServer 不會連過去（我們自己起的 vite 因 strictPort 死掉就報錯）；4. --url 會印警告。
const assert = require("assert"), fs = require("fs"), http = require("http"), net = require("net"), path = require("path");
const U = require("../../tools/check/ui_check.cjs");
const ROOT = path.join(__dirname, "..", "..");
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
const serve = (handler, port = 0) => new Promise(res => { const s = http.createServer(handler); s.listen(port, "localhost", () => res(s)); });
const MAIN = fs.readFileSync(path.join(ROOT, "web", "src", "core", "main.js"), "utf8");

(async () => {
  await T("freePort：給的埠沒人在聽，兩次不一樣也沒關係", async () => {
    const p = await U.freePort();
    assert.ok(p > 1024);
    await new Promise((res, rej) => { const s = net.createServer(); s.on("error", rej); s.listen(p, "127.0.0.1", () => s.close(res)); }); // 真的聽得起來＝沒人占
  });
  await T("serverIsHere：main.js 一樣 true、不一樣 false、連不上 null", async () => {
    const mine = await serve((q, r) => { r.end("export default " + JSON.stringify(MAIN)); });
    const other = await serve((q, r) => { r.end("export default " + JSON.stringify(MAIN + "\n// 別的分支")); });
    const missing = await serve((q, r) => { r.statusCode = 404; r.end("no"); });
    try {
      assert.strictEqual(await U.serverIsHere("http://localhost:" + mine.address().port), true);
      assert.strictEqual(await U.serverIsHere("http://localhost:" + other.address().port), false);
      assert.strictEqual(await U.serverIsHere("http://localhost:" + missing.address().port), false);
      assert.strictEqual(await U.serverIsHere("http://localhost:" + await U.freePort()), null);
    } finally { mine.close(); other.close(); missing.close(); }
  });
  await T("埠被別人占著：startServer 不連過去，直接報錯", async () => {
    const squatter = await serve((q, r) => { r.end("別人的畫面"); });
    try {
      await assert.rejects(U.startServer(squatter.address().port), /起不來|不是這個資料夾/);
    } finally { squatter.close(); }
  });
  await T("原始碼：預設找空的埠、--url 印警告並比對、不再寫死 5499", () => {
    const src = fs.readFileSync(path.join(ROOT, "tools", "check", "ui_check.cjs"), "utf8");
    assert.ok(/freePort\(\)/.test(src) && !/\b5499\b/.test(src.replace(/\/\/.*$/gm, "")), "預設埠要找空的");
    assert.ok(/不是自己起的 server/.test(src) && /serverIsHere\(base\)/.test(src), "--url 要警告、比對");
  });
  console.log(`${pass} 通過、${fail} 失敗`);
  process.exit(fail ? 1 : 0);
})();

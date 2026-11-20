// 前端錯誤回報（決定 0125）：node test/game/client_error.test.cjs（npm test 也會跑）
// 測：清掉個資、長度上限、欄位白名單、每頁最多 5 筆、每人每分鐘最多 5 筆、同天同樣的算同壹筆；伺服器和網頁真的有接上
const assert = require("assert"), fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 4).join("\n    ")); } };
(async () => {
  const M = await import("../../shared/client_error.js"), { CLIENT_ERR, clientErrClean, clientErrKey, clientErrAllow, clientErrQuota, clientErrText } = M;
  await T("清乾淨：email、像 uid 的字、網域、網址的 ? 和 # 都不留", () => {
    const uid = "AbCdEfGhIjKlMnOpQrStUvWxYz12", t = clientErrText(`Failed for yuga.test+1@gmail.com uid ${uid} at https://pepe-museum.web.app/assets/ui.js?token=SECRET#frag:12:3`);
    assert.ok(!/gmail|@|SECRET|token|pepe-museum\.web\.app|#frag/.test(t) && !t.includes(uid), t);
    assert.ok(t.includes("（email）") && t.includes("（uid）"), t);
  });
  await T("白名單：只留 msg、src、stack、screen、ver、vw、vh；多給的存檔、名字、uid、email 全丟掉", () => {
    const c = clientErrClean({ msg: "x is not a function", src: "ui_bank.js:12", stack: "a\nb", screen: "bank", ver: "2026.11.11-1", vw: 375, vh: 740, save: { P: 1 }, name: "小明", uid: "u1", email: "a@b.co" });
    assert.deepStrictEqual(Object.keys(c).sort(), ["msg", "screen", "src", "stack", "ver", "vh", "vw"]);
    assert.ok(!JSON.stringify(c).includes("小明") && !JSON.stringify(c).includes("a@b.co"));
  });
  await T("長度上限：訊息 300 字、stack 5 行、每行 200 字；不合格的畫面 id、版本號丟掉；視窗大小不是整數或太大＝0", () => {
    const c = clientErrClean({ msg: "字".repeat(1000), stack: Array.from({ length: 20 }, (_, i) => "line" + i + "x".repeat(500)).join("\n"), screen: "bad screen!", ver: "../../etc", vw: 99999, vh: "abc", src: "f".repeat(500) });
    assert.strictEqual([...c.msg].length, CLIENT_ERR.msgMax);
    assert.strictEqual(c.stack.split("\n").length, CLIENT_ERR.stackLines);
    assert.ok(c.stack.split("\n").every(l => [...l].length <= CLIENT_ERR.lineMax));
    assert.ok([...c.src].length <= 120);
    assert.strictEqual(c.screen, ""); assert.strictEqual(c.ver, ""); assert.strictEqual(c.vw, 0); assert.strictEqual(c.vh, 0);
  });
  await T("空的、不是物件、只有空白的訊息：不送（回 null）", () => { for (const x of [null, undefined, "str", 5, {}, { msg: "   " }, { msg: "" }]) assert.strictEqual(clientErrClean(x), null); });
  await T("每次開頁最多 5 筆、同樣的不重複送", () => {
    const sent = [], mk = i => ({ msg: "e" + i, src: "a.js:" + i });
    assert.strictEqual(clientErrAllow(sent, mk(1)), true); assert.strictEqual(clientErrAllow(sent, mk(1)), false, "同樣的不重複");
    for (let i = 2; i <= 5; i++) assert.strictEqual(clientErrAllow(sent, mk(i)), true);
    assert.strictEqual(clientErrAllow(sent, mk(6)), false, "第 6 筆擋掉"); assert.strictEqual(sent.length, CLIENT_ERR.perPage);
  });
  await T("每人每分鐘最多 5 筆，下壹分鐘重算", () => {
    let rec = null; const t0 = 1_700_000_000_000;
    for (let i = 0; i < CLIENT_ERR.perMinute; i++) { const s = clientErrQuota(rec, t0 + i * 1000); assert.ok(s.ok, "第 " + (i + 1) + " 筆該過"); rec = s.rec; }
    assert.strictEqual(clientErrQuota(rec, t0 + 6000).ok, false, "第 6 筆擋掉");
    assert.strictEqual(clientErrQuota(rec, t0 + 61000).ok, true, "下壹分鐘重算");
  });
  await T("同壹天、同樣的訊息和位置＝同壹個 key；不同天或不同訊息不同", () => {
    const a = { msg: "m", src: "s" };
    assert.strictEqual(clientErrKey(a, "2026-11-17"), clientErrKey({ msg: "m", src: "s" }, "2026-11-17"));
    assert.notStrictEqual(clientErrKey(a, "2026-11-17"), clientErrKey(a, "2026-11-18"));
    assert.notStrictEqual(clientErrKey(a, "2026-11-17"), clientErrKey({ msg: "m2", src: "s" }, "2026-11-17"));
    assert.ok(/^2026-11-17_[0-9a-f]{8}$/.test(clientErrKey(a, "2026-11-17")));
  });
  await T("接線：伺服器匯出 clientError、不讀存檔和 uid；網頁載入 error_report、開發時不送；委託櫃台側欄每塊有 safeBlock", () => {
    const R = f => fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8");
    assert.ok(/export \{ clientError \}/.test(R("functions/index.js")));
    const fn = R("functions/client_error.js");
    assert.ok(!/req\.auth|\.uid\b/.test(fn), "伺服器端不碰登入資訊");
    assert.ok(/clientErrClean\(req\.data\)/.test(fn) && /clientErrQuota/.test(fn) && /expireAt/.test(fn));
    assert.ok(/error_report\.js/.test(R("web/src/main.js")));
    assert.ok(/import\.meta\.env\.DEV/.test(R("web/src/error_report.js")));
    const sc = R("web/src/ui_screens2.js");
    for (const t of ["老主顧", "怪癖的治法", "壹鍵交件"]) assert.ok(sc.includes(`safeBlock("${t}"`), t);
  });
  console.log(fail ? `client_error：${pass} 過、${fail} 失敗` : `client_error：${pass} 項全過`);
  process.exit(fail ? 1 : 0);
})();

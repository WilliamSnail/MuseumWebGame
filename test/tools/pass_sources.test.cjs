// 館友證的來源檢查（tools/check/pass_sources.cjs，11-22）：node test/tools/pass_sources.test.cjs（npm test 也會跑）
const assert = require("assert");
const { check, gather } = require("../../tools/check/pass_sources.cjs");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const fresh = () => gather();
const has = (bad, re) => bad.some(b => re.test(b));

T("現在的 repo：登記表、白名單、passView、對外欄位都對得上", () => assert.deepStrictEqual(check(fresh()), []));
T("來源 → 館友證：新增存檔欄位沒登記要擋；加進 hideSave 就過；hideSave 的欄位後來登記了或拿掉了也要擋", () => {
  const d = fresh(); d.saveKeys.P.push("newThing"); assert.ok(has(check(d), /P\.newThing 沒登記/));
  d.gaps.hideSave["P.newThing"] = "測試"; assert.deepStrictEqual(check(d), []);
  const e = fresh(); e.gaps.hideSave["P.mood"] = "x"; assert.ok(has(check(e), /hideSave 的 P\.mood 已經登記/));
  const f = fresh(); f.gaps.hideSave["P.gone"] = "x"; assert.ok(has(check(f), /P\.gone 存檔裡已經沒有/));
});
T("來源 → 館友證：config／text 多了清單沒登記要擋；白名單 hideLists 的清單後來登記了也要擋", () => {
  const d = fresh(); d.listExports["shared/core/config.js"].push("NEW_THING_ITEMS"); assert.ok(has(check(d), /NEW_THING_ITEMS 沒登記/));
  const e = fresh(); e.gaps.hideLists.GEAR_ITEMS = "x"; assert.ok(has(check(e), /hideLists 的 GEAR_ITEMS 已經登記/));
});
T("來源 → 館友證：登記了館友證沒顯示的要擋（要有 none 白名單）；補完了白名單還留著也要擋", () => {
  const d = fresh(); d.gaps.gaps = d.gaps.gaps.filter(g => g.row !== "visitors"); assert.ok(has(check(d), /visitors.*館友證沒有顯示/));
  const e = fresh(); e.rows.find(r => r.id === "visitors").pass = { src: "pass", key: "visitor.stats" }; assert.ok(has(check(e), /visitors（none）已經有顯示/));
});
T("來源 → 館友證：passView 算了但畫面沒讀要擋；unused 白名單在畫面讀了以後要擋", () => {
  const d = fresh(); d.gaps.gaps = d.gaps.gaps.filter(g => g.kind !== "unused"); assert.ok(has(check(d), /souvenirs 算了但畫面/));
  const e = fresh(); e.uiSrc += " x.souvenirs "; assert.ok(has(check(e), /souvenirs（unused souvenirs）畫面已經讀/));
});
T("館友證 → 來源：passView 回的欄位拿掉了、登記表指到不存在的檔或清單、輸出多了沒對應的欄位都要擋", () => {
  const d = fresh(); delete d.passOut.pepe.failed; assert.ok(has(check(d), /沒有欄位 pepe\.failed/));
  const e = fresh(); e.rows.find(r => r.id === "gear").from.list = "GONE_ITEMS"; assert.ok(has(check(e), /沒有 export GONE_ITEMS/));
  const f = fresh(); f.passOut.extra = 1; assert.ok(has(check(f), /回了欄位 extra/)); f.gaps.hidePass.extra = "x"; assert.deepStrictEqual(check(f), []);
  const g = fresh(); g.casOut.extra = 1; assert.ok(has(check(g), /casPassView 回了欄位 extra/));
});
T("對外：cleanHallView 多一個欄位、或登記表的 pub 多寫壹個，兩邊都要擋", () => {
  const d = fresh(); d.pubKeys.push("secret"); assert.ok(has(check(d), /cleanHallView 對外的欄位 secret/));
  const e = fresh(); e.rows.find(r => r.id === "hall").pub.push("ghost"); assert.ok(has(check(e), /pub 寫了 ghost/));
});
T("登記表：id 不重複；白名單的 gaps 要指到存在的列、有原因", () => {
  const d = fresh(); d.rows.push(Object.assign({}, d.rows[0])); assert.ok(has(check(d), /id「visitor」重複/));
  const e = fresh(); e.gaps.gaps.push({ row: "nope", kind: "none", id: "X", reason: "x", since: "2026-11-22" }); assert.ok(has(check(e), /找不到登記表的列「nope」/));
  const f = fresh(); f.gaps.gaps.push({ row: "hall", kind: "partial", id: "X", reason: "", since: "" }); assert.ok(has(check(f), /要有 id、reason、since/));
});
console.log(fail ? `館友證來源檢查：${fail} 項沒過` : `館友證來源檢查：${pass} 項都過`); process.exit(fail ? 1 : 0);

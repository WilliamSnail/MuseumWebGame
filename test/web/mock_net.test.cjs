// 假伺服器（web/src/core/mock_net.js、mock/fixtures.json，11-22）：node test/web/mock_net.test.cjs（npm test 也會跑）
// 1. 畫面用 NET.call("casino"…) 叫的「只讀」動作，fixtures.json 都要有；會動錢、改狀態的列在 MUTATING（假伺服器回「不處理」）。新動作兩邊都沒有就擋。
// 2. fixtures.json 有 calls.json 列的每一個呼叫、都是成功的回應；裡面沒有真人資料（模擬器的 dev- 帳號、email）。
// 3. 錄製腳本和假伺服器算 key 的寫法一樣（不然錄了也對不上）。
// 假資料的形狀跟伺服器對不對得上要連模擬器才知道：npm run mock:record -- --set N --check（不在 npm test）。
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.stack.split("\n").slice(0, 5).join("\n    ")); } };
const FIX = JSON.parse(rd("web/src/core/mock/fixtures.json")).responses, SPEC = JSON.parse(rd("web/src/core/mock/calls.json"));
const keyOf = (fn, d) => [fn, d && d.act, d && d.op].filter(Boolean).join(":");

// 會動錢、改狀態、送出東西的動作：假伺服器不處理（要測規則請用模擬器登入）。新增動作要想過是只讀還是會改，只讀的放進 calls.json 錄下來
const MUTATING = new Set(["casino:econ", "casino:pack", "casino:job", "casino:cellarFind", "casino:used", "casino:signWeek", "casino:wkclaim", "casino:tickets",
  "casino:giver:heard", "casinoHoldem:act", "casinoHoldem:buyin", "casinoHoldem:tick", "casinoHoldem:npcWho", "casinoHoldem:npcInvite", "casinoTable:npcWho", "casinoTable:npcInvite"]);
// 桌子的後續動作（buyin、tick、npcWho）假伺服器回錄下來的那張桌子；其他一律「不處理」
const TABLE_FOLLOW = /^(casinoHoldem|casinoTable):(buyin|tick|npcWho|npcInvite|act|join|bet|hit|stand|say|leave)$/;

T("畫面叫的 casino 動作：不是有假資料，就是列在 MUTATING", () => {
  const found = new Map();
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(e => {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) return walk(p);
    if (!/\.js$/.test(e.name) || /(mock_net|qa_hooks)\.js$/.test(e.name)) return;
    for (const m of rd(p).matchAll(/NET\.call\("(casino|casinoTable|casinoHoldem)", \{ act: "([a-zA-Z]+)"(?:, op: "([a-zA-Z]+)")?/g)) found.set(keyOf(m[1], { act: m[2], op: m[3] }), p);
  });
  walk("web/src");
  const lost = [...found].filter(([k]) => !(k in FIX) && !MUTATING.has(k) && !TABLE_FOLLOW.test(k)).map(([k, p]) => `${k}（${p}）`);
  assert.deepStrictEqual(lost, [], "畫面叫了假伺服器沒有的動作：只讀的加進 web/src/core/mock/calls.json 再 npm run mock:record；會改狀態的加進這個測試的 MUTATING");
});
T("fixtures.json 有 calls.json 列的每個呼叫，而且都是成功的回應", () => {
  for (const c of SPEC.calls) { const k = keyOf(c.fn, c.data); assert.ok(k in FIX, `缺 ${k}（重錄）`); assert.notStrictEqual(FIX[k] && FIX[k].ok, false, `${k} 錄到的是失敗：${FIX[k] && FIX[k].reason}`); }
  for (const k of ["casinoTable:open", "casinoHoldem:open"]) assert.ok(FIX[k] && FIX[k].view && FIX[k].pid, `缺桌子 ${k}`);
});
T("fixtures.json 沒有真人資料（模擬器的 dev- 帳號、email、錄製用的暱稱）", () => {
  const s = rd("web/src/core/mock/fixtures.json");
  assert.ok(!/dev-[0-9a-f]{6}|@dev\.local|"假館友"/.test(s), "有沒換掉的帳號或暱稱");
  assert.ok(s.includes('"mock-me"') && s.includes("測試館友"));
});
T("錄製腳本和假伺服器算 key 的寫法一樣", () => {
  const expr = "[fn, d && d.act, d && d.op].filter(Boolean).join(\":\")";
  assert.ok(rd("tools/dev/mock_record.cjs").includes(expr) && rd("web/src/core/mock_net.js").includes(expr));
});
T("形狀比對（mock:record --check 用）：多欄位、少欄位、型別變都報；null、空陣列、不同名字的字典不報", () => {
  const { shapeDiff } = require("../../tools/dev/mock_record.cjs");
  assert.deepStrictEqual(shapeDiff({ a: 1, b: { c: "x" } }, { a: 1, b: { c: "x" } }), []);
  assert.strictEqual(shapeDiff({ a: 1 }, { a: 1, z: 2 }).length, 1, "伺服器新增欄位");
  assert.strictEqual(shapeDiff({ a: 1, b: 2 }, { a: 1 }).length, 1, "伺服器拿掉欄位");
  assert.strictEqual(shapeDiff({ a: 1 }, { a: "1" }).length, 1, "型別變了");
  assert.strictEqual(shapeDiff({ w: { n: [{ id: 1, x: 2 }] } }, { w: { n: [{ id: 1 }] } }).length, 1, "陣列裡的物件也比");
  assert.deepStrictEqual(shapeDiff({ e: null, l: [] }, { e: { x: 1 }, l: [{ y: 1 }] }), [], "null、空陣列是這一刻的狀態");
  const big = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ["k" + i, 1]));
  assert.deepStrictEqual(shapeDiff(big(50), big(51)), [], "id 當 key 的字典不比 key");
});
console.log(`${pass} 通過、${fail} 失敗`);
process.exit(fail ? 1 : 0);

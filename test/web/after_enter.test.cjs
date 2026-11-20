// 進館的順序（11-16 翊文：「有時候壹登入後進大廳會跑進賭桌而不是公告」）：賭場同桌不能讓 afterEnter 提早結束、跳過公佈欄和簽到
const assert = require("assert"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "rooms", "ui_screens1.js"), "utf8");
const i = src.indexOf("export async function afterEnter"), body = src.slice(i, src.indexOf("\n}\n", i));
assert.ok(i > 0, "找得到 afterEnter");
assert.ok(!/casinoResume\(\)\)\s*return/.test(body), "賭場同桌接回去不能讓 afterEnter 直接 return");
assert.ok(body.indexOf("autoBoard") > 0 && body.lastIndexOf("PANELS.casinoOffer(") > body.indexOf("PANELS.autoBoard"), "問要不要回牌桌要排在公佈欄後面");
const tb = fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "rooms", "casino", "ui_casino_table.js"), "utf8");
const r = tb.slice(tb.indexOf("PANELS.casinoResume = "), tb.indexOf("PANELS.casinoOffer = "));
assert.ok(!/openTable\(/.test(r), "casinoResume 只回傳 pid，不自己打開牌桌");
console.log("3 passed, 0 failed（進館順序）");

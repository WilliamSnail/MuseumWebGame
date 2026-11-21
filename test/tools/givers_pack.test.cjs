// shared/npc/givers.js 要跟 content/givers/*.json 一樣新（tools/content/givers_pack.cjs 產生）：node test/tools/givers_pack.test.cjs
const assert = require("assert"), fs = require("fs"), path = require("path");
const P = require("../../tools/content/givers_pack.cjs");
const file = path.join(__dirname, "..", "..", "shared", "npc", "givers.js");
const g = P.givers();
assert.deepStrictEqual(Object.keys(g).sort(), ["clerk", "hall", "number", "postman", "scale", "yuga"], "六位交代人都在");
assert.strictEqual(fs.readFileSync(file, "utf8"), P.source(g), "shared/npc/givers.js 沒跟上 content/givers：node tools/content/givers_pack.cjs");
console.log("交代人資料打包：2 項都過");

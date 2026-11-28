// 這個分頁要不要靜音（shared/game/quiet.js，11-28）：node test/game/quiet.test.cjs（npm test 也會跑）
const assert = require("assert");
const { load } = require("../load_shared.cjs");
const G = load();
const q = o => G.tabQuiet(o);
assert.strictEqual(q({ dev: true, search: "", hash: "" }), true, "開發版根網址也靜音（以前會放大廳音樂）");
assert.strictEqual(q({ dev: true, search: "?user=小明", hash: "" }), true);
assert.strictEqual(q({ dev: true, search: "?user=小明&sound", hash: "" }), false, "&sound 要出聲");
assert.strictEqual(q({ dev: true, search: "", hash: "#lobby&sound" }), false, "#畫面&sound 也要出聲");
assert.strictEqual(q({ dev: true, search: "?soundtrack=1", hash: "" }), true, "soundtrack 不算 sound");
assert.strictEqual(q({ dev: false, webdriver: true, search: "", hash: "" }), true, "正式版被自動化瀏覽器打開也靜音");
assert.strictEqual(q({ dev: false, webdriver: false, search: "", hash: "" }), false, "真人開正式版照常有聲音");
assert.strictEqual(q(null), false);
console.log("tabQuiet：8 passed");
process.exit(0);

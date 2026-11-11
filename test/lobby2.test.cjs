// 新的大廳（決定 0066）：node test/lobby2.test.cjs（npm test 也會跑）
// 回滾用的總開關在、舊的大廳程式還在、11 間房都對得到、素材都在 web/public/lobby、設定頁有「舊的大廳」。只讀檔案，不開瀏覽器。
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load_shared.cjs");
const ROOT = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(load()); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };

T("回滾的總開關：NUM.ui.newLobby 是布林；存檔的設定有 oldLobby（預設 false）", G => {
  assert.strictEqual(typeof G.NUM.ui.newLobby, "boolean");
  assert.strictEqual(G.newSave().settings.oldLobby, false);
});
T("舊的大廳還在（回滾就走它）：SCREENS.lobby 先問 useLobby2，下面照舊畫 ART.floorPlan", () => {
  const s = read("web/src/ui_screens1.js");
  const i = s.indexOf("SCREENS.lobby = root => {"), j = s.indexOf("SCREENS.gallery");
  const body = s.slice(i, j);
  assert.ok(body.includes("ADDONS.useLobby2()") && body.includes("ART.floorPlan("), "新舊兩條路都在");
});
T("新大廳的 11 間房：都是遊戲裡的房間，不重複；房間按鈕保留 .fp-room（教學找得到）", () => {
  const s = read("web/src/ui_lobby2.js");
  const ids = [...s.matchAll(/\{ id: "([a-z]+)", icon:/g)].map(m => m[1]);
  assert.deepStrictEqual(ids.slice().sort(), ["casino", "cellar", "codex", "commission", "fusion", "gallery", "hall", "office", "origin", "pillow", "workshop"]);
  assert.ok(s.includes('"l2-room fp-room"'));
});
T("用到的素材都在 web/public/lobby（打包時原樣複製）", () => {
  const s = read("web/src/ui_lobby2.js") + read("web/src/css/lobby2.css");
  const used = new Set([...s.matchAll(/\/lobby\/([a-z0-9-]+\.webp)/g)].map(m => m[1]));
  [...s.matchAll(/room-\$\{r\.icon\}/g)].length && ["gallery", "fusion", "library", "cellar", "workshop", "board", "office", "casino"].forEach(r => used.add(`room-${r}.webp`));
  ["seal-gold", "seal-wine", "seal-green", "seal-dark", "land", "ic-nameplate"].forEach(n => used.add(n + ".webp"));
  used.forEach(f => assert.ok(fs.existsSync(path.join(ROOT, "web/public/lobby", f)), "少了 " + f));
});
T("畫面上的字沒有英文（房間名字、橫幅、按鈕都用中文）", () => {
  const s = read("web/src/ui_lobby2.js");
  const code = s.split("\n").filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\/\/ .*$/, "")).join("\n"); // 註解不算
  const strings = [...code.matchAll(/"([^"\\\n]*[一-鿿][^"\\\n]*)"/g)].map(m => m[1]);
  strings.filter(t => !/[`$?:(),]/.test(t)).forEach(t => assert.ok(!/[A-Za-z]{2,}/.test(t), t)); // 跨過程式碼的不是字串，跳過
  assert.ok(strings.includes("今天要做的事") && strings.includes("手上有的"));
});

console.log(`${fail ? "✗" : "✓"} 新的大廳：${pass} 項通過${fail ? `、${fail} 項沒過` : ""}`);
if (fail) process.exit(1);

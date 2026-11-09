// 把 database.rules.json 放進模擬器裡遊戲用的那個 Realtime Database：node tools/emu_rules.cjs（第 N 套：EMU_SET=N）
// 為什麼要有：模擬器照 firebase.json 把規則放在預設的 demo-pepe4-default-rtdb，但遊戲和 Functions 用的名字是 demo-pepe4（web/src/firebase_config.js）。
// 所以 npm run emulators 開起來，demo-pepe4 這個資料庫其實沒有規則（誰都讀得到）。要測「玩家讀不到別人的東西」，開好模擬器之後跑一次這支。
// 只連 127.0.0.1 的模擬器，碰不到正式的 Firebase。
const fs = require("fs"), path = require("path"), http = require("http");
const port = 9100 + 1000 * (Number(process.env.EMU_SET) || 0);
const rules = fs.readFileSync(path.join(__dirname, "..", "database.rules.json"));
const req = http.request({ host: "127.0.0.1", port, path: "/.settings/rules.json?ns=demo-pepe4&access_token=owner", method: "PUT" }, res => {
  let body = "";
  res.on("data", d => { body += d; });
  res.on("end", () => { console.log(res.statusCode === 200 ? `規則放好了（連接埠 ${port}）` : `放不進去：${res.statusCode} ${body}`); process.exit(res.statusCode === 200 ? 0 : 1); });
});
req.on("error", e => { console.error(`連不上模擬器（連接埠 ${port}）：${e.message}`); process.exit(1); });
req.end(rules);

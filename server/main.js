// 佩佩博物館 4 的遊戲伺服器：npm run server（或 node server/main.js）。
// 設定全部用環境變數，見 server/README.md。開發時什麼都不用設：
//   port 8787、只聽 127.0.0.1、開發登入（帶名字就登入）、資料庫在 ~/.pepe-museum4/dev.db。
// 網頁還是開 npm run dev（Vite，5173），Vite 會把 /api、/ws 轉到這裡。
import { readConfig } from "./config.js";
import { startServer } from "./app.js";

let cfg;
try {
  cfg = readConfig();
} catch (e) {
  console.error("設定有問題：" + e.message);
  process.exit(1);
}

let srv;
try {
  srv = await startServer(cfg);
} catch (e) {
  console.error("伺服器開不起來：" + (e && e.message));
  process.exit(1);
}

console.log(`佩佩博物館 4 伺服器：http://${cfg.host}:${srv.port}`);
console.log(`  模式 ${cfg.nodeEnv}、登入 ${cfg.auth}、入口 ${cfg.entry}、資料庫 ${cfg.dbPath}`);
console.log(cfg.serveDist ? `  網頁：發 ${cfg.distDir}` : "  網頁：不發（開發時走 Vite：npm run dev）");

let stopping = false;
async function stop(sig) {
  if (stopping) return;
  stopping = true;
  console.log(`收到 ${sig}，關閉中…`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  await srv.close();
  process.exit(0);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

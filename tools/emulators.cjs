// 開 Firebase 模擬器：npm run emulators（docs/Firebase做法.md 第五節）
// - 專案名用 demo-pepe4：demo- 開頭的專案不用登入 Firebase，也不會連到真的專案。
// - 要 Java 21。這台電腦的 PATH 找不到 java 時，試著找 Windows 上 Eclipse Adoptium 裝的位置。
// - 資料放在 .firebase-data/（不進 repo），關掉時存下來，下次開的時候讀回來。
// - 開之前把 shared/ 複製進 functions/shared/（Functions 要 import 同一份規則）。
// - 同時開好幾套（好幾個分支各測各的 Functions）：EMU_SET=1 npm run emulators，每個連接埠加 1000×EMU_SET、資料不存；
//   網頁要連同一套：VITE_EMU_SET=1 npx vite --port 5190 --strictPort（web/src/firebase_config.js）。沒設就是原本那一套。
const { spawnSync, spawn } = require("child_process");
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, ".firebase-data");
const env = { ...process.env };
// functions/discord_warm.js 有 top-level await：新版 Node 的 require() 載不了，firebase-tools 又只有 require 失敗成 ERR_REQUIRE_ESM 才改用 import。
// 關掉 require(esm)，模擬器才載得起來（正式環境本來就用 import）。
env.NODE_OPTIONS = [env.NODE_OPTIONS, "--no-experimental-require-module"].filter(Boolean).join(" ");

function hasJava(e) {
  const r = spawnSync("java", ["-version"], { env: e });
  return r.status === 0;
}
if (!hasJava(env) && process.platform === "win32") {
  const base = "C:\\Program Files\\Eclipse Adoptium";
  const jdk = fs.existsSync(base) && fs.readdirSync(base).filter(d => d.startsWith("jdk-21")).sort().pop();
  if (jdk) {
    env.JAVA_HOME = path.join(base, jdk);
    env.PATH = path.join(env.JAVA_HOME, "bin") + path.delimiter + (env.PATH || env.Path || "");
    env.Path = env.PATH;
  }
}
if (!hasJava(env)) {
  console.error("找不到 Java。Firebase 模擬器要 Java 21：Windows 可以用 winget install --id EclipseAdoptium.Temurin.21.JDK -e");
  process.exit(1);
}

require("./copy_shared.cjs");

const SET = Number(env.EMU_SET) || 0;
let args;
if (SET) {
  // 另一套：照 firebase.json 另外寫一份設定（不進 repo），連接埠都加 1000×SET；Firestore 的 websocket 也要另外給，不然會撞
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  const add = 1000 * SET;
  for (const v of Object.values(cfg.emulators)) if (v && typeof v === "object" && v.port) v.port += add;
  cfg.emulators.firestore.websocketPort = 9150 + add;
  const name = `firebase.emu${SET}.json`;
  fs.writeFileSync(path.join(ROOT, name), JSON.stringify(cfg, null, 2));
  args = ["--config", name, "emulators:start", "--project", "demo-pepe4"];
  console.log(`第 ${SET} 套模擬器：連接埠都加 ${add}（管理畫面 http://127.0.0.1:${cfg.emulators.ui.port}）。網頁用 VITE_EMU_SET=${SET} 開。`);
} else {
  args = ["emulators:start", "--project", "demo-pepe4", "--export-on-exit", DATA];
  if (fs.existsSync(path.join(DATA, "firebase-export-metadata.json"))) args.push("--import", DATA);
}
// 直接用 node 跑 firebase-tools（不經過 shell：路徑裡有空白、中文也沒關係）
const bin = path.join(ROOT, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const child = spawn(process.execPath, [bin, ...args], { cwd: ROOT, env, stdio: "inherit" });
child.on("exit", code => process.exit(code || 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));

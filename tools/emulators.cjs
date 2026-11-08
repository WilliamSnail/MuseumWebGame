// 開 Firebase 模擬器：npm run emulators（docs/Firebase做法.md 第五節）
// - 專案名用 demo-pepe4：demo- 開頭的專案不用登入 Firebase，也不會連到真的專案。
// - 要 Java 21。這台電腦的 PATH 找不到 java 時，試著找 Windows 上 Eclipse Adoptium 裝的位置。
// - 資料放在 .firebase-data/（不進 repo），關掉時存下來，下次開的時候讀回來。
// - 開之前把 shared/ 複製進 functions/shared/（Functions 要 import 同一份規則）。
const { spawnSync, spawn } = require("child_process");
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, ".firebase-data");
const env = { ...process.env };

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

const args = ["emulators:start", "--project", "demo-pepe4", "--export-on-exit", DATA];
if (fs.existsSync(path.join(DATA, "firebase-export-metadata.json"))) args.push("--import", DATA);
// 直接用 node 跑 firebase-tools（不經過 shell：路徑裡有空白、中文也沒關係）
const bin = path.join(ROOT, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const child = spawn(process.execPath, [bin, ...args], { cwd: ROOT, env, stdio: "inherit" });
child.on("exit", code => process.exit(code || 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));

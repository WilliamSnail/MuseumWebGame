// 伺服器的設定：全部從環境變數來，程式裡不寫死網址、金鑰。
// 每個變數的意思見 server/README.md「環境變數」。.env 不進 repo。
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 專案資料夾（server/ 的上一層）
export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const AUTH_MODES = ["dev", "firebase", "access"];
export const ENTRIES = ["ddns", "tunnel"];

function int(v, def, name) {
  if (v == null || v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} 要是 0 以上的整數，現在是「${v}」`);
  return n;
}

function flag(v, def) {
  if (v == null || v === "") return def;
  return v === "1" || v === "true";
}

// 讀設定。設錯就丟錯誤，伺服器不會開起來。
export function readConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const production = nodeEnv === "production";

  const entry = env.ENTRY || "ddns";
  if (!ENTRIES.includes(entry)) throw new Error(`ENTRY 只能是 ${ENTRIES.join("／")}，現在是「${entry}」`);

  // 登入方式：開發時預設 dev；正式環境照入口決定（A＝ddns 用 Firebase，B＝tunnel 用 Access）
  const auth = env.AUTH || (production ? (entry === "tunnel" ? "access" : "firebase") : "dev");
  if (!AUTH_MODES.includes(auth)) throw new Error(`AUTH 只能是 ${AUTH_MODES.join("／")}，現在是「${auth}」`);
  if (production && auth === "dev") throw new Error("正式環境（NODE_ENV=production）不能用 AUTH=dev");

  // 正式環境的資料庫一定要指定，而且要放在 releases 資料夾外面（換版時才不會跟著換掉）
  if (production && !env.DB_PATH) throw new Error("正式環境要設 DB_PATH，例如 /srv/pepe/data/pepe.db");

  let publicUrl = env.PUBLIC_URL || "";
  if (publicUrl) {
    try { publicUrl = new URL(publicUrl).origin; }
    catch { throw new Error(`PUBLIC_URL 不是網址：「${env.PUBLIC_URL}」`); }
  }

  return {
    nodeEnv,
    production,
    entry,
    auth,
    port: int(env.PORT, 8787, "PORT"),
    host: env.HOST || "127.0.0.1",
    // 開發用的資料庫放在家目錄，不放在專案裡：不會進 repo，也不會被 OneDrive 同步到一半
    dbPath: env.DB_PATH || join(homedir(), ".pepe-museum4", "dev.db"),
    publicUrl,
    serveDist: flag(env.SERVE_DIST, production),
    distDir: env.DIST_DIR || join(ROOT, "dist"),
    trustProxy: flag(env.TRUST_PROXY, production),
    // 開發時 @dev.local 的帳號不用在邀請名單上
    devOpen: !production && flag(env.DEV_OPEN, true),
    saveMaxBytes: int(env.SAVE_MAX_KB, 1024, "SAVE_MAX_KB") * 1024,
    snapshotKeep: int(env.SNAPSHOT_KEEP, 20, "SNAPSHOT_KEEP"),
    snapshotGapSec: int(env.SNAPSHOT_GAP_MIN, 10, "SNAPSHOT_GAP_MIN") * 60,
    sessionDays: int(env.SESSION_DAYS, 30, "SESSION_DAYS"),
    loginPerMin: 10, // 每個 IP 一分鐘最多登入幾次（測試會放寬）
    // 之後接正式登入要的值（現在還沒用到）
    firebaseProjectId: env.FIREBASE_PROJECT_ID || "",
    accessTeamDomain: env.ACCESS_TEAM_DOMAIN || "",
    accessAud: env.ACCESS_AUD || "",
    // 在線名單的時間（毫秒）。測試會改短，平常不用動。
    beatEveryMs: 20000,     // 畫面多久送一次心跳
    beatTimeoutMs: 60000,   // 多久沒心跳算離線
    awayAfterMs: 5 * 60000, // 多久沒動算「離開」
    offlineGraceMs: 5000,   // 斷線後等多久才算離線（重新整理頁面不會閃一下離線）
    helloTimeoutMs: 5000,   // 連上之後多久內要送 hello
    sweepMs: 5000,          // 多久檢查一次心跳
    rosterDelayMs: 100,     // 名單有變時，等一下再一起送（同時很多變動只送一次）
    quiet: false,           // true：不印紀錄（測試用）
  };
}

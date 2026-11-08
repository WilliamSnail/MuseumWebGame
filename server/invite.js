// 邀請名單的小工具（館長用）。跟伺服器讀同一個資料庫（DB_PATH）。
//   node server/invite.js list
//   node server/invite.js add 某人@gmail.com 小明
//   node server/invite.js disable 某人@gmail.com      ← 拿掉一個人（只標停用，不刪）
// 正式環境：node --env-file=/etc/pepe/pepe.env server/invite.js list
// 伺服器開著也可以用；拿掉的人下一個請求就進不來。
import { readConfig } from "./config.js";
import { openDb } from "./db.js";
import { createStore } from "./store.js";

const [cmd, email, ...rest] = process.argv.slice(2);
const cfg = readConfig();
const db = openDb(cfg.dbPath);
const store = createStore(db, cfg);

try {
  if (cmd === "list") {
    const rows = store.invites();
    if (!rows.length) console.log("邀請名單是空的");
    for (const r of rows) console.log(`${r.disabled_at ? "停用" : "有效"}  ${r.email}  ${r.note}`);
  } else if (cmd === "add" && email) {
    const r = store.addInvite(email, rest.join(" "));
    console.log(`加好了：${r.email}${r.note ? "（" + r.note + "）" : ""}`);
  } else if (cmd === "disable" && email) {
    console.log(store.disableInvite(email) ? `停用了：${email}` : `名單上沒有（或已經停用）：${email}`);
  } else {
    console.log("用法：node server/invite.js list | add <email> [備註] | disable <email>");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}

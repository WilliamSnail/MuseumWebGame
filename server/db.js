// 資料庫：Node 內建的 node:sqlite（不用裝原生套件）。
// 資料表搬家（migration）寫在專案的 db/ 資料夾：
//   - 檔名「四位數編號_說明.sql」，例如 0003_信箱.sql，從 0001 連著排。
//   - 一個檔一次改動。開資料庫時照編號跑還沒跑過的，記在 schema_migrations。
//   - 跑過的檔不能再改：會比對內容（SHA-256），改了伺服器就不開。
//   - 只加不刪：不准 DROP、改名、DELETE（addOnlyProblems 會擋，測試也會擋）。
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { ROOT } from "./config.js";

export const MIGRATIONS_DIR = join(ROOT, "db");
const NAME_RE = /^(\d{4})_[^\\/]+\.sql$/;

export function nowIso() { return new Date().toISOString(); }

function sha256(text) { return createHash("sha256").update(text).digest("hex"); }

// 讀 db/ 裡的搬家檔，照編號排好。編號跳號、重複、檔名不對都丟錯誤。
export function listMigrations(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const list = files.map(f => {
    const m = f.match(NAME_RE);
    if (!m) throw new Error(`db/${f}：檔名要是「四位數編號_說明.sql」，例如 0003_信箱.sql`);
    const sql = readFileSync(join(dir, f), "utf8");
    return { id: Number(m[1]), name: f, sql, sha256: sha256(sql) };
  });
  list.forEach((m, i) => {
    if (m.id !== i + 1) throw new Error(`db/${m.name}：編號要從 0001 連著排，這裡應該是 ${String(i + 1).padStart(4, "0")}`);
  });
  return list;
}

// 只加不刪：回傳問題清單（空的就是沒問題）。註解和字串裡的字不算。
export function addOnlyProblems(name, sql) {
  const code = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
  const errs = [];
  if (/\bDROP\b/i.test(code)) errs.push(`${name}：不准 DROP（資料庫只加不刪）`);
  if (/\bRENAME\b/i.test(code)) errs.push(`${name}：不准改名（要改名分兩版做：先加新的、兩邊都寫，下一版才拿掉舊的）`);
  if (/\bDELETE\b/i.test(code)) errs.push(`${name}：搬家檔裡不准 DELETE 資料`);
  return errs;
}

// 包一個交易：fn 丟錯誤就全部退回
export function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// 跑還沒跑過的搬家檔。回傳這次跑了哪些（檔名）。
export function migrate(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    sha256     TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const done = new Map(db.prepare("SELECT id, name, sha256 FROM schema_migrations").all().map(r => [r.id, r]));
  const list = listMigrations(dir);
  for (const m of list) {
    const d = done.get(m.id);
    if (d && (d.sha256 !== m.sha256 || d.name !== m.name)) {
      throw new Error(`db/${m.name}：跑過之後被改了（原本是 ${d.name}）。跑過的檔不能改，要改請新增下一個編號的檔`);
    }
  }
  // 資料庫比程式新（程式退回上一版）也照樣開：只加不刪，舊程式讀得懂
  const ran = [];
  const record = db.prepare("INSERT INTO schema_migrations (id, name, sha256, applied_at) VALUES (?, ?, ?, ?)");
  for (const m of list) {
    if (done.has(m.id)) continue;
    const problems = addOnlyProblems(m.name, m.sql);
    if (problems.length) throw new Error(problems.join("\n"));
    try {
      tx(db, () => {
        db.exec(m.sql);
        record.run(m.id, m.name, m.sha256, nowIso());
      });
    } catch (e) {
      throw new Error(`db/${m.name} 跑失敗：${e.message}`);
    }
    ran.push(m.name);
  }
  return ran;
}

// 打開資料庫（沒有就建），順便跑搬家。
export function openDb(file, { migrationsDir = MIGRATIONS_DIR } = {}) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");
    db.migrated = migrate(db, migrationsDir);
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}

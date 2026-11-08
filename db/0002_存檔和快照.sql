-- 0002：伺服器存檔和快照（2026-11-08）
-- 規矩同 0001：跑過不改、只加不刪。

-- 每個帳號一份存檔（整份 SAVE，JSON 字串）。伺服器核對之後再做。
-- rev：每存一次加 1。PUT 要帶 baseRev，對不上就是別的分頁或裝置先存了。
CREATE TABLE saves (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  data       TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  size       INTEGER NOT NULL,            -- data 的位元組數
  updated_at TEXT NOT NULL
);

-- 快照：被蓋掉之前的那一份，之後還原用。
-- 每個帳號只留最近幾份（SNAPSHOT_KEEP），而且隔一段時間才留一份（SNAPSHOT_GAP_MIN）。
CREATE TABLE save_snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  rev        INTEGER NOT NULL,
  data       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  reason     TEXT NOT NULL,               -- auto＝存檔時自動留的；之後還有 restore、daily…
  created_at TEXT NOT NULL
);
CREATE INDEX save_snapshots_account ON save_snapshots(account_id, id);

-- 0001：帳號、邀請名單、登入的 session（2026-11-08）
-- 搬家的規矩（server/README.md「資料庫」）：
--   一個檔一次改動；跑過的檔不能再改（伺服器會比對內容，改了就不開）。
--   只加不刪：不 DROP、不改名、不改舊欄位的意思。要改就新增下一個編號的檔。

-- 邀請名單：只有這裡的 email 能登入（開發時 @dev.local 的帳號例外）。
-- 拿掉一個人＝填 disabled_at，不刪那一列。
CREATE TABLE invites (
  email       TEXT PRIMARY KEY,           -- 一律小寫
  note        TEXT NOT NULL DEFAULT '',   -- 備註，例如「小明，高中同學」
  added_at    TEXT NOT NULL,              -- ISO 時間（UTC）
  disabled_at TEXT                        -- 停用的時間；NULL＝有效
);

-- 帳號表：email 只放在這裡，用來對應是誰。
-- 遊戲資料（存檔、在線名單）只用 id 和暱稱，不帶 email。
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,     -- 一律小寫
  nick          TEXT NOT NULL,            -- 暱稱，別人看得到
  created_at    TEXT NOT NULL,
  last_login_at TEXT,
  last_seen_at  TEXT,                     -- 別人看到的「最後上線」；隱身時不更新
  invisible     INTEGER NOT NULL DEFAULT 0, -- 1＝隱身：別人看到離線
  disabled_at   TEXT                      -- 停用；NULL＝正常
);

-- 登入之後發的 session。只存 token 的雜湊（SHA-256），不存 token 本身。
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  auth_mode  TEXT NOT NULL                -- dev／firebase／access：從哪一種登入來的
);
CREATE INDEX sessions_account ON sessions(account_id);

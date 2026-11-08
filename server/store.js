// 資料的讀寫：邀請名單、帳號、session、存檔。SQL 都集中在這裡。
// email 只在帳號表和邀請名單；別的地方（存檔、在線名單）只用帳號 id 和暱稱。
import { createHash, randomBytes } from "node:crypto";
import { nowIso, tx } from "./db.js";

export const NICK_MAX = 12;

export function normEmail(s) { return String(s ?? "").trim().toLowerCase(); }

// 暱稱：去掉頭尾空白、連續空白變一個；不准控制字元和看不見的字；最多 NICK_MAX 個字。不合格回傳 null。
export function cleanNick(s) {
  const t = String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t || /\p{C}/u.test(t) || [...t].length > NICK_MAX) return null;
  return t;
}

function hashToken(token) { return createHash("sha256").update(String(token)).digest("hex"); }

export function createStore(db, cfg) {
  const q = {
    invite: db.prepare("SELECT email, note, added_at, disabled_at FROM invites WHERE email = ?"),
    invites: db.prepare("SELECT email, note, added_at, disabled_at FROM invites ORDER BY added_at"),
    addInvite: db.prepare(`INSERT INTO invites (email, note, added_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET disabled_at = NULL, note = CASE WHEN excluded.note = '' THEN invites.note ELSE excluded.note END`),
    disableInvite: db.prepare("UPDATE invites SET disabled_at = ? WHERE email = ? AND disabled_at IS NULL"),

    accountByEmail: db.prepare("SELECT * FROM accounts WHERE email = ?"),
    account: db.prepare("SELECT * FROM accounts WHERE id = ?"),
    accounts: db.prepare("SELECT * FROM accounts WHERE disabled_at IS NULL ORDER BY id"),
    addAccount: db.prepare("INSERT INTO accounts (email, nick, created_at, last_login_at) VALUES (?, ?, ?, ?)"),
    loginAt: db.prepare("UPDATE accounts SET last_login_at = ? WHERE id = ?"),
    setNick: db.prepare("UPDATE accounts SET nick = ? WHERE id = ?"),
    setInvisible: db.prepare("UPDATE accounts SET invisible = ? WHERE id = ?"),
    seen: db.prepare("UPDATE accounts SET last_seen_at = ? WHERE id = ?"),

    addSession: db.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at, auth_mode) VALUES (?, ?, ?, ?, ?)"),
    session: db.prepare("SELECT account_id, expires_at FROM sessions WHERE token_hash = ?"),
    endSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    pruneSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),

    save: db.prepare("SELECT data, rev, size, updated_at FROM saves WHERE account_id = ?"),
    insSave: db.prepare("INSERT INTO saves (account_id, data, rev, size, updated_at) VALUES (?, ?, ?, ?, ?)"),
    updSave: db.prepare("UPDATE saves SET data = ?, rev = ?, size = ?, updated_at = ? WHERE account_id = ?"),
    lastSnap: db.prepare("SELECT created_at FROM save_snapshots WHERE account_id = ? ORDER BY id DESC LIMIT 1"),
    addSnap: db.prepare("INSERT INTO save_snapshots (account_id, rev, data, size, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
    pruneSnaps: db.prepare(`DELETE FROM save_snapshots WHERE account_id = ? AND id NOT IN
      (SELECT id FROM save_snapshots WHERE account_id = ? ORDER BY id DESC LIMIT ?)`),
    snaps: db.prepare("SELECT id, rev, size, reason, created_at FROM save_snapshots WHERE account_id = ? ORDER BY id DESC"),
  };

  const ping = db.prepare("SELECT 1 AS ok");

  const store = {
    ping() { return ping.get().ok === 1; },

    // ---- 邀請名單 ----
    invite(email) { return q.invite.get(normEmail(email)) || null; },
    invites() { return q.invites.all(); },
    addInvite(email, note = "") {
      const e = normEmail(email);
      if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new Error(`不像 email：「${email}」`);
      q.addInvite.run(e, String(note), nowIso());
      return store.invite(e);
    },
    // 拿掉一個人：只標停用，不刪那一列
    disableInvite(email) { return q.disableInvite.run(nowIso(), normEmail(email)).changes > 0; },
    // 這個 email 可不可以登入：在名單上而且沒停用；開發時 @dev.local 例外
    allowed(email) {
      const e = normEmail(email);
      if (cfg.devOpen && e.endsWith("@dev.local")) return true;
      const r = q.invite.get(e);
      return !!r && !r.disabled_at;
    },

    // ---- 帳號 ----
    // 登入時呼叫：沒有帳號就建一個（暱稱先用登入帶來的名字），有就記登入時間
    loginAccount({ email, name }) {
      const e = normEmail(email);
      const at = nowIso();
      return tx(db, () => {
        const found = q.accountByEmail.get(e);
        if (found) { q.loginAt.run(at, found.id); return q.account.get(found.id); }
        const nick = cleanNick(name) || cleanNick(e.split("@")[0]) || "館友";
        const r = q.addAccount.run(e, nick, at, at);
        return q.account.get(Number(r.lastInsertRowid));
      });
    },
    account(id) { return q.account.get(id) || null; },
    accounts() { return q.accounts.all(); },
    setNick(id, nick) { q.setNick.run(nick, id); },
    setInvisible(id, on) { q.setInvisible.run(on ? 1 : 0, id); },
    touchSeen(id, at = nowIso()) { q.seen.run(at, id); },

    // ---- session ----
    newSession(accountId, mode) {
      const token = randomBytes(32).toString("base64url");
      const now = Date.now();
      const expiresAt = new Date(now + cfg.sessionDays * 86400000).toISOString();
      q.addSession.run(hashToken(token), accountId, new Date(now).toISOString(), expiresAt, mode);
      return { token, expiresAt };
    },
    // token 對應的帳號；過期、不存在、帳號停用、不在名單上都回傳 null
    sessionAccount(token) {
      if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
      const s = q.session.get(hashToken(token));
      if (!s || s.expires_at < nowIso()) return null;
      const a = q.account.get(s.account_id);
      if (!a || a.disabled_at || !store.allowed(a.email)) return null;
      return a;
    },
    endSession(token) { q.endSession.run(hashToken(token)); },
    pruneSessions() { return q.pruneSessions.run(nowIso()).changes; },

    // ---- 存檔 ----
    getSave(accountId) {
      const r = q.save.get(accountId);
      return r ? { data: r.data, rev: r.rev, size: r.size, updatedAt: r.updated_at } : { data: null, rev: 0, size: 0, updatedAt: null };
    },
    // 整份存。baseRev 要等於現在的 rev，不然回傳 { conflict: true, rev }（別的分頁或裝置先存了）。
    // 被蓋掉的那一份，隔 snapshotGapSec 以上才留一份快照，每個帳號只留最近 snapshotKeep 份。
    putSave(accountId, dataStr, baseRev) {
      return tx(db, () => {
        const cur = q.save.get(accountId);
        const curRev = cur ? cur.rev : 0;
        if (baseRev !== curRev) return { conflict: true, rev: curRev };
        const at = nowIso();
        const rev = curRev + 1;
        const size = Buffer.byteLength(dataStr);
        if (cur) {
          const last = q.lastSnap.get(accountId);
          const gapSec = last ? (Date.parse(at) - Date.parse(last.created_at)) / 1000 : Infinity;
          if (cfg.snapshotKeep > 0 && gapSec >= cfg.snapshotGapSec) {
            q.addSnap.run(accountId, cur.rev, cur.data, cur.size, "auto", at);
            q.pruneSnaps.run(accountId, accountId, cfg.snapshotKeep);
          }
          q.updSave.run(dataStr, rev, size, at, accountId);
        } else {
          q.insSave.run(accountId, dataStr, rev, size, at);
        }
        return { conflict: false, rev, updatedAt: at };
      });
    },
    snapshots(accountId) { return q.snaps.all(accountId); },
  };
  return store;
}

// HTTP API（/api/…）。每一條的欄位寫在 server/protocol.md。
// 登入之後拿到 token，之後每個請求帶 header「Authorization: Bearer <token>」。
// 用 header 不用 cookie：別的網站沒辦法替玩家送請求（不用另外擋 CSRF）。
import { AuthError } from "./auth/error.js";
import { HttpError, clientIp, readJson, sendError, sendJson } from "./http.js";
import { createLimiter } from "./limits.js";
import { cleanNick, normEmail, NICK_MAX } from "./store.js";

const SMALL_BODY = 4096; // 存檔以外的請求，body 最多 4 KB

function publicMe(acc) {
  return { id: acc.id, nick: acc.nick, email: acc.email, invisible: !!acc.invisible, createdAt: acc.created_at };
}

export function createApi({ cfg, store, auth, presence, version, startedAt, log }) {
  const ipLimit = createLimiter({ capacity: 120, perSec: 2 });        // 每個 IP：一口氣 120 次，之後每秒 2 次
  const loginLimit = createLimiter({ capacity: cfg.loginPerMin, perSec: cfg.loginPerMin / 60 }); // 每個 IP 登入：一分鐘約 10 次
  const saveLimit = createLimiter({ capacity: 20, perSec: 20 / 60 });  // 每個帳號存檔：一分鐘約 20 次

  function needAccount(req) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
    const acc = m && store.sessionAccount(m[1]);
    if (!acc) throw new HttpError(401, "need_login", "要先登入（或登入過期了）");
    return { acc, token: m[1] };
  }

  const routes = {
    // 健康檢查：不用登入。不放任何秘密。
    "GET /api/health": () => {
      store.ping(); // 資料庫讀得到才算活著
      return { ok: true, version, auth: cfg.auth, entry: cfg.entry, uptimeSec: Math.round((Date.now() - startedAt) / 1000) };
    },

    "POST /api/login": async (req, ip) => {
      if (!loginLimit.take(ip)) throw new HttpError(429, "rate_limited", "登入試太多次了，等一分鐘再試");
      const body = await readJson(req, SMALL_BODY);
      const who = await auth.verify(req, body);
      const email = normEmail(who && who.email);
      if (!email.includes("@")) throw new AuthError(401, "bad_login", "登入資料不完整");
      if (!store.allowed(email)) throw new HttpError(403, "not_invited", "這個帳號不在邀請名單上，請找館長");
      const acc = store.loginAccount({ email, name: who.name });
      if (acc.disabled_at) throw new HttpError(403, "disabled", "這個帳號停用了，請找館長");
      const { token, expiresAt } = store.newSession(acc.id, auth.mode);
      log(`登入：#${acc.id} ${acc.nick}（${auth.mode}）`);
      return { token, expiresAt, me: publicMe(acc) };
    },

    "POST /api/logout": req => {
      const { token } = needAccount(req);
      store.endSession(token);
      return { ok: true };
    },

    "GET /api/me": req => publicMe(needAccount(req).acc),

    // 改暱稱、隱身：{ nick?, invisible? }
    "PUT /api/me": async req => {
      const { acc } = needAccount(req);
      const body = await readJson(req, SMALL_BODY);
      if (body.nick !== undefined) {
        const nick = cleanNick(body.nick);
        if (!nick) throw new HttpError(400, "bad_nick", `暱稱要 1–${NICK_MAX} 個字，不能有看不見的字`);
        store.setNick(acc.id, nick);
      }
      if (body.invisible !== undefined) {
        if (typeof body.invisible !== "boolean") throw new HttpError(400, "bad_field", "invisible 要是 true 或 false");
        store.setInvisible(acc.id, body.invisible);
      }
      presence.accountChanged(acc.id);
      return publicMe(store.account(acc.id));
    },

    "GET /api/save": req => {
      const { acc } = needAccount(req);
      const s = store.getSave(acc.id);
      return { data: s.data ? JSON.parse(s.data) : null, rev: s.rev, updatedAt: s.updatedAt };
    },

    // 整份存：{ data: 整份 SAVE, baseRev: 上次讀到或存好的 rev }
    "PUT /api/save": async req => {
      const { acc } = needAccount(req);
      if (!saveLimit.take(acc.id)) throw new HttpError(429, "rate_limited", "存太快了，等一下再存");
      const body = await readJson(req, cfg.saveMaxBytes + 1024);
      const { data, baseRev } = body;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "bad_save", "data 要是一個物件（整份存檔）");
      if (!Number.isInteger(baseRev) || baseRev < 0) throw new HttpError(400, "need_rev", "要帶 baseRev（上次讀到的 rev，第一次是 0）");
      const text = JSON.stringify(data);
      if (Buffer.byteLength(text) > cfg.saveMaxBytes) throw new HttpError(413, "too_big", `存檔太大（最多 ${cfg.saveMaxBytes / 1024} KB）`);
      const r = store.putSave(acc.id, text, baseRev);
      if (r.conflict) throw new HttpError(409, "conflict", "別的分頁或裝置先存了，請重新讀存檔", { rev: r.rev });
      return { rev: r.rev, updatedAt: r.updatedAt };
    },
  };

  async function handle(req, res, url) {
    const ip = clientIp(req, cfg);
    try {
      if (!ipLimit.take(ip)) throw new HttpError(429, "rate_limited", "請求太多了，等一下再試");
      const fn = routes[`${req.method} ${url.pathname}`];
      if (!fn) {
        const known = Object.keys(routes).some(k => k.endsWith(" " + url.pathname));
        throw known ? new HttpError(405, "bad_method", "不支援這個方法") : new HttpError(404, "not_found", "沒有這個 API");
      }
      sendJson(res, 200, await fn(req, ip));
    } catch (e) {
      if (e instanceof HttpError || e instanceof AuthError) return sendError(res, e);
      log(`API 出錯 ${req.method} ${url.pathname}：${e.stack || e}`);
      sendError(res, { status: 500, code: "server_error", message: "伺服器出錯了" });
    }
  }

  return {
    handle,
    // 定時清掉用不到的次數桶子
    sweep() { ipLimit.sweep(); loginLimit.sweep(); saveLimit.sweep(); },
  };
}

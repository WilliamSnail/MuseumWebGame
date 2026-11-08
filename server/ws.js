// WebSocket 的門口：接連線、檢查登入、檢查每則訊息的大小和次數，再交給登記好的處理函式。
// 訊息格式見 server/protocol.md。之後的邀請、招募、合作關卡都用 gateway.on(種類, 處理函式) 加進來，
// 欄位寫在 server/protocol.js 的 CLIENT_MESSAGES。
import { WebSocketServer } from "ws";
import { CLOSE, LIMITS, PROTOCOL_VERSION, checkMessage } from "./protocol.js";
import { clientIp } from "./http.js";
import { createLimiter } from "./limits.js";

function reject(socket, status, text) {
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } finally {
    socket.destroy();
  }
}

export function createGateway({ cfg, store, presence, log }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxBytes, perMessageDeflate: false });
  const handlers = new Map();
  // 每個 IP 連線的次數：一家人共用一個 IP、伺服器重開時大家一起重連，所以給寬一點
  const upgradeLimit = createLimiter({ capacity: 30, perSec: 1 });
  const all = new Set();
  let seq = 0;

  function send(conn, obj) {
    if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj));
  }
  function sendError(conn, code, msg, re) {
    const out = { t: "error", code, msg };
    if (re !== undefined) out.re = re;
    send(conn, out);
  }
  function close(conn, c, reason = c.why) {
    try { conn.ws.close(c.code, reason.slice(0, 60)); } catch { /* 已經關了 */ }
  }
  // 送錯一次記一點，太多就斷線
  function strike(conn) {
    conn.strikes++;
    if (conn.strikes >= LIMITS.strikes) { close(conn, CLOSE.tooMany); return true; }
    return false;
  }

  function onHello(conn, msg) {
    if (msg.v !== PROTOCOL_VERSION) return close(conn, CLOSE.badMessage, `protocol v${PROTOCOL_VERSION} only`);
    const acc = store.sessionAccount(msg.token);
    if (!acc) return close(conn, CLOSE.needLogin);
    if (presence.connCount(acc.id) >= LIMITS.connsPerAccount) return close(conn, CLOSE.tooManyConns);
    clearTimeout(conn.helloTimer);
    conn.account = acc;
    conn.version = msg.v;
    presence.join(conn);
  }

  function onMessage(conn, raw, isBinary) {
    if (conn.closed) return;
    if (!conn.bucket.take(conn.id)) {
      if (!strike(conn)) sendError(conn, "rate_limited", "送太快了，等一下再送");
      return;
    }
    if (isBinary) { if (!strike(conn)) sendError(conn, "bad_message", "只收文字（JSON）"); return; }
    let msg;
    try { msg = JSON.parse(raw.toString("utf8")); }
    catch { if (!strike(conn)) sendError(conn, "bad_json", "JSON 格式不對"); return; }
    const problem = checkMessage(msg);
    if (problem) { if (!strike(conn)) sendError(conn, "bad_message", problem, msg && msg.id); return; }

    // 還沒登入：只收 hello
    if (!conn.account) {
      if (msg.t !== "hello") return close(conn, CLOSE.needLogin, "send hello first");
      return onHello(conn, msg);
    }
    if (msg.t === "hello") { if (!strike(conn)) sendError(conn, "already_hello", "已經打過招呼了", msg.id); return; }

    conn.beatAt = Date.now(); // 收到任何一則都算心跳
    const h = handlers.get(msg.t);
    if (!h) { sendError(conn, "unknown_type", `伺服器還不會處理「${msg.t}」`, msg.id); return; }
    try { h(conn, msg); }
    catch (e) { log(`處理 ${msg.t} 出錯：${e.stack || e}`); sendError(conn, "server_error", "伺服器出錯了", msg.id); }
  }

  function accept(ws, req) {
    const conn = {
      id: ++seq,
      ws,
      ip: clientIp(req, cfg),
      account: null,
      version: 0,
      beatAt: Date.now(),
      strikes: 0,
      left: false,
      closed: false,
      lastRoster: "",
      limits: { maxBytes: LIMITS.maxBytes, burst: LIMITS.burst, perSec: LIMITS.perSec },
      bucket: createLimiter({ capacity: LIMITS.burst, perSec: LIMITS.perSec }),
    };
    all.add(conn);
    conn.helloTimer = setTimeout(() => close(conn, CLOSE.helloTimeout), cfg.helloTimeoutMs);
    ws.on("message", (raw, isBinary) => onMessage(conn, raw, isBinary));
    ws.on("close", () => {
      conn.closed = true;
      clearTimeout(conn.helloTimer);
      all.delete(conn);
      presence.leave(conn);
    });
    // 訊息超過 maxBytes 時 ws 會先丟 error，再自己用 1009 關掉；這裡接住就好
    ws.on("error", e => log(`WebSocket 錯誤（#${conn.account ? conn.account.id : "?"}）：${e.message}`));
  }

  return {
    wss,
    // 登記一種訊息的處理函式：fn(conn, msg)。conn.account 是帳號（有 id、nick）。
    on(type, fn) { handlers.set(type, fn); },
    send,
    sendError,

    // http server 的 upgrade 事件
    handleUpgrade(req, socket, head) {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname !== "/ws") return reject(socket, 404, "Not Found");
      // 正式環境有設 PUBLIC_URL：瀏覽器來的連線，Origin 要是自己的網址
      const origin = req.headers.origin;
      if (cfg.publicUrl && origin && origin !== cfg.publicUrl) return reject(socket, 403, "Forbidden");
      if (!upgradeLimit.take(clientIp(req, cfg))) return reject(socket, 429, "Too Many Requests");
      if (all.size >= LIMITS.connsTotal) return reject(socket, 503, "Service Unavailable");
      wss.handleUpgrade(req, socket, head, ws => accept(ws, req));
    },

    sweep() { upgradeLimit.sweep(); },
    count() { return all.size; },
    // 直接切斷某個帳號的每一條（像網路斷掉，不送關閉碼）。測試用；之後管理介面「踢人」也可以用。
    terminateAccount(id) {
      for (const conn of all) if (conn.account && conn.account.id === id) { try { conn.ws.terminate(); } catch { /* 已經關了 */ } }
    },

    // 伺服器要關了：每條都用 1001 關（畫面會自己重連）
    close() {
      for (const conn of all) {
        clearTimeout(conn.helloTimer);
        try { conn.ws.close(CLOSE.restart.code, "server restart"); } catch { /* 已經關了 */ }
        presence.leave(conn);
      }
      wss.close();
      setTimeout(() => { for (const conn of all) { try { conn.ws.terminate(); } catch { /* 已經關了 */ } } }, 1000).unref();
    },
  };
}

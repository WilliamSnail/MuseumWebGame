// 把伺服器的每一塊接起來：資料庫 → 登入 → HTTP API → WebSocket（在線名單）→ 網頁（dist/）。
// server/main.js 用它開正式的伺服器；test/server.test.mjs 用它開測試用的（暫存的資料庫、port 0）。
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.js";
import { openDb } from "./db.js";
import { createStore } from "./store.js";
import { createAuth } from "./auth/index.js";
import { createPresence } from "./presence.js";
import { createGateway } from "./ws.js";
import { createApi } from "./api.js";
import { sendJson, serveStatic } from "./http.js";

function readVersion() {
  try { return JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8")).version; } catch { return "?"; }
}

// cfg 用 readConfig() 讀出來的（測試可以蓋掉其中幾個）。回傳 { port, url, db, store, presence, gateway, close() }。
export async function startServer(cfg) {
  const log = cfg.quiet ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);
  const auth = createAuth(cfg); // 正式環境用 dev 會在這裡丟錯誤
  const db = openDb(cfg.dbPath);
  if (db.migrated.length) log(`資料表搬家：${db.migrated.join("、")}`);
  const store = createStore(db, cfg);
  const presence = createPresence({ cfg, store, log });
  const gateway = createGateway({ cfg, store, presence, log });
  gateway.on("beat", (conn, msg) => presence.beat(conn, msg));
  gateway.on("where", (conn, msg) => presence.where(conn, msg));
  const startedAt = Date.now();
  const api = createApi({ cfg, store, auth, presence, version: readVersion(), startedAt, log });

  if (cfg.serveDist && !existsSync(join(cfg.distDir, "index.html"))) {
    log(`注意：找不到 ${join(cfg.distDir, "index.html")}，網頁發不出去（先跑 npm run build）`);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return api.handle(req, res, url);
    if (cfg.serveDist && (req.method === "GET" || req.method === "HEAD")) return serveStatic(req, res, url, cfg.distDir);
    sendJson(res, 404, { error: "not_found", msg: cfg.serveDist ? "沒有這個網址" : "開發時網頁走 Vite（npm run dev），這裡只有 /api 和 /ws" });
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 20000;
  server.on("upgrade", (req, socket, head) => gateway.handleUpgrade(req, socket, head));
  server.on("clientError", (e, socket) => { try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch { /* 已經斷了 */ } });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(cfg.port, cfg.host, () => { server.off("error", reject); resolve(); });
    });
  } catch (e) {
    db.close();
    throw e.code === "EADDRINUSE" ? new Error(`port ${cfg.port} 已經有人在用了（伺服器是不是已經開著？）`) : e;
  }
  const port = server.address().port;

  // 定時：心跳檢查、清次數桶子；每小時清一次過期的 session
  let ticks = 0;
  const timer = setInterval(() => {
    presence.sweep();
    gateway.sweep();
    api.sweep();
    if (++ticks % Math.max(1, Math.round(3600000 / cfg.sweepMs)) === 0) store.pruneSessions();
  }, cfg.sweepMs);
  timer.unref();

  let closing = null;
  return {
    port,
    url: `http://${cfg.host}:${port}`,
    db,
    store,
    presence,
    gateway,
    // 關掉：WebSocket 用 1001 通知、記下最後上線、關 HTTP、關資料庫
    close() {
      if (closing) return closing;
      closing = new Promise(resolve => {
        clearInterval(timer);
        gateway.close();
        presence.close();
        server.close(() => { db.close(); resolve(); });
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

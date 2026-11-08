// HTTP 的小工具：回 JSON、讀 JSON、找出玩家的 IP、發 dist/ 的網頁。
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

export class HttpError extends Error {
  constructor(status, code, msg, extra = {}) {
    super(msg);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function sendJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...headers,
  });
  res.end(body);
}

// 錯誤一律回 { error: 代號, msg: 給人看的話, ...其他 }
export function sendError(res, e) {
  sendJson(res, e.status || 500, { error: e.code || "server_error", msg: e.message || "伺服器出錯了", ...(e.extra || {}) });
}

// 讀 JSON body，最多 maxBytes。沒有 body 回傳 {}。
// 太大時馬上回錯誤，剩下的照樣讀掉丟掉（直接切斷的話，瀏覽器會看不到 413）。
export function readJson(req, maxBytes) {
  const tooBig = () => new HttpError(413, "too_big", `資料太大（最多 ${Math.floor(maxBytes / 1024)} KB）`);
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"] || 0) > maxBytes) { req.resume(); return reject(tooBig()); }
    const chunks = [];
    let n = 0, over = false;
    req.on("data", c => {
      if (over) return;
      n += c.length;
      if (n > maxBytes) { over = true; chunks.length = 0; reject(tooBig()); return; }
      chunks.push(c);
    });
    req.on("error", reject);
    req.on("end", () => {
      if (over) return;
      if (!n) return resolve({});
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        return reject(new HttpError(415, "need_json", "要用 JSON（Content-Type: application/json）"));
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new HttpError(400, "bad_json", "JSON 格式不對")); }
    });
  });
}

// 玩家的 IP。前面有 Caddy、cloudflared 時（TRUST_PROXY=1），從它們加的 header 拿。
export function clientIp(req, cfg) {
  if (cfg.trustProxy) {
    if (cfg.entry === "tunnel") {
      const cf = req.headers["cf-connecting-ip"];
      if (typeof cf === "string" && cf) return cf.trim();
    }
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff) return xff.split(",").pop().trim(); // 最右邊是離我們最近的那一層加的
  }
  return req.socket.remoteAddress || "?";
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".map": "application/json; charset=utf-8",
};

function fileAt(path) {
  try { const st = statSync(path); return st.isFile() ? st : null; } catch { return null; }
}

// 發 dist/ 裡的檔（npm run build 打包出來的）。
// 找不到、又不像檔案（沒有副檔名）的路徑給 index.html；有副檔名卻找不到就 404。
export function serveStatic(req, res, url, distDir) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return sendJson(res, 400, { error: "bad_path", msg: "網址不對" }); }
  const root = normalize(distDir + sep);
  let file = normalize(join(root, rel));
  if (!file.startsWith(root)) return sendJson(res, 403, { error: "forbidden", msg: "不能讀這裡" });
  let st = fileAt(file);
  if (!st && (rel.endsWith("/") || !extname(rel))) { file = join(root, "index.html"); st = fileAt(file); }
  if (!st) return sendJson(res, 404, { error: "not_found", msg: "找不到這個檔" });
  const hashed = rel.startsWith("/assets/"); // Vite 打包的檔名有雜湊，可以放心快取
  res.writeHead(200, {
    "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": st.size,
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    ...SECURITY_HEADERS,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

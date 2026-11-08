// 開發用的登入：帶一個名字就登入，email 是「名字@dev.local」。
// 只在 NODE_ENV 不是 production 時能用；正式環境建立時就丟錯誤，每次登入也再檢查一次。
//
// 名字從這三個地方拿（先找到的算）：
//   1. header  X-Dev-User: <名字>      （中文要 encodeURIComponent，header 只能放英文字）
//   2. 網址    POST /api/login?user=<名字>
//   3. body    { "name": "<名字>" }     （web/src/net.js 用這個）
import { AuthError } from "./error.js";

const NAME_RE = /^[\p{L}\p{N}_-]{1,20}$/u;

function isProduction(cfg) { return cfg.production || process.env.NODE_ENV === "production"; }

function pickName(req, body) {
  const h = req.headers["x-dev-user"];
  if (typeof h === "string" && h) {
    try { return decodeURIComponent(h).trim(); } catch { return h.trim(); }
  }
  const q = new URL(req.url, "http://x").searchParams.get("user");
  if (q) return q.trim();
  if (body && typeof body.name === "string") return body.name.trim();
  return "";
}

export function createDevAuth(cfg) {
  if (isProduction(cfg)) throw new Error("開發登入（AUTH=dev）在正式環境（NODE_ENV=production）不能用");
  return {
    mode: "dev",
    async verify(req, body) {
      if (isProduction(cfg)) throw new AuthError(403, "dev_off", "正式環境不能用開發登入");
      const name = pickName(req, body);
      if (!name) throw new AuthError(400, "need_name", "開發登入要帶名字：?user=名字、header X-Dev-User，或 body 的 name");
      if (!NAME_RE.test(name)) throw new AuthError(400, "bad_name", "開發登入的名字只能用字母、數字、_、-，最多 20 個字");
      return { email: `${name.toLowerCase()}@dev.local`, name };
    },
  };
}
